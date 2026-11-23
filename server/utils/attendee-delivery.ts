import * as AliSms from '@alicloud/dysmsapi20170525'
import { Config } from '@alicloud/openapi-client'
import { createTransport } from 'nodemailer'
import { sms } from 'tencentcloud-sdk-nodejs-sms'
import type { ContactKind } from '#shared/attendee-account'

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
  const { provider, config } = await activeSmsConfig()
  requireDeliveryConfig(config)
  if (provider === 'tencent') {
    const { signName, templateId, smsSdkAppId, secretId, secret, region } = config
    const client = new sms.v20210111.Client({
      credential: { secretId, secretKey: secret }, region,
      profile: { httpProfile: { reqTimeout: 8 } },
    })
    return async (identifier, code) => {
      const response = await client.SendSms({
        PhoneNumberSet: ['+86' + identifier], SmsSdkAppId: smsSdkAppId, SignName: signName,
        TemplateId: templateId, TemplateParamSet: [code],
      })
      if (response.SendStatusSet?.[0]?.Code !== 'Ok') throw new Error('Tencent SMS delivery failed')
    }
  }
  const { accessKeyId, secret, signName, templateCode } = config
  const sdk = AliSms.default as typeof AliSms.default & { default?: typeof AliSms.default }
  const Client = sdk.default || sdk
  const client = new Client(new Config({
    accessKeyId, accessKeySecret: secret,
    endpoint: 'dysmsapi.aliyuncs.com', readTimeout: 8000, connectTimeout: 8000,
  }))
  return async (phoneNumbers, code) => {
    const response = await client.sendSms(new AliSms.SendSmsRequest({
      phoneNumbers, signName, templateCode, templateParam: JSON.stringify({ code }),
    }))
    if (response.body?.code !== 'OK') throw new Error('Alibaba Cloud SMS delivery failed')
  }
}
