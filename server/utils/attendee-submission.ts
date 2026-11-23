import Busboy from 'busboy'
import { randomUUID } from 'node:crypto'
import type { PoolConnection } from 'mysql2/promise'
import { isContentField, isFileField, type Answer, type Attachment, type FormVersion } from '#shared/models'

type UploadedPart = { filename: string, bytes: Buffer }
type Submission = { payload: Record<string, unknown>, files: Map<string, UploadedPart[]> }
type UploadedFile = UploadedPart & { fieldId: string, mime: string }

const payloadLimit = 256 * 1024
const multipartLimit = totalUploadsLimit + payloadLimit + 512 * 1024
const filePartsLimit = 40 * 10

export async function readAttendeeSubmission(event: RequestEvent): Promise<Submission> {
  if (!/^multipart\/form-data(?:\s*;|$)/i.test(getHeader(event, 'content-type') || '')) {
    return { payload: await jsonBody(event), files: new Map() }
  }

  let parser: ReturnType<typeof Busboy>
  try {
    parser = Busboy({
      headers: event.node.req.headers,
      defParamCharset: 'utf8',
      limits: {
        fields: 1, fieldSize: payloadLimit, files: filePartsLimit, parts: filePartsLimit + 2,
        fileSize: uploadLimit('file') + 1, headerPairs: 24,
      },
    })
  } catch {
    fail(400, '报名资料格式有误')
  }

  const bytes = await rawUpload(event, multipartLimit)
  const files = new Map<string, UploadedPart[]>()
  let payload: string | undefined
  let malformed = false
  let tooLarge = false
  let total = 0
  await new Promise<void>((resolve) => {
    parser.on('field', (name, value, info) => {
      if (name !== 'payload') malformed = true
      if (info.valueTruncated || info.nameTruncated) tooLarge = true
      payload = value
    })
    parser.on('file', (fieldId, stream, info) => {
      stream.on('error', () => { malformed = true })
      const { filename } = info
      if (!uuidPattern.test(fieldId) || !filename) {
        malformed = true
        stream.resume()
        return
      }
      const parts = files.get(fieldId) || []
      files.set(fieldId, parts)
      const chunks: Buffer[] = []
      stream.on('limit', () => { tooLarge = true })
      stream.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > totalUploadsLimit) tooLarge = true
        if (!tooLarge) chunks.push(chunk)
      })
      stream.on('end', () => {
        if (!tooLarge) parts.push({ filename, bytes: Buffer.concat(chunks) })
      })
    })
    for (const limit of ['partsLimit', 'fieldsLimit', 'filesLimit'] as const) {
      parser.on(limit, () => { malformed = true })
    }
    parser.once('error', () => { malformed = true; resolve() })
    parser.once('close', resolve)
    parser.end(bytes)
  })

  if (tooLarge) fail(413, '附件大小超过限制')
  if (malformed || payload === undefined) fail(400, '报名资料格式有误')
  let input: unknown
  try {
    input = JSON.parse(payload)
  } catch {
    fail(400, '报名资料格式有误')
  }
  return { payload: object(input), files }
}

function answersFor(form: FormVersion, input: unknown, consent: boolean, previous?: Record<string, Answer>) {
  const supplied = input === undefined ? {} : object(input)
  const answerFields = form.fields.filter(field => !isContentField(field.type) && !isFileField(field.type))
  if (Object.keys(supplied).some(id => !answerFields.some(field => field.id === id))) {
    fail(400, '回答包含报名表中不存在的字段')
  }
  const answers: Record<string, Answer> = {}
  for (const field of answerFields) {
    const value = supplied[field.id]
    if (field.contactRole) {
      const oldValue = previous?.[field.id]
      if (previous && value === undefined) {
        if (oldValue !== undefined) answers[field.id] = oldValue
        continue
      }
      const entered = text(value, field.contactRole === 'name' ? 80 : 30, field.label, field.required)
      const normalized = entered && field.contactRole === 'phone' ? phone(entered, field.label) : entered
      if (previous && normalized !== (oldValue ?? '')) fail(400, field.label + '用于找回报名，提交后不能修改')
      if (normalized) answers[field.id] = normalized
      continue
    }
    if (field.type === 'checkbox') {
      const choices = value === undefined ? [] : value
      if (!Array.isArray(choices) || choices.length > field.options.length ||
        new Set(choices).size !== choices.length ||
        choices.some(choice => typeof choice !== 'string' || !field.options.includes(choice))) {
        fail(400, '请检查' + field.label + '的选项')
      }
      if (!choices.length && field.required) fail(400, '请选择' + field.label)
      if (choices.length) answers[field.id] = choices
      continue
    }
    const maxLength = field.type === 'textarea' ? 4000 : field.type === 'text' ? 500 :
      field.type === 'radio' ? 120 : 30
    const answer = text(value, maxLength, field.label, field.required)
    if (!answer) continue
    if (field.type === 'radio' && !field.options.includes(answer)) fail(400, '请检查' + field.label + '的选项')
    if (field.type === 'phone') {
      answers[field.id] = phone(answer, field.label)
    } else if (field.type === 'identity') {
      if (!consent) fail(400, '请阅读身份证号收集用途并确认同意')
      const clear = identity(answer, field.label)
      answers[field.id] = seal(Buffer.from(clear), 'identity:' + form.id + ':' + field.id).toString('base64')
    } else {
      answers[field.id] = answer
    }
  }
  return answers
}

export async function prepareAttendeeSubmission(
  form: FormVersion, submission: Submission, consent: boolean, previous?: Record<string, Answer>,
) {
  const answers = answersFor(form, submission.payload.answers, consent, previous)
  const fileFields = form.fields.filter(field => isFileField(field.type))
  const remove = submission.payload.removeAttachments
  if (remove !== undefined && (!previous || !Array.isArray(remove) ||
    remove.length > filePartsLimit || remove.some(id => typeof id !== 'string' || !uuidPattern.test(id)))) {
    fail(400, '附件移除请求有误')
  }

  const uploads: UploadedFile[] = []
  for (const [id, parts] of submission.files) {
    const field = fileFields.find(field => field.id === id)
    if (!field) fail(400, '附件与报名表不匹配')
    if (parts.length > (field.maxFiles ?? 1)) fail(400, field.label + '最多可上传 ' + (field.maxFiles ?? 1) + ' 个附件')
    for (const part of parts) {
      const filename = cleanFilename(part.filename)
      const mime = await verifyUpload(part.bytes, field.type === 'image' ? 'image' : 'file', filename)
      uploads.push({ ...part, fieldId: id, filename, mime })
    }
  }
  return {
    answers, uploads, removals: new Set<string>(Array.isArray(remove) ? remove : []), fileFields,
    legacyContact: form.legacyContact,
    identityConsented: consent && form.fields.some(field => field.type === 'identity'),
  }
}

type Prepared = Awaited<ReturnType<typeof prepareAttendeeSubmission>>

export function validateAttendeeAttachments(prepared: Prepared, previous: Attachment[]) {
  const removeIds = new Set<string>()
  for (const id of prepared.removals) {
    if (previous.some(file => file.id === id)) {
      removeIds.add(id)
    } else if (prepared.legacyContact && prepared.fileFields.some(field => field.id === id)) {
      // Older clients removed a single-file slot using its field ID.
      for (const file of previous) if (file.fieldId === id) removeIds.add(file.id)
    } else {
      fail(400, '待移除附件不存在')
    }
  }
  for (const field of prepared.fileFields) {
    const added = prepared.uploads.filter(file => file.fieldId === field.id).length
    if (prepared.legacyContact && (field.maxFiles ?? 1) === 1 && added) {
      // Keep implicit replacement for legacy one-file forms.
      for (const file of previous) if (file.fieldId === field.id) removeIds.add(file.id)
    }
    const retained = previous.filter(file => file.fieldId === field.id && !removeIds.has(file.id)).length
    if (field.required && !added && !retained) fail(400, '请上传' + field.label)
    if (retained + added > (field.maxFiles ?? 1)) fail(400, field.label + '最多可上传 ' + (field.maxFiles ?? 1) + ' 个附件')
  }
  const retainedBytes = previous.reduce((total, file) => total + (removeIds.has(file.id) ? 0 : file.byteCount), 0)
  const newBytes = prepared.uploads.reduce((total, file) => total + file.bytes.length, 0)
  if (retainedBytes + newBytes > totalUploadsLimit) fail(413, '每份报名的附件合计不能超过 20 MB')
  return removeIds
}

export async function saveAttendeeAttachments(db: PoolConnection, registrationId: number, prepared: Prepared, removals: Set<string>) {
  for (const id of removals) {
    await mutate('DELETE FROM attachments WHERE registration_id=? AND id=?', [registrationId, id], db)
  }
  for (const file of prepared.uploads) {
    await mutate(
      'INSERT INTO attachments (id,registration_id,field_id,filename,mime,byte_count,payload) VALUES (?,?,?,?,?,?,?)',
      [randomUUID(), registrationId, file.fieldId, file.filename, file.mime, file.bytes.length,
        seal(file.bytes, 'file:' + registrationId + ':' + file.fieldId)], db,
    )
  }
}
