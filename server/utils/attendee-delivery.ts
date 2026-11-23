import * as AliSms from '@alicloud/dysmsapi20170525'
import { Config } from '@alicloud/openapi-client'
import { createTransport } from 'nodemailer'
import { sms } from 'tencentcloud-sdk-nodejs-sms'
import type { ContactKind } from '#shared/attendee-account'
import type { RegistrationSmsStatus } from '#shared/models'

function requireDeliveryConfig(config: Record<string, string>) {
  if (Object.values(config).some(value => !value)) fail(503, '验证码发送服务尚未配置')
}

export async function attendeeCodeDelivery(kind: ContactKind): Promise<(identifier: string, code: string) => Promise<void>> {
  if (kind === 'email') {
    const config = await activeSmtpConfig()
    requireDeliveryConfig(config)
    const { host, from, user, secret } = config
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) fail(503, '邮箱服务配置有误')
    const transport = createTransport({
      host, port, secure: port === 465, requireTLS: port !== 465,
      auth: { user, pass: secret },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
    })
    return async (to, code) => {
      await transport.sendMail({
        from, to, subject: 'QiMeet 验证码',
        text: '您的 QiMeet 验证码是 ' + code + '，5 分钟内有效。',
      })
    }
  }
  const { send } = await smsDelivery('verification')
  return (identifier, code) => send(identifier, { code })
}

async function smsDelivery(purpose: 'verification' | 'registration'): Promise<{
  requiresDetails: boolean,
  send: (phone: string, variables: Record<string, string>) => Promise<void>,
}> {
  const { provider, config } = await activeSmsConfig()
  const { registrationTemplate, registrationTemplateMode } = config
  const registration = purpose === 'registration'
  const requiresDetails = registration && registrationTemplateMode === 'name-activity'
  if (registration && !registrationTemplate) fail(503, '报名通知模板尚未配置')
  if (provider === 'tencent') {
    const { signName, templateId, smsSdkAppId, secretId, secret, region } = config
    requireDeliveryConfig({ signName, templateId, smsSdkAppId, secretId, secret, region })
    const client = new sms.v20210111.Client({
      credential: { secretId, secretKey: secret }, region,
      profile: { httpProfile: { reqTimeout: 8 } },
    })
    return { requiresDetails, async send(identifier, variables) {
      const response = await client.SendSms({
        PhoneNumberSet: ['+86' + identifier], SmsSdkAppId: smsSdkAppId, SignName: signName,
        TemplateId: registrationTemplate && registration ? registrationTemplate : templateId,
        TemplateParamSet: Object.values(variables),
      })
      if (response.SendStatusSet?.[0]?.Code !== 'Ok') throw new Error('Tencent SMS delivery failed')
    } }
  }
  const { accessKeyId, secret, signName, templateCode } = config
  requireDeliveryConfig({ accessKeyId, secret, signName, templateCode })
  const sdk = AliSms.default as typeof AliSms.default & { default?: typeof AliSms.default }
  const Client = sdk.default || sdk
  const client = new Client(new Config({
    accessKeyId, accessKeySecret: secret,
    endpoint: 'dysmsapi.aliyuncs.com', readTimeout: 8000, connectTimeout: 8000,
  }))
  return { requiresDetails, async send(phoneNumbers, variables) {
    const response = await client.sendSms(new AliSms.SendSmsRequest({
      phoneNumbers, signName, templateCode: registrationTemplate && registration ? registrationTemplate : templateCode,
      ...(Object.keys(variables).length ? { templateParam: JSON.stringify(variables) } : {}),
    }))
    if (response.body?.code !== 'OK') throw new Error('Alibaba Cloud SMS delivery failed')
  } }
}

export async function sendRegistrationSms(accountId: number, fields: { phone?: string | null, name?: string | null, activity?: string } = {}): Promise<RegistrationSmsStatus> {
  try {
    const account = await first<{ verifiedPhone: string | null }>(
      'SELECT verified_phone AS verifiedPhone FROM attendee_accounts WHERE id=? AND disabled_at IS NULL', [accountId],
    )
    const phone = account?.verifiedPhone
    if (!phone) return 'missing-phone'
    if (fields.phone && fields.phone !== phone) return 'form-phone-unverified'
    const name = fields.name?.trim()
    const activity = fields.activity?.trim()
    const details = name && /^[\p{L}\p{M}·・’' -]{1,35}$/u.test(name) && activity &&
      Array.from(activity).length <= 35 && !/[\x00-\x1f\x7f]/.test(activity) ? { name, activity } : undefined
    const { send, requiresDetails } = await smsDelivery('registration')
    if (requiresDetails && !details) return 'missing-template-values'
    await send(phone, requiresDetails && details ? details : {})
    return 'submitted'
  } catch {
    return 'failed'
  }
}
