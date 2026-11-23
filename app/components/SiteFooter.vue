<script setup lang="ts">
import { filingSystemUrl } from '#shared/site-settings'
const props = defineProps<{ copyrightText?: string, activitySlug?: string, clientLogin?: { next: string, register: boolean }, filingOnly?: boolean }>()
const { data } = useSiteSettings()
const site = computed(() => data.value || fallbackSite)
const hasLinks = computed(() => props.filingOnly ? Boolean(site.value.filingNumber) : hasSiteLinks(site.value) || Boolean(props.clientLogin))
const query = computed(() => {
  if (props.clientLogin) return { from: 'client-login', next: props.clientLogin.next, mode: props.clientLogin.register ? 'register' : undefined }
  return props.activitySlug ? { event: props.activitySlug } : {}
})
</script>

<template>
  <footer v-if="copyrightText?.trim() || hasLinks" class="site-footer">
    <p v-if="copyrightText?.trim()" class="site-footer-copyright">{{ copyrightText }}</p>
    <div v-if="hasLinks" class="site-footer-links">
      <a v-if="site.filingNumber" :href="filingSystemUrl" target="_blank" rel="noopener noreferrer">{{ site.filingNumber }}</a>
      <NuxtLink v-if="!filingOnly && (site.hasPrivacyPolicy || clientLogin)" :to="{ path: '/policies/privacy', query }">隐私政策</NuxtLink>
      <NuxtLink v-if="!filingOnly && (site.hasUserAgreement || clientLogin)" :to="{ path: '/policies/terms', query }">用户协议</NuxtLink>
    </div>
  </footer>
</template>

<style scoped>
.site-footer-copyright { margin: 0; white-space: pre-line; overflow-wrap: anywhere; }
.site-footer-links { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 3px 14px; padding: 0; }
.site-footer-copyright + .site-footer-links { margin-top: 4px; }
.site-footer-links a { color: inherit; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.site-footer-links a:hover { color: var(--jade); }
</style>
