import { randomBytes } from 'node:crypto'
import { accountCookie, attendeeReturn } from '#shared/attendee-account'
import type { RequestEvent } from './security'

const oauthCookie = '__Host-qm_wechat'
const oauthOptions = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' as const }
const profilePath = '/mine/profile'
type LinkState = { accountId: number, proof: string }
const bindingProof = (state: string, appId: string, id: number, sessionHash: string) =>
  sign(['attendee-wechat-link', state, appId, id, sessionHash].join(':'))

export async function beginWechat(event: RequestEvent, next: unknown, bindAccountId?: number) {
  const config = await attendeeWechatCredentials()
  if (!config) fail(503, '微信扫码登录尚未配置')
  const state = randomBytes(24).toString('hex')
  const link = bindAccountId === undefined ? undefined : {
    accountId: bindAccountId, proof: bindingProof(state, config.appId, bindAccountId, hash(getCookie(event, accountCookie)!)),
  }
  setCookie(event, oauthCookie, JSON.stringify({ state, next: attendeeReturn(next), appId: config.appId, link }), { ...oauthOptions, maxAge: 600 })
  const query = new URLSearchParams({
    appid: config.appId, redirect_uri: config.callback,
    response_type: 'code', scope: 'snsapi_login', state,
  })
  return 'https://open.weixin.qq.com/connect/qrconnect?' + query + '#wechat_redirect'
}

export async function beginWechatLink(event: RequestEvent) {
  const account = await requireAttendeeAccount(event)
  throttle(event, 'attendee-wechat-link:' + account.id, 10)
  if (account.kind === 'wechat' || account.wechatLinked) fail(409, '此账号已绑定微信')
  return { authorizationUrl: await beginWechat(event, profilePath, account.id) }
}

export async function finishWechat(event: RequestEvent) {
  const cookie = getCookie(event, oauthCookie)
  deleteCookie(event, oauthCookie, oauthOptions)
  let expected: { state?: string, next?: string, appId?: string, link?: LinkState } = {}
  try { expected = JSON.parse(cookie || '{}') || {} } catch { /* Invalid login state. */ }
  const next = attendeeReturn(expected.next)
  const query = getQuery(event)
  const failed = () => sendRedirect(event, expected.link ? profilePath + '?wechat=failed' : '/login?' + new URLSearchParams({ next, wechat: 'failed' }))
  if (typeof query.code !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(query.code) ||
    typeof query.state !== 'string' || query.state.length !== 48 ||
    typeof expected.state !== 'string' || !safeEqual(query.state, expected.state)) {
    return failed()
  }
  try {
    const config = await attendeeWechatCredentials()
    if (!config || (expected.appId && expected.appId !== config.appId)) throw new Error('WeChat settings have changed')
    const link = expected.link
    let sessionHash: string | undefined
    if (link) {
      const session = getCookie(event, accountCookie)
      if (!session || !/^[a-zA-Z0-9_-]{43}$/.test(session) || !Number.isSafeInteger(link.accountId) || typeof link.proof !== 'string') return failed()
      sessionHash = hash(session)
      if (!safeEqual(link.proof, bindingProof(expected.state, config.appId, link.accountId, sessionHash))) return failed()
    }
    const tokenQuery = new URLSearchParams({
      appid: config.appId, secret: config.secret,
      code: query.code, grant_type: 'authorization_code',
    })
    const token = await $fetch<{ openid?: string, errcode?: number }>(
      'https://api.weixin.qq.com/sns/oauth2/access_token?' + tokenQuery, { timeout: 8000, retry: 0 },
    )
    if (token.errcode || !token.openid || !/^[A-Za-z0-9_-]{1,128}$/.test(token.openid)) throw new Error('Invalid WeChat response')
    if (link && sessionHash) {
      const result = await bindAttendeeWechat(link.accountId, sessionHash, token.openid, config.appId)
      return sendRedirect(event, profilePath + '?wechat=' + result)
    }
    await signInWithWechat(event, token.openid, config.appId)
    return sendRedirect(event, next)
  } catch {
    return failed()
  }
}
