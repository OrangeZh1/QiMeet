<script setup lang="ts">
import type { ActivityStats } from '#shared/overview'
import { displayDate, type Conference } from '#shared/models'

const props = defineProps<{ conference: Conference }>()
const request = useRequestFetch()
const id = props.conference.id
const { data, error, refresh } = await useAsyncData('event-analytics-' + id, () =>
  request<ActivityStats>('/api/manage/activity-stats', { query: { eventId: id } }),
)
const number = new Intl.NumberFormat('zh-CN')
const rate = (attended: number, registered: number) => registered ? Math.round(attended / registered * 100) + '%' : '—'
const checkpointLabels = { pending: '未开放', open: '签到中', closed: '已关闭' }
function displayCheckpointStatus(status: ActivityStats['checkpoints'][number]['status']) {
  if (props.conference.endedAt) return 'closed'
  return !props.conference.published && status === 'open' ? 'pending' : status
}

const metrics = computed(() => {
  const stats = data.value
  if (!stats) return []
  const today = stats.trend.at(-1)
  return [
    { title: '报名人数', value: number.format(stats.registrations),
      note: '今日新增 ' + number.format(today?.registrations ?? 0) + (props.conference.published && stats.registrationOpen ? ' · 报名中' : ''),
      icon: 'i-lucide-users-round' },
    { title: '到场人数', value: number.format(stats.attendees), note: '今日首次到场 ' + number.format(today?.attendees ?? 0), icon: 'i-lucide-scan-line' },
    { title: '尚未到场', value: number.format(stats.registrations - stats.attendees), note: '已报名且暂无签到记录', icon: 'i-lucide-hourglass' },
    { title: '到场率', value: rate(stats.attendees, stats.registrations), note: '每人仅计一次到场', icon: 'i-lucide-chart-pie' },
  ]
})

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => { if (!document.hidden) void refresh({ dedupe: 'defer' }) }, 45000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <p v-if="error" class="feedback error" role="alert">暂时无法加载本场数据。</p>
  <div v-else-if="data" class="page-stack">
    <section class="metric-grid" aria-label="本场活动统计">
      <article v-for="item in metrics" :key="item.title" class="metric-card event-metric">
        <span class="metric-icon event-data-icon"><UIcon :name="item.icon" /></span>
        <span class="metric-label">{{ item.title }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.note }}</small>
      </article>
    </section>
    <div class="event-data-grid">
      <ActivityTrend :trend="data.trend" />
      <CheckinSourceBreakdown :sources="data.sources" />
    </div>
    <div class="event-data-grid">
      <section class="panel" aria-labelledby="event-checkpoint-stats">
        <div class="panel-toolbar">
          <h2 id="event-checkpoint-stats" class="section-title">各环节签到</h2>
        </div>
        <ul v-if="data.checkpoints.length" class="data-rows">
          <li v-for="point in data.checkpoints" :key="point.id">
            <div>
              <span class="checkpoint-summary"><strong>{{ point.title }}</strong><span class="state-pill" :class="{ live: displayCheckpointStatus(point.status) === 'open' }">{{ checkpointLabels[displayCheckpointStatus(point.status)] }}</span></span>
              <small>{{ displayDate(point.startsAt) }} ～ {{ displayDate(point.endsAt) }}</small>
            </div>
            <div class="data-count"><strong>{{ number.format(point.attended) }} 人</strong><small>{{ rate(point.attended, data.registrations) }}</small></div>
          </li>
        </ul>
        <p v-else class="panel-message help">还没有设置签到环节。</p>
      </section>
      <section class="panel" aria-labelledby="event-version-stats">
        <div class="panel-toolbar">
          <h2 id="event-version-stats" class="section-title">表单版本报名</h2>
        </div>
        <ul v-if="data.versions.length" class="data-rows">
          <li v-for="version in data.versions" :key="version.id">
            <span>V{{ version.version }}</span><strong>{{ number.format(version.registrations) }} 人</strong>
          </li>
        </ul>
        <p v-else class="panel-message help">还没有报名表版本。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.event-metric small { grid-column: 1 / -1; color: var(--muted); font-size: 13px; }
.event-data-icon { color: var(--color-blue-700,#1d4ed8); background: var(--color-blue-50,#eff6ff); }
.event-data-grid { display: grid; grid-template-columns: minmax(0,1.7fr) minmax(270px,1fr); gap: 18px; align-items: stretch; }
.data-rows li { padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid var(--line); }
.data-rows strong { font-weight: 650; }
.checkpoint-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.data-rows small { display: block; color: var(--muted); font-size: 13px; }
.data-count { text-align: right; flex: none; font-variant-numeric: tabular-nums; }
@media (max-width: 880px) { .event-data-grid { grid-template-columns: minmax(0,1fr); } }
</style>
