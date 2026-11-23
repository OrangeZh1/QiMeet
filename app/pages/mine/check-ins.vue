<script setup lang="ts">
import type { AccountCheckinRecord } from '#shared/attendee-account'
import { attendeeCheckinSourceLabel, displayDate } from '#shared/models'

definePageMeta({ layout: false, pageTransition: false })
useSeoMeta({ title: '签到记录' })
const { data: history, error } = await useFetch<AccountCheckinRecord[]>('/api/account/check-in-history', {
  key: 'attendee-checkin-history', cache: 'no-store',
})
if (attendeeErrorStatus(error.value) === 401) await navigateTo(attendeeLogin('/mine/check-ins'), { redirectCode: 302 })
</script>

<template>
  <NuxtLayout name="attendee" toolbar-title="签到记录" :back="{ to: '/mine', label: '我的' }">
    <section class="client-section checkin-history">
      <h1 class="sr-only">签到记录</h1>
      <p v-if="error" class="attendee-error" role="alert">暂时无法读取签到记录，请稍后重试。</p>
      <ul v-else-if="history?.length" class="checkin-history-list">
        <li v-for="item in history" :key="item.checkpointId">
          <NuxtLink :to="'/mine/check-in-record/' + item.checkpointId" class="checkin-history-card checkin-history-link">
            <span class="attendee-inline-link">{{ item.eventTitle }}</span>
            <div class="checkin-history-heading">
              <h2>{{ item.checkpointTitle }}</h2>
              <span class="attendee-label done">已签到</span>
            </div>
            <p class="attendee-helper"><time :datetime="item.checkedAt">{{ displayDate(item.checkedAt) }}</time> · {{ attendeeCheckinSourceLabel(item.source) }}</p>
          </NuxtLink>
        </li>
      </ul>
      <div v-else class="checkin-history-card checkin-history-empty">
        <UIcon name="i-lucide-list-checks" aria-hidden="true" />
        <h2>暂无签到记录</h2>
      </div>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.checkin-history { max-width: 38rem; margin-inline: auto; }
.checkin-history-list { display: grid; gap: 10px; list-style: none; padding: 0; }
.checkin-history-card { display: grid; gap: 6px; padding: 14px; border: 1px solid #e1e8f2; border-radius: 10px; }
.checkin-history-link:hover { border-color: #a9bee4; background: #f8fbff; }
.checkin-history-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 7px; }
.checkin-history-card h2 { font-size: 16px; font-weight: 690; overflow-wrap: anywhere; }
.checkin-history-empty { justify-items: center; padding-block: 24px; }
.checkin-history-empty > span { color: #2356bf; font-size: 26px; }
</style>
