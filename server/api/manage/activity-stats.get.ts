import type { ActivityStats } from '#shared/overview'

export default defineEventHandler(async (event): Promise<ActivityStats> => {
  privateResponse(event)
  await assertAdmin(event)
  const id = positive(getQuery(event).eventId)
  const conference = await conferenceById(id)
  const [totals, trend, checkpoints, versions, sources] = await Promise.all([
    first<{ registrations: number, attendees: number }>(
      'SELECT (SELECT COUNT(*) FROM registrations WHERE event_id=?) AS registrations, ' +
      '(SELECT COUNT(DISTINCT c.registration_id) FROM checkins c JOIN checkpoints p ON p.id=c.checkpoint_id WHERE p.event_id=?) AS attendees',
      [id, id],
    ),
    activityTrend(id),
    checkpointsFor(id),
    rows<ActivityStats['versions'][number]>(
      'SELECT f.id,f.version,COUNT(r.id) AS registrations FROM form_versions f ' +
      'LEFT JOIN registrations r ON r.form_id=f.id AND r.event_id=f.event_id WHERE f.event_id=? ' +
      'GROUP BY f.id,f.version ORDER BY f.version DESC',
      [id],
    ),
    checkinSourceCounts(id),
  ])
  const now = Date.now()
  const checkpointStats = checkpoints.map((point): ActivityStats['checkpoints'][number] => ({
    ...point,
    status: conference.endedAt || Date.parse(point.endsAt) <= now
      ? 'closed'
      : conference.published && Date.parse(point.startsAt) <= now ? 'open' : 'pending',
  }))
  return { ...totals!, registrationOpen: registrationOpen(conference), trend, checkpoints: checkpointStats, versions, sources }
})
