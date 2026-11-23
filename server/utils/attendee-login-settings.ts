import type { PoolConnection } from 'mysql2/promise'
import type { ContactKind } from '#shared/attendee-account'

type LoginRow = {
  phoneLoginEnabled: number, emailLoginEnabled: number, wechatLoginEnabled: number | null,
  wechatAppId: string | null, wechatAppSecret: Buffer | null,
}
const secretContext = 'site-wechat-app-secret'

export async function clientLoginRow(db?: PoolConnection) {
  const row = await first<LoginRow>(
    'SELECT phone_login_enabled AS phoneLoginEnabled,email_login_enabled AS emailLoginEnabled,' +
    'wechat_login_enabled AS wechatLoginEnabled,wechat_app_id AS wechatAppId,wechat_app_secret AS wechatAppSecret FROM site_settings WHERE id=1',
    [], db,
  )
  if (!row) fail(503, '站点设置尚未初始化')
  return row
}

export function clientLoginView(row: LoginRow) {
  const environmentId = process.env.QI_WECHAT_APP_ID?.trim() || ''
  const wechatAppId = row.wechatAppId ?? environmentId
  const environmentSecret = wechatAppId === environmentId ? process.env.QI_WECHAT_APP_SECRET?.trim() : undefined
  const wechatSecretConfigured = Boolean(row.wechatAppSecret || environmentSecret)
  const wechatLoginEnabled = row.wechatLoginEnabled === null
    ? Boolean(wechatAppId && wechatSecretConfigured) : Boolean(row.wechatLoginEnabled)
  const address = origin()
  const wechatCallbackUrl = address + '/api/account/wechat-callback'
  return {
    phoneLoginEnabled: Boolean(row.phoneLoginEnabled), emailLoginEnabled: Boolean(row.emailLoginEnabled),
    wechatLoginEnabled, wechatAppId, wechatSecretConfigured, wechatCallbackUrl,
  }
}

export function configuredWechat(row: LoginRow) {
  const view = clientLoginView(row)
  if (!view.wechatLoginEnabled || !view.wechatAppId || !view.wechatSecretConfigured || !view.wechatCallbackUrl.startsWith('https:')) return
  return view
}

export async function attendeeWechatCredentials() {
  const row = await clientLoginRow()
  const view = configuredWechat(row)
  if (!view) return
  const secret = row.wechatAppSecret
    ? unseal(row.wechatAppSecret, secretContext).toString('utf8') : process.env.QI_WECHAT_APP_SECRET?.trim()
  return secret ? { appId: view.wechatAppId, secret, callback: view.wechatCallbackUrl } : undefined
}

export async function requireContactLogin(kind: ContactKind) {
  const row = await clientLoginRow()
  if (!(kind === 'phone' ? row.phoneLoginEnabled : row.emailLoginEnabled)) {
    fail(403, kind === 'phone' ? '站点未开放手机号登录与注册' : '站点未开放邮箱登录与注册')
  }
}

function loginSwitch(input: unknown, current: boolean | null) {
  if (input === undefined) return current
  if (typeof input !== 'boolean') fail(400, '登录方式设置有误')
  return input
}

export async function saveClientLoginSettings(input: Record<string, unknown>, db: PoolConnection) {
  const fields = ['phoneLoginEnabled', 'emailLoginEnabled', 'wechatLoginEnabled', 'wechatAppId', 'wechatAppSecret']
  if (!fields.some(field => input[field] !== undefined)) return
  const current = await clientLoginRow(db)
  const appId = input.wechatAppId === undefined ? current.wechatAppId : text(input.wechatAppId, 64, '微信 AppID', false)
  if (appId && !/^wx[A-Za-z0-9]{1,62}$/.test(appId)) fail(400, '请输入以 wx 开头的微信 AppID')
  const secret = text(input.wechatAppSecret, 128, '微信 AppSecret', false)
  if (secret && !(appId ?? process.env.QI_WECHAT_APP_ID?.trim())) fail(400, '请先填写微信 AppID')
  const encrypted = secret ? seal(Buffer.from(secret), secretContext)
    : appId === current.wechatAppId ? current.wechatAppSecret : null
  await mutate(
    'UPDATE site_settings SET phone_login_enabled=?,email_login_enabled=?,wechat_login_enabled=?,wechat_app_id=?,wechat_app_secret=? WHERE id=1',
    [
      loginSwitch(input.phoneLoginEnabled, Boolean(current.phoneLoginEnabled)),
      loginSwitch(input.emailLoginEnabled, Boolean(current.emailLoginEnabled)),
      loginSwitch(input.wechatLoginEnabled, current.wechatLoginEnabled === null ? null : Boolean(current.wechatLoginEnabled)),
      appId, encrypted,
    ], db,
  )
}
