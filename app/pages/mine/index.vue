<script setup lang="ts">
import type { AttendeeActivityCard, AttendeeAuth } from '#shared/attendee-account'
import { brand } from '#shared/brand'
definePageMeta({ layout: false, pageTransition: false })
useSeoMeta({ title: '我的' })
const [{ data: session, error }, { data: activities }] = await Promise.all([
  useFetch<AttendeeAuth>('/api/account/session', { key: 'attendee-mine-session', cache: 'no-store' }),
  useFetch<AttendeeActivityCard[]>('/api/activities'),
])
const recentActivities = computed(() => activities.value?.slice(0, 2) || [])
const { data: site } = useSiteSettings()
</script>

<template>
  <NuxtLayout name="attendee" navigation hide-header>
    <section class="client-profile">
      <header class="profile-identity">
        <img class="profile-cover" :src="site?.loginImageUrl || fallbackSite.loginImageUrl" alt="" />
        <h1 class="sr-only">我的</h1>
        <NuxtLink v-if="!session?.account" :to="attendeeLogin('/mine')" class="profile-identity-row">
          <span class="profile-avatar"><img :src="brand.defaultAvatar" alt="" width="45" height="45" /></span>
          <span class="profile-identity-copy">
            <strong>登录 / 注册</strong>
            <small>查看你的报名和签到记录</small>
          </span>
          <UIcon name="i-lucide-chevron-right" class="profile-chevron" aria-hidden="true" />
        </NuxtLink>
        <NuxtLink v-else to="/mine/profile" class="profile-identity-row" aria-label="个人资料">
          <span class="profile-avatar">
            <img :src="session.account.avatarUrl || brand.defaultAvatar" alt="" width="45" height="45" />
          </span>
          <div class="profile-identity-copy">
            <h2>{{ session.account.displayName || '未设置用户名' }}</h2>
            <small>个人资料</small>
          </div>
          <UIcon name="i-lucide-chevron-right" class="profile-chevron" aria-hidden="true" />
        </NuxtLink>
      </header>

      <div class="profile-content">
        <p v-if="error" class="attendee-error" role="alert">{{ errorText(error) }}</p>
        <div class="profile-shortcuts">
          <NuxtLink to="/mine/registrations" class="profile-shortcut">
            <span class="profile-shortcut-icon"><UIcon name="i-lucide-ticket" aria-hidden="true" /></span>
            <strong>我的报名</strong>
          </NuxtLink>
          <NuxtLink to="/activities" class="profile-shortcut">
            <span class="profile-shortcut-icon"><UIcon name="i-lucide-calendar-days" aria-hidden="true" /></span>
            <strong>浏览活动</strong>
          </NuxtLink>
        </div>

        <section v-if="recentActivities.length" class="profile-recent" aria-labelledby="profile-recent-title">
          <h2 id="profile-recent-title">近期活动</h2>
          <AttendeeActivityList :items="recentActivities" />
        </section>
        <NuxtLink class="profile-link" to="/mine/recover">
          <UIcon name="i-lucide-search" aria-hidden="true" />
          <span>找回报名</span>
          <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
        </NuxtLink>
        <NuxtLink class="profile-link" to="/mine/check-in-help">
          <UIcon name="i-lucide-circle-help" aria-hidden="true" />
          <span>帮助中心</span>
          <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
        </NuxtLink>
        <NuxtLink class="profile-link" :to="session?.account ? '/mine/check-ins' : attendeeLogin('/mine/check-ins')">
          <UIcon name="i-lucide-scan-line" aria-hidden="true" />
          <span>待签到</span>
          <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
        </NuxtLink>

      </div>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.profile-identity { position: relative; isolation: isolate; padding-top: env(safe-area-inset-top, 0px); overflow: hidden; color: #fff; background: #132d58; }
.profile-identity::after { content: ''; position: absolute; z-index: -1; inset: 0; background: linear-gradient(90deg, #132d58 6%, #132d58ea 47%, #132d5866); }
.profile-cover { position: absolute; z-index: -2; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 75% 46%; }
.profile-identity-row { display: flex; align-items: center; gap: 12px; min-height: 142px; padding: 14px var(--attendee-form-gutter) 24px; }
.profile-identity-row:focus-visible { outline-offset: -4px; outline-color: white; }
.profile-avatar { display: grid; place-items: center; width: 45px; height: 45px; flex: none; border: 1px solid #cad9f593; border-radius: 50%; color: #fff; background: #b9d2fa2f; font-size: 22px; }
.profile-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
.profile-identity-copy { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.profile-identity-copy :is(strong,h2) { display: block; font-size: 19px; font-weight: 700; }
.profile-identity-copy small { display: block; margin-top: 4px; color: #e4ecfb; font-size: 13px; }
.profile-chevron { flex: none; font-size: 20px; }
.profile-content { position: relative; display: grid; gap: 12px; margin-top: -13px; padding: 0 var(--attendee-form-gutter) 20px; }
.profile-shortcuts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.profile-shortcuts, .profile-recent, .profile-link { border: 1px solid #e1e8f2; border-radius: 11px; background: #fff; }
.profile-shortcut { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 80px; padding: 9px; font-size: 14px; }
.profile-shortcut + .profile-shortcut::before { content: ''; position: absolute; inset: 16px auto 16px 0; width: 1px; background: #edf1f7; }
.profile-shortcut:hover, .profile-link:hover { color: #2356bf; }
.profile-shortcut-icon { display: grid; place-items: center; width: 32px; height: 32px; flex: none; border-radius: 8px; color: #2356bf; background: #eef4ff; font-size: 17px; }
.profile-recent { padding: 12px 13px 2px; }
.profile-recent h2 { font-size: 16px; font-weight: 700; }
.profile-link { display: flex; align-items: center; gap: 9px; min-height: 47px; padding: 0 13px; font-size: 14px; font-weight: 620; }
.profile-link > span:first-child { color: #2356bf; font-size: 17px; }
.profile-link > span:last-child { margin-inline-start: auto; color: var(--muted); }
.profile-support summary::-webkit-details-marker { display: none; }
.profile-support[open] summary > span:last-child { transform: rotate(180deg); }
.profile-help { margin: 0 13px 12px 39px; }
</style>
