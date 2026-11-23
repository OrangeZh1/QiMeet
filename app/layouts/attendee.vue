<script setup lang="ts">
const props = defineProps<{
  eventPage?: boolean, toolbarTitle?: string, backToEvent?: boolean, navigation?: boolean, hideHeader?: boolean, dockCopyright?: boolean,
  back?: { to: string, label: string },
}>()
const { data: settings } = useSiteSettings()
const site = computed(() => settings.value || fallbackSite)
const footerCopyright = computed(() => site.value.loginCopyright)
const hasFooter = computed(() => Boolean(footerCopyright.value || site.value.filingNumber))
const hasCopyrightDock = computed(() => props.dockCopyright && Boolean(footerCopyright.value || site.value.filingNumber))
useHead({ htmlAttrs: { class: 'qm-attendee-page' } })
const route = useRoute()
const slug = computed(() => String(route.params.slug || ''))
const path = computed(() => slug.value ? attendeePath(slug.value) : '/activities')
const onRecord = computed(() => route.path === path.value + '/record')
const navigationItems = [
  { to: '/activities', label: '活动', icon: 'i-lucide-calendar-days' },
  { to: '/mine/registrations', label: '我的报名', icon: 'i-lucide-ticket' },
  { to: '/mine', label: '我的', icon: 'i-lucide-user-round' },
]
const activeItem = computed(() => {
  if (route.path === '/mine/registrations' || onRecord.value) return '/mine/registrations'
  if (route.path === '/mine' || route.path.startsWith('/mine/') || route.path === '/login') return '/mine'
  return '/activities'
})
</script>

<template>
  <div class="attendee-shell" :class="{
    'attendee-shell--event': eventPage, 'attendee-shell--form': !eventPage && (!!toolbarTitle || navigation),
    'attendee-shell--has-footer': hasFooter, 'attendee-shell--navigation': navigation,
    'attendee-shell--copyright-docked': hasCopyrightDock,
  }">
    <header v-if="!hideHeader" class="attendee-top">
      <div class="attendee-top-inner">
        <NuxtLink v-if="back" :to="back.to" class="page-back-icon attendee-top-back" :aria-label="'返回' + back.label">
          <UIcon name="i-lucide-chevron-left" aria-hidden="true" />
        </NuxtLink>
        <NuxtLink v-else-if="eventPage" to="/activities" class="page-back-icon attendee-top-back" aria-label="返回活动首页">
          <UIcon name="i-lucide-chevron-left" aria-hidden="true" />
        </NuxtLink>
        <NuxtLink v-else-if="backToEvent" :to="path" class="page-back-icon attendee-top-back" aria-label="返回活动详情">
          <UIcon name="i-lucide-chevron-left" aria-hidden="true" />
        </NuxtLink>
        <NuxtLink v-else :to="path" class="attendee-logo" :aria-label="site.title + (slug ? ' 活动详情' : ' 活动')">
          <img :src="site.logoUrl || fallbackSite.logoUrl" width="28" height="28" alt="" />
          <span>{{ site.title }}</span>
        </NuxtLink>
        <span v-if="eventPage || toolbarTitle" class="event-toolbar-title">{{ toolbarTitle || '活动详情' }}</span>
        <NuxtLink v-if="slug && !onRecord && !eventPage" :to="path + '/record'" class="attendee-top-link">
          <UIcon name="i-lucide-ticket" aria-hidden="true" />
          我的报名
        </NuxtLink>
        <NuxtLink v-else-if="onRecord" :to="path" class="attendee-top-link">
          <UIcon name="i-lucide-calendar-days" aria-hidden="true" />
          活动详情
        </NuxtLink>
      </div>
    </header>
    <main id="attendee-main" class="attendee-main">
      <slot />
    </main>
    <SiteFooter v-if="hasCopyrightDock" class="attendee-docked-copyright" :copyright-text="footerCopyright" filing-only />
    <SiteFooter v-else-if="hasFooter && !dockCopyright" class="attendee-footer" :copyright-text="footerCopyright" filing-only />
    <nav v-if="navigation" class="client-navigation" aria-label="客户端导航">
      <div>
        <NuxtLink v-for="item in navigationItems" :key="item.to" :to="item.to"
          :aria-current="activeItem === item.to ? 'page' : undefined">
          <UIcon :name="item.icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>

<style src="~/assets/css/attendee.css"></style>
<style src="~/assets/css/attendee-form.css"></style>
