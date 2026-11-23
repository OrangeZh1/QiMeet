export const smsProviders = ['disabled', 'aliyun', 'tencent'] as const
export type SmsProvider = typeof smsProviders[number]
export type DeliveryKind = 'sms' | 'email'
export const registrationTemplateModes = ['plain', 'name-activity'] as const
export type RegistrationTemplateMode = typeof registrationTemplateModes[number]

export const deliveryFields = {
  aliyun: {
    accessKeyId: 'AccessKey ID', signName: '短信签名', templateCode: '验证码模板 CODE',
  },
  tencent: {
    secretId: 'SecretId', region: '地域', smsSdkAppId: 'SdkAppId', signName: '短信签名', templateId: '验证码模板 ID',
  },
  smtp: {
    host: 'SMTP 服务器', port: 'SMTP 端口', user: 'SMTP 用户名', from: '发件邮箱',
  },
} as const

export const deliverySecretLabels = { aliyun: 'AccessKey Secret', tencent: 'SecretKey', smtp: '密码或授权码' } as const
export const deliveryCredentialFields = { aliyun: ['accessKeyId'], tencent: ['secretId'], smtp: ['host', 'user'] } as const

export type DeliveryChannel = keyof typeof deliveryFields
type DeliveryValues<K extends DeliveryChannel> = Record<keyof typeof deliveryFields[K], string> &
  (K extends 'smtp' ? unknown : { registrationTemplate?: string, registrationTemplateMode?: RegistrationTemplateMode })
export type DeliveryConfig<K extends DeliveryChannel> = DeliveryValues<K> & { secret: string }
export type DeliverySettingsView = {
  provider?: SmsProvider
  configs: Partial<{ [K in DeliveryChannel]: { values: DeliveryValues<K>, secretConfigured: boolean } }>
}
