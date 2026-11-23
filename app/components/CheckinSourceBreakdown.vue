<script setup lang="ts">
import { checkinSourceLabels } from '#shared/models'
import type { SignInSourceCount } from '#shared/overview'

const props = defineProps<{ sources: SignInSourceCount[] }>()
const titleId = useId()
const number = new Intl.NumberFormat('zh-CN')
const counts = computed(() => Object.entries(checkinSourceLabels).map(([source, label]) => ({
  label, total: props.sources.find(item => item.source === source)?.total ?? 0,
})))
const total = computed(() => counts.value.reduce((sum, item) => sum + item.total, 0))
</script>

<template>
  <section class="panel" :aria-labelledby="titleId">
    <div class="panel-toolbar">
      <div><h2 :id="titleId" class="section-title">签到方式</h2><p class="help">按签到环节记录统计</p></div>
      <span class="help">共 {{ number.format(total) }} 条</span>
    </div>
    <dl class="source-breakdown">
      <div v-for="item in counts" :key="item.label">
        <dt>{{ item.label }}</dt>
        <dd>
          <progress :value="item.total" :max="Math.max(total, 1)" :aria-label="item.label + '占比'" />
          <span>{{ number.format(item.total) }}</span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.source-breakdown { display: grid; gap: 11px; padding: 0 20px 19px; }
.source-breakdown > div { display: grid; grid-template-columns: 5rem minmax(0,1fr); align-items: center; gap: 12px; font-size: 14px; }
.source-breakdown dd { display: flex; align-items: center; gap: 10px; }
.source-breakdown progress { appearance: none; width: 100%; height: 6px; border: 0; border-radius: 999px; color: var(--color-blue-700,#1d4ed8); background: #edf1f7; }
.source-breakdown progress::-webkit-progress-bar { background: #edf1f7; border-radius: 999px; }
.source-breakdown progress::-webkit-progress-value { background: currentColor; border-radius: 999px; }
.source-breakdown progress::-moz-progress-bar { background: currentColor; border-radius: 999px; }
.source-breakdown dd span { min-width: 3ch; text-align: right; font-variant-numeric: tabular-nums; }
</style>
