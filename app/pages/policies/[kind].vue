<script setup lang="ts">
import type { SitePolicy } from '#shared/site-settings'
import { attendeeReturn } from '#shared/attendee-account'
import RichMarkdown from '~/components/RichMarkdown.vue'

definePageMeta({ key: route => route.path })
const route = useRoute()
const kind = route.params.kind === 'privacy' || route.params.kind === 'terms' ? route.params.kind : undefined
const activitySlug = computed(() => {
  const event = route.query.event
  return typeof event === 'string' && event.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event) ? event : undefined
})
const clientLogin = computed(() => route.query.from === 'client-login'
  ? { next: attendeeReturn(route.query.next), register: route.query.mode === 'register' } : undefined)
const returnPath = computed(() => {
  if (clientLogin.value) return {
    path: '/login',
    query: { next: clientLogin.value.next, mode: clientLogin.value.register ? 'register' : undefined },
  }
  return activitySlug.value ? attendeePath(activitySlug.value) : '/admin/login'
})

const { data: settings } = useSiteSettings()
const site = computed(() => settings.value || fallbackSite)
const fallbackTitle = kind === 'privacy' ? '隐私政策' : kind === 'terms' ? '用户协议' : '站点协议'
const { data: result, error } = await useAsyncData('site-policy:' + (kind || 'unknown'), async () => {
  if (!kind) return { policy: null }
  const policy = await $fetch<SitePolicy>('/api/site/policy', { query: { kind }, cache: 'no-store' })
  return { policy }
})
const policy = computed(() => result.value?.policy)
const unavailable = computed(() => !error.value || attendeeErrorStatus(error.value) === 404)
useSeoMeta({ title: () => policy.value?.title || fallbackTitle })
if (import.meta.server) useResponseHeader('cache-control').value = 'no-store'
if (!kind) setAttendeeErrorStatus({ statusCode: 404 })
else setAttendeeErrorStatus(error.value)
</script>

<template>
  <main class="policy-screen">
    <header class="policy-header">
      <NuxtLink :to="returnPath" class="page-back-icon"
        :aria-label="clientLogin?.register ? '返回注册' : activitySlug ? '返回活动' : '返回登录'">
        <UIcon name="i-lucide-chevron-left" aria-hidden="true" />
      </NuxtLink>
      <div class="policy-brand">
        <img :src="site.logoUrl || fallbackSite.logoUrl" alt="" width="28" height="28" />
        <span>{{ site.title }}</span>
      </div>
    </header>
    <article class="policy-body">
      <h1 class="page-title">{{ policy?.title || fallbackTitle }}</h1>
      <RichMarkdown v-if="policy" :source="policy.source" />
      <p v-else class="policy-note">{{ unavailable ? '暂未发布此内容。' : '页面暂不可用，请稍后再试。' }}</p>
    </article>
    <SiteFooter class="policy-footer" :activity-slug="activitySlug" :client-login="clientLogin" />
  </main>
</template>

<style scoped>
.policy-screen { min-height: 100svh; padding: 18px var(--qm-attendee-page-gutter) 30px; width: min(100%, 780px); margin-inline: auto; }
.policy-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding-bottom: 15px; }
.policy-brand { display: flex; align-items: center; gap: 7px; min-width: 0; color: #192e60; font-weight: 720; }
.policy-brand img { width: 28px; height: 28px; object-fit: contain; flex: none; }
.policy-brand span { overflow-wrap: anywhere; }
.policy-body { padding: clamp(20px, 4vw, 34px); background: #fff; border: 1px solid var(--line); border-radius: 14px; overflow-wrap: anywhere; }
.policy-body > .page-title { margin-bottom: 17px; }
.policy-note { color: var(--muted); }
.policy-footer { margin-top: 16px; color: var(--muted); font-size: 13px; }
</style>
