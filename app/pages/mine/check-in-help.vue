<script setup lang="ts">
import RichMarkdown from '~/components/RichMarkdown.vue'
import type { HelpContent } from '#shared/help'

definePageMeta({ layout: false, pageTransition: false })
useSeoMeta({ title: '帮助中心' })
const { data, error } = await useFetch<HelpContent>('/api/site/check-in-help', {
  key: 'check-in-help', cache: 'no-store',
})
</script>

<template>
  <NuxtLayout name="attendee" toolbar-title="帮助中心" :back="{ to: '/mine', label: '我的' }">
    <article class="client-section check-in-help">
      <h1 class="sr-only">帮助中心</h1>
      <p v-if="error" class="attendee-error" role="alert">{{ errorText(error, '暂时无法读取签到帮助') }}</p>
      <template v-else-if="data && (data.intro || data.items.length)">
        <RichMarkdown v-if="data.intro" :source="data.intro" />
        <div v-if="data.items.length" class="help-questions">
          <details v-for="item in data.items" :key="item.id" class="help-question">
            <summary>{{ item.question }} <UIcon name="i-lucide-chevron-down" aria-hidden="true" /></summary>
            <RichMarkdown class="help-answer" :source="item.answer" />
          </details>
        </div>
      </template>
      <p v-else class="attendee-helper">暂无帮助内容</p>
    </article>
  </NuxtLayout>
</template>

<style scoped>
.check-in-help { max-width: 38rem; margin-inline: auto; }
.help-questions { display: grid; gap: 10px; }
.help-question { min-width: 0; border-radius: 11px; background: #f4f7fc; }
.help-question summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 15px; min-height: 48px; cursor: pointer; list-style: none; font-size: 15px; font-weight: 660; overflow-wrap: anywhere; }
.help-question summary::-webkit-details-marker { display: none; }
.help-question summary > span { flex: none; color: #4265a2; }
.help-question[open] summary > span { transform: rotate(180deg); }
.help-answer { padding: 0 15px 15px; color: var(--muted); font-size: 14px; }
</style>
