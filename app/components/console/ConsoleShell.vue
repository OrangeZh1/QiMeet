<script setup lang="ts">
import ConsoleSidebarRail from './ConsoleSidebarRail.vue'

type SidebarOptions = Record<string, unknown> & { ui?: Record<string, unknown> }

withDefaults(defineProps<{
  storageKey: string
  managedSidebar?: boolean
  showSidebarTheme?: boolean
  brandName?: string
  brandCaption?: string
  brandBadge?: string
  brandLogoDarkSrc?: string
  brandLogoSrc?: string
  brandTo?: string
  navigationLabel?: string
  userName?: string
  userDescription?: string
  userAvatarUrl?: string | null
  userInitial?: string
  withPanel?: boolean
  sidebar?: SidebarOptions
  sidebarClass?: string
  panelClass?: string
  stageClass?: string
}>(), {
  managedSidebar: false,
  showSidebarTheme: true,
  brandName: '',
  brandCaption: '',
  brandBadge: '',
  brandLogoSrc: '/brand-icon.png',
  brandTo: '',
  navigationLabel: '主导航',
  userName: '',
  userDescription: '',
  userAvatarUrl: null,
  userInitial: '',
  withPanel: true,
  sidebar: () => ({}),
  sidebarClass: 'console-dashboard-sidebar',
  panelClass: 'console-dashboard-panel',
  stageClass: 'console-page-stage w-full p-4 sm:p-6 lg:px-8 lg:pb-8 lg:pt-10',
})

const emit = defineEmits<{ logout: [] }>()
</script>

<template>
  <UDashboardGroup :storage-key="storageKey" class="qisvc-console-shell console-dashboard-group bg-default text-default">
    <ConsoleSidebarRail
      :managed="managedSidebar"
      :show-sidebar-theme="showSidebarTheme"
      :brand-name="brandName"
      :brand-caption="brandCaption"
      :brand-badge="brandBadge"
      :brand-logo-src="brandLogoSrc"
      :brand-logo-dark-src="brandLogoDarkSrc"
      :brand-to="brandTo"
      :navigation-label="navigationLabel"
      :user-name="userName"
      :user-description="userDescription"
      :user-avatar-url="userAvatarUrl"
      :user-initial="userInitial"
      :sidebar="sidebar"
      :sidebar-class="sidebarClass"
      @logout="emit('logout')"
    >
      <template #brand="scope"><slot name="brand" v-bind="scope" /></template>
      <template #navigation="scope"><slot name="navigation" v-bind="scope" /></template>
      <template #user="scope"><slot name="user" v-bind="scope" /></template>
    </ConsoleSidebarRail>
    <UDashboardPanel
      v-if="withPanel"
      :class="['qisvc-console-panel', panelClass]"
      :ui="{ body: 'qisvc-console-panel-body min-w-0 gap-0 sm:gap-0 overflow-visible p-0 sm:p-0' }"
    >
      <template v-if="$slots.header" #header>
        <header class="qisvc-console-topbar"><slot name="header" /></header>
      </template>
      <template #body><main :class="['qisvc-console-stage', stageClass]"><slot /></main></template>
    </UDashboardPanel>
    <slot v-else />
  </UDashboardGroup>
</template>
