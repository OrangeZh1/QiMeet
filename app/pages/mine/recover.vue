<script setup lang="ts">
import type { AttendeeActivityCard } from '#shared/attendee-account'

definePageMeta({ layout: false, pageTransition: false })
useSeoMeta({ title: '找回报名' })
const { data: items, error } = await useFetch<AttendeeActivityCard[]>('/api/activities')
const { search, query, filtered } = useAttendeeActivitySearch(items)
</script>

<template>
  <NuxtLayout name="attendee" toolbar-title="找回报名" :back="{ to: '/mine', label: '我的' }">
    <section class="client-section">
      <h1 class="attendee-heading">选择要找回报名的活动</h1>
      <UInput v-model="search" type="search" icon="i-lucide-search" aria-label="搜索活动" placeholder="搜索活动名称或地点" />
      <p v-if="error" class="attendee-error" role="alert">{{ errorText(error, '暂时无法加载活动') }}</p>
      <AttendeeActivityList v-else-if="filtered.length" :items="filtered" recover />
      <p v-else class="attendee-helper">{{ query ? '没有匹配的活动' : '暂无可选活动' }}</p>
    </section>
  </NuxtLayout>
</template>
