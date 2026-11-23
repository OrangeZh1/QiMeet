export type ContactKind = 'email' | 'phone'
export type AccountIntent = 'login' | 'register'
export type AttendeeAccount = { id: number, kind: ContactKind | 'wechat', label: string }
export type AttendeeContacts = { contactPhone: string | null, contactPhoneVerified: boolean, contactEmail: string | null }
export type AttendeeProfile = AttendeeAccount & AttendeeContacts & { displayName: string, avatarUrl: string | null, hasPassword: boolean }

export function attendeeContactPhone(account: { kind: AttendeeAccount['kind'], identifier: string, verifiedPhone: string | null }) {
  return account.verifiedPhone ?? (account.kind === 'phone' ? account.identifier : null)
}
export type AdminUserRow = AttendeeAccount & {
  displayName: string, phone: string | null, avatarUrl: string | null, createdAt: string, disabled: boolean,
}
export type AdminUserPage = {
  rows: AdminUserRow[], total: number, page: number, pageSize: number,
}
export const adminUserPageSizes = [10, 20, 50, 100] as const
export const adminUserDefaultPageSize = 20
export type AttendeeAuth = { account: AttendeeProfile | null, phone: boolean, email: boolean, wechat: boolean }
export const attendeePasswordMin = 8
export const attendeePasswordMax = 128
export const accountCookie = 'qm_account'
export type AttendeeActivityCard = {
  slug: string, title: string, coverUrl: string | null, venue: string, startsAt: string, endsAt: string, registrationOpen: boolean,
}
export type AccountRegistration = AttendeeActivityCard & { registrationId: number, registeredAt: string, checkedIn: boolean }
export type AccountPendingCheckin = {
  eventSlug: string, eventTitle: string, checkpointId: number, checkpointTitle: string,
  startsAt: string, endsAt: string, directEnabled: boolean,
}

export function attendeeReturn(value: unknown) {
  if (typeof value !== 'string' || value.length > 1200 ||
    !value.startsWith('/') || value.startsWith('//') || /[\\\s\u0000-\u001f]/.test(value)) return '/mine'
  try {
    const url = new URL(value, 'https://qimeet.invalid')
    if (url.origin === 'https://qimeet.invalid' &&
      (url.pathname === '/activities' || url.pathname === '/mine' || url.pathname.startsWith('/mine/') ||
        /^\/e\/[a-z0-9-]+(?:\/(?:register|record|check-in))?$/.test(url.pathname))) {
      return url.pathname + url.search
    }
  } catch { return '/mine' }
  return '/mine'
}

export function attendeeLoginFallback(next: unknown) {
  if (typeof next !== 'string' || attendeeReturn(next) !== next) return '/activities'
  const path = next.split('?')[0] || ''
  const activity = /^\/e\/[a-z0-9-]+(?=\/|$)/.exec(path)?.[0]
  return activity || (path === '/mine' || path.startsWith('/mine/') ? '/mine' : '/activities')
}

export function isPublicAttendeeHistory(value: unknown) {
  if (typeof value !== 'string' || value.startsWith('//') || /[\\\s\u0000-\u001f\u007f]/.test(value)) return false
  const path = value.split(/[?#]/, 1)[0] || ''
  return ['/', '/activities', '/mine', '/mine/registrations', '/mine/check-in-help'].includes(path) || /^\/e\/[a-z0-9-]+$/.test(path)
}
