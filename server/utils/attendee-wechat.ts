import { randomBytes } from 'node:crypto'
import { attendeeReturn } from '#shared/attendee-account'
import type { RequestEvent } from './security'

const oauthCookie = '__Host-qm_wechat'
const oauthOptions = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' as const }

export async function beginWechat(event: RequestEvent, next: unknown) {
  const config = await attendeeWechatCredentials()
  if (!config) fail(503, '微信扫码登录尚未配置')
  const state = randomBytes(24).toString('hex')
  setCookie(event, oauthCookie, JSON.stringify({ state, next: attendeeReturn(next), appId: config.appId }), { ...oauthOptions, maxAge: 600 })
  const query = new URLSearchParams({
    appid: config.appId, redirect_uri: config.callback,
    response_type: 'code', scope: 'snsapi_login', state,
  })
  return sendRedirect(event, 'https://open.weixin.qq.com/connect/qrconnect?' + query + '#wechat_redirect')
}

export async function finishWechat(event: RequestEvent) {
  const cookie = getCookie(event, oauthCookie)
  deleteCookie(event, oauthCookie, oauthOptions)
  let expected: { state?: string, next?: string, appId?: string } = {}
  try { expected = JSON.parse(cookie || '{}') } catch { /* Invalid login state. */ }
  const next = attendeeReturn(expected.next)
  const query = getQuery(event)
  if (typeof query.code !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(query.code) ||
    typeof query.state !== 'string' || query.state.length !== 48 ||
    typeof expected.state !== 'string' || !safeEqual(query.state, expected.state)) {
    return sendRedirect(event, '/login?' + new URLSearchParams({ next, wechat: 'failed' }))
  }
  try {
    const config = await attendeeWechatCredentials()
    if (!config || (expected.appId && expected.appId !== config.appId)) throw new Error('WeChat settings have changed')
    const tokenQuery = new URLSearchParams({
      appid: config.appId, secret: config.secret,
      code: query.code, grant_type: 'authorization_code',
    })
    const token = await $fetch<{ openid?: string, errcode?: number }>(
      'https://api.weixin.qq.com/sns/oauth2/access_token?' + tokenQuery, { timeout: 8000, retry: 0 },
    )
    if (token.errcode || !token.openid || !/^[A-Za-z0-9_-]{1,128}$/.test(token.openid)) throw new Error('Invalid WeChat response')
    await signInWithWechat(event, token.openid)
    return sendRedirect(event, next)
  } catch {
    return sendRedirect(event, '/login?' + new URLSearchParams({ next, wechat: 'failed' }))
  }
}
