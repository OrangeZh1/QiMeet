<script setup lang="ts">
import type { AccountCheckinRecord } from '#shared/attendee-account'
import { attendeeCheckinSourceLabel, displayDate } from '#shared/models'

definePageMeta({ layout: false, pageTransition: false, key: route => route.path })
useSeoMeta({ title: '签到详情' })
const route = useRoute()
const { data: record, error } = await useFetch<AccountCheckinRecord>('/api/account/check-in-history', {
  query: { id: String(route.params.id) }, cache: 'no-store',
})
const status = attendeeErrorStatus(error.value)
if (status === 401) await navigateTo(attendeeLogin(route.fullPath), { redirectCode: 302 })
else setAttendeeErrorStatus(error.value)
</script>

<template>
  <NuxtLayout name="attendee" toolbar-title="签到详情" :back="{ to: '/mine/check-ins', label: '签到记录' }">
    <section class="client-section checkin-detail">
      <article v-if="record" class="attendee-card padded attendee-stack">
        <div class="checkin-detail-heading">
          <h1 class="attendee-heading">{{ record.checkpointTitle }}</h1>
          <span class="attendee-label done">已签到</span>
        </div>
        <dl class="attendee-answers">
          <div class="attendee-answer-row"><dt>活动</dt><dd>{{ record.eventTitle }}</dd></div>
          <div class="attendee-answer-row"><dt>签到时间</dt><dd><time :datetime="record.checkedAt">{{ displayDate(record.checkedAt) }}</time></dd></div>
          <div class="attendee-answer-row"><dt>签到方式</dt><dd>{{ attendeeCheckinSourceLabel(record.source) }}</dd></div>
        </dl>
      </article>
      <p v-else class="attendee-error" role="alert">{{ status === 404 ? '找不到签到记录。' : '暂时无法读取签到记录，请稍后重试。' }}</p>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.checkin-detail { max-width: 38rem; margin-inline: auto; }
.checkin-detail-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
</style>
