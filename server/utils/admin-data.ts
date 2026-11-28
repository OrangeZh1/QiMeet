import { randomBytes } from 'node:crypto'
import type { PoolConnection } from 'mysql2/promise'
import type { AdminEvent, FormVersion } from '#shared/models'
import { markdownVideoIds } from '#shared/markdown-tokens'
import { checkinSourceLabels, displayDate, isContentField, isFileField, registrantDefaultPageSize, registrantPageSizes, registrationContactField } from '#shared/models'

function coverInput(input: Record<string, unknown>): string[] | undefined {
  if (input.coverMaterialIds === undefined && input.coverMaterialId === undefined) return undefined
  const incoming = input.coverMaterialIds ?? (input.coverMaterialId == null ? [] : [input.coverMaterialId])
  if (!Array.isArray(incoming) || incoming.length > 8) fail(400, '最多可选择 8 张封面图片')
  const ids = incoming.map(item => text(item, 36, '封面图片编号').toLowerCase())
  if (new Set(ids).size !== ids.length) fail(400, '同一图片不能重复添加')
  return ids
}

async function replaceCovers(db: PoolConnection, eventId: number, ids: string[]) {
  await mutate('DELETE FROM event_covers WHERE event_id=?', [eventId], db)
  if (ids.length) await mutate(
    'INSERT INTO event_covers (event_id,position,material_id) VALUES ' + ids.map(() => '(?,?,?)').join(','),
    ids.flatMap((id, position) => [eventId, position, id]), db,
  )
}

async function replaceActivityVideos(db: PoolConnection, eventId: number, ids: string[]) {
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    const matched = await rows<{ id: string }>("SELECT id FROM materials WHERE kind='video' AND id IN (" + placeholders + ')', ids, db)
    if (matched.length !== ids.length) fail(404, '活动介绍引用的视频素材不存在，请重新选择。')
  }
  await mutate('DELETE FROM event_videos WHERE event_id=?', [eventId], db)
  if (ids.length) await mutate(
    'INSERT INTO event_videos (event_id,material_id) VALUES ' + ids.map(() => '(?,?)').join(','),
    ids.flatMap(id => [eventId, id]), db,
  )
}

export async function saveConference(id: number | undefined, input: Record<string, unknown>) {
  const title = text(input.title, 160, '活动名称')
  const organizer = text(input.organizer, 160, '主办方', false)
  const venue = text(input.venue, 200, '会场地点', false)
  const covers = coverInput(input)
  const description = text(input.description, 12000, '活动介绍', false)
  const videos = markdownVideoIds(description)
  const eventRange = interval(input.startsAt, input.endsAt, '活动')
  const registrationRange = interval(input.registrationStartsAt, input.registrationEndsAt, '报名')
  const editPolicy = oneOf(input.editPolicy, ['off', 'once', 'unlimited'], '二次修改规则')
  const editDeadline = oneOf(input.editDeadline, ['registration', 'manual'], '修改截止规则')
  const registrationSms = input.registrationSms
  if (registrationSms !== undefined && typeof registrationSms !== 'boolean') fail(400, '请选择是否发送报名成功短信')
  const details = [title, organizer, venue, description]
  const timing = [...eventRange, ...registrationRange, editPolicy, editDeadline]
  return await transaction(async (db) => {
    for (const cover of covers || []) await assertMaterial(cover, db)
    if (id) {
      const current = await conferenceById(id, db, true)
      const coverColumns = covers === undefined ? '' : ",cover_material_id=?,cover_url=''"
      await mutate('UPDATE events SET title=?,organizer=?,venue=?,description=?,starts_at=?,ends_at=?,registration_starts_at=?,registration_ends_at=?,edit_policy=?,edit_deadline=?,registration_sms=?' + coverColumns + ' WHERE id=?',
        [...details, ...timing, registrationSms ?? current.registrationSms, ...(covers === undefined ? [] : [covers[0] ?? null]), id], db)
      if (covers !== undefined) await replaceCovers(db, id, covers)
      await replaceActivityVideos(db, id, videos)
      return id
    }
    const provided = text(input.slug, 64, '活动链接', false)
    const slug = provided || randomBytes(7).toString('hex')
    if (!slugPattern.test(slug)) fail(400, '活动链接只能使用小写字母、数字和连字符')
    let result
    try {
      result = await mutate(
        'INSERT INTO events (slug,title,organizer,venue,description,starts_at,ends_at,registration_starts_at,registration_ends_at,edit_policy,edit_deadline,cover_material_id,published,registration_sms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [slug, ...details, ...timing, covers?.[0] ?? null, input.published === true, registrationSms ?? false], db,
      )
    } catch (error) {
      if (isDuplicate(error)) fail(409, '活动链接已被占用')
      throw error
    }
    if (covers?.length) await replaceCovers(db, result.insertId, covers)
    if (videos.length) await replaceActivityVideos(db, result.insertId, videos)
    await mutate('INSERT INTO form_versions (event_id,version,fields,legacy_contact) VALUES (?,1,JSON_ARRAY(),FALSE)', [result.insertId], db)
    await mutate("INSERT INTO checkpoints (event_id,title,starts_at,ends_at) VALUES (?,'主会场签到',?,?)", [result.insertId, ...eventRange], db)
    return result.insertId
  })
}

export async function getAdminEvent(eventId: number): Promise<AdminEvent> {
  const [conference, forms, checkpoints, counts] = await Promise.all([
    conferenceById(eventId), formsFor(eventId), checkpointsFor(eventId),
    first<{ registered: number, attended: number }>(
      'SELECT (SELECT COUNT(*) FROM registrations WHERE event_id=?) AS registered, ' +
      '(SELECT COUNT(DISTINCT c.registration_id) FROM checkins c JOIN checkpoints p ON p.id=c.checkpoint_id WHERE p.event_id=?) AS attended', [eventId, eventId],
    ),
  ])
  return { conference, forms, checkpoints, registered: counts!.registered, attended: counts!.attended }
}

export async function saveForm(eventId: number, input: Record<string, unknown>) {
  const nextFields = fields(input.fields)
  const purpose = text(input.identityPurpose, 800, '身份证号收集用途', nextFields.some(field => field.type === 'identity'))
  return await transaction(async (db) => {
    await conferenceById(eventId, db, true)
    const current = await activeForm(eventId, db)
    if (positive(input.formId) !== current.id) fail(409, '报名表已有新版本，请刷新页面后继续修改')
    const version = current.version + 1
    const result = await mutate('INSERT INTO form_versions (event_id,version,fields,identity_purpose,legacy_contact) VALUES (?,?,?,?,FALSE)',
      [eventId, version, JSON.stringify(nextFields), purpose], db)
    return { id: result.insertId, version, fields: nextFields, identityPurpose: purpose, legacyContact: false }
  })
}

export async function saveCheckpoint(eventId: number, input: Record<string, unknown>) {
  const title = text(input.title, 100, '签到环节名称')
  const period = interval(input.startsAt, input.endsAt, '签到')
  const mode = oneOf(input.qrMode, ['fixed', 'dynamic', 'both'], '二维码类型')
  const direct = input.directEnabled
  if (direct !== undefined && typeof direct !== 'boolean') fail(400, '请选择是否允许手机签到')
  return await transaction(async (db) => {
    await conferenceById(eventId, db, true)
    if (input.id !== undefined && input.id !== null) {
      const id = positive(input.id)
      const point = await checkpointFor(eventId, id, db, true)
      await mutate('UPDATE checkpoints SET title=?,starts_at=?,ends_at=?,qr_mode=?,qr_version=?,direct_enabled=? WHERE id=?',
        [title, ...period, mode, point.qrVersion + Number(point.qrMode !== mode), direct ?? point.directEnabled, id], db)
      return id
    }
    return (await mutate('INSERT INTO checkpoints (event_id,title,starts_at,ends_at,qr_mode,direct_enabled) VALUES (?,?,?,?,?,?)',
      [eventId, title, ...period, mode, direct ?? false], db)).insertId
  })
}

function rosterContactColumn(forms: FormVersion[], role: 'name' | 'phone') {
  const stored = 'r.' + role
  const sources = forms.flatMap(form => {
    const field = registrationContactField(form.fields, role)
    return field ? [[form.id, '$.' + JSON.stringify(field.id)]] : []
  })
  if (!sources.length) return { sql: stored, args: [] }
  const cases = sources.map(() => "WHEN ? THEN NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r.answers, ?))), '')").join(' ')
  return { sql: `COALESCE(NULLIF(CONVERT(${stored} USING utf8mb4) COLLATE utf8mb4_bin, ''), CASE r.form_id ${cases} END)`, args: sources.flat() }
}

export async function listRegistrations(eventId: number, query: Record<string, unknown>) {
  await conferenceById(eventId)
  const term = text(query.q, 120, '搜索条件', false)
  const requestedPage = query.page === undefined ? 1 : positive(query.page)
  const pageSize = query.pageSize === undefined ? registrantDefaultPageSize : positive(query.pageSize)
  if (!registrantPageSizes.some(size => size === pageSize)) fail(400, '每页条数有误')
  const pointId = query.checkpointId ? positive(query.checkpointId) : null
  const status = oneOf(query.status || 'all', ['all', 'checked', 'pending'], '签到状态')
  if (pointId) await checkpointFor(eventId, pointId)
  const forms = await formsFor(eventId)
  const rosterName = rosterContactColumn(forms, 'name')
  const rosterPhone = rosterContactColumn(forms, 'phone')
  const where = ['r.event_id=?']
  const args: unknown[] = [eventId]
  if (term) {
    where.push(`(LOCATE(?,${rosterName.sql})>0 OR LOCATE(?,${rosterPhone.sql})>0)`)
    args.push(term, ...rosterName.args, term, ...rosterPhone.args)
  }
  if (status !== 'all') {
    where.push((status === 'pending' ? 'NOT ' : '') + 'EXISTS (SELECT 1 FROM checkins c WHERE c.registration_id=r.id' + (pointId ? ' AND c.checkpoint_id=?' : '') + ')')
    if (pointId) args.push(pointId)
  }
  const condition = ' FROM registrations r JOIN form_versions f ON f.id=r.form_id WHERE ' + where.join(' AND ')
  const count = await first<{ total: number }>('SELECT COUNT(*) AS total' + condition, args)
  const total = count!.total
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)))
  const results = await rows<{ id: number, name: string | null, phone: string | null, createdAt: string, version: number, edits: number }>(
    `SELECT r.id,${rosterName.sql} AS name,${rosterPhone.sql} AS phone,r.created_at AS createdAt,r.edits,f.version` + condition + ' ORDER BY r.id DESC LIMIT ? OFFSET ?',
    [...rosterName.args, ...rosterPhone.args, ...args, String(pageSize), String((page - 1) * pageSize)],
  )
  const attendance = await attendanceFor(eventId, results.map(row => row.id))
  return { total, page, pageSize, rows: results.map(row => ({ ...row, createdAt: iso(row.createdAt), attendance: attendance.get(row.id) || [] })) }
}

function csvCell(value: unknown) {
  const raw = String(value ?? '')
  const safe = /^[\t\r\n]|^\s*[=+\-@＝＋－＠]/u.test(raw) ? "'" + raw : raw
  return '"' + safe.replaceAll('"', '""') + '"'
}
export async function exportRegistrants(event: RequestEvent, eventId: number, formId: number | undefined, sensitive: boolean) {
  const conference = await conferenceById(eventId)
  const form = formId ? await savedForm(eventId, formId) : null
  const checkpoints = await checkpointsFor(eventId)
  const columns = [
    '报名编号', '姓名', '手机号', '报名表版本', '报名时间', '修改次数',
    ...checkpoints.flatMap(point => [point.title + ' · 签到时间', point.title + ' · 来源']),
  ]
  const customFields = form?.fields.filter(field => !isContentField(field.type)) || []
  columns.push(...customFields.map(field => field.label))
  const lines = [columns.map(csvCell).join(',')]
  let rowCount = 0
  let lastId = 0
  // Batch attendance and attachment metadata so exports never load attachment payloads.
  for (;;) {
    const results = await rows<StoredRegistration & { version: number }>(
      'SELECT ' + registrationColumns + ',f.version FROM registrations r JOIN form_versions f ON f.id=r.form_id ' +
      'WHERE r.event_id=? AND r.id>?' + (formId ? ' AND r.form_id=?' : '') + ' ORDER BY r.id LIMIT 500',
      formId ? [eventId, lastId, formId] : [eventId, lastId],
    )
    if (!results.length) break
    lastId = results.at(-1)!.id
    const ids = results.map(row => row.id)
    const attendance = await attendanceFor(eventId, ids)
    const attachments = customFields.some(field => isFileField(field.type))
      ? await rows<{ registrationId: number, fieldId: string, filename: string }>(
        'SELECT registration_id AS registrationId,field_id AS fieldId,filename FROM attachments WHERE registration_id IN (' + ids.map(() => '?').join(',') + ')', ids,
      ) : []
    const filenames = new Map<string, string[]>()
    for (const file of attachments) {
      const key = file.registrationId + ':' + file.fieldId
      const names = filenames.get(key)
      if (names) names.push(file.filename)
      else filenames.set(key, [file.filename])
    }
    for (const record of results) {
      const answers = form ? shownAnswers(record, form, sensitive ? 'full' : 'masked') : {}
      const pointMap = new Map(attendance.get(record.id)?.map(point => [point.id, point]))
      const values = [
        record.id, record.name, record.phone, record.version, displayDate(iso(record.createdAt)), record.edits,
        ...checkpoints.flatMap(point => {
          const saved = pointMap.get(point.id)
          return saved?.checkedAt ? [displayDate(saved.checkedAt), saved.source ? checkinSourceLabels[saved.source] : ''] : ['', '']
        }),
        ...customFields.map(field => {
          if (isFileField(field.type)) return filenames.get(record.id + ':' + field.id)?.join('；') || ''
          const value = answers[field.id]
          return Array.isArray(value) ? value.join('；') : value
        }),
      ]
      lines.push(values.map(csvCell).join(','))
      rowCount++
    }
  }
  if (sensitive) await mutate('INSERT INTO export_audit (event_id,form_id,row_count) VALUES (?,?,?)', [eventId, formId!, rowCount])
  const filename = conference.slug + (form ? '-v' + form.version : '-summary') + (sensitive ? '-full' : '') + '.csv'
  setResponseHeaders(event, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="' + filename + '"' })
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}
