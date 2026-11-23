<script setup lang="ts">
import type { AccountRegistration, AttendeeActivityCard } from '#shared/attendee-account'
import AttendeeLoginPrompt from '~/components/AttendeeLoginPrompt.vue'
definePageMeta({ layout: false, pageTransition: false })
useSeoMeta({ title: '我的报名' })
const [{ data: items, error }, { data: activities, error: activitiesError }] = await Promise.all([
  useFetch<AccountRegistration[]>('/api/account/registrations', { key: 'attendee-account-registrations', cache: 'no-store' }),
  useFetch<AttendeeActivityCard[]>('/api/activities'),
])
const signedOut = computed(() => attendeeErrorStatus(error.value) === 401)
const recent = computed(() => activities.value?.slice(0, 2) || [])
const { search, filtered } = useAttendeeActivitySearch(items)
</script>

<template>
  <NuxtLayout name="attendee" navigation toolbar-title="我的报名">
    <section class="client-section">
      <h1 class="sr-only">我的报名</h1>
      <AttendeeLoginPrompt v-if="signedOut" next="/mine/registrations" message="登录后查看报名与签到记录。" />
      <p v-else-if="error" class="attendee-error" role="alert">{{ errorText(error, '暂时无法加载报名记录') }}</p>
      <template v-else-if="items?.length">
        <UInput v-model="search" type="search" icon="i-lucide-search" aria-label="搜索我的报名" placeholder="搜索活动名称或地点" />
        <AttendeeActivityList v-if="filtered.length" :items="filtered" />
        <p v-else class="attendee-helper">没有匹配的报名记录</p>
      </template>
      <div v-else class="registrations-empty">
        <span><UIcon name="i-lucide-ticket" aria-hidden="true" /></span>
        <h2>暂无报名记录</h2>
      </div>
      <section v-if="signedOut || (!error && !items?.length)" class="registration-activities" aria-labelledby="recent-activity-heading">
        <div class="registration-activities-header">
          <h2 id="recent-activity-heading">近期活动</h2>
          <NuxtLink class="registration-activities-link" to="/activities">
            浏览活动 <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
          </NuxtLink>
        </div>
        <AttendeeActivityList v-if="recent.length" :items="recent" />
        <p v-else-if="!activitiesError" class="attendee-helper">暂无公开活动</p>
      </section>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.registrations-empty { display: flex; align-items: center; gap: 10px; padding: 13px; border: 1px solid #e0e8f5; border-radius: 9px; }
.registrations-empty > span { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 8px; background: #e8f0ff; color: #2356bf; font-size: 18px; }
.registrations-empty h2, .registration-activities h2 { font-size: 16px; font-weight: 680; }
.registration-activities { min-width: 0; margin-top: 2px; padding: 2px 13px 0; border: 1px solid #e1e8f2; border-radius: 9px; }
.registration-activities-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.registration-activities-link { display: inline-flex; align-items: center; gap: 3px; min-height: 44px; color: #2356bf; font-size: 13px; font-weight: 650; white-space: nowrap; }
.registration-activities-link:hover { text-decoration: underline; }
.registration-activities > p { padding-bottom: 12px; }
.registration-activities :deep(.client-activity) { padding-block: 8px 12px; }
</style>
