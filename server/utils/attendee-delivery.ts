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
      if (!/^\d{6}$/.test(code)) throw new Error('Invalid verification code')
      await transport.sendMail({
        from, to, subject: 'QiMeet 邮箱验证码',
        text: `您的 QiMeet 验证码是 ${code}。\n\n验证码 5 分钟内有效，请勿转发。\n如果您没有发起本次操作，可以忽略此邮件。`,
        html: `<!doctype html><html lang="zh-CN"><body style="margin:0;background:#f3f6fb;color:#182641;font-family:Arial,'Microsoft YaHei',sans-serif">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:440px;background:#fff;border:1px solid #dce4f0;border-radius:14px">
              <tr><td style="padding:26px 22px">
                <p style="margin:0;color:#2356bf;font-size:15px;font-weight:700">QiMeet</p>
                <h1 style="margin:8px 0 12px;font-size:22px">邮箱验证码</h1>
                <p style="margin:0;font-size:15px;line-height:1.6">请在 QiMeet 页面输入以下 6 位验证码。</p>
                <p style="margin:16px 0;padding:14px 8px;background:#edf3ff;border-radius:9px;color:#163474;text-align:center;font-size:30px;font-family:monospace;font-weight:700;letter-spacing:5px">${code}</p>
                <p style="margin:0 0 6px;font-size:14px;line-height:1.6"><strong>5 分钟内有效</strong>，请勿转发。</p>
                <p style="margin:0;color:#52617a;font-size:13px;line-height:1.6">如果您没有发起本次操作，可以忽略此邮件。</p>
              </td></tr>
            </table>
          </td></tr></table>
        </body></html>`,
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
