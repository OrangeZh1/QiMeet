import type { PoolConnection } from 'mysql2/promise'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { isIPv4 } from 'node:net'
import { promisify } from 'node:util'

export type RequestEvent = Parameters<typeof getCookie>[0]
const scryptAsync = promisify(scrypt)
const buckets = new Map<string, { count: number, until: number }>()
const HOUR = 3600000
const loopbackHosts = ['localhost', '127.0.0.1', '[::1]']

export function fail(statusCode: number, message: string, data?: Record<string, unknown>): never {
  throw createError({ statusCode, message, data: { ...data, message } })
}

export function origin() {
  if (!process.env.QI_ORIGIN) throw new Error('QI_ORIGIN is required')
  const url = new URL(process.env.QI_ORIGIN)
  if (!['http:', 'https:'].includes(url.protocol) ||
    (url.protocol === 'http:' && !loopbackHosts.includes(url.hostname) && !isLanPreview(url))) {
    throw new Error('QI_ORIGIN must use HTTPS outside loopback')
  }
  return url.origin
}

function isLanPreview(url: URL) {
  return import.meta.dev && url.protocol === 'http:' && isIPv4(url.hostname) &&
    /^(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/.test(url.hostname)
}

export function privateResponse(event: RequestEvent) {
  setResponseHeaders(event, { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' })
}

export function sameOrigin(event: RequestEvent) {
  const canonical = origin()
  const supplied = getHeader(event, 'origin')
  const url = new URL(canonical)
  if (!isLanPreview(url)) {
    if (supplied === canonical) return
  } else {
    const host = getHeader(event, 'host')
    const port = url.port ? ':' + url.port : ''
    if (supplied === 'http://' + host &&
      (host === url.host || loopbackHosts.some(name => host === name + port))) return
  }
  fail(403, '请求来源无效，请重新打开页面')
}

export function throttle(event: RequestEvent, scope: string, limit: number, window = 300000) {
  const now = Date.now()
  const address = getRequestIP(event, { xForwardedFor: process.env.QI_TRUST_PROXY === '1' }) || 'local'
  const key = scope + ':' + address
  if (buckets.size >= 4096) {
    for (const [item, bucket] of buckets) if (bucket.until <= now) buckets.delete(item)
    if (buckets.size >= 4096 && !buckets.has(key)) fail(429, '请求较多，请稍后重试')
  }
  const current = buckets.get(key)
  const bucket = current && current.until > now ? current : { count: 0, until: now + window }
  if (++bucket.count > limit) {
    setResponseHeader(event, 'Retry-After', Math.ceil((bucket.until - now) / 1000))
    fail(429, '请求过于频繁，请稍后重试')
  }
  buckets.set(key, bucket)
}

function key(name: 'QI_SIGNING_KEY' | 'QI_DATA_KEY') {
  const value = process.env[name] || ''
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(name + ' must be 32 hexadecimal bytes')
  return Buffer.from(value, 'hex')
}

export const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export const sign = (value: string) => createHmac('sha256', key('QI_SIGNING_KEY')).update(value).digest('base64url')
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function seal(bytes: Buffer, context: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key('QI_DATA_KEY'), iv)
  cipher.setAAD(Buffer.from(context))
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted])
}
export function unseal(bytes: Buffer, context: string) {
  const decipher = createDecipheriv('aes-256-gcm', key('QI_DATA_KEY'), bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(12, 28))
  decipher.setAAD(Buffer.from(context))
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()])
}

const credentialAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export function newCredential() {
  const characters = Array.from(randomBytes(16), byte => credentialAlphabet[byte & 31]).join('')
  return characters.match(/.{4}/g)!.join('-')
}
export const credentialHash = (value: string) => hash(value.replace(/[\s-]/g, '').toUpperCase())
type SessionKind = 'admin' | 'attendee' | 'checkin'
type Session = { kind: SessionKind, registrationId: number | null }
const sessionCookie = (eventId?: number) => eventId ? 'qm_e_' + eventId : 'qm_admin'
const cookieOptions = () => ({ path: '/', httpOnly: true, secure: origin().startsWith('https:'), sameSite: 'lax' as const })

export async function findQiSession(event: RequestEvent, eventId?: number, accountId?: number) {
  if (eventId && !accountId) return
  const token = getCookie(event, sessionCookie(eventId))
  if (token && /^[a-zA-Z0-9_-]{43}$/.test(token)) {
    const stored = await first<Session>(
      "SELECT s.kind,s.registration_id AS registrationId FROM sessions s LEFT JOIN registrations r ON r.id=s.registration_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3) AND " +
      (eventId ? "r.event_id=? AND s.account_id=? AND s.kind IN ('attendee','checkin')" : "s.kind='admin'"),
      eventId ? [hash(token), eventId, accountId] : [hash(token)],
    )
    if (stored) return stored
  }
  if (eventId) return first<Session>(
    "SELECT 'attendee' AS kind,id AS registrationId FROM registrations WHERE event_id=? AND account_id=? ORDER BY id DESC LIMIT 1",
    [eventId, accountId],
  )
}
export async function prepareQiSession(
  event: RequestEvent, kind: SessionKind, registrationId: number | null,
  db: PoolConnection, eventId?: number, accountId?: number,
) {
  const token = randomBytes(32).toString('base64url')
  const ttl = (kind === 'admin' ? 12 : kind === 'checkin' ? 4 : 24 * 180) * HOUR
  const cookie = sessionCookie(eventId)
  const options = { ...cookieOptions(), maxAge: ttl / 1000 }
  const previous = getCookie(event, cookie)
  await mutate('INSERT INTO sessions (token_hash,kind,registration_id,expires_at,account_id) VALUES (?,?,?,?,?)',
    [hash(token), kind, registrationId, utc(new Date(Date.now() + ttl)), accountId ?? null], db)
  if (previous) await mutate('DELETE FROM sessions WHERE token_hash=? AND account_id <=> ?', [hash(previous), accountId ?? null], db)
  return () => setCookie(event, cookie, token, options)
}

export async function clearQiSession(event: RequestEvent) {
  const token = getCookie(event, sessionCookie())
  if (token) await mutate("DELETE FROM sessions WHERE token_hash=? AND kind='admin'", [hash(token)])
  deleteCookie(event, sessionCookie(), cookieOptions())
}

export async function assertAdmin(event: RequestEvent) {
  if (!(await findQiSession(event))) fail(401, '请先登录管理后台')
}

export async function verifyPassword(password: unknown, passwordHash: string) {
  if (typeof password !== 'string' || password.length > 200) return false
  const [salt, stored] = passwordHash.split(':')
  const actual = (await scryptAsync(password, salt!, 64) as Buffer).toString('hex')
  return safeEqual(actual, stored!)
}
export async function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString('hex')
  return salt + ':' + (await scryptAsync(password, salt, 64) as Buffer).toString('hex')
}
type AdminCredentials = { username: string, password_hash: string }

export async function signInAdmin(event: RequestEvent, username: string, password: string) {
  const credentials = 'SELECT username, password_hash FROM admin_account WHERE id=1'
  const account = await first<AdminCredentials>(credentials)
  const stored = account?.password_hash || '0'.repeat(32) + ':' + '0'.repeat(128)
  const verified = await verifyPassword(password, stored)
  if (!verified || !account || !safeEqual(account.username, username)) fail(401, '账号或密码有误')
  const writeCookie = await transaction(async (db) => {
    const current = await first<AdminCredentials>(credentials + ' FOR UPDATE', [], db)
    if (current?.username !== account.username || current.password_hash !== account.password_hash) fail(401, '账号或密码有误')
    return prepareQiSession(event, 'admin', null, db)
  })
  writeCookie()
  if (randomBytes(1)[0] === 0) await mutate('DELETE FROM sessions WHERE expires_at<=UTC_TIMESTAMP(3) LIMIT 1000', [])
}
