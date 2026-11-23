<script setup lang="ts">
import ConsolePageHeading from '#qiandao-console/ConsolePageHeading.vue'
import { displayDate } from '#shared/models'
import type { Overview, OverviewEvent, OverviewReminder } from '#shared/overview'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '概览' })

const request = useRequestFetch()
const { data, error, refresh } = await useAsyncData('operations-overview', () => request<Overview>('/api/manage/overview'))
const number = new Intl.NumberFormat('zh-CN')
const formatRate = (attended: number, registered: number) => registered ? Math.round(attended / registered * 100) + '%' : '—'
const recentStatus = (item: OverviewEvent) => {
  if (item.endedAt) return '已结束'
  if (item.registrationClosedAt) return '报名已截止'
  return item.published ? '已发布' : '草稿'
}
const stats = computed(() => data.value?.stats)
const trendHasData = computed(() => data.value?.trend.some(day => day.registrations || day.attendees) ?? false)

const metrics = computed(() => {
  const value = stats.value
  if (!value) return []
  return [
    { label: '活动总数', value: number.format(value.events), icon: 'i-lucide-calendar-days', detail: number.format(value.published) + ' 场已发布' },
    { label: '累计报名', value: number.format(value.registrations), icon: 'i-lucide-users-round', detail: '今日新增 ' + number.format(data.value?.trend.at(-1)?.registrations ?? 0) },
    { label: '累计到场', value: number.format(value.attendees), icon: 'i-lucide-scan-line', detail: '今日首次到场 ' + number.format(data.value?.trend.at(-1)?.attendees ?? 0) },
    { label: '整体到场率', value: formatRate(value.attendees, value.registrations), icon: 'i-lucide-chart-pie', detail: '按场次合计，场内重复签到仅计一次' },
  ]
})
const stageLabels = {
  registering: '报名中', scheduled: '待开始', underway: '进行中', ended: '已结束', draft: '草稿',
}
const stages = computed(() => Object.entries(stageLabels).map(([stage, label]) => ({
  label, total: data.value?.stages.find(item => item.stage === stage)?.total ?? 0,
})))
const reminders = {
  checkpoint: { label: '签到进行中', icon: 'i-lucide-scan-line', tab: '?tab=checkpoints' },
  registration: { label: '报名即将截止', icon: 'i-lucide-clock-3', tab: '?tab=roster' },
  'registration-open': { label: '报名进行中', icon: 'i-lucide-clipboard-list', tab: '?tab=roster' },
  draft: { label: '临近开始，尚未发布', icon: 'i-lucide-calendar-clock', tab: '' },
}

const reminderGroups = computed(() => {
  const groups = new Map<number, { eventId: number, title: string, tasks: OverviewReminder[] }>()
  for (const item of data.value?.reminders ?? []) {
    const group = groups.get(item.eventId)
    if (group) group.tasks.push(item)
    else groups.set(item.eventId, { eventId: item.eventId, title: item.title, tasks: [item] })
  }
  return [...groups.values()]
})
const taskUrl = (item: OverviewReminder) => '/admin/events/' + item.eventId +
  reminders[item.kind].tab + (item.checkpointId ? '#checkpoint-' + item.checkpointId : '')

let polling: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  polling = setInterval(() => {
    if (!document.hidden) void refresh({ dedupe: 'defer' })
  }, 45000)
})
onBeforeUnmount(() => clearInterval(polling))
</script>

<template>
  <div class="page-stack operations">
    <div class="page-heading-row">
      <ConsolePageHeading title="概览" description="查看活动运营数据和近期会务安排。" />
    </div>
    <p v-if="error" class="feedback error" role="alert">暂时无法加载运营数据。</p>
    <template v-else-if="data">
      <section class="metric-grid" aria-label="运营统计">
        <article v-for="item in metrics" :key="item.label" class="metric-card ops-metric">
          <span class="metric-icon ops-icon"><UIcon :name="item.icon" /></span>
          <span class="metric-label">{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.detail }}</small>
        </article>
      </section>

      <div class="overview-grid">
        <ActivityTrend :trend="data.trend" class="overview-trend" :class="{ 'trend-without-data': !trendHasData }" />
        <section class="panel reminders-panel" aria-labelledby="reminders-title">
          <div class="panel-toolbar">
            <div><h2 id="reminders-title" class="section-title">会务提醒</h2>
            <p class="help">{{ data.stats.openRegistrations }} 场活动开放报名 · {{ data.stats.openCheckpoints }} 个环节开放签到</p></div>
          </div>
          <ul v-if="reminderGroups.length" class="reminders">
            <li v-for="group in reminderGroups" :key="group.eventId" class="reminder-group">
              <h3><NuxtLink :to="'/admin/events/' + group.eventId">{{ group.title }}</NuxtLink></h3>
              <ul class="reminder-tasks">
                <li v-for="task in group.tasks" :key="task.kind + ':' + (task.checkpointId ?? 'event')">
                  <NuxtLink :to="taskUrl(task)" class="reminder-link">
                    <span class="reminder-icon"><UIcon :name="reminders[task.kind].icon" /></span>
                    <span class="reminder-text">
                      <strong>{{ task.checkpoint || reminders[task.kind].label }}</strong>
                      <small v-if="task.checkpoint">{{ reminders[task.kind].label }}</small>
                    </span>
                    <time :datetime="task.dueAt">{{ displayDate(task.dueAt) }} {{ task.kind === 'draft' ? '开始' : '截止' }}</time>
                  </NuxtLink>
                </li>
              </ul>
            </li>
          </ul>
          <div v-else class="empty-state ops-empty">
            <UIcon name="i-lucide-list-checks" />
            <strong>暂无待处理事项</strong>
            <p>报名或签到开放后，会在这里显示。</p>
          </div>
        </section>
        <section class="panel stages-panel" aria-labelledby="stages-title">
          <div class="panel-toolbar"><h2 id="stages-title" class="section-title">活动阶段分布</h2><span class="help">共 {{ data.stats.events }} 场</span></div>
          <dl class="stage-grid">
            <div v-for="item in stages" :key="item.label">
              <dt>{{ item.label }}</dt><dd>{{ number.format(item.total) }}</dd>
            </div>
          </dl>
        </section>
        <CheckinSourceBreakdown :sources="data.sources" class="overview-sources" />
      </div>

      <section class="panel" aria-labelledby="performance-title">
        <div class="panel-toolbar">
          <h2 id="performance-title" class="section-title">近期活动表现</h2>
          <UButton to="/admin/events" color="neutral" variant="outline">全部活动</UButton>
        </div>
        <div v-if="data.events.length" class="table-scroll" tabindex="0" aria-label="活动成效数据">
          <table class="activity-table ops-table">
            <thead><tr><th scope="col">活动</th><th scope="col">状态</th><th scope="col">报名</th><th scope="col">到场</th><th scope="col">到场率</th></tr></thead>
            <tbody>
              <tr v-for="item in data.events" :key="item.id">
                <td class="ops-event">
                  <NuxtLink :to="'/admin/events/' + item.id">{{ item.title }}</NuxtLink>
                  <time :datetime="item.startsAt">{{ displayDate(item.startsAt) }}</time>
                </td>
                <td><span class="state-pill" :class="{ live: item.published && !item.endedAt && !item.registrationClosedAt }">{{ recentStatus(item) }}</span></td>
                <td>{{ number.format(item.registered) }}</td><td>{{ number.format(item.attended) }}</td>
                <td>
                  <span class="event-rate">
                    <progress v-if="item.registered" :value="item.attended" :max="item.registered" :aria-label="item.title + '到场率'" />
                    <span>{{ formatRate(item.attended, item.registered) }}</span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-state ops-empty">
          <UIcon name="i-lucide-calendar-days" />
          <strong>还没有活动</strong>
          <p>创建活动并开始报名后，即可查看各场活动的报名和到场数据。</p>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.operations {
  container: ops-overview / inline-size;
  --ops-blue: var(--color-blue-700, #1d4ed8);
  --ops-light: var(--color-blue-50, #eff6ff);
}
.ops-metric { grid-template-rows: auto auto 1fr; }
.ops-metric small { grid-column: 1 / -1; color: var(--muted); font-size: 13px; }
.ops-icon, .reminder-icon { color: var(--ops-blue); background: var(--ops-light); }
.overview-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 18px; align-items: stretch; }
.trend-without-data :deep(.chart) { --plot-height: 66px; }
.stages-panel { display: grid; grid-template-rows: auto 1fr; }
.stage-grid { align-self: center; display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 8px; padding: 0 20px 17px; }
.stage-grid > div { padding: 8px 4px; border-radius: 8px; text-align: center; background: var(--ops-light); }
.stage-grid dt { color: var(--muted); font-size: 13px; }
.stage-grid dd { font-weight: 700; font-variant-numeric: tabular-nums; }
.reminders-panel { overflow: hidden; }
.reminder-group { padding: 11px 13px; border-top: 1px solid var(--line); }
.reminder-group h3 { padding: 0 7px 4px; font-size: 15px; font-weight: 680; overflow-wrap: anywhere; }
.reminder-group h3 a:hover { color: var(--ops-blue); text-decoration: underline; }
.reminder-tasks { display: grid; gap: 2px; }
.reminder-link { display: grid; grid-template-columns: auto minmax(0,1fr) minmax(0,auto); align-items: center; gap: 7px; padding: 6px 7px; border-radius: 7px; }
.reminder-link:hover, .reminder-link:focus-visible { background: var(--ops-light); }
.reminder-link:focus-visible { outline-offset: -2px; }
.reminder-icon { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; font-size: 14px; }
.reminder-text { min-width: 0; display: grid; gap: 1px; }
.reminder-text strong { overflow-wrap: anywhere; font-size: 13px; font-weight: 620; }
.reminder-text small, .reminder-link time, .ops-event time { color: var(--muted); font-size: 12px; }
.reminder-link time { text-align: right; white-space: normal; font-variant-numeric: tabular-nums; }
.ops-empty { gap: 7px; padding: 27px 16px; }
.ops-empty p { font-size: 14px; }
.ops-table { min-width: 575px; font-variant-numeric: tabular-nums; }
.ops-event a { font-size: 15px; font-weight: 650; }
.ops-event a:hover { text-decoration: underline; }
.ops-event time { display: block; margin-top: 2px; }
.event-rate { display: inline-flex; align-items: center; gap: 8px; }
.event-rate progress { width: 66px; height: 5px; accent-color: var(--ops-blue); }
@container ops-overview (min-width: 720px) {
  .overview-grid {
    grid-template-columns: minmax(0,1.7fr) minmax(275px,1fr);
    grid-template-areas: 'trend reminders' 'stages sources';
  }
  .overview-trend { grid-area: trend; }
  .reminders-panel { grid-area: reminders; }
  .stages-panel { grid-area: stages; }
  .overview-sources { grid-area: sources; }
}
@container ops-overview (max-width: 400px) {
  .stage-grid { gap: 4px; padding-inline: 12px; }
}
</style>
