import type { PoolConnection } from 'mysql2/promise'
import type { Answer, Attachment, Conference, FormVersion } from '#shared/models'

export type StoredRegistration = {
  id: number
  name: string | null
  phone: string | null
  formId: number
  createdAt: string
  updatedAt: string | null
  identityConsentedAt: string | null
  edits: number
  answers: Record<string, Answer>
}
export const registrationColumns = 'r.id,r.name,r.phone,r.form_id AS formId,r.answers,r.created_at AS createdAt,r.updated_at AS updatedAt,r.identity_consented_at AS identityConsentedAt,r.edits'

export async function registrationFor(eventId: number, id: number, db?: PoolConnection, lock = false) {
  const record = await first<StoredRegistration>(
    'SELECT ' + registrationColumns + ' FROM registrations r WHERE r.event_id=? AND r.id=?' + (lock ? ' FOR UPDATE' : ''),
    [eventId, id], db,
  )
  if (!record) fail(404, '报名记录不存在')
  return record
}
export const attachmentsFor = (id: number, db?: PoolConnection) => rows<Attachment>(
  'SELECT id,field_id AS fieldId,filename,byte_count AS byteCount FROM attachments WHERE registration_id=? ORDER BY field_id,filename,id', [id], db,
)
export const mask = (id: string) => id.slice(0, 3) + '***********' + id.slice(-4)
export const maskPhone = (phone: string) => phone.slice(0, 3) + '****' + phone.slice(-4)
export function shownAnswers(record: StoredRegistration, form: FormVersion, mode: 'full' | 'masked') {
  return Object.fromEntries(Object.entries(record.answers).map(([id, value]) => {
    if (form.fields.find(field => field.id === id)?.type !== 'identity') return [id, value]
    const clear = unseal(Buffer.from(String(value), 'base64'), 'identity:' + form.id + ':' + id).toString('utf8')
    return [id, mode === 'full' ? clear : mask(clear)]
  }))
}
export async function recordView(conference: Conference, record: StoredRegistration, mode: 'full' | 'masked' | 'checkin', db?: PoolConnection) {
  const [form, attendance, attachments] = await Promise.all([
    savedForm(conference.id, record.formId, db),
    attendanceFor(conference.id, [record.id], db),
    mode === 'checkin' ? [] : attachmentsFor(record.id, db),
  ])
  const [createdAt, updatedAt] = [iso(record.createdAt), record.updatedAt ? iso(record.updatedAt) : null]
  return {
    id: record.id, name: record.name, phone: mode === 'checkin' && record.phone ? maskPhone(record.phone) : record.phone,
    createdAt, updatedAt, edits: record.edits, form: mode === 'checkin' ? { ...form, fields: [], identityPurpose: '' } : form,
    answers: mode === 'checkin' ? {} : shownAnswers(record, form, mode),
    identityConsented: mode !== 'checkin' && Boolean(record.identityConsentedAt),
    attachments, attendance: attendance.get(record.id) || [],
    fullAccess: mode === 'full', canEdit: mode === 'full' && editOpen(conference, record.edits),
  }
}

export async function serveAttachment(event: RequestEvent, recordId: number, id: string) {
  if (!uuidPattern.test(id)) fail(404, '找不到附件')
  const attachment = await first<{ fieldId: string, filename: string, payload: Buffer }>(
    'SELECT field_id AS fieldId,filename,payload FROM attachments WHERE id=? AND registration_id=?', [id, recordId],
  )
  if (!attachment) fail(404, '找不到附件')
  setResponseHeaders(event, {
    'content-type': 'application/octet-stream',
    'content-disposition': "attachment; filename*=UTF-8''" +
      encodeURIComponent(attachment.filename).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16)),
    'content-security-policy': "default-src 'none'; sandbox",
  })
  return unseal(attachment.payload, 'file:' + recordId + ':' + attachment.fieldId)
}
