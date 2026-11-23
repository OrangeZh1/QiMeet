<script setup lang="ts">
import { attendeeCheckinSourceLabel, attendeeCheckinSources, displayDate, type CheckInIssue, type CheckinSource, type Checkpoint, type Registration } from '#shared/models'
import { materialImagePreviewUrl } from '#shared/materials'

definePageMeta({ layout: false, pageTransition: false, key: route => route.fullPath })
const route = useRoute()
const { slug, path, details } = useAttendeeEvent()
const checkinQuery = attendeeCheckinQuery(route.query)
const direct = Boolean(checkinQuery?.point)
const request = useRequestFetch()
const { data: event, error: eventError } = await details
const pageTitle = direct ? '手机签到' : '现场签到'
useSeoMeta({ title: () => event.value ? pageTitle + ' · ' + event.value.conference.title : pageTitle })
setAttendeeErrorStatus(eventError.value)

type Preview = { checkpoint: Checkpoint, recognized: boolean, checkedAt: string | null, name: string | null, source: CheckinSource | null }
const { data: initial, error: previewError } = await useAsyncData('attendee-check-in:' + route.path + ':' + JSON.stringify(checkinQuery), async () => {
  if (!event.value || !checkinQuery) return { preview: null }
  return { preview: await request<Preview>(attendeeApi(slug, 'check-in'), { query: checkinQuery }) }
})
if (event.value) setAttendeeErrorStatus(previewError.value)
if (event.value && !event.value.signedIn && initial.value?.preview) {
  await navigateTo(attendeeLogin(route.fullPath), { redirectCode: 302 })
}

const preview = ref(initial.value?.preview || null)
const switching = ref(false)
const confirming = ref(false)
const error = ref('')
const invalid = ref(false)
const issueFrom = (cause: unknown) => (cause as { data?: { data?: { checkInIssue?: CheckInIssue } } } | undefined)?.data?.data?.checkInIssue
const issue = ref(issueFrom(previewError.value))
const issueTitles = { waiting: '签到尚未开始', closed: '本环节签到已结束', expired: '动态签到码已过期', revoked: '签到码已作废' }
const point = computed(() => issue.value && 'checkpoint' in issue.value ? issue.value.checkpoint : preview.value?.checkpoint)
const unavailable = computed(() => !event.value || event.value.conference.endedAt || !preview.value || invalid.value)
const resultHeading = ref<HTMLElement>()

function recovered(registration: Registration) {
  if (event.value) event.value = { ...event.value, recognized: true, checkedInSources: attendeeCheckinSources(registration.attendance) }
  if (preview.value) {
    const attendance = registration.attendance.find(item => item.id === preview.value?.checkpoint.id)
    preview.value = {
      ...preview.value, recognized: true, name: registration.name,
      checkedAt: attendance?.checkedAt ?? null, source: attendance?.source ?? null,
    }
  }
  switching.value = false
  error.value = ''
  clearNuxtData(['attendee-record:' + slug, 'attendee-account-registrations', 'attendee-pending-checkins', 'attendee-checkin-history'])
  void nextTick(() => resultHeading.value?.focus())
}

async function checkIn() {
  if (confirming.value || !preview.value) return
  confirming.value = true
  error.value = ''
  try {
    const result = await $fetch<{ checkedAt: string, source: CheckinSource }>(attendeeApi(slug, 'check-in'), {
      method: 'POST', body: checkinQuery,
    })
    preview.value = { ...preview.value, checkedAt: result.checkedAt, source: result.source }
    if (event.value) event.value = { ...event.value, checkedInSources: { ...event.value.checkedInSources, [preview.value.checkpoint.id]: result.source } }
    clearNuxtData(['attendee-record:' + slug, 'attendee-account-registrations', 'attendee-pending-checkins', 'attendee-checkin-history'])
    void nextTick(() => resultHeading.value?.focus())
  } catch (cause) {
    const status = attendeeErrorStatus(cause)
    invalid.value = status === 409 || status === 410
    issue.value = issueFrom(cause)
    if (status === 401 && preview.value) {
      preview.value = { ...preview.value, recognized: false, name: null }
      const auth = await $fetch<{ account: unknown }>('/api/account/session').catch(() => undefined)
      if (auth?.account === null) {
        await navigateTo(attendeeLogin(route.fullPath), { replace: true })
        return
      }
    }
    error.value = errorText(cause, '签到失败，请稍后再试。')
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <NuxtLayout name="attendee" :toolbar-title="pageTitle" :back-to-event="Boolean(event)">
    <article class="checkin-screen">
      <header v-if="event" class="attendee-event-summary checkin-event">
        <img v-if="event.conference.coverUrl" :src="materialImagePreviewUrl(event.conference.coverUrl)" class="attendee-event-summary-cover" alt="" width="64" height="48" />
        <div>
          <component :is="unavailable ? 'p' : 'h1'" class="checkin-event-title">{{ event.conference.title }}</component>
          <p v-if="point" class="checkin-event-point">{{ point.title }}</p>
        </div>
      </header>
      <AttendeeUnavailable
        v-if="!event" class="checkin-unavailable" title="活动暂不可查看"
        :message="errorText(eventError, '请向活动主办方确认链接。')"
      />
      <AttendeeUnavailable
        v-else-if="event.conference.endedAt" class="checkin-unavailable" title="活动已结束"
        message="现场签到已关闭。你仍可查看已有的报名和签到记录。"
        :to="path + '/record'" action="查看我的报名"
      />
      <section v-else-if="!preview || invalid" class="checkin-body checkin-status">
        <div class="attendee-result-icon warning" aria-hidden="true"><UIcon :name="issue?.reason === 'waiting' || issue?.reason === 'closed' ? 'i-lucide-clock-3' : 'i-lucide-scan-line'" /></div>
        <div>
          <h1>{{ issue ? issueTitles[issue.reason] : direct ? '手机签到暂不可用' : checkinQuery ? '签到码暂不可用' : '请扫描现场签到码' }}</h1>
          <p class="attendee-helper">{{ checkinQuery ? error || errorText(previewError, '请返回活动详情查看签到方式。') : '使用手机微信或相机扫描活动现场的二维码。' }}</p>
          <p v-if="issue && 'checkpoint' in issue" class="checkin-hours">{{ attendeeDateRange(issue.checkpoint.startsAt, issue.checkpoint.endsAt) }}</p>
        </div>
      </section>
      <template v-else>
        <p v-if="error" role="alert" class="attendee-error checkin-error">{{ error }}</p>
        <section v-if="preview.recognized && !switching" class="checkin-body attendee-stack" aria-labelledby="attendee-check-heading">
          <div class="checkin-result-title">
            <UIcon v-if="preview.checkedAt" name="i-lucide-circle-check" aria-hidden="true" />
            <h2 id="attendee-check-heading" ref="resultHeading" tabindex="-1">{{ preview.checkedAt ? '已签到' : '确认报名信息' }}</h2>
          </div>
          <dl v-if="preview.name || preview.checkedAt" class="attendee-answers">
            <div v-if="preview.name" class="attendee-answer-row"><dt>报名姓名</dt><dd>{{ preview.name }}</dd></div>
            <div v-if="preview.checkedAt" class="attendee-answer-row"><dt>签到时间</dt><dd><time :datetime="preview.checkedAt">{{ displayDate(preview.checkedAt) }}</time></dd></div>
            <div v-if="preview.source" class="attendee-answer-row"><dt>签到方式</dt><dd>{{ attendeeCheckinSourceLabel(preview.source) }}</dd></div>
          </dl>
          <div class="checkin-actions">
            <UButton v-if="!preview.checkedAt" type="button" class="attendee-action checkin-primary" :loading="confirming" @click="checkIn">确认签到</UButton>
            <UButton v-else :to="path + '/record'" class="attendee-action checkin-primary">查看我的报名</UButton>
            <button type="button" class="attendee-inline-link checkin-secondary" :disabled="confirming" @click="switching = true">切换报名</button>
          </div>
        </section>
        <div v-else>
          <AttendeeRecovery class="checkin-body checkin-recovery attendee-compact-recovery" :slug="slug" :identity-recovery="event.identityRecovery" title="验证报名信息" submit-label="下一步" @recovered="recovered" />
          <button v-if="switching" type="button" class="attendee-inline-link checkin-secondary" @click="switching = false">取消切换</button>
          <NuxtLink v-else-if="event.registrationOpen" :to="{ path: path + '/register', query: checkinQuery }" class="attendee-inline-link checkin-secondary">
            还没有报名？前往报名
          </NuxtLink>
        </div>
      </template>
    </article>
  </NuxtLayout>
</template>

<style scoped>
.checkin-event { border-bottom: 1px solid var(--attendee-form-line); }
.checkin-event-title { font-size: 17px; font-weight: 700; overflow-wrap: anywhere; }
.checkin-event-point { margin-top: 2px; font-size: 13px; color: var(--muted); }
.checkin-body, .checkin-body.checkin-recovery, .checkin-unavailable.attendee-card {
  padding: 20px var(--attendee-form-gutter); border: 0; border-radius: 0; box-shadow: none;
}
.checkin-recovery :deep(h2), .checkin-result-title h2, .checkin-status h1 { font-size: 19px; font-weight: 700; }
.checkin-status { display: flex; align-items: flex-start; gap: 12px; }
.checkin-status .attendee-result-icon { flex: none; width: 36px; height: 36px; border-radius: 8px; font-size: 19px; }
.checkin-status p { margin-top: 5px; }
.checkin-hours { color: var(--ink); font-size: 14px; font-variant-numeric: tabular-nums; }
.checkin-error { margin: 12px var(--attendee-form-gutter) 0; }
.checkin-result-title { display: flex; gap: 7px; align-items: center; }
.checkin-result-title > span { color: #1a654b; font-size: 20px; }
.checkin-actions { display: grid; gap: 6px; }
.checkin-primary { width: 100%; border-radius: 7px; background: var(--attendee-form-blue); }
.checkin-primary:hover { background: #184493; }
.checkin-secondary { display: grid; place-items: center; min-height: 44px; margin: 0 auto; width: fit-content; }
</style>
