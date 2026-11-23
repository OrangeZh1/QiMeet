import type { AgendaItem } from '#shared/models'
import type { TrashedEvent } from '#shared/event-trash'

export async function listTrashedConferences(): Promise<TrashedEvent[]> {
  const entries = await rows<TrashedEvent>(
    'SELECT id,title,starts_at AS startsAt,deleted_at AS deletedAt FROM events WHERE deleted_at IS NOT NULL ' +
    'ORDER BY deleted_at DESC,id DESC',
  )
  return entries.map(entry => ({ ...entry, startsAt: iso(entry.startsAt), deletedAt: iso(entry.deletedAt) }))
}

export async function trashEvent(id: number) {
  const result = await mutate('UPDATE events SET deleted_at=UTC_TIMESTAMP(3),published=0 WHERE id=? AND deleted_at IS NULL', [id])
  if (!result.affectedRows && !await first('SELECT id FROM events WHERE id=? AND deleted_at IS NOT NULL', [id])) fail(404, '找不到活动')
  return { ok: true }
}

export async function restoreTrashedEvent(id: number) {
  const result = await mutate('UPDATE events SET deleted_at=NULL,published=0 WHERE id=? AND deleted_at IS NOT NULL', [id])
  if (!result.affectedRows) fail(404, '找不到待恢复的活动')
  return { ok: true }
}

export async function purgeTrashedEvent(id: number, deletedAt: string) {
  return transaction(async (db) => {
    const row = await first<{ deletedAt: string | null }>('SELECT deleted_at AS deletedAt FROM events WHERE id=? FOR UPDATE', [id], db)
    if (!row?.deletedAt) fail(404, '找不到待永久删除的活动')
    if (iso(row.deletedAt) !== deletedAt) fail(409, '回收站中的活动状态已变化，请重新确认')
    await mutate('DELETE s FROM sessions s JOIN registrations r ON r.id=s.registration_id WHERE r.event_id=?', [id], db)
    await mutate('DELETE a FROM attachments a JOIN registrations r ON r.id=a.registration_id WHERE r.event_id=?', [id], db)
    await mutate('DELETE c FROM checkins c JOIN registrations r ON r.id=c.registration_id WHERE r.event_id=?', [id], db)
    await mutate('DELETE c FROM checkins c JOIN checkpoints p ON p.id=c.checkpoint_id WHERE p.event_id=?', [id], db)
    await mutate('DELETE FROM registrations WHERE event_id=?', [id], db)
    await mutate('DELETE FROM export_audit WHERE event_id=?', [id], db)
    await mutate('DELETE FROM form_versions WHERE event_id=?', [id], db)
    await mutate('DELETE FROM checkpoints WHERE event_id=?', [id], db)
    await mutate('DELETE FROM events WHERE id=? AND deleted_at IS NOT NULL', [id], db)
    return { ok: true }
  })
}

export async function closeEventPart(id: number, scope: 'registration' | 'event') {
  return transaction(async (db) => {
    const conference = await conferenceById(id, db, true)
    if (!conference.published) fail(409, '请先发布活动')
    const column = scope === 'registration' ? 'registration_closed_at' : 'ended_at'
    const existing = scope === 'registration' ? conference.registrationClosedAt || conference.endedAt : conference.endedAt
    if (existing) return conference
    if (scope === 'registration' && Date.parse(conference.registrationEndsAt) <= Date.now()) fail(409, '报名已经截止')
    if (scope === 'event' && Date.parse(conference.endsAt) <= Date.now()) fail(409, '活动已经结束')
    await mutate('UPDATE events SET ' + column + '=UTC_TIMESTAMP(3) WHERE id=?', [id], db)
    return conferenceById(id, db)
  })
}

export async function saveEventAgenda(id: number, input: unknown) {
  if (!Array.isArray(input) || input.length > 30) fail(400, '活动流程最多 30 个环节')
  const ids = new Set<string>()
  const agenda = input.map((raw): AgendaItem => {
    const item = object(raw)
    const key = text(item.id, 36, '流程编号')
    if (!uuidPattern.test(key) || ids.has(key)) fail(400, '流程编号重复或无效')
    ids.add(key)
    const startsAt = iso(date(item.startsAt, '流程开始时间'))
    const endsAt = item.endsAt ? iso(date(item.endsAt, '流程结束时间')) : null
    if (endsAt && startsAt >= endsAt) fail(400, '流程结束时间必须晚于开始时间')
    return { id: key, title: text(item.title, 120, '流程名称'), startsAt, endsAt, description: text(item.description, 1000, '流程说明', false) }
  }).sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  await transaction(async (db) => {
    await conferenceById(id, db, true)
    await mutate('UPDATE events SET agenda=? WHERE id=?', [JSON.stringify(agenda), id], db)
  })
  return agenda
}
