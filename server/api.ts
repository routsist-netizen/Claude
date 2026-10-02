import { randomUUID } from 'node:crypto'
import {
  COOKIE,
  createToken,
  getSecret,
  hashPassword,
  parseCookies,
  readToken,
  sessionCookie,
  SESSION_DAYS,
  verifyPassword,
  type Session,
  type User,
} from './auth'
import type { KV } from './store'

/**
 * The whole backend: a small REST API over a key-value store.
 *
 *   POST /api/auth/register | /api/auth/login | /api/auth/logout
 *   GET  /api/auth/me
 *   GET|POST        /api/{recipes|bakes|starter}
 *   GET|PUT|DELETE  /api/{recipes|bakes|starter}/:id
 *   POST            /api/photos            (raw image body)
 *   GET|DELETE      /api/photos/:id
 *
 * Every user's data lives under the key prefix `u/{userId}/`, so one user
 * can never read or write another's records.
 */

export interface Env {
  secret?: string
}

const COLLECTIONS = new Set(['recipes', 'bakes', 'starter'])
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,32}$/u
const MAX_JSON = 512 * 1024
const MAX_PHOTO = 4 * 1024 * 1024

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
const error = (status: number, code: string) => json({ error: code }, status)

async function readJSON(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text()
  if (text.length > MAX_JSON) return null
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

const userKey = (username: string) => `users/${username.toLowerCase()}`
const dataKey = (uid: string, col: string, id: string) => `u/${uid}/${col}/${id}`

export async function handle(req: Request, kv: KV, env: Env = {}): Promise<Response> {
  const url = new URL(req.url)
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const secure = url.protocol === 'https:'
  const secret = await getSecret(kv, env.secret)
  const session = readToken(parseCookies(req.headers.get('cookie'))[COOKIE], secret)

  try {
    if (parts[0] === 'auth') return await auth(req, parts[1], kv, secret, secure, session)
    if (!session) return error(401, 'unauthorized')
    if (parts[0] === 'photos') return await photos(req, parts[1], kv, session)
    if (COLLECTIONS.has(parts[0])) return await collection(req, parts[0], parts[1], kv, session)
    return error(404, 'notFound')
  } catch (e) {
    console.error(e)
    return error(500, 'server')
  }
}

async function auth(
  req: Request,
  action: string | undefined,
  kv: KV,
  secret: string,
  secure: boolean,
  session: Session | null,
): Promise<Response> {
  if (action === 'me' && req.method === 'GET') {
    return session ? json({ username: session.name }) : error(401, 'unauthorized')
  }
  if (action === 'logout' && req.method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', secure, 0) })
  }
  if ((action === 'login' || action === 'register') && req.method === 'POST') {
    const body = await readJSON(req)
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!USERNAME_RE.test(username)) return error(400, 'badUsername')
    if (password.length < 6 || password.length > 200) return error(400, 'badPassword')

    let user: User | null
    if (action === 'register') {
      user = { id: randomUUID(), username, ...(await hashPassword(password)), createdAt: new Date().toISOString() }
      const created = await kv.setJSON(userKey(username), user, { onlyIfNew: true })
      if (!created) return error(409, 'usernameTaken')
    } else {
      user = await kv.getJSON<User>(userKey(username))
      if (!user || !(await verifyPassword(password, user))) return error(401, 'badCredentials')
    }
    const token = createToken(
      { uid: user.id, name: user.username, exp: Date.now() + SESSION_DAYS * 86400_000 },
      secret,
    )
    return json({ username: user.username }, action === 'register' ? 201 : 200, {
      'set-cookie': sessionCookie(token, secure),
    })
  }
  return error(404, 'notFound')
}

async function collection(
  req: Request,
  col: string,
  id: string | undefined,
  kv: KV,
  session: Session,
): Promise<Response> {
  const uid = session.uid
  if (!id) {
    if (req.method === 'GET') {
      const keys = await kv.list(`u/${uid}/${col}/`)
      const items = (await Promise.all(keys.map((k) => kv.getJSON(k)))).filter(Boolean)
      return json(items)
    }
    if (req.method === 'POST') {
      const body = await readJSON(req)
      if (!body) return error(400, 'badBody')
      const newId = typeof body.id === 'string' && ID_RE.test(body.id) ? body.id : randomUUID()
      return save(kv, uid, col, newId, body, true)
    }
    return error(405, 'method')
  }
  if (!ID_RE.test(id)) return error(400, 'badId')
  const key = dataKey(uid, col, id)
  if (req.method === 'GET') {
    const item = await kv.getJSON(key)
    return item ? json(item) : error(404, 'notFound')
  }
  if (req.method === 'PUT') {
    const body = await readJSON(req)
    if (!body) return error(400, 'badBody')
    return save(kv, uid, col, id, body, false)
  }
  if (req.method === 'DELETE') {
    if (col === 'bakes') {
      // A bake owns its photos.
      const bake = await kv.getJSON<{ photos?: { id: string }[] }>(key)
      for (const p of bake?.photos ?? []) {
        if (ID_RE.test(p.id)) await kv.delete(`u/${uid}/photos/${p.id}`)
      }
    }
    await kv.delete(key)
    return json({ ok: true })
  }
  return error(405, 'method')
}

async function save(kv: KV, uid: string, col: string, id: string, body: Record<string, unknown>, isNew: boolean) {
  const now = new Date().toISOString()
  const key = dataKey(uid, col, id)
  const existing = isNew ? null : await kv.getJSON<Record<string, unknown>>(key)
  const item = {
    ...body,
    id,
    // Examples are only ever served from the app bundle, never stored.
    isExample: undefined,
    createdAt: (existing?.createdAt as string) ?? (body.createdAt as string) ?? now,
    updatedAt: now,
  }
  if (isNew) {
    const created = await kv.setJSON(key, item, { onlyIfNew: true })
    if (!created) return error(409, 'exists')
    return json(item, 201)
  }
  await kv.setJSON(key, item)
  return json(item)
}

async function photos(req: Request, id: string | undefined, kv: KV, session: Session): Promise<Response> {
  const uid = session.uid
  if (!id && req.method === 'POST') {
    const type = req.headers.get('content-type') ?? ''
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return error(415, 'badImage')
    const data = await req.arrayBuffer()
    if (data.byteLength === 0 || data.byteLength > MAX_PHOTO) return error(413, 'tooLarge')
    const photoId = randomUUID()
    await kv.setBinary(`u/${uid}/photos/${photoId}`, data, type)
    return json({ id: photoId }, 201)
  }
  if (!id || !ID_RE.test(id)) return error(400, 'badId')
  const key = `u/${uid}/photos/${id}`
  if (req.method === 'GET') {
    const bin = await kv.getBinary(key)
    if (!bin) return error(404, 'notFound')
    return new Response(bin.data, {
      headers: { 'content-type': bin.contentType, 'cache-control': 'private, max-age=31536000, immutable' },
    })
  }
  if (req.method === 'DELETE') {
    await kv.delete(key)
    return json({ ok: true })
  }
  return error(405, 'method')
}
