<script setup lang="ts">
import type { AdminEvent, QrDisplay } from '#shared/models'
import { markdownIntro } from '#shared/markdown-tokens'
definePageMeta({ middleware: 'admin', key: route => route.path + ':' + (route.query.mode === 'dynamic' ? 'dynamic' : 'fixed') })
const route = useRoute()
const eventId = Number(route.params.id)
const pointId = Number(route.params.point)
const mode = route.query.mode === 'dynamic' ? 'dynamic' : 'fixed'
const request = useRequestFetch()
const { data: event } = await useAsyncData('projector-event-' + eventId, () => request<AdminEvent>('/api/manage/event', { query: { eventId } }))
const conference = computed(() => event.value?.conference)
const intro = computed(() => markdownIntro(conference.value?.description || ''))
const coverImages = computed(() => {
  const activity = conference.value
  if (activity?.coverImages.length) return activity.coverImages
  return activity?.coverUrl ? [{ id: 'legacy-cover', url: activity.coverUrl }] : []
})
const { data: settings } = useSiteSettings()
const site = computed(() => settings.value || fallbackSite)
const point = computed(() => event.value?.checkpoints.find(point => point.id === pointId))
useSeoMeta({ title: () => (point.value?.title || '签到码') + ' · ' + (mode === 'dynamic' ? '动态码' : '固定码') })
const { data: qr, error, refresh } = await useAsyncData('projector-qr-' + pointId + '-' + mode, () =>
  request<QrDisplay>('/api/manage/qr', { query: { eventId, id: pointId, mode } }),
)
const now = useState(`projector-clock:${eventId}:${pointId}:${mode}`, () => Date.now())
const remaining = computed(() => qr.value?.expiresAt ? Math.max(0, Math.ceil((Date.parse(qr.value.expiresAt) - now.value) / 1000)) : null)
const visible = computed(() => !!qr.value && (remaining.value === null || remaining.value > 0))
let updater: ReturnType<typeof setInterval> | undefined
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  now.value = Date.now()
  clock = setInterval(() => { now.value = Date.now() }, 1000)
  if (mode === 'dynamic') {
    updater = setInterval(() => { void refresh({ dedupe: 'defer' }) }, 30000)
  }
})
onBeforeUnmount(() => { clearInterval(updater); clearInterval(clock) })
const print = () => window.print()
const checkinStatus = computed(() => {
  if (!point.value) return ''
  if (conference.value?.endedAt || Date.parse(point.value.endsAt) <= now.value) return '签到已截止'
  return Date.parse(point.value.startsAt) > now.value ? '签到尚未开始' : '签到中'
})
</script>

<template>
  <main class="projection">
    <article class="projection-board">
      <section class="projection-event" aria-labelledby="projection-title">
        <div class="projection-brand"><img :src="site.logoUrl" width="30" height="30" alt="" /> {{ site.title }}</div>
        <h1 id="projection-title">{{ conference?.title || '现场签到' }}</h1>
        <p v-if="intro" class="projection-intro">{{ intro }}</p>
        <div v-if="coverImages.length" class="projection-cover print-hide">
          <AttendeeCoverCarousel :images="coverImages" />
        </div>
        <dl v-if="conference" class="projection-facts">
          <div v-if="conference.organizer"><dt>主办方</dt><dd>{{ conference.organizer }}</dd></div>
          <div v-if="conference.venue"><dt>会场地点</dt><dd>{{ conference.venue }}</dd></div>
          <div><dt>活动时间</dt><dd>{{ attendeeDateRange(conference.startsAt, conference.endsAt) }}</dd></div>
        </dl>
      </section>

      <section class="projection-scan" aria-labelledby="projection-checkpoint">
        <div class="projection-scan-title">
          <h2 id="projection-checkpoint">{{ point?.title || '签到二维码' }}</h2>
          <span v-if="checkinStatus" class="projection-state" :data-live="checkinStatus === '签到中'">{{ checkinStatus }}</span>
        </div>
        <p v-if="point" class="projection-hours">{{ attendeeDateRange(point.startsAt, point.endsAt) }}</p>
        <img v-if="visible && qr" class="projection-code" :src="qr.dataUrl"
          :alt="mode === 'dynamic' ? '动态签到二维码' : '固定签到二维码'" width="480" height="480" />
        <p v-if="error" class="feedback error" role="alert">{{ errorText(error, '签到码暂时不可用') }}</p>
        <p v-else-if="!visible" class="feedback error">二维码已过期，请等待自动更新。</p>
        <p v-else class="projection-instruction">
          {{ checkinStatus === '签到尚未开始' ? '签到开始后，请用微信或相机扫码' : '请使用微信或手机相机扫码签到' }}
        </p>
        <p v-if="visible && remaining !== null" class="projection-hours print-hide">
          动态码自动更新 · 当前码剩余 {{ remaining }} 秒
        </p>
        <UButton v-if="mode === 'fixed' && visible" class="print-hide" icon="i-lucide-printer" @click="print">打印此页</UButton>
      </section>
    </article>
    <SiteFooter class="projection-footer" :copyright-text="site.loginCopyright" filing-only />
  </main>
</template>

<style scoped>
.projection {
  display: grid; place-items: center; align-content: center; gap: 12px; min-height: 100dvh; padding: clamp(16px, 3.4vw, 54px);
  background: #edf2fa;
}
.projection-footer { max-width: 100%; color: var(--muted); font-size: 13px; text-align: center; overflow-wrap: anywhere; }
.projection-board {
  display: grid; width: min(100%, 1200px); grid-template-columns: minmax(0, 1.15fr) minmax(0, .95fr);
  border: 1px solid #dce5f4; border-radius: 16px; overflow: hidden; background: #fff;
}
.projection-event, .projection-scan { min-width: 0; padding: clamp(23px, 3.4vw, 47px); }
.projection-event { display: grid; gap: 18px; align-content: center; background: #f6f9ff; }
.projection-brand { display: flex; align-items: center; gap: 8px; color: #1b3777; font-size: 20px; font-weight: 710; }
.projection-brand img { flex: none; object-fit: contain; }
.projection-event h1 { color: #162948; font-size: clamp(26px, 3.4vw, 47px); font-weight: 740; line-height: 1.18; overflow-wrap: anywhere; }
.projection-intro {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3;
  overflow: hidden; overflow-wrap: anywhere; color: #485a77; font-size: clamp(14px, 1.4vw, 17px);
}
.projection-cover { width: 100%; max-height: 270px; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 7px; background: #e9edf4; }
.projection-facts { display: grid; margin: 0; }
.projection-facts > div { display: grid; grid-template-columns: minmax(72px,.3fr) minmax(0,1fr); gap: 8px; padding-block: 9px; border-bottom: 1px solid #e3eaf7; }
.projection-facts dt { color: #58657d; }
.projection-facts dd { color: #223654; overflow-wrap: anywhere; }
.projection-scan { display: grid; align-content: center; justify-items: center; gap: 10px; text-align: center; border-left: 1px solid #e3eaf6; }
.projection-scan-title { display: flex; align-items: center; justify-content: center; gap: 8px 11px; flex-wrap: wrap; }
.projection-scan h2 { font-size: clamp(23px, 2.55vw, 36px); font-weight: 730; overflow-wrap: anywhere; }
.projection-state { padding: 4px 8px; font-size: 13px; color: #56637a; background: #edf2fb; border-radius: 6px; }
.projection-state[data-live='true'] { color: #176444; background: #eaf6ef; }
.projection-hours { color: #5b6881; font-size: 14px; font-variant-numeric: tabular-nums; }
.projection-code { width: min(100%, 440px); height: auto; aspect-ratio: 1; }
.projection-instruction { color: #1e3459; font-size: 16px; font-weight: 640; }
@media (max-width: 780px) {
  .projection-board { grid-template-columns: minmax(0,1fr); }
  .projection-scan { border-left: 0; border-top: 1px solid #e3eaf6; }
  .projection-event { gap: 13px; }
}
@media print {
  .projection, .projection-event { background: #fff; padding: 10px; min-height: 0; }
  .projection-board { grid-template-columns: minmax(0, 1fr); border: 0; }
  .projection-scan { padding: 10px; border: 0; break-inside: avoid; }
  .projection-code { max-width: 330px; }
}
</style>
