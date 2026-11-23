export type ContactKind = 'email' | 'phone'

export function detectAttendeeContact(input: string): { kind: ContactKind, identifier: string } | undefined {
  const value = input.trim().normalize('NFC').toLowerCase()
  if (value.length > 254) return
  const phone = value.replace(/^\+86\s*/, '')
  if (/^1[3-9]\d{9}$/.test(phone)) return { kind: 'phone', identifier: phone }
  if (/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(value)) {
    return { kind: 'email', identifier: value }
  }
}

export type AccountIntent = 'login' | 'register'
export type AttendeeAccount = { id: number, kind: ContactKind | 'wechat', label: string }
export type AttendeeContacts = { contactPhone: string | null, contactPhoneVerified: boolean, contactEmail: string | null }
export type AttendeeProfile = AttendeeAccount & AttendeeContacts & { displayName: string, avatarUrl: string | null, hasPassword: boolean, wechatLinked: boolean }

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
export type AccountRegistration = AttendeeActivityCard & { registrationId: number, registeredAt: string, checkedIn: boolean, recovered: boolean }
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
  const [path = '', query] = next.split('?')
  if (path.endsWith('/record') && new URLSearchParams(query).get('recover') === '1') return '/mine/recover'
  const activity = /^\/e\/[a-z0-9-]+(?=\/|$)/.exec(path)?.[0]
  return activity || (path === '/mine' || path.startsWith('/mine/') ? '/mine' : '/activities')
}

export function isPublicAttendeeHistory(value: unknown) {
  if (typeof value !== 'string' || value.startsWith('//') || /[\\\s\u0000-\u001f\u007f]/.test(value)) return false
  const path = value.split(/[?#]/, 1)[0] || ''
  return ['/', '/activities', '/mine', '/mine/registrations', '/mine/recover', '/mine/check-in-help'].includes(path) || /^\/e\/[a-z0-9-]+$/.test(path)
}

export function scannedCheckInPath(value: string, origin: string) {
  if (value.length > 512) return
  try {
    const url = new URL(value)
    if (url.origin !== origin || url.username || url.password || !/^\/e\/[a-z0-9-]+\/check-in$/.test(url.pathname)) return
    const [code, duplicate] = url.searchParams.getAll('q')
    if (duplicate !== undefined || !code || code.length > 150 || !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]{43}$/.test(code)) return
    return url.pathname + '?q=' + code
  } catch {
    return
  }
}
