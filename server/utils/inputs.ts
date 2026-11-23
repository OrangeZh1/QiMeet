import { fieldLabels, isContentField, type Field, type FieldType } from '#shared/models'

export function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '请求格式有误')
  return value as Record<string, unknown>
}
export function text(value: unknown, max: number, label: string, required = true) {
  if (typeof value !== 'string') {
    if (!required && (value === undefined || value === null)) return ''
    fail(400, label + '格式有误')
  }
  const result = value.trim().normalize('NFC')
  if ((required && !result) || result.length > max || result.includes('\u0000')) fail(400, '请检查' + label)
  return result
}
export function positive(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') fail(400, '记录编号有误')
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 1 || result > 4294967295) fail(400, '记录编号有误')
  return result
}
export function oneOf<T extends string>(value: unknown, options: readonly T[], label: string) {
  if (typeof value !== 'string' || !options.includes(value as T)) fail(400, '请检查' + label)
  return value as T
}
export function date(value: unknown, label: string) {
  const input = text(value, 30, label)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) ||
      !Number.isFinite(Date.parse(input)) || new Date(input).toISOString() !== input) fail(400, '请检查' + label)
  return utc(new Date(input))
}
export function interval(start: unknown, end: unknown, label: string) {
  const range = [date(start, label + '开始时间'), date(end, label + '结束时间')] as const
  if (range[0] >= range[1]) fail(400, label + '结束时间必须晚于开始时间')
  return range
}
export function phone(value: unknown, label = '手机号') {
  const raw = text(value, 30, label).replace(/[\s-]/g, '').replace(/^\+86/, '')
  if (!/^1[3-9]\d{9}$/.test(raw)) fail(400, '请填写有效的' + label)
  return raw
}
export function identity(value: string, label: string) {
  const id = value.toUpperCase()
  if (!/^[1-9]\d{16}[\dX]$/.test(id)) fail(400, '请填写有效的' + label)
  const wanted = id.slice(6, 14)
  const birth = new Date(wanted.slice(0, 4) + '-' + wanted.slice(4, 6) + '-' + wanted.slice(6) + 'T00:00:00Z')
  if (!Number.isFinite(+birth) || birth.toISOString().slice(0, 10).replaceAll('-', '') !== wanted ||
    +birth > Date.now() || birth.getUTCFullYear() < 1800) fail(400, '请填写有效的' + label)
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const sum = weights.reduce((total, weight, index) => total + weight * Number(id[index]), 0)
  if ('10X98765432'[sum % 11] !== id[17]) fail(400, '请填写有效的' + label)
  return id
}
export const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function fields(value: unknown) {
  if (!Array.isArray(value) || value.length > 40) fail(400, '自定义字段最多 40 项')
  const ids = new Set<string>()
  const roles = new Set<string>()
  const smsRoles = new Set<string>()
  return value.map((raw): Field => {
    const input = object(raw)
    const id = text(input.id, 36, '字段编号').toLowerCase()
    if (!uuidPattern.test(id) || ids.has(id)) fail(400, '字段编号冲突')
    ids.add(id)
    const type = oneOf(input.type, Object.keys(fieldLabels) as FieldType[], '字段类型')
    const label = text(input.label, type === 'note' ? 800 : 120, '字段名称或说明')
    let options: string[] = []
    if (type === 'radio' || type === 'checkbox') {
      if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 30) fail(400, label + '须填写 2–30 个选项')
      options = input.options.map(value => text(value, 120, '选项'))
      if (new Set(options).size !== options.length) fail(400, label + '有重复选项')
    }
    const contactRole = input.contactRole === undefined || input.contactRole === null || input.contactRole === ''
      ? undefined : oneOf(input.contactRole, ['name', 'phone'], '报名找回字段')
    if (contactRole) {
      if (roles.has(contactRole) || type !== (contactRole === 'name' ? 'text' : 'phone')) {
        fail(400, '请为每种找回信息指定一个匹配的字段')
      }
      roles.add(contactRole)
    }
    const smsRole = input.smsRole == null ? undefined : oneOf(input.smsRole, ['name', 'phone'], '短信字段')
    if (smsRole) {
      if (smsRoles.has(smsRole) || type !== (smsRole === 'name' ? 'text' : 'phone')) fail(400, '每种短信字段只能绑定一次，字段类型须匹配')
      smsRoles.add(smsRole)
    }
    const supportsFiles = type === 'file' || type === 'image'
    const maxFiles = supportsFiles && input.maxFiles !== undefined ? positive(input.maxFiles) : 1
    if (maxFiles > 10) fail(400, '每个上传字段最多允许 10 份附件')
    return {
      id, type, label, options, required: !isContentField(type) && input.required === true,
      ...(contactRole ? { contactRole } : {}), ...(smsRole ? { smsRole } : {}), ...(supportsFiles ? { maxFiles } : {}),
    }
  })
}

export async function jsonBody(event: RequestEvent) {
  const length = Number(getHeader(event, 'content-length') || 0)
  if (!getHeader(event, 'content-type')?.toLowerCase().startsWith('application/json')) fail(415, '请求须使用 JSON')
  if (length > 256 * 1024 || getHeader(event, 'transfer-encoding')) fail(413, '请求内容过大')
  return object(await readBody(event))
}
