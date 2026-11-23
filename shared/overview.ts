import type { CheckinSource } from './models'

export type OverviewStats = {
  events: number
  published: number
  registrations: number
  attendees: number
  openRegistrations: number
  openCheckpoints: number
}

export type OverviewDay = { date: string, registrations: number, attendees: number }

export type OverviewEvent = {
  id: number
  title: string
  startsAt: string
  published: boolean
  registrationClosedAt: string | null
  endedAt: string | null
  registered: number
  attended: number
}

export type OverviewReminder = {
  eventId: number
  title: string
  checkpoint?: string | null
  checkpointId?: number | null
  dueAt: string
  kind: 'registration' | 'registration-open' | 'checkpoint' | 'draft'
}

export type Overview = {
  stats: OverviewStats
  trend: OverviewDay[]
  events: OverviewEvent[]
  reminders: OverviewReminder[]
  stages: { stage: 'draft' | 'scheduled' | 'registering' | 'underway' | 'ended', total: number }[]
  sources: SignInSourceCount[]
}

export type SignInSourceCount = { source: CheckinSource, total: number }

export type ActivityStats = {
  registrations: number
  attendees: number
  registrationOpen: boolean
  trend: OverviewDay[]
  checkpoints: { id: number, title: string, startsAt: string, endsAt: string, attended: number, status: 'pending' | 'open' | 'closed' }[]
  versions: { id: number, version: number, registrations: number }[]
  sources: SignInSourceCount[]
}
