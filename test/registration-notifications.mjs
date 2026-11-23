import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

test('报名短信核对表单号码，并在姓名模板中传入姓名和活动标题', async (t) => {
  const attempts = []
  const modules = {
    'tencentcloud-sdk-nodejs-sms': `export const sms = { v20210111: { Client: class {
      SendSms(request) { return globalThis.registrationSmsFake(request) }
    } } }`,
    '@alicloud/dysmsapi20170525': `export default class {
      sendSms(request) { return globalThis.registrationSmsFake(request) }
    }
    export class SendSmsRequest { constructor(values) { Object.assign(this, values) } }`,
    '@alicloud/openapi-client': 'export class Config {}',
    nodemailer: 'export function createTransport() { throw Error("邮件不属于报名短信通道") }',
  }
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (!Object.hasOwn(modules, specifier)) return next(specifier, context)
      return { url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]), shortCircuit: true }
    },
  })
  const { attendeeCodeDelivery, sendRegistrationSms } = await import('../server/utils/attendee-delivery.ts')
    .finally(() => hooks.deregister())
  const phone = '19900000000'
  let account = { kind: 'email', identifier: 'fixture@example.test', verifiedPhone: null }
  let provider = 'tencent'
  let registrationTemplate = ''
  let registrationTemplateMode
  let failure = false
  const adapters = {
    first: async (sql) => {
      assert.match(sql, /verified_phone AS verifiedPhone/)
      return account
    },
    fail: (_status, message) => { throw new Error(message) },
    activeSmsConfig: async () => ({ provider, config: provider === 'tencent'
      ? { templateId: '101', registrationTemplate, registrationTemplateMode, signName: '测试签名', smsSdkAppId: '42', secretId: 'fixture', secret: 'fixture', region: 'ap-guangzhou' }
      : { templateCode: 'SMS_101', registrationTemplate, registrationTemplateMode, signName: '测试签名', accessKeyId: 'fixture', secret: 'fixture' } }),
    registrationSmsFake(request) {
      attempts.push(request)
      if (failure) throw new Error('模拟服务商故障')
      return provider === 'tencent' ? { SendStatusSet: [{ Code: 'Ok' }] } : { body: { code: 'OK' } }
    },
  }
  Object.assign(globalThis, adapters)
  t.after(() => { for (const key of Object.keys(adapters)) delete globalThis[key] })

  assert.equal(await sendRegistrationSms(1), 'missing-phone')
  account = { kind: 'phone', identifier: phone, verifiedPhone: null }
  assert.equal(await sendRegistrationSms(1), 'missing-phone')
  account = { ...account, verifiedPhone: phone }
  assert.equal(await sendRegistrationSms(1), 'failed')
  assert.equal(attempts.length, 0)
  await (await attendeeCodeDelivery('phone'))(phone, '483059')
  assert.equal(attempts[0].TemplateId, '101')
  assert.deepEqual(attempts[0].TemplateParamSet, ['483059'])

  registrationTemplate = '202'
  assert.equal(await sendRegistrationSms(1), 'submitted')
  assert.deepEqual(attempts[1].PhoneNumberSet, ['+86' + phone])
  assert.equal(attempts[1].TemplateId, '202')
  assert.deepEqual(attempts[1].TemplateParamSet, [])

  registrationTemplate = '203'
  registrationTemplateMode = 'name-activity'
  const details = { phone, name: '张三', activity: '青年就业峰会' }
  assert.equal(await sendRegistrationSms(1, { ...details, phone: '19800000000' }), 'form-phone-unverified')
  assert.equal(attempts.length, 2)
  assert.equal(await sendRegistrationSms(1, details), 'submitted')
  assert.equal(attempts.at(-1).TemplateId, '203')
  assert.deepEqual(attempts.at(-1).TemplateParamSet, ['张三', '青年就业峰会'])

  provider = 'aliyun'
  registrationTemplate = 'SMS_203'
  account = { ...account, verifiedPhone: '19800000000' }
  assert.equal(await sendRegistrationSms(1, { ...details, phone: null }), 'submitted')
  assert.equal(attempts.at(-1).phoneNumbers, account.verifiedPhone)
  assert.equal(attempts.at(-1).templateCode, 'SMS_203')
  assert.deepEqual(JSON.parse(attempts.at(-1).templateParam), { name: '张三', activity: '青年就业峰会' })
  assert.equal(await sendRegistrationSms(1, { ...details, phone: null, activity: '活动'.repeat(18) }), 'missing-template-values')
  assert.equal(attempts.length, 4)
  registrationTemplateMode = 'plain'
  registrationTemplate = 'SMS_202'
  assert.equal(await sendRegistrationSms(1, { ...details, phone: null }), 'submitted')
  assert.equal(attempts.at(-1).templateCode, 'SMS_202')
  assert.ok(!Object.hasOwn(attempts.at(-1), 'templateParam'))
  failure = true
  assert.equal(await sendRegistrationSms(1), 'failed')
  assert.equal(attempts.length, 6)
})
