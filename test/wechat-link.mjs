import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { registerHooks } from 'node:module'
import test from 'node:test'

test('微信绑定回调只能使用发起绑定的账号会话', async t => {
  const loginToken = 'a'.repeat(43)
  const accountId = 42
  const appId = 'wx-fixture'
  const cookieName = '__Host-qm_wechat'
  const cookies = new Map([['qm_account', loginToken]])
  let query = {}
  let exchanges = 0
  const bound = []
  const hash = value => createHash('sha256').update(value).digest('hex')
  const adapters = {
    getCookie: (_event, name) => cookies.get(name),
    setCookie: (_event, name, value) => cookies.set(name, value),
    deleteCookie: (_event, name) => cookies.delete(name),
    getQuery: () => query,
    sendRedirect: (_event, target) => target,
    sign: value => createHmac('sha256', 'test-key').update(value).digest('base64url'),
    safeEqual: (left, right) => left === right,
    hash,
    requireAttendeeAccount: async () => ({ id: accountId, kind: 'email', wechatLinked: false }),
    throttle: () => {},
    attendeeWechatCredentials: async () => ({ appId, secret: 'fixture', callback: 'https://example.test/api/account/wechat-callback' }),
    $fetch: async () => { exchanges++; return { openid: 'fixture-wechat-user' } },
    bindAttendeeWechat: async (...args) => { bound.push(args); return 'linked' },
    signInWithWechat: async () => assert.fail('绑定回调不应进入登录流程'),
  }
  Object.assign(globalThis, adapters)
  t.after(() => { for (const key of Object.keys(adapters)) delete globalThis[key] })

  const hooks = registerHooks({ resolve(specifier, context, next) {
    return specifier === '#shared/attendee-account'
      ? { url: new URL('../shared/attendee-account.ts', import.meta.url).href, shortCircuit: true }
      : next(specifier, context)
  } })
  const { beginWechatLink, finishWechat } = await import('../server/utils/attendee-wechat.ts').finally(() => hooks.deregister())
  const start = async () => {
    const { authorizationUrl } = await beginWechatLink({})
    query = { code: 'fixture-code', state: new URL(authorizationUrl).searchParams.get('state') }
  }

  await start()
  cookies.set('qm_account', 'b'.repeat(43))
  assert.equal(await finishWechat({}), '/mine/profile?wechat=failed')
  assert.equal(exchanges, 0)
  assert.equal(cookies.has(cookieName), false)

  cookies.set('qm_account', loginToken)
  await start()
  assert.equal(await finishWechat({}), '/mine/profile?wechat=linked')
  assert.deepEqual(bound, [[accountId, hash(loginToken), 'fixture-wechat-user', appId]])
  assert.equal(cookies.get('qm_account'), loginToken)
})
