import type { Overview, OverviewEvent, OverviewReminder, OverviewStats } from '#shared/overview'

export default defineEventHandler(async (event): Promise<Overview> => {
  privateResponse(event)
  await assertAdmin(event)

  const now = new Date()
  const nextTwoDays = utc(new Date(+now + 2 * 24 * 60 * 60 * 1000))
  const current = utc(now)
  const activeEvent = 'e.published=1 AND e.deleted_at IS NULL AND e.ended_at IS NULL'
  const registrationsOpen = activeEvent + ' AND e.registration_closed_at IS NULL AND e.registration_starts_at<=? AND e.registration_ends_at>?'
  const checkpointsOpen = activeEvent + ' AND p.starts_at<=? AND p.ends_at>?'
  const [stats, trend, conferences, reminders, stages, sources] = await Promise.all([
    first<OverviewStats>(
      'SELECT (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL) AS events, ' +
      '(SELECT COUNT(*) FROM events WHERE published=1 AND deleted_at IS NULL) AS published, ' +
      '(SELECT COUNT(*) FROM registrations r JOIN events e ON e.id=r.event_id WHERE e.deleted_at IS NULL) AS registrations, ' +
      '(SELECT COUNT(DISTINCT c.registration_id) FROM checkins c JOIN registrations r ON r.id=c.registration_id JOIN events e ON e.id=r.event_id WHERE e.deleted_at IS NULL) AS attendees, ' +
      '(SELECT COUNT(*) FROM events e WHERE ' + registrationsOpen + ') AS openRegistrations, ' +
      '(SELECT COUNT(*) FROM checkpoints p JOIN events e ON e.id=p.event_id WHERE ' + checkpointsOpen + ') AS openCheckpoints',
      [current, current, current, current],
    ),
    activityTrend(undefined, now),
    rows<OverviewEvent>(
      'SELECT e.id,e.title,e.starts_at AS startsAt,e.published,e.registration_closed_at AS registrationClosedAt,e.ended_at AS endedAt, ' +
      '(SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id) AS registered, ' +
      '(SELECT COUNT(DISTINCT c.registration_id) FROM checkins c JOIN checkpoints p ON p.id=c.checkpoint_id WHERE p.event_id=e.id) AS attended ' +
      'FROM events e WHERE e.deleted_at IS NULL ORDER BY e.created_at DESC,e.id DESC LIMIT 6',
    ),
    rows<OverviewReminder>(
      "SELECT e.id AS eventId,e.title,p.title AS checkpoint,p.id AS checkpointId,p.ends_at AS dueAt,'checkpoint' AS kind " +
      'FROM checkpoints p JOIN events e ON e.id=p.event_id WHERE ' + checkpointsOpen + ' ' +
      "UNION ALL SELECT e.id AS eventId,e.title,NULL,NULL,e.registration_ends_at,CASE WHEN e.registration_ends_at<=? THEN 'registration' ELSE 'registration-open' END " +
      'FROM events e WHERE ' + registrationsOpen + ' ' +
      "UNION ALL SELECT id AS eventId,title,NULL,NULL,starts_at,'draft' " +
      'FROM events WHERE published=0 AND deleted_at IS NULL AND ended_at IS NULL AND starts_at>? AND starts_at<=? ' +
      'ORDER BY dueAt,eventId LIMIT 6',
      [current, current, nextTwoDays, current, current, current, nextTwoDays],
    ),
    rows<Overview['stages'][number]>(
      "SELECT CASE WHEN published=0 THEN 'draft' WHEN ended_at IS NOT NULL OR ends_at<=? THEN 'ended' " +
      "WHEN starts_at<=? THEN 'underway' WHEN registration_closed_at IS NULL AND registration_starts_at<=? AND registration_ends_at>? THEN 'registering' " +
      "ELSE 'scheduled' END AS stage,COUNT(*) AS total FROM events WHERE deleted_at IS NULL GROUP BY stage",
      [current, current, current, current],
    ),
    checkinSourceCounts(),
  ])

  return {
    stats: stats!,
    trend,
    events: conferences.map(item => ({
      ...item, startsAt: iso(item.startsAt), published: Boolean(item.published),
      registrationClosedAt: item.registrationClosedAt ? iso(item.registrationClosedAt) : null,
      endedAt: item.endedAt ? iso(item.endedAt) : null,
    })),
    reminders: reminders.map(item => ({ ...item, dueAt: iso(item.dueAt) })),
    stages,
    sources,
  }
})
