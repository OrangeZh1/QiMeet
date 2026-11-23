import { displayDate, type EventDetails } from '#shared/models'
import { attendeeReturn } from '#shared/attendee-account'

type AttendeeEventDetails = EventDetails & { identityRecovery: boolean }

export const attendeePath = (slug: string) => '/e/' + encodeURIComponent(slug)
export const attendeeApi = (slug: string, action: string) => '/api' + attendeePath(slug) + '/' + action
export const attendeeLogin = (next: string) => ({ path: '/login', query: { next: attendeeReturn(next) } })
export function attendeeCheckinQuery(query: Record<string, unknown>) {
  if (query.q !== undefined) {
    return typeof query.q === 'string' && query.q && query.q.length <= 150 ? { q: query.q } : undefined
  }
  return typeof query.point === 'string' && /^[1-9]\d{0,9}$/.test(query.point) ? { point: query.point } : undefined
}

export function useAttendeeEvent() {
  const slug = String(useRoute().params.slug || '')
  const request = useRequestFetch()
  const details = useAsyncData('attendee-event:' + slug, async () => {
    return request<AttendeeEventDetails>(attendeeApi(slug, 'details'))
  })
  return { slug, path: attendeePath(slug), details }
}

export function attendeeErrorStatus(cause: unknown) {
  if (!cause || typeof cause !== 'object') return
  const value = cause as { statusCode?: number, status?: number }
  return value.statusCode || value.status
}

export function setAttendeeErrorStatus(cause: unknown) {
  if (!import.meta.server || !cause) return
  const request = useRequestEvent()
  const status = attendeeErrorStatus(cause)
  if (request && status && status >= 400 && status <= 599) request.node.res.statusCode = status
}

export function attendeeDateRange(start: string, end: string) {
  return displayDate(start) + ' 至 ' + displayDate(end)
}
