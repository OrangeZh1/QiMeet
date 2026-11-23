import type { PoolConnection } from 'mysql2/promise'
import type { Attendance, Checkpoint, Conference, FormVersion } from '#shared/models'
import type { AccountPendingCheckin, AccountRegistration, AttendeeActivityCard } from '#shared/attendee-account'

type ConferenceRow = Omit<Conference, 'coverImages'> & { coverIds: string | null }
const eventColumns = "id,slug,title,organizer,venue,cover_url AS coverUrl,cover_material_id AS coverMaterialId,description,agenda,registration_closed_at AS registrationClosedAt,ended_at AS endedAt,starts_at AS startsAt,ends_at AS endsAt,registration_starts_at AS registrationStartsAt,registration_ends_at AS registrationEndsAt,published,registration_sms AS registrationSms,edit_policy AS editPolicy,edit_deadline AS editDeadline,(SELECT GROUP_CONCAT(ec.material_id ORDER BY ec.position) FROM event_covers ec WHERE ec.event_id=e.id) AS coverIds"
function eventDates({ coverIds, ...row }: ConferenceRow, publicView = false): Conference {
  const ids = coverIds ? coverIds.split(',') : row.coverMaterialId ? [row.coverMaterialId] : []
  const prefix = publicView ? '/api/materials/' : '/api/manage/materials/content?id='
  const coverImages = ids.map(id => ({ id, url: prefix + id }))
  return {
    ...row, published: Boolean(row.published), registrationSms: Boolean(row.registrationSms),
    coverMaterialId: coverImages[0]?.id || null,
    coverUrl: coverImages[0]?.url || row.coverUrl,
    coverImages,
    registrationClosedAt: row.registrationClosedAt ? iso(row.registrationClosedAt) : null,
    endedAt: row.endedAt ? iso(row.endedAt) : null,
    startsAt: iso(row.startsAt), endsAt: iso(row.endsAt),
    registrationStartsAt: iso(row.registrationStartsAt), registrationEndsAt: iso(row.registrationEndsAt),
  }
}
export const isOpen = (start: string, end: string) => Date.parse(start) <= Date.now() && Date.now() < Date.parse(end)
export const registrationOpen = (conference: Conference) => conference.published && !conference.endedAt && !conference.registrationClosedAt &&
  isOpen(conference.registrationStartsAt, conference.registrationEndsAt)
export const editOpen = (conference: Conference, edits: number) =>
  conference.published && conference.editPolicy !== 'off' &&
  (conference.editPolicy === 'unlimited' || edits === 0) &&
  (conference.editDeadline === 'manual' || registrationOpen(conference))

export async function conferenceById(id: number, db?: PoolConnection, lock = false) {
  const row = await first<ConferenceRow>("SELECT " + eventColumns + " FROM events e WHERE e.id=? AND e.deleted_at IS NULL" + (lock ? ' FOR UPDATE' : ''), [id], db)
  if (!row) fail(404, '找不到活动')
  return eventDates(row)
}
export async function publishedConference(slug: string, db?: PoolConnection, lock = false) {
  if (slug.length > 64 || !slugPattern.test(slug)) fail(404, '活动不存在或尚未发布')
  const row = await first<ConferenceRow>('SELECT ' + eventColumns + ' FROM events e WHERE e.slug=? AND e.published=1 AND e.deleted_at IS NULL' + (lock ? ' FOR UPDATE' : ''), [slug], db)
  if (!row) fail(404, '活动不存在或尚未发布')
  return eventDates(row, true)
}
export async function listConferences() {
  const results = await rows<ConferenceRow & { registered: number, attended: number }>(
    'SELECT ' + eventColumns + ', (SELECT COUNT(*) FROM registrations WHERE event_id=e.id) AS registered, ' +
    '(SELECT COUNT(DISTINCT c.registration_id) FROM checkins c JOIN checkpoints p ON p.id=c.checkpoint_id WHERE p.event_id=e.id) AS attended ' +
    'FROM events e WHERE e.deleted_at IS NULL ORDER BY e.created_at DESC,e.id DESC',
  )
  return results.map(row => ({ ...eventDates(row), registered: row.registered, attended: row.attended }))
}

const cardColumns = "e.slug,e.title,e.venue,e.starts_at AS startsAt,e.ends_at AS endsAt," +
  "IF(e.cover_material_id IS NULL,e.cover_url,CONCAT('/api/materials/',e.cover_material_id)) AS coverUrl," +
  "(e.ended_at IS NULL AND e.registration_closed_at IS NULL AND UTC_TIMESTAMP(3)>=e.registration_starts_at AND UTC_TIMESTAMP(3)<e.registration_ends_at) AS registrationOpen"
const cardDates = <T extends AttendeeActivityCard>(card: T): T => ({
  ...card, startsAt: iso(card.startsAt), endsAt: iso(card.endsAt), registrationOpen: Boolean(card.registrationOpen),
})

export async function listPublicActivities() {
  const cards = await rows<AttendeeActivityCard>(
    'SELECT ' + cardColumns + ' FROM events e WHERE e.published=1 AND e.deleted_at IS NULL ORDER BY registrationOpen DESC,e.starts_at DESC,e.id DESC',
  )
  return cards.map(cardDates)
}

export async function listAccountRegistrations(accountId: number) {
  const cards = await rows<AccountRegistration>(
    'SELECT ' + cardColumns + ',r.id AS registrationId,r.created_at AS registeredAt,' +
    'EXISTS(SELECT 1 FROM checkins c WHERE c.registration_id=r.id) AS checkedIn ' +
    'FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.account_id=? AND e.published=1 AND e.deleted_at IS NULL ' +
    'ORDER BY r.created_at DESC,r.id DESC',
    [accountId],
  )
  return cards.map(card => ({ ...cardDates(card), registeredAt: iso(card.registeredAt), checkedIn: Boolean(card.checkedIn) }))
}

export async function listAccountPendingCheckins(accountId: number) {
  const items = await rows<AccountPendingCheckin>(
    'SELECT e.slug AS eventSlug,e.title AS eventTitle,p.id AS checkpointId,p.title AS checkpointTitle,' +
    'p.starts_at AS startsAt,p.ends_at AS endsAt,p.direct_enabled AS directEnabled ' +
    'FROM registrations r JOIN events e ON e.id=r.event_id JOIN checkpoints p ON p.event_id=e.id ' +
    'WHERE r.account_id=? AND e.published=1 AND e.deleted_at IS NULL AND e.ended_at IS NULL AND p.ends_at>UTC_TIMESTAMP(3) ' +
    'AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.registration_id=r.id AND c.checkpoint_id=p.id) ' +
    'ORDER BY p.starts_at,p.id',
    [accountId],
  )
  return items.map(item => ({ ...item, startsAt: iso(item.startsAt), endsAt: iso(item.endsAt), directEnabled: Boolean(item.directEnabled) }))
}

const formColumns = 'id,version,fields,identity_purpose AS identityPurpose,legacy_contact AS legacyContact'
export async function formsFor(eventId: number, db?: PoolConnection) {
  const list = await rows<FormVersion>('SELECT ' + formColumns + ' FROM form_versions WHERE event_id=? ORDER BY version DESC', [eventId], db)
  return list.map(form => ({ ...form, legacyContact: Boolean(form.legacyContact) }))
}
export async function activeForm(eventId: number, db?: PoolConnection) {
  const form = await first<FormVersion>('SELECT ' + formColumns + ' FROM form_versions WHERE event_id=? ORDER BY version DESC LIMIT 1', [eventId], db)
  if (!form) fail(409, '报名表尚未配置')
  return { ...form, legacyContact: Boolean(form.legacyContact) }
}
export async function savedForm(eventId: number, formId: number, db?: PoolConnection) {
  const form = await first<FormVersion>('SELECT ' + formColumns + ' FROM form_versions WHERE event_id=? AND id=?', [eventId, formId], db)
  if (!form) fail(404, '报名表版本不存在')
  return { ...form, legacyContact: Boolean(form.legacyContact) }
}

type StoredCheckpoint = Checkpoint & { qrVersion: number, attended: number }
const checkpointColumns = 'p.id,p.title,p.starts_at AS startsAt,p.ends_at AS endsAt,p.qr_mode AS qrMode,p.qr_version AS qrVersion,p.direct_enabled AS directEnabled'
const checkpointDates = (row: StoredCheckpoint) => ({ ...row, startsAt: iso(row.startsAt), endsAt: iso(row.endsAt), directEnabled: Boolean(row.directEnabled) })
export async function checkpointsFor(eventId: number, db?: PoolConnection) {
  const result = await rows<StoredCheckpoint>(
    'SELECT ' + checkpointColumns + ',(SELECT COUNT(*) FROM checkins c WHERE c.checkpoint_id=p.id) AS attended FROM checkpoints p WHERE p.event_id=? ORDER BY p.starts_at,p.id',
    [eventId], db,
  )
  return result.map(checkpointDates)
}
export async function checkpointFor(eventId: number, id: number, db?: PoolConnection, lock = false) {
  const row = await first<StoredCheckpoint>(
    'SELECT ' + checkpointColumns + ' FROM checkpoints p WHERE p.event_id=? AND p.id=?' + (lock ? ' FOR UPDATE' : ''),
    [eventId, id], db,
  )
  if (!row) fail(404, '签到环节不存在')
  return checkpointDates(row)
}
export async function attendanceFor(eventId: number, registrationIds: number[], db?: PoolConnection) {
  const result = new Map<number, Attendance[]>()
  if (!registrationIds.length) return result
  const checkpoints = await checkpointsFor(eventId, db)
  for (const id of registrationIds) result.set(id, checkpoints.map(point => ({ id: point.id, title: point.title, checkedAt: null, source: null })))
  const checked = await rows<{ registrationId: number, pointId: number, checkedAt: string, source: Attendance['source'] }>(
    'SELECT c.registration_id AS registrationId,c.checkpoint_id AS pointId,c.checked_at AS checkedAt,c.source FROM checkins c JOIN checkpoints p ON p.id=c.checkpoint_id ' +
    'WHERE p.event_id=? AND c.registration_id IN (' + registrationIds.map(() => '?').join(',') + ')',
    [eventId, ...registrationIds], db,
  )
  for (const check of checked) {
    const point = result.get(check.registrationId)?.find(point => point.id === check.pointId)
    if (point) Object.assign(point, { checkedAt: iso(check.checkedAt), source: check.source })
  }
  return result
}
export async function recordCheckin(db: PoolConnection, checkpointId: number, registrationId: number, source: NonNullable<Attendance['source']>) {
  let repeated = false
  try {
    await mutate('INSERT INTO checkins (checkpoint_id,registration_id,source,checked_at) VALUES (?,?,?,UTC_TIMESTAMP(3))', [checkpointId, registrationId, source], db)
  } catch (error) {
    if (!isDuplicate(error)) throw error
    repeated = true
  }
  const result = await first<{ checkedAt: string, source: Attendance['source'] }>(
    'SELECT checked_at AS checkedAt,source FROM checkins WHERE checkpoint_id=? AND registration_id=? FOR UPDATE',
    [checkpointId, registrationId], db,
  )
  return { checkedAt: iso(result!.checkedAt), source: result!.source, repeated }
}
