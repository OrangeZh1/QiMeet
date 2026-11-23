<script setup lang="ts">
import type { AccountPendingCheckin } from '#shared/attendee-account'

definePageMeta({ layout: false, pageTransition: false })
useSeoMeta({ title: '待签到' })
const { data, error } = await useFetch<AccountPendingCheckin[]>('/api/account/pending-check-ins', {
  key: 'attendee-pending-checkins', cache: 'no-store',
})
if (attendeeErrorStatus(error.value) === 401) await navigateTo(attendeeLogin('/mine/check-ins'), { redirectCode: 302 })

const now = useState('attendee-pending-checkins-clock', () => Date.now())
const pending = computed(() => (data.value || []).filter(item => Date.parse(item.endsAt) > now.value))
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  now.value = Date.now()
  timer = setInterval(() => { now.value = Date.now() }, 15000)
})
onBeforeUnmount(() => clearInterval(timer))
const isOpen = (item: AccountPendingCheckin) => Date.parse(item.startsAt) <= now.value
</script>

<template>
  <NuxtLayout name="attendee" toolbar-title="待签到" :back="{ to: '/mine', label: '我的' }">
    <section class="client-section pending-checkins">
      <h1 class="sr-only">待签到</h1>
      <p v-if="error" class="attendee-error" role="alert">{{ errorText(error, '暂时无法读取待签到环节') }}</p>
      <ul v-else-if="pending.length" class="pending-list">
        <li v-for="item in pending" :key="item.checkpointId" class="pending-card">
          <NuxtLink :to="attendeePath(item.eventSlug)" class="attendee-inline-link">{{ item.eventTitle }}</NuxtLink>
          <div class="pending-heading">
            <h2>{{ item.checkpointTitle }}</h2>
            <span class="attendee-label" :class="{ done: isOpen(item) }">{{ isOpen(item) ? '签到中' : '待开始' }}</span>
          </div>
          <p class="attendee-helper">{{ attendeeDateRange(item.startsAt, item.endsAt) }}</p>
          <NuxtLink v-if="isOpen(item) && item.directEnabled" class="pending-action"
            :to="{ path: attendeePath(item.eventSlug) + '/check-in', query: { point: item.checkpointId } }">手机签到</NuxtLink>
          <p v-else-if="isOpen(item)" class="attendee-helper">到场后请扫描现场签到码。</p>
        </li>
      </ul>
      <div v-else class="pending-card pending-empty">
        <UIcon name="i-lucide-scan-line" aria-hidden="true" />
        <h2>暂无待签到环节</h2>
        <NuxtLink to="/mine/registrations" class="attendee-inline-link">查看我的报名</NuxtLink>
      </div>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.pending-checkins { max-width: 38rem; margin-inline: auto; }
.pending-list { display: grid; gap: 10px; list-style: none; padding: 0; }
.pending-card { display: grid; gap: 7px; padding: 14px; border: 1px solid #e1e8f2; border-radius: 10px; }
.pending-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.pending-card h2 { font-size: 16px; font-weight: 690; overflow-wrap: anywhere; }
.pending-action { display: flex; align-items: center; justify-content: center; justify-self: start; min-height: 42px; padding-inline: 14px; border-radius: 7px; background: #2356bf; color: #fff; font-size: 14px; font-weight: 620; }
.pending-empty { justify-items: center; padding-block: 24px; }
.pending-empty > span { color: #2356bf; font-size: 26px; }
</style>
