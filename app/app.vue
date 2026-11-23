<script setup lang="ts">
import type { SitePublic } from '#shared/site-settings'

const { data: publicSite } = await useFetch<SitePublic>('/api/site', {
  key: siteDataKey, cache: 'no-store', default: () => fallbackSite,
})

useHead(() => {
  const site = publicSite.value || fallbackSite
  const title = site.title || fallbackSite.title
  const favicon = site.faviconUrl || fallbackSite.faviconUrl
  return {
    titleTemplate: (pageTitle?: string | null) => pageTitle ? pageTitle + ' · ' + title : title,
    link: [{ rel: 'icon', href: favicon }],
  }
})
</script>

<template>
  <UApp :scroll-body="{ padding: 0, margin: 0 }" :toaster="{ position: 'top-right', duration: 3200, progress: false, max: 3 }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
