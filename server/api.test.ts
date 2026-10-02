import { describe, expect, it } from 'vitest'
import { handle } from './api'
import { createToken, readToken } from './auth'
import { MemoryKV } from './store'

const BASE = 'https://bake.example/api'

function client(kv = new MemoryKV()) {
  let cookie = ''
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const init: RequestInit = { method, headers: { ...headers, ...(cookie ? { cookie } : {}) } }
    if (body instanceof ArrayBuffer) init.body = body
    else if (body !== undefined) init.body = JSON.stringify(body)
    const res = await handle(new Request(BASE + path, init), kv, { secret: 'test-secret' })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return res
  }
  return { call, kv, logout: () => (cookie = '') }
}

describe('auth', () => {
  it('registers, logs in and identifies the user via cookie', async () => {
    const c = client()
    const reg = await c.call('POST', '/auth/register', { username: 'Μαρία', password: 'secret1' })
    expect(reg.status).toBe(201)
    expect(reg.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/)
    expect(await (await c.call('GET', '/auth/me')).json()).toEqual({ username: 'Μαρία' })

    c.logout()
    expect((await c.call('GET', '/auth/me')).status).toBe(401)
    expect((await c.call('POST', '/auth/login', { username: 'μαρία', password: 'wrong!!' })).status).toBe(401)
    expect((await c.call('POST', '/auth/login', { username: 'μαρία', password: 'secret1' })).status).toBe(200)
    expect((await c.call('GET', '/auth/me')).status).toBe(200)
  })

  it('rejects duplicate usernames (case-insensitive) and weak input', async () => {
    const c = client()
    await c.call('POST', '/auth/register', { username: 'baker', password: 'secret1' })
    expect((await c.call('POST', '/auth/register', { username: 'BAKER', password: 'secret1' })).status).toBe(409)
    expect((await c.call('POST', '/auth/register', { username: 'ab', password: 'secret1' })).status).toBe(400)
    expect((await c.call('POST', '/auth/register', { username: 'abc', password: '123' })).status).toBe(400)
  })

  it('rejects tampered and expired tokens', () => {
    const t = createToken({ uid: 'u1', name: 'a', exp: Date.now() + 1000 }, 's')
    expect(readToken(t, 's')?.uid).toBe('u1')
    expect(readToken(t, 'other')).toBeNull()
    expect(readToken(t.slice(0, -2) + 'xx', 's')).toBeNull()
    expect(readToken(t, 's', Date.now() + 5000)).toBeNull()
    expect(readToken('garbage', 's')).toBeNull()
  })

  it('does not store the password in plain text', async () => {
    const c = client()
    await c.call('POST', '/auth/register', { username: 'baker', password: 'secret1' })
    const user = await c.kv.getJSON<Record<string, string>>('users/baker')
    expect(JSON.stringify(user)).not.toContain('secret1')
  })
})

describe('collections', () => {
  it('requires a session', async () => {
    expect((await client().call('GET', '/recipes')).status).toBe(401)
  })

  it('creates, lists, updates and deletes records', async () => {
    const c = client()
    await c.call('POST', '/auth/register', { username: 'baker', password: 'secret1' })
    const created = await c.call('POST', '/recipes', { id: 'r1', name: 'Test', isExample: true })
    expect(created.status).toBe(201)
    const item = await created.json()
    expect(item.isExample).toBeUndefined()
    expect(item.createdAt).toBeTruthy()

    expect((await c.call('POST', '/recipes', { id: 'r1', name: 'Dup' })).status).toBe(409)

    const updated = await (await c.call('PUT', '/recipes/r1', { name: 'Renamed' })).json()
    expect(updated.name).toBe('Renamed')
    expect(updated.createdAt).toBe(item.createdAt)

    const list = await (await c.call('GET', '/recipes')).json()
    expect(list.map((r: { name: string }) => r.name)).toEqual(['Renamed'])

    expect((await c.call('DELETE', '/recipes/r1')).status).toBe(200)
    expect((await c.call('GET', '/recipes/r1')).status).toBe(404)
  })

  it("keeps each user's data separate", async () => {
    const kv = new MemoryKV()
    const a = client(kv)
    const b = client(kv)
    await a.call('POST', '/auth/register', { username: 'alice', password: 'secret1' })
    await b.call('POST', '/auth/register', { username: 'bob', password: 'secret1' })
    await a.call('POST', '/bakes', { id: 'b1', recipeName: 'Alice bread' })
    expect(await (await b.call('GET', '/bakes')).json()).toEqual([])
    expect((await b.call('GET', '/bakes/b1')).status).toBe(404)
  })

  it('rejects bad ids, bodies and unknown routes', async () => {
    const c = client()
    await c.call('POST', '/auth/register', { username: 'baker', password: 'secret1' })
    expect((await c.call('GET', '/recipes/../users')).status).toBe(404)
    expect((await c.call('PUT', '/recipes/a%2Fb', { x: 1 })).status).toBe(400)
    expect((await c.call('POST', '/recipes', [1, 2])).status).toBe(400)
    expect((await c.call('GET', '/nope')).status).toBe(404)
  })
})

describe('photos', () => {
  it('stores and serves images, and deletes them with their bake', async () => {
    const c = client()
    await c.call('POST', '/auth/register', { username: 'baker', password: 'secret1' })
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]).buffer
    const up = await c.call('POST', '/photos', bytes, { 'content-type': 'image/jpeg' })
    expect(up.status).toBe(201)
    const { id } = await up.json()

    const got = await c.call('GET', `/photos/${id}`)
    expect(got.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(new Uint8Array(bytes))

    await c.call('POST', '/bakes', { id: 'b1', photos: [{ id, kind: 'crumb' }] })
    await c.call('DELETE', '/bakes/b1')
    expect((await c.call('GET', `/photos/${id}`)).status).toBe(404)
  })

  it('refuses non-images', async () => {
    const c = client()
    await c.call('POST', '/auth/register', { username: 'baker', password: 'secret1' })
    const res = await c.call('POST', '/photos', new ArrayBuffer(4), { 'content-type': 'text/html' })
    expect(res.status).toBe(415)
  })
})
