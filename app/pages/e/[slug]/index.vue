<script setup lang="ts">
import { attendeeCheckinSourceLabel, displayDate, toLocalInput, type AgendaItem, type CheckinSource } from '#shared/models'
import RichMarkdown from '~/components/RichMarkdown.vue'

definePageMeta({ layout: false, pageTransition: false, key: route => route.path })
const { slug, path, details } = useAttendeeEvent()
const { data, error } = await details
const conference = computed(() => data.value?.conference)
const coverImages = computed(() => {
  if (conference.value?.coverImages?.length) return conference.value.coverImages
  return conference.value?.coverUrl ? [{ id: 'legacy-cover', url: conference.value.coverUrl }] : []
})
const loadedAt = useState('attendee-loaded:' + slug, () => Date.now())
let statusTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  loadedAt.value = Date.now()
  statusTimer = setInterval(() => { loadedAt.value = Date.now() }, 30000)
})
onBeforeUnmount(() => clearInterval(statusTimer))
const canRegister = computed(() => Boolean(data.value?.registrationOpen && conference.value &&
  Date.parse(conference.value.registrationEndsAt) > loadedAt.value))
const registrationStatus = computed(() => {
  if (conference.value?.endedAt) return '活动已结束'
  if (conference.value?.registrationClosedAt) return '报名已截止'
  if (canRegister.value) return '报名开放中'
  return conference.value && Date.parse(conference.value.registrationStartsAt) > loadedAt.value
    ? '报名尚未开始'
    : '报名已截止'
})
setAttendeeErrorStatus(error.value)
useSeoMeta({
  title: () => conference.value?.title || '活动详情',
  description: () => conference.value?.description.slice(0, 150),
})
const agendaLabel = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'short' })
const flowDays = computed(() => {
  const days = new Map<string, { label: string, items: AgendaItem[] }>()
  for (const item of conference.value?.agenda || []) {
    const key = toLocalInput(item.startsAt).slice(0, 10)
    const existing = days.get(key)
    if (existing) existing.items.push(item)
    else days.set(key, { label: agendaLabel.format(new Date(item.startsAt)), items: [item] })
  }
  return days
})
const flowTime = (value: string) => toLocalInput(value).slice(11, 16)
const crossesDay = (left: string, right: string) => toLocalInput(left).slice(0, 10) !== toLocalInput(right).slice(0, 10)
function checkpointState(point: { startsAt: string, endsAt: string }) {
  if (conference.value?.endedAt || Date.parse(point.endsAt) <= loadedAt.value) return '已结束'
  return Date.parse(point.startsAt) <= loadedAt.value ? '签到中' : '待开始'
}
function checkpointTime(point: { startsAt: string, endsAt: string }) {
  if (!conference.value || crossesDay(point.startsAt, point.endsAt)) return attendeeDateRange(point.startsAt, point.endsAt)
  const time = flowTime(point.startsAt) + '–' + flowTime(point.endsAt)
  return crossesDay(conference.value.startsAt, point.startsAt)
    ? agendaLabel.format(new Date(point.startsAt)) + ' ' + time
    : time
}
const actionText = computed(() => data.value?.recognized ? '查看报名详情' : canRegister.value ? '立即报名' : registrationStatus.value)
const hasRegistrationAction = computed(() => data.value?.recognized || canRegister.value)
const checkedIn = computed<Partial<Record<number, CheckinSource>>>(() => data.value?.checkedInSources || {})
const openCheckpoints = computed(() => (data.value?.checkpoints || []).filter(point => !checkedIn.value[point.id] && checkpointState(point) === '签到中'))
const directCheckpoints = computed(() => openCheckpoints.value.filter(point => point.directEnabled))
const actionCount = computed(() => Number(hasRegistrationAction.value) + Number(directCheckpoints.value.length > 0) + Number(openCheckpoints.value.length > 0))
const checkinPickerOpen = ref(false)
const scannerOpen = ref(false)
const registrationLink = computed(() => {
  const page = path + (data.value?.recognized ? '/record' : '/register')
  return data.value?.signedIn ? page : attendeeLogin(page)
})
const checkinLink = (point: number) => {
  const page = path + '/check-in?point=' + point
  return data.value?.signedIn ? page : attendeeLogin(page)
}
</script>

<template>
  <NuxtLayout name="attendee" event-page navigation>
    <article v-if="conference && data" class="event-detail">
      <section class="event-intro" aria-labelledby="attendee-title">
        <div v-if="coverImages.length" class="event-poster">
          <AttendeeCoverCarousel :images="coverImages" />
        </div>
        <h1 id="attendee-title" class="attendee-heading">{{ conference.title }}</h1>
        <div v-if="hasRegistrationAction || directCheckpoints.length" class="event-enrollment">
          <span class="event-registration-state" :data-active="canRegister && !data.recognized">
            {{ data.recognized && !conference.endedAt ? '已报名' : registrationStatus }}
          </span>
        </div>
        <div v-if="conference.organizer" class="event-organizer">
          <span class="event-organizer-icon"><UIcon name="i-lucide-building-2" aria-hidden="true" /></span>
          <div><small>主办方</small><strong>{{ conference.organizer }}</strong></div>
        </div>
      </section>

      <dl class="event-facts" aria-label="活动安排">
        <div class="event-fact">
          <dt><UIcon name="i-lucide-calendar-days" aria-hidden="true" />活动时间</dt>
          <dd>
            {{ attendeeDateRange(conference.startsAt, conference.endsAt) }}
            <small v-if="conference.endedAt">结束于 <time :datetime="conference.endedAt">{{ displayDate(conference.endedAt) }}</time></small>
          </dd>
        </div>
        <div v-if="conference.venue" class="event-fact">
          <dt><UIcon name="i-lucide-map-pin" aria-hidden="true" />会场地点</dt>
          <dd>{{ conference.venue }}</dd>
        </div>
        <div class="event-fact">
          <dt><UIcon name="i-lucide-clock-3" aria-hidden="true" />报名时间</dt>
          <dd>
            {{ attendeeDateRange(conference.registrationStartsAt, conference.registrationEndsAt) }}
            <small v-if="conference.registrationClosedAt">截止于 <time :datetime="conference.registrationClosedAt">{{ displayDate(conference.registrationClosedAt) }}</time></small>
          </dd>
        </div>
      </dl>

      <section v-if="conference.description" class="event-section">
        <h2>活动介绍</h2>
        <RichMarkdown :source="conference.description" />
      </section>

      <section v-if="conference.agenda?.length" class="event-section">
        <h2>活动流程</h2>
        <div v-for="[day, group] in flowDays" :key="day" class="event-flow-day">
          <p class="event-flow-date"><time :datetime="day">{{ group.label }}</time></p>
          <ol class="event-flow-list">
            <li v-for="item in group.items" :key="item.id" class="event-flow-item">
              <div class="event-flow-time">
                <time :datetime="item.startsAt">{{ flowTime(item.startsAt) }}</time>
                <template v-if="item.endsAt">
                  <span aria-hidden="true">–</span><span class="sr-only">至</span>
                  <time :datetime="item.endsAt">{{ crossesDay(item.startsAt, item.endsAt) ? displayDate(item.endsAt) : flowTime(item.endsAt) }}</time>
                </template>
              </div>
              <div>
                <h3>{{ item.title }}</h3>
                <p v-if="item.description">{{ item.description }}</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section v-if="data.checkpoints.length" class="event-section">
        <h2>现场签到</h2>
        <p v-if="openCheckpoints.length" class="event-check-in-note">从底部选择可用的签到方式。</p>
        <ul class="event-checkpoints">
          <li v-for="checkpoint in data.checkpoints" :key="checkpoint.id">
            <div class="event-checkpoint-copy">
              <strong>{{ checkpoint.title }}</strong>
              <span class="event-checkpoint-state" :data-live="!!checkedIn[checkpoint.id] || checkpointState(checkpoint) === '签到中'">
                {{ checkedIn[checkpoint.id] ? '已签到 · ' + attendeeCheckinSourceLabel(checkedIn[checkpoint.id]!) : checkpointState(checkpoint) }}
              </span>
            </div>
            <span class="event-checkpoint-time">{{ checkpointTime(checkpoint) }}</span>
          </li>
        </ul>
      </section>

      <div class="event-action-bar" :class="{ 'event-action-bar-paired': actionCount === 2, 'event-action-bar-three': actionCount === 3 }">
        <NuxtLink v-if="hasRegistrationAction" class="event-enroll-action"
          :class="{ 'event-enroll-secondary': openCheckpoints.length }"
          :to="registrationLink">{{ actionText }}</NuxtLink>
        <button v-else-if="!actionCount" type="button" class="event-enroll-action" disabled>{{ actionText }}</button>
        <NuxtLink v-if="directCheckpoints.length === 1 && directCheckpoints[0]" class="event-enroll-action"
          :class="{ 'event-enroll-secondary': openCheckpoints.length }"
          :to="checkinLink(directCheckpoints[0].id)">手机签到</NuxtLink>
        <button v-else-if="directCheckpoints.length > 1" type="button" class="event-enroll-action" aria-haspopup="dialog"
          :class="{ 'event-enroll-secondary': openCheckpoints.length }"
          @click="checkinPickerOpen = true">手机签到</button>
        <button v-if="openCheckpoints.length" type="button" class="event-enroll-action" aria-haspopup="dialog" @click="scannerOpen = true">扫码签到</button>
      </div>
      <UModal v-if="openCheckpoints.length || scannerOpen" v-model:open="scannerOpen" title="扫码签到" description="识别后进入签到确认页。"
        :ui="{ overlay: 'z-[60]', content: 'z-[60]' }">
        <template #body><CheckInQrScanner v-if="scannerOpen" /></template>
      </UModal>
      <UModal v-if="directCheckpoints.length > 1 || checkinPickerOpen" v-model:open="checkinPickerOpen"
        title="选择签到环节" description="仅显示当前开放的手机签到环节。"
        :ui="{ overlay: 'z-[60]', content: 'z-[60]' }">
        <template #body>
          <ul v-if="directCheckpoints.length" class="event-checkin-options">
            <li v-for="checkpoint in directCheckpoints" :key="checkpoint.id">
              <NuxtLink :to="checkinLink(checkpoint.id)" @click="checkinPickerOpen = false">
                <span>{{ checkpoint.title }}</span>
                <span class="event-checkpoint-time">{{ checkpointTime(checkpoint) }}</span>
                <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
              </NuxtLink>
            </li>
          </ul>
          <p v-else class="attendee-helper">当前没有开放的环节。</p>
        </template>
      </UModal>
    </article>
    <AttendeeUnavailable v-else class="attendee-narrow event-unavailable"
      title="活动暂不可查看"
      :message="errorText(error, '请向活动主办方确认链接或稍后再试。')" />
  </NuxtLayout>
</template>

<style src="~/assets/css/event-detail.css"></style>
