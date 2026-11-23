import type { AttendeeAuth } from '#shared/attendee-account'

export default defineEventHandler(async (event) => {
  privateResponse(event)
  const action = getRouterParam(event, 'action')
  const method = getMethod(event)
  if (method === 'GET') {
    if (action === 'session') {
      const [account, login] = await Promise.all([getAttendeeAccount(event), clientLoginRow()])
      return {
        account: attendeeProfileView(account), phone: Boolean(login.phoneLoginEnabled), email: Boolean(login.emailLoginEnabled),
        wechat: !!configuredWechat(login),
      } satisfies AttendeeAuth
    }
    if (action === 'avatar') return readAttendeeAvatar(event)
    if (action === 'wechat-callback') return finishWechat(event)
    if (action === 'registrations') {
      const account = await requireAttendeeAccount(event)
      return listAccountRegistrations(account.id)
    }
    if (action === 'pending-check-ins') {
      const account = await requireAttendeeAccount(event)
      return listAccountPendingCheckins(account.id)
    }
  }
  if (method === 'POST') {
    sameOrigin(event)
    if (action === 'logout') return logoutAttendee(event)
    if (action === 'profile') return saveAttendeeDisplayName(event, await jsonBody(event))
    if (action === 'contact-code' || action === 'contact') return attendeeContactAction(event, action, await jsonBody(event))
    if (action === 'avatar') return uploadAttendeeAvatar(event)
    if (action === 'change-password') return saveAttendeePassword(event, await jsonBody(event))
    if (action === 'wechat') {
      if (!getHeader(event, 'content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
        fail(415, '请求须使用表单')
      }
      if (Number(getHeader(event, 'content-length') || 0) > 8192 || getHeader(event, 'transfer-encoding')) fail(413, '请求内容过大')
      const input = object(await readBody(event))
      if (input.policyAccepted !== '1') fail(400, '请先勾选隐私政策和用户协议')
      return beginWechat(event, input.next)
    }
    if (action === 'code' || action === 'verify' || action === 'password') {
      const input = await jsonBody(event)
      if (input.policyAccepted !== true) fail(400, '请先勾选隐私政策和用户协议')
      const kind = oneOf(input.kind, ['email', 'phone'], '联系方式')
      await requireContactLogin(kind)
      const identifier = contactIdentifier(kind, input.identifier)
      if (action === 'password') return signInWithPassword(event, kind, identifier, input.password)
      const intent = oneOf(input.intent, ['login', 'register'], '验证用途')
      if (action === 'code') return deliverAttendeeCode(event, kind, identifier, intent)
      return verifyAttendeeCode(event, kind, identifier, intent, text(input.code, 6, '验证码'), input.password)
    }
  }
  fail(404, '操作不存在')
})
