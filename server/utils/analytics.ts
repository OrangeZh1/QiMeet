import type { OverviewDay, SignInSourceCount } from '#shared/overview'

const chinaDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
})
const dayMs = 24 * 60 * 60 * 1000

export async function activityTrend(eventId?: number, now = new Date()): Promise<OverviewDay[]> {
  const today = new Date(chinaDate.format(now) + 'T00:00:00+08:00')
  const start = new Date(+today - 6 * dayMs)
  const end = new Date(+today + dayMs)
  const period = [utc(start), utc(end)]
  const dates = Array.from({ length: 7 }, (_, offset) => chinaDate.format(new Date(+start + offset * dayMs)))
  const [registrations, attendees] = await Promise.all([
    rows<{ date: string, total: number }>(
      "SELECT DATE_FORMAT(DATE_ADD(r.created_at, INTERVAL 8 HOUR),'%Y-%m-%d') AS date,COUNT(*) AS total " +
      'FROM registrations r JOIN events e ON e.id=r.event_id WHERE e.deleted_at IS NULL AND r.created_at>=? AND r.created_at<?' +
      (eventId ? ' AND r.event_id=?' : '') + ' GROUP BY date',
      eventId ? [...period, eventId] : period,
    ),
    rows<{ date: string, total: number }>(
      "SELECT DATE_FORMAT(DATE_ADD(first_checkin, INTERVAL 8 HOUR),'%Y-%m-%d') AS date,COUNT(*) AS total " +
      'FROM (SELECT MIN(c.checked_at) AS first_checkin FROM checkins c ' +
      'JOIN registrations r ON r.id=c.registration_id JOIN events e ON e.id=r.event_id WHERE e.deleted_at IS NULL ' +
      (eventId ? 'AND r.event_id=? ' : '') +
      'GROUP BY c.registration_id) AS initial_checkins ' +
      'WHERE first_checkin>=? AND first_checkin<? GROUP BY date',
      eventId ? [eventId, ...period] : period,
    ),
  ])
  const totals = (items: { date: string, total: number }[]) => new Map(items.map(item => [item.date, item.total]))
  const registrationsByDate = totals(registrations)
  const attendeesByDate = totals(attendees)
  return dates.map(date => ({
    date, registrations: registrationsByDate.get(date) ?? 0, attendees: attendeesByDate.get(date) ?? 0,
  }))
}

export async function checkinSourceCounts(eventId?: number) {
  return rows<SignInSourceCount>(
    'SELECT c.source,COUNT(*) AS total FROM checkins c JOIN checkpoints p ON p.id=c.checkpoint_id ' +
    'JOIN events e ON e.id=p.event_id WHERE e.deleted_at IS NULL ' +
    (eventId ? 'AND p.event_id=? ' : '') +
    'GROUP BY c.source',
    eventId ? [eventId] : [],
  )
}
