import { isIP } from 'node:net'
import type { PoolConnection } from 'mysql2/promise'
import { deliveryCredentialFields, deliveryFields, deliverySecretLabels, registrationTemplateModes, smsProviders, type DeliveryChannel, type DeliveryConfig, type DeliveryKind, type DeliverySettingsView, type SmsProvider } from '#shared/delivery-settings'

type DeliveryRow = { provider: SmsProvider | null } & Record<DeliveryChannel, Buffer | null>
const columns = { aliyun: 'aliyun_sms_config', tencent: 'tencent_sms_config', smtp: 'smtp_config' } as const
const env = (key: string) => process.env['QI_' + key] || ''
const environment: { [K in DeliveryChannel]: () => DeliveryConfig<K> } = {
  aliyun: () => ({
    accessKeyId: env('ALIYUN_ACCESS_KEY_ID'), secret: env('ALIYUN_ACCESS_KEY_SECRET'),
    signName: env('ALIYUN_SMS_SIGN'), templateCode: env('ALIYUN_SMS_TEMPLATE'),
  }),
  tencent: () => ({
    secretId: env('TENCENT_SECRET_ID'), secret: env('TENCENT_SECRET_KEY'), region: env('TENCENT_SMS_REGION') || 'ap-guangzhou',
    smsSdkAppId: env('TENCENT_SMS_APP_ID'), signName: env('TENCENT_SMS_SIGN'), templateId: env('TENCENT_SMS_TEMPLATE'),
  }),
  smtp: () => ({
    host: env('SMTP_HOST'), port: env('SMTP_PORT') || '587', user: env('SMTP_USER'),
    secret: env('SMTP_PASSWORD'), from: env('SMTP_FROM'),
  }),
}

async function deliveryRow(db?: PoolConnection) {
  const row = await first<DeliveryRow>(
    'SELECT sms_provider AS provider,aliyun_sms_config AS aliyun,tencent_sms_config AS tencent,smtp_config AS smtp ' +
    'FROM site_settings WHERE id=1' + (db ? ' FOR UPDATE' : ''), [], db,
  )
  if (!row) fail(503, '站点设置尚未初始化')
  return row
}

function smsProvider(row: DeliveryRow): SmsProvider {
  const provider = env('SMS_PROVIDER')
  return row.provider ?? (provider === 'aliyun' || provider === 'tencent' ? provider : 'disabled')
}

function channelConfig<K extends DeliveryChannel>(row: DeliveryRow, channel: K): DeliveryConfig<K> {
  const encrypted = row[channel]
  return encrypted ? JSON.parse(unseal(encrypted, 'site-delivery:' + channel).toString('utf8')) : environment[channel]()
}

export async function activeSmsConfig() {
  const row = await deliveryRow()
  const provider = smsProvider(row)
  if (provider === 'disabled') fail(503, '短信服务尚未配置')
  return provider === 'aliyun'
    ? { provider, config: channelConfig(row, 'aliyun') }
    : { provider, config: channelConfig(row, 'tencent') }
}

export async function activeSmtpConfig() {
  return channelConfig(await deliveryRow(), 'smtp')
}

function channelView<K extends DeliveryChannel>(row: DeliveryRow, channel: K) {
  const { secret, ...values } = channelConfig(row, channel)
  return { values, secretConfigured: Boolean(secret) }
}

function deliveryView(row: DeliveryRow, kind: DeliveryKind): DeliverySettingsView {
  return kind === 'email' ? { configs: { smtp: channelView(row, 'smtp') } } : {
    provider: smsProvider(row), configs: { aliyun: channelView(row, 'aliyun'), tencent: channelView(row, 'tencent') },
  }
}

export async function readDeliverySettings(kind: DeliveryKind) {
  return deliveryView(await deliveryRow(), kind)
}

function validatedConfig(row: DeliveryRow, channel: DeliveryChannel, input: Record<string, unknown>) {
  const current = channelConfig(row, channel)
  const values = Object.fromEntries(Object.entries(deliveryFields[channel]).map(([key, label]) => {
    const value = text(input[key], 254, label)
    if (/[\x00-\x1f\x7f]/.test(value)) fail(400, '请检查' + label)
    return [key, value]
  }))
  if (channel === 'smtp') {
    const hostLabel = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
    if (!isIP(values.host!) && !new RegExp('^' + hostLabel + '(?:\\.' + hostLabel + ')*\\.?$', 'i').test(values.host!)) {
      fail(400, '请输入 SMTP 服务器主机名或 IP 地址')
    }
    if (!/^\d{1,5}$/.test(values.port!) || Number(values.port) < 1 || Number(values.port) > 65535) fail(400, '请输入有效的 SMTP 端口')
    if (values.from !== (current as DeliveryConfig<'smtp'>).from) contactIdentifier('email', values.from)
  } else {
    const previous = current as DeliveryConfig<'aliyun'> | DeliveryConfig<'tencent'>
    const template = input.registrationTemplate === undefined
      ? previous.registrationTemplate || '' : text(input.registrationTemplate, 100, '报名通知短信模板', false)
    if (template && !/^[a-zA-Z0-9_-]+$/.test(template)) fail(400, '报名通知短信模板编号有误')
    if (template && template === values[channel === 'aliyun' ? 'templateCode' : 'templateId']) fail(400, '报名通知请使用独立于验证码的模板')
    values.registrationTemplate = template
    values.registrationTemplateMode = input.registrationTemplateMode === undefined
      ? previous.registrationTemplateMode || 'plain' : oneOf(input.registrationTemplateMode, registrationTemplateModes, '报名短信模板类型')
  }
  const credentialChanged = deliveryCredentialFields[channel].some(key => values[key] !== (current as Record<string, string>)[key])
  const secret = input.secret === undefined || input.secret === '' ? (credentialChanged ? '' : current.secret) : input.secret
  if (typeof secret !== 'string' || !secret || secret.length > 512 || /[\x00-\x1f\x7f]/.test(secret)) {
    fail(400, '请填写有效的' + deliverySecretLabels[channel])
  }
  return { ...values, secret }
}

export async function saveDeliverySettings(kind: DeliveryKind, input: Record<string, unknown>) {
  return transaction(async (db) => {
    const row = await deliveryRow(db)
    const provider = kind === 'sms' ? oneOf(input.provider, smsProviders, '短信服务商') : row.provider
    const channel = kind === 'email' ? 'smtp' : provider
    if (channel && channel !== 'disabled') {
      const config = validatedConfig(row, channel, object(input.config))
      row[channel] = seal(Buffer.from(JSON.stringify(config)), 'site-delivery:' + channel)
      await mutate('UPDATE site_settings SET ' + columns[channel] + '=? WHERE id=1', [row[channel]], db)
    }
    if (kind === 'sms') {
      await mutate('UPDATE site_settings SET sms_provider=? WHERE id=1', [provider], db)
      row.provider = provider
    }
    return deliveryView(row, kind)
  })
}
