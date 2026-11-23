import type { Conference } from './models'

export const activityStages = {
  registering: '报名中',
  scheduled: '待开始',
  underway: '进行中',
  ended: '已结束',
  draft: '草稿',
} as const
export type ActivityStage = keyof typeof activityStages

export function activityStage(event: Conference, now: number): ActivityStage {
  if (!event.published) return 'draft'
  if (event.endedAt || Date.parse(event.endsAt) <= now) return 'ended'
  if (Date.parse(event.startsAt) <= now) return 'underway'
  if (!event.registrationClosedAt && Date.parse(event.registrationStartsAt) <= now && Date.parse(event.registrationEndsAt) > now) return 'registering'
  return 'scheduled'
}
