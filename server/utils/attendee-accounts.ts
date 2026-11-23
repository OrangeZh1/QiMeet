import type { PoolConnection } from 'mysql2/promise'
import { randomBytes, randomInt } from 'node:crypto'
import { accountCookie, adminUserDefaultPageSize, adminUserPageSizes, attendeeContactPhone, attendeePasswordMin, attendeePasswordMax, detectAttendeeContact, type AccountIntent, type AdminUserPage, type AttendeeAccount, type AttendeeProfile, type ContactKind } from '#shared/attendee-account'
import type { RequestEvent } from './security'

type AccountRow = { id: number, kind: AttendeeAccount['kind'], identifier: string }
type AccountProfile = { displayName: string, contactPhone: string | null, avatarMaterialId: string | null }
type AccountAvatar = { id: number, avatarMaterialId: string | null, avatarRevision: number, hasOwnAvatar: number }
type StoredProfile = AccountRow & AccountAvatar & { displayName: string, hasPassword: number, verifiedPhone: string | null, verifiedEmail: string | null, wechatLinked: number }
const options = () => ({ path: '/', httpOnly: true, secure: origin().startsWith('https:'), sameSite: 'lax' as const })

export async function getAttendeeAccount(event: RequestEvent) {
  const token = getCookie(event, accountCookie)
  if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return
  return first<StoredProfile>(
    'SELECT a.id,a.kind,a.identifier,a.display_name AS displayName,a.verified_phone AS verifiedPhone,a.verified_email AS verifiedEmail,a.avatar_material_id AS avatarMaterialId,' +
    'a.avatar_revision AS avatarRevision,(a.avatar_mime IS NOT NULL) AS hasOwnAvatar,(a.password_hash IS NOT NULL) AS hasPassword,' +
    'EXISTS (SELECT 1 FROM attendee_wechat_links w WHERE w.account_id=a.id) AS wechatLinked ' +
    "FROM sessions s JOIN attendee_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.kind='account' AND s.expires_at>UTC_TIMESTAMP(3) AND a.disabled_at IS NULL",
    [hash(token)],
  )
}

export async function requireAttendeeAccount(event: RequestEvent) {
  const account = await getAttendeeAccount(event)
  if (!account) fail(401, '请先登录客户端账号')
  return account
}

export function accountDisplay(account: AccountRow | undefined): AttendeeAccount | null {
  if (!account) return null
  return { id: account.id, kind: account.kind, label: account.kind === 'wechat' ? '微信用户' : account.identifier }
}

function attendeeAvatarUrl(account: AccountAvatar) {
  return account.hasOwnAvatar || account.avatarMaterialId
    ? '/api/account/avatar?id=' + account.id + '&v=' + account.avatarRevision : null
}

export function attendeeProfileView(account: StoredProfile | undefined): AttendeeProfile | null {
  if (!account) return null
  return {
    ...accountDisplay(account)!, displayName: account.displayName, avatarUrl: attendeeAvatarUrl(account),
    hasPassword: Boolean(account.hasPassword), contactPhone: attendeeContactPhone(account),
    contactPhoneVerified: Boolean(account.verifiedPhone), contactEmail: account.verifiedEmail,
    wechatLinked: account.kind === 'wechat' || Boolean(account.wechatLinked),
  }
}

export async function saveAttendeeDisplayName(event: RequestEvent, input: Record<string, unknown>) {
  const account = await requireAttendeeAccount(event)
  const displayName = text(input.displayName, 60, '用户名')
  await mutate('UPDATE attendee_accounts SET display_name=? WHERE id=?', [displayName, account.id])
  return { displayName }
}

export async function uploadAttendeeAvatar(event: RequestEvent) {
  const account = await requireAttendeeAccount(event)
  throttle(event, 'attendee-avatar:' + account.id, 12)
  const filename = cleanFilename(getQuery(event).name)
  const bytes = await rawUpload(event, uploadLimit('image'))
  const mime = await verifyUpload(bytes, 'image', filename)
  const avatarUrl = await transaction(async (db) => {
    await mutate('UPDATE attendee_accounts SET avatar_mime=?,avatar_payload=?,avatar_revision=avatar_revision+1 WHERE id=?',
      [mime, bytes, account.id], db)
    const row = await first<AccountAvatar>(
      'SELECT id,avatar_material_id AS avatarMaterialId,avatar_revision AS avatarRevision,1 AS hasOwnAvatar FROM attendee_accounts WHERE id=?',
      [account.id], db,
    )
    if (!row) fail(404, '用户不存在')
    return attendeeAvatarUrl(row)
  })
  return { avatarUrl }
}

export async function readAttendeeAvatar(event: RequestEvent) {
  const id = positive(getQuery(event).id)
  const account = await getAttendeeAccount(event)
  if (account?.id !== id) await assertAdmin(event)
  const avatar = await first<{ mime: string | null, payload: Buffer | null, revision: number }>(
    "SELECT COALESCE(a.avatar_mime,m.mime) AS mime,COALESCE(a.avatar_payload,m.payload) AS payload,a.avatar_revision AS revision " +
    "FROM attendee_accounts a LEFT JOIN materials m ON m.id=a.avatar_material_id AND m.kind='image' WHERE a.id=?",
    [id],
  )
  if (!avatar?.mime || !avatar.payload) fail(404, '头像不存在')
  setResponseHeaders(event, { 'content-type': avatar.mime, 'content-security-policy': "default-src 'none'; sandbox" })
  if (imageNotModified(event, `attendee-avatar-${id}-${avatar.revision}`, getQuery(event).v === String(avatar.revision), true)) return null
  return avatar.payload
}

export async function listAttendeeAccounts(query: Record<string, unknown>): Promise<AdminUserPage> {
  const term = text(query.q, 254, '搜索条件', false).toLowerCase()
  const contact = term.replace(/^\+86\s*(?=\d)/, '')
  const accountId = /^\d{1,10}$/.test(term) && Number(term) <= 4294967295 ? Number(term) : null
  const requestedPage = query.page === undefined ? 1 : positive(query.page)
  const pageSize = query.pageSize === undefined ? adminUserDefaultPageSize : positive(query.pageSize)
  if (!adminUserPageSizes.some(size => size === pageSize)) fail(400, '每页条数有误')
  const where = term
    ? " WHERE (kind IN ('phone','email') AND LOCATE(?,identifier)>0) OR LOCATE(?,contact_phone)>0 OR LOCATE(?,LOWER(display_name))>0 OR id=?"
    : ''
  const parameters = term ? [contact, contact, term, accountId] : []
  const count = await first<{ total: number }>('SELECT COUNT(*) AS total FROM attendee_accounts' + where, parameters)
  const total = count?.total ?? 0
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)))
  const accounts = await rows<AccountRow & AccountProfile & AccountAvatar & { createdAt: string, disabled: number }>(
    'SELECT id,kind,identifier,display_name AS displayName,contact_phone AS contactPhone,avatar_material_id AS avatarMaterialId,' +
    'avatar_revision AS avatarRevision,(avatar_mime IS NOT NULL) AS hasOwnAvatar,created_at AS createdAt,(disabled_at IS NOT NULL) AS disabled ' +
    'FROM attendee_accounts' + where + ' ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',
    [...parameters, pageSize, (page - 1) * pageSize],
  )
  return {
    rows: accounts.map(account => ({
      ...accountDisplay(account)!,
      displayName: account.displayName,
      phone: account.kind === 'phone' ? account.identifier : account.contactPhone,
      avatarUrl: attendeeAvatarUrl(account),
      createdAt: iso(account.createdAt),
      disabled: Boolean(account.disabled),
    })),
    total, page, pageSize,
  }
}

export async function createAttendeeAccount(kind: ContactKind, identifier: string, password: unknown, db?: PoolConnection, profile?: AccountProfile) {
  const passwordHash = await createPasswordHash(registrationPassword(password))
  if (profile?.avatarMaterialId) await assertMaterial(profile.avatarMaterialId, db)
  try {
    const { insertId } = await mutate(
      'INSERT INTO attendee_accounts (kind,identifier,password_hash,display_name,contact_phone,avatar_material_id,created_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))',
      [kind, identifier, passwordHash, profile?.displayName ?? '', profile?.contactPhone ?? null, profile?.avatarMaterialId ?? null], db,
    )
    return { id: insertId, kind, label: identifier }
  } catch (error) {
    if (isDuplicate(error)) fail(409, '此联系方式已注册')
    if (error instanceof Error && 'code' in error && error.code === 'ER_NO_REFERENCED_ROW_2') fail(409, '头像素材已不可用，请重新选择')
    throw error
  }
}

async function attendeeForUpdate(id: number, db: PoolConnection) {
  const account = await first<{ kind: AttendeeAccount['kind'] }>('SELECT kind FROM attendee_accounts WHERE id=? FOR UPDATE', [id], db)
  if (!account) fail(404, '用户不存在')
  return account
}

export async function editAttendeeAccount(input: Record<string, unknown>) {
  const id = positive(input.id)
  const displayName = text(input.displayName, 60, '名称')
  const passwordHash = input.password === undefined ? undefined : await createPasswordHash(registrationPassword(input.password))
  await transaction(async (db) => {
    const account = await attendeeForUpdate(id, db)
    const fields = ['display_name=?']
    const values: unknown[] = [displayName]
    if (passwordHash) {
      if (account.kind === 'wechat') fail(403, '此账号使用微信登录')
      fields.push('password_hash=?')
      values.push(passwordHash)
    }
    if (account.kind !== 'phone' && input.phone !== undefined) {
      const candidate = text(input.phone, 16, '手机号', false)
      fields.push('contact_phone=?')
      values.push(candidate ? contactIdentifier('phone', candidate) : null)
    }
    if (input.avatarMaterialId !== undefined) {
      const avatar = text(input.avatarMaterialId, 36, '头像素材', false).toLowerCase() || null
      if (avatar) await assertMaterial(avatar, db)
      fields.push('avatar_material_id=?', 'avatar_payload=NULL', 'avatar_mime=NULL', 'avatar_revision=avatar_revision+1')
      values.push(avatar)
    }
    try {
      await mutate('UPDATE attendee_accounts SET ' + fields.join(',') + ' WHERE id=?', [...values, id], db)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ER_NO_REFERENCED_ROW_2') fail(409, '头像素材已不可用，请重新选择')
      throw error
    }
    if (passwordHash) await mutate('DELETE FROM sessions WHERE account_id=?', [id], db)
  })
  return { ok: true }
}

export async function setAttendeeStatus(input: Record<string, unknown>) {
  const id = positive(input.id)
  const disabled = input.disabled
  if (typeof disabled !== 'boolean') fail(400, '请选择用户状态')
  await transaction(async (db) => {
    await attendeeForUpdate(id, db)
    await mutate('UPDATE attendee_accounts SET disabled_at=IF(?,COALESCE(disabled_at,UTC_TIMESTAMP(3)),NULL) WHERE id=?', [disabled, id], db)
    if (disabled) await mutate('DELETE FROM sessions WHERE account_id=?', [id], db)
  })
  return { ok: true }
}

export async function deleteAttendeeAccount(id: number) {
  await transaction(async (db) => {
    await attendeeForUpdate(id, db)
    await mutate('DELETE FROM sessions WHERE account_id=?', [id], db)
    await mutate('UPDATE registrations SET account_id=NULL WHERE account_id=?', [id], db)
    await mutate('DELETE FROM attendee_accounts WHERE id=?', [id], db)
  })
  return { ok: true }
}

async function createAccountSession(event: RequestEvent, id: number, db: PoolConnection) {
  if (!await first('SELECT id FROM attendee_accounts WHERE id=? AND disabled_at IS NULL FOR UPDATE', [id], db)) {
    fail(403, '账号已停用或不存在')
  }
  const token = randomBytes(32).toString('base64url')
  const days = 30
  await mutate("INSERT INTO sessions (token_hash,kind,registration_id,expires_at,account_id) VALUES (?,'account',NULL,UTC_TIMESTAMP(3)+INTERVAL 30 DAY,?)",
    [hash(token), id], db)
  const previous = getCookie(event, accountCookie)
  if (previous) await mutate("DELETE FROM sessions WHERE token_hash=? AND kind='account'", [hash(previous)], db)
  return () => setCookie(event, accountCookie, token, { ...options(), maxAge: days * 86400 })
}

export async function logoutAttendee(event: RequestEvent) {
  const previous = getCookie(event, accountCookie)
  if (previous) await mutate("DELETE FROM sessions WHERE token_hash=? AND kind='account'", [hash(previous)])
  deleteCookie(event, accountCookie, options())
  return { ok: true }
}

export function contactIdentifier(kind: ContactKind, input: unknown) {
  const contact = detectAttendeeContact(text(input, 254, kind === 'email' ? '邮箱' : '手机号'))
  if (contact?.kind !== kind) fail(400, kind === 'email' ? '请输入有效的邮箱地址' : '请输入有效的中国大陆手机号')
  return contact.identifier
}

type CodePurpose = AccountIntent | `profile:${number}:${string}`
const codeDigest = (kind: ContactKind, identifier: string, intent: CodePurpose, code: string) =>
  sign(['attendee-code', kind, identifier, intent, code].join(':'))
const verifiedColumn = (kind: ContactKind) => kind === 'phone' ? 'verified_phone' : 'verified_email'

export async function deliverAttendeeCode(event: RequestEvent, kind: ContactKind, identifier: string, intent: CodePurpose) {
  throttle(event, 'attendee-code:' + kind, 8, 600000)
  const deliver = await attendeeCodeDelivery(kind)
  const code = String(randomInt(100000, 1000000))
  const digest = codeDigest(kind, identifier, intent, code)
  await transaction(async (db) => {
    // Keep one send cooldown per address across all purposes and sessions.
    await mutate(
      "INSERT INTO attendee_codes (kind,identifier,digest,sent_at,expires_at,remaining) VALUES (?,?,'',UTC_TIMESTAMP(3)-INTERVAL 60 SECOND,UTC_TIMESTAMP(3),0) " +
      'ON DUPLICATE KEY UPDATE identifier=identifier',
      [kind, identifier], db,
    )
    const reserved = await mutate(
      "UPDATE attendee_codes SET sent_at=UTC_TIMESTAMP(3),expires_at=UTC_TIMESTAMP(3)+INTERVAL 60 SECOND,digest='',remaining=0 " +
      'WHERE kind=? AND identifier=? AND sent_at<=UTC_TIMESTAMP(3)-INTERVAL 60 SECOND',
      [kind, identifier], db,
    )
    if (!reserved.affectedRows) fail(429, '请在 60 秒后重新获取验证码')
    await mutate(
      'INSERT INTO attendee_code_challenges (kind,identifier,purpose_hash,digest,expires_at,remaining) ' +
      'VALUES (?,?,?,?,UTC_TIMESTAMP(3)+INTERVAL 5 MINUTE,5) ' +
      'ON DUPLICATE KEY UPDATE digest=?,expires_at=UTC_TIMESTAMP(3)+INTERVAL 5 MINUTE,remaining=5',
      [kind, identifier, hash(intent), digest, digest], db,
    )
  })
  try {
    await deliver(identifier, code)
  } catch {
    fail(502, '验证码暂时无法送达，请稍后重试')
  }
  if (randomBytes(1)[0] === 0) {
    await mutate('DELETE FROM attendee_code_challenges WHERE expires_at<=UTC_TIMESTAMP(3) LIMIT 1000', [])
    await mutate('DELETE FROM attendee_codes WHERE expires_at<=UTC_TIMESTAMP(3) LIMIT 1000', [])
  }
  return { retryAfter: 60 }
}

async function consumeAttendeeCode(db: PoolConnection, kind: ContactKind, identifier: string, purpose: CodePurpose, code: string) {
  const params = [kind, identifier, hash(purpose)]
  const challenge = await first<{ digest: string, remaining: number }>(
    'SELECT digest,remaining FROM attendee_code_challenges WHERE kind=? AND identifier=? AND purpose_hash=? AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE', params, db,
  )
  if (!challenge?.remaining) return '验证码已失效，请重新获取'
  if (!safeEqual(challenge.digest, codeDigest(kind, identifier, purpose, code))) {
    await mutate('UPDATE attendee_code_challenges SET remaining=remaining-1 WHERE kind=? AND identifier=? AND purpose_hash=?', params, db)
    return '验证码错误'
  }
  await mutate('DELETE FROM attendee_code_challenges WHERE kind=? AND identifier=? AND purpose_hash=?', params, db)
}

export async function verifyAttendeeCode(
  event: RequestEvent, kind: ContactKind, identifier: string, intent: AccountIntent, code: string, password?: unknown,
) {
  throttle(event, 'attendee-code-verify', 35, 300000)
  if (!/^\d{6}$/.test(code)) fail(400, '请输入 6 位验证码')
  const newPassword = intent === 'register' ? registrationPassword(password) : undefined
  const result = await transaction(async (db) => {
    const error = await consumeAttendeeCode(db, kind, identifier, intent, code)
    if (error) return { error }
    const existing = await first<AccountRow>('SELECT id,kind,identifier FROM attendee_accounts WHERE kind=? AND identifier=?', [kind, identifier], db)
    if (intent === 'login' && !existing) return { error: '此联系方式尚未注册，请先注册' }
    if (intent === 'register' && existing) return { error: '此联系方式已注册，请直接登录' }
    const id = existing?.id ?? (await createAttendeeAccount(kind, identifier, newPassword, db)).id
    const column = verifiedColumn(kind)
    await mutate('UPDATE attendee_accounts SET ' + column + '=? WHERE id=? AND ' + column + ' IS NULL', [identifier, id], db)
    return { account: accountDisplay({ id, kind, identifier }), writeCookie: await createAccountSession(event, id, db) }
  })
  if (!result.writeCookie) fail(400, result.error || '验证失败')
  result.writeCookie()
  return result.account
}

export async function attendeeContactAction(event: RequestEvent, action: 'contact-code' | 'contact', input: Record<string, unknown>) {
  const account = await requireAttendeeAccount(event)
  const kind = oneOf(input.kind, ['phone', 'email'], '联系方式')
  const identifier = contactIdentifier(kind, input.identifier)
  const token = hash(getCookie(event, accountCookie)!)
  const purpose = `profile:${account.id}:${token}` as const
  if (action === 'contact-code') {
    throttle(event, 'attendee-contact-code:' + account.id, 8, 600000)
    return deliverAttendeeCode(event, kind, identifier, purpose)
  }
  throttle(event, 'attendee-contact-verify:' + account.id, 15, 300000)
  const code = text(input.code, 6, '验证码')
  if (!/^\d{6}$/.test(code)) fail(400, '请输入 6 位验证码')
  const error = await transaction(async (db) => {
    const challengeError = await consumeAttendeeCode(db, kind, identifier, purpose, code)
    if (challengeError) return challengeError
    const activeAccount = await first('SELECT id FROM attendee_accounts WHERE id=? AND disabled_at IS NULL FOR UPDATE', [account.id], db)
    const activeSession = activeAccount && await first(
      "SELECT 1 FROM sessions WHERE kind='account' AND account_id=? AND token_hash=? AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",
      [account.id, token], db,
    )
    if (!activeSession) fail(401, '登录已过期，请重新登录')
    await mutate('UPDATE attendee_accounts SET ' + verifiedColumn(kind) + '=? WHERE id=?', [identifier, account.id], db)
  })
  if (error) fail(400, error)
  return kind === 'phone' ? { contactPhone: identifier, contactPhoneVerified: true } : { contactEmail: identifier }
}

function registrationPassword(value: unknown) {
  if (typeof value !== 'string' || value.length < attendeePasswordMin || value.length > attendeePasswordMax || !value.trim()) {
    fail(400, '密码须为 ' + attendeePasswordMin + ' 至 ' + attendeePasswordMax + ' 个字符')
  }
  return value
}

export async function signInWithPassword(event: RequestEvent, kind: ContactKind, identifier: string, password: unknown) {
  throttle(event, 'attendee-password-login', 15, 300000)
  if (typeof password !== 'string' || !password || password.length > attendeePasswordMax) fail(400, '请输入密码')
  const account = await first<AccountRow & { passwordHash: string | null }>(
    'SELECT id,kind,identifier,password_hash AS passwordHash FROM attendee_accounts WHERE kind=? AND identifier=?',
    [kind, identifier],
  )
  const verified = await verifyPassword(password, account?.passwordHash || '0'.repeat(32) + ':' + '0'.repeat(128))
  if (!verified || !account?.passwordHash) fail(401, '账号或密码有误，也可使用验证码登录')
  const writeCookie = await transaction(async (db) => {
    const current = await first<{ passwordHash: string | null }>(
      'SELECT password_hash AS passwordHash FROM attendee_accounts WHERE id=? FOR UPDATE', [account.id], db,
    )
    if (current?.passwordHash !== account.passwordHash) fail(401, '账号或密码有误，也可使用验证码登录')
    return createAccountSession(event, account.id, db)
  })
  writeCookie()
  return accountDisplay(account)
}

export async function saveAttendeePassword(event: RequestEvent, input: Record<string, unknown>) {
  const account = await requireAttendeeAccount(event)
  if (account.kind === 'wechat') fail(403, '此账号使用微信登录')
  const next = registrationPassword(input.newPassword)
  throttle(event, 'attendee-change-password:' + account.id, 10)
  const token = hash(getCookie(event, accountCookie)!)
  const nextHash = await createPasswordHash(next)
  await transaction(async (db) => {
    const current = await first<{ passwordHash: string | null }>(
      'SELECT password_hash AS passwordHash FROM attendee_accounts WHERE id=? FOR UPDATE', [account.id], db,
    )
    if (!current) fail(401, '登录已过期，请重新登录')
    const active = await first("SELECT 1 FROM sessions WHERE kind='account' AND account_id=? AND token_hash=? AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",
      [account.id, token], db)
    if (!active) fail(401, '登录已过期，请重新登录')
    if (current.passwordHash) {
      if (!await verifyPassword(input.currentPassword, current.passwordHash)) fail(403, '当前密码有误')
      if (input.currentPassword === next) fail(400, '新密码须与当前密码不同')
    }
    await mutate('UPDATE attendee_accounts SET password_hash=? WHERE id=?', [nextHash, account.id], db)
    await mutate("DELETE FROM sessions WHERE kind='account' AND account_id=? AND token_hash<>?", [account.id, token], db)
  })
  return { ok: true }
}

function wechatLink(openId: string, db: PoolConnection, lock = false) {
  return first<{ accountId: number, appId: string | null }>(
    'SELECT account_id AS accountId,app_id AS appId FROM attendee_wechat_links WHERE open_id=?' + (lock ? ' FOR UPDATE' : ''), [openId], db)
}

export async function signInWithWechat(event: RequestEvent, openId: string, appId: string) {
  const writeCookie = await transaction(async (db) => {
    const link = await wechatLink(openId, db)
    if (link) {
      if (!link.appId) await mutate('UPDATE attendee_wechat_links SET app_id=? WHERE open_id=? AND app_id IS NULL', [appId, openId], db)
      const app = link.appId ?? (await wechatLink(openId, db, true))?.appId
      if (app !== appId) fail(409, '此微信身份属于其他网站应用')
      return createAccountSession(event, link.accountId, db)
    }
    const result = await mutate("INSERT INTO attendee_accounts (kind,identifier,created_at) VALUES ('wechat',?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)", [openId], db)
    await mutate('INSERT INTO attendee_wechat_links (open_id,app_id,account_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE account_id=attendee_wechat_links.account_id', [openId, appId, result.insertId], db)
    const owner = await wechatLink(openId, db, true)
    if (owner?.accountId !== result.insertId || owner.appId !== appId) fail(409, '微信账号绑定状态已变化，请重试')
    return createAccountSession(event, result.insertId, db)
  })
  writeCookie()
}

export async function bindAttendeeWechat(accountId: number, sessionHash: string, openId: string, appId: string) {
  return transaction(async (db) => {
    const account = await first("SELECT id FROM attendee_accounts WHERE id=? AND kind IN ('phone','email') AND disabled_at IS NULL FOR UPDATE", [accountId], db)
    const active = account && await first("SELECT 1 FROM sessions WHERE kind='account' AND account_id=? AND token_hash=? AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",
      [accountId, sessionHash], db)
    if (!active) fail(401, '登录已过期，请重新登录')
    const owner = await wechatLink(openId, db)
    if (owner) return owner.accountId === accountId && owner.appId === appId ? 'linked' : 'conflict'
    if (await first("SELECT id FROM attendee_accounts WHERE kind='wechat' AND identifier=?", [openId], db)) return 'conflict'
    try {
      await mutate('INSERT INTO attendee_wechat_links (open_id,app_id,account_id) VALUES (?,?,?)', [openId, appId, accountId], db)
      return 'linked'
    } catch (error) {
      if (isDuplicate(error)) return 'conflict'
      throw error
    }
  })
}
