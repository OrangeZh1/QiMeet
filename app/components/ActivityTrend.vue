<script setup lang="ts">
import type { OverviewDay } from '#shared/overview'

const props = defineProps<{ trend: OverviewDay[] }>()
const titleId = useId()
const number = new Intl.NumberFormat('zh-CN')
const max = computed(() => Math.max(3, Math.ceil(Math.max(0, ...props.trend.flatMap(day => [day.registrations, day.attendees])) / 3) * 3))
const labels = computed(() => [max.value, max.value * 2 / 3, max.value / 3, 0])
const height = (count: number) => count / max.value * 100 + '%'
</script>

<template>
  <section class="panel trend-panel" :aria-labelledby="titleId">
    <div class="panel-toolbar">
      <div>
        <h2 :id="titleId" class="section-title">报名与到场趋势</h2>
        <p class="help">最近 7 天 · 到场按首次签到日期统计</p>
      </div>
      <div class="chart-legend" aria-hidden="true">
        <span><i class="registration-dot" />报名</span>
        <span><i class="attendance-dot" />首次到场</span>
      </div>
    </div>
    <div class="chart">
      <div class="chart-axis" aria-hidden="true">
        <span v-for="label in labels" :key="label">{{ number.format(label) }}</span>
      </div>
      <ul class="chart-days" aria-label="每日数据">
        <li v-for="day in trend" :key="day.date" :title="day.date + ' · 报名 ' + day.registrations + ' · 到场 ' + day.attendees">
          <div class="chart-columns" aria-hidden="true">
            <i class="chart-registration" :style="{ height: height(day.registrations) }" />
            <i class="chart-attendance" :style="{ height: height(day.attendees) }" />
          </div>
          <time :datetime="day.date">{{ day.date.slice(5).replace('-', '/') }}</time>
          <span class="sr-only">，报名 {{ day.registrations }} 人，首次到场 {{ day.attendees }} 人</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.trend-panel { display: flex; min-width: 0; flex-direction: column; --trend-blue: var(--color-blue-700, #1d4ed8); --trend-aqua: #087b96; }
.chart-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; color: var(--muted); font-size: 14px; }
.chart-legend span { display: flex; gap: 5px; align-items: center; }
.chart-legend i { width: 9px; height: 9px; border-radius: 3px; }
.registration-dot, .chart-registration { background: var(--trend-blue); }
.attendance-dot, .chart-attendance { background: var(--trend-aqua); }
.chart { --plot-height: 148px; display: grid; flex: 1; min-height: calc(var(--plot-height) + 27px); grid-template-columns: max-content minmax(0, 1fr); gap: 8px; margin: 10px 16px 14px; }
.chart-axis { display: flex; flex-direction: column; justify-content: space-between; margin-bottom: 27px; color: var(--muted); text-align: right; font-size: 12px; line-height: 1; }
.chart-axis span:first-child { transform: translateY(-50%); }
.chart-axis span:last-child { transform: translateY(50%); }
.chart-days { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); }
.chart-days li { display: grid; min-width: 0; grid-template-rows: minmax(var(--plot-height), 1fr) 27px; text-align: center; }
.chart-days time { display: block; margin-top: 8px; font-size: 12px; color: var(--muted); white-space: nowrap; }
.chart-columns { display: flex; gap: clamp(2px,.45vw,6px); justify-content: center; align-items: flex-end; min-height: var(--plot-height); border-bottom: 1px solid var(--line); background: repeating-linear-gradient(to bottom,var(--line) 0 1px,transparent 1px calc(100% / 3)); }
.chart-columns i { width: min(23%,19px); min-width: 4px; border-radius: 4px 4px 0 0; }
</style>
