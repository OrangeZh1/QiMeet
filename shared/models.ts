import type { MaterialKind } from './materials'

export const fieldLabels = {
  title: '标题', note: '说明文字', text: '填空', textarea: '多行填空',
  radio: '单选', checkbox: '多选', phone: '手机号', identity: '身份证号',
  file: '文件', image: '图片',
} as const

export type FieldType = keyof typeof fieldLabels
export type Field = {
  id: string
  type: FieldType
  label: string
  required: boolean
  options: string[]
  contactRole?: 'name' | 'phone'
  smsRole?: 'name' | 'phone'
  maxFiles?: number
}
export const legacyContactFields: Field[] = [
  { id: 'a1cbd416-0471-4b83-a062-556ef6568ec1', type: 'text', label: '姓名', required: true, options: [], contactRole: 'name' },
  { id: '2581e68f-de20-4de9-8ae8-74ffa4b86d90', type: 'phone', label: '报名手机号', required: true, options: [], contactRole: 'phone' },
]
const registrationContactLabels = {
  name: ['姓名', '报名姓名', '真实姓名', '参会人姓名', '来宾姓名'],
  phone: ['手机号', '手机号码', '报名手机号', '联系电话', '联系手机'],
}
export function registrationContactField(fields: Field[], role: 'name' | 'phone') {
  const candidates = fields.filter(field => field.type === 'text' || (role === 'phone' && field.type === 'phone'))
  return candidates.find(field => field.contactRole === role)
    ?? candidates.find(field => registrationContactLabels[role].includes(field.label.trim()))
    ?? candidates.find(field => field.smsRole === role)
}
export type QrMode = 'fixed' | 'dynamic' | 'both'
export type EditMode = 'off' | 'once' | 'unlimited'
export type EditDeadline = 'registration' | 'manual'
export type AgendaItem = {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  description: string
}
export type Conference = {
  id: number
  slug: string
  title: string
  organizer: string
  venue: string
  coverUrl: string
  coverMaterialId: string | null
  coverImages: { id: string, url: string }[]
  description: string
  agenda: AgendaItem[]
  registrationClosedAt: string | null
  endedAt: string | null
  startsAt: string
  endsAt: string
  registrationStartsAt: string
  registrationEndsAt: string
  published: boolean
  editPolicy: EditMode
  registrationSms: boolean
  editDeadline: EditDeadline
}
export type FormVersion = { id: number, version: number, fields: Field[], identityPurpose: string, legacyContact: boolean }
export type Checkpoint = { id: number, title: string, startsAt: string, endsAt: string, qrMode: QrMode, directEnabled: boolean }
export const checkinSourceLabels = { fixed: '固定码', dynamic: '动态码', direct: '手机签到', manual: '人工补签' } as const
export type CheckinSource = keyof typeof checkinSourceLabels
export type Attendance = { id: number, title: string, checkedAt: string | null, source: CheckinSource | null }
export const attendeeCheckinSourceLabel = (source: CheckinSource) => source === 'fixed' || source === 'dynamic' ? '现场扫码签到' : checkinSourceLabels[source]
export const attendeeCheckinSources = (attendance: Attendance[]): Partial<Record<number, CheckinSource>> =>
  Object.fromEntries(attendance.flatMap(item => item.source ? [[item.id, item.source] as const] : []))
export type Answer = string | string[]
export type Attachment = { id: string, fieldId: string, filename: string, byteCount: number }
export type Registration = {
  id: number
  name: string | null
  phone: string | null
  createdAt: string
  updatedAt: string | null
  edits: number
  form: FormVersion
  answers: Record<string, Answer>
  attachments: Attachment[]
  identityConsented: boolean
  canEdit: boolean
  fullAccess: boolean
  attendance: Attendance[]
}
export type EventDetails = { conference: Conference, form: FormVersion, registrationOpen: boolean, checkpoints: Checkpoint[], recognized: boolean, signedIn: boolean, checkedInSources: Partial<Record<number, CheckinSource>> }
export type RegistrationSmsStatus = 'submitted' | 'missing-phone' | 'unverified-contact' | 'form-phone-unverified' | 'missing-template-values' | 'failed'
export type EventListItem = Conference & { registered: number, attended: number }
export type RegistrantRow = Pick<Registration, 'id' | 'name' | 'phone' | 'createdAt' | 'edits'> & { version: number, attendance: Attendance[] }
export type AdminEvent = { conference: Conference, forms: FormVersion[], checkpoints: (Checkpoint & { attended: number })[], registered: number, attended: number }
export type QrDisplay = { url: string, dataUrl: string, expiresAt: string | null }
export type CheckInIssue = { reason: 'expired' | 'revoked' } |
  { reason: 'waiting' | 'closed', checkpoint: Pick<Checkpoint, 'title' | 'startsAt' | 'endsAt'> }
export const isContentField = (type: FieldType) => type === 'title' || type === 'note'
export const isFileField = (type: FieldType) => type === 'file' || type === 'image'

const dateLabel = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
export const displayDate = (value: string | null) => value ? dateLabel.format(new Date(value)) : '—'

const inputDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
export const toLocalInput = (value: string) => value ? inputDate.format(new Date(value)).replace(' ', 'T') : ''
export const fromLocalInput = (value: string) => value ? new Date(value + ':00+08:00').toISOString() : ''

export type Material = {
  id: string
  kind: MaterialKind
  name: string
  mime: string
  byteCount: number
  createdAt: string
  url: string
}
export type AdminProfile = {
  username: string
  displayName: string
  avatarMaterialId: string | null
  avatarUrl: string
}
