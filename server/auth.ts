import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { KV } from './store'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

export interface User {
  id: string
  username: string
  salt: string
  hash: string
  createdAt: string
}

export interface Session {
  uid: string
  name: string
  exp: number
}

export const COOKIE = 'prozymi_session'
export const SESSION_DAYS = 180

export async function hashPassword(password: string, salt = randomBytes(16)): Promise<{ salt: string; hash: string }> {
  const hash = await scrypt(password, salt, 64)
  return { salt: salt.toString('base64'), hash: hash.toString('base64') }
}

export async function verifyPassword(password: string, user: Pick<User, 'salt' | 'hash'>): Promise<boolean> {
  const { hash } = await hashPassword(password, Buffer.from(user.salt, 'base64'))
  const a = Buffer.from(hash, 'base64')
  const b = Buffer.from(user.hash, 'base64')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Secret for signing session cookies. Set PROZYMI_SECRET to choose one;
 * otherwise a random secret is generated once and kept in the blob store,
 * so a fresh deploy needs no configuration.
 */
export async function getSecret(kv: KV, env: string | undefined): Promise<string> {
  if (env) return env
  const key = 'meta/session-secret'
  const existing = await kv.getJSON<string>(key)
  if (existing) return existing
  const fresh = randomBytes(32).toString('base64url')
  if (await kv.setJSON(key, fresh, { onlyIfNew: true })) return fresh
  return (await kv.getJSON<string>(key)) ?? fresh
}

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url')

export function createToken(session: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function readToken(token: string | undefined, secret: string, now = Date.now()): Session | null {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = Buffer.from(sign(payload, secret))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session
    return typeof s.uid === 'string' && s.exp > now ? s : null
  } catch {
    return null
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function sessionCookie(token: string, secure: boolean, maxAge = SESSION_DAYS * 86400): string {
  return [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`, secure ? 'Secure' : '']
    .filter(Boolean)
    .join('; ')
}
