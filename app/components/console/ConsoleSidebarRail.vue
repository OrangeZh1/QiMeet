<script setup lang="ts">
import { computed, ref, watch } from 'vue'

type SidebarOptions = Record<string, unknown> & { ui?: Record<string, unknown> }

const props = withDefaults(defineProps<{
  managed?: boolean
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
  sidebar?: SidebarOptions
  sidebarClass?: string
}>(), {
  managed: false,
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
  sidebar: () => ({}),
  sidebarClass: 'console-dashboard-sidebar',
})

const emit = defineEmits<{ logout: [] }>()

function extendUiClass(base: string, custom: unknown) {
  return custom ? [base, custom] : base
}

const sidebarOptions = computed<SidebarOptions>(() => {
  const sidebar = props.sidebar ?? {}
  const ui = sidebar.ui && typeof sidebar.ui === 'object' ? sidebar.ui : {}

  return {
    toggleSide: 'right',
    toggle: { icon: 'i-lucide-panel-left-close', 'aria-label': '关闭侧栏' },
    ...sidebar,
    ui: {
      ...ui,
      root: extendUiClass('qisvc-console-sidebar-root', ui.root),
      content: extendUiClass('qisvc-console-sidebar-content', ui.content),
      overlay: extendUiClass('qisvc-console-sidebar-overlay', ui.overlay),
      header: extendUiClass('qisvc-console-sidebar-header h-16 overflow-hidden border-b border-default px-4', ui.header),
      body: extendUiClass('qisvc-console-sidebar-body min-h-0 overflow-hidden p-0', ui.body),
      footer: extendUiClass('qisvc-console-sidebar-footer overflow-hidden border-t border-default p-3', ui.footer),
    },
  }
})

const avatarFailed = ref(false)
const brandLogoFailed = ref(false)
const resolvedBrandLogoSrc = computed(() => brandLogoFailed.value ? '/brand-icon.png' : props.brandLogoSrc)
const resolvedUserInitial = computed(() => props.userInitial
  || Array.from(props.userName.trim())[0]?.toLocaleUpperCase()
  || '用')

watch(() => props.userAvatarUrl, () => {
  avatarFailed.value = false
})

watch(() => props.brandLogoSrc, () => {
  brandLogoFailed.value = false
})
</script>

<template>
  <UDashboardSidebar
    v-bind="sidebarOptions"
    collapsible
    :resizable="false"
    :class="['qisvc-console-sidebar qisvc-console-navigation', sidebarClass]"
  >
    <template #header="scope">
      <template v-if="managed">
        <UDashboardSidebarCollapse
          v-if="scope.collapsed"
          icon="i-lucide-panel-left-open"
          aria-label="展开侧栏"
          size="xs"
          square
          class="qisvc-console-sidebar-action"
        />
        <template v-else>
          <NuxtLink
            v-if="brandTo"
            :to="brandTo"
            class="qisvc-console-brand no-underline"
            :aria-label="brandCaption || brandName"
          >
            <img :src="resolvedBrandLogoSrc" alt="" class="qisvc-console-brand-logo" :class="{'qisvc-brand-light':brandLogoDarkSrc}" @error="brandLogoFailed = true"><img v-if="brandLogoDarkSrc" :src="brandLogoDarkSrc" alt="" class="qisvc-console-brand-logo qisvc-brand-dark">
            <span class="qisvc-console-brand-copy">
              <span class="qisvc-console-brand-title-row">
                <strong class="qisvc-console-brand-name">{{ brandName }}</strong>
                <span v-if="brandBadge" class="qisvc-console-brand-badge">{{ brandBadge }}</span>
              </span>
              <small v-if="brandCaption" class="qisvc-console-brand-caption">{{ brandCaption }}</small>
            </span>
          </NuxtLink>
          <div v-else class="qisvc-console-brand" :aria-label="brandCaption || brandName">
            <img :src="resolvedBrandLogoSrc" alt="" class="qisvc-console-brand-logo" :class="{'qisvc-brand-light':brandLogoDarkSrc}" @error="brandLogoFailed = true"><img v-if="brandLogoDarkSrc" :src="brandLogoDarkSrc" alt="" class="qisvc-console-brand-logo qisvc-brand-dark">
            <span class="qisvc-console-brand-copy">
              <span class="qisvc-console-brand-title-row">
                <strong class="qisvc-console-brand-name">{{ brandName }}</strong>
                <span v-if="brandBadge" class="qisvc-console-brand-badge">{{ brandBadge }}</span>
              </span>
              <small v-if="brandCaption" class="qisvc-console-brand-caption">{{ brandCaption }}</small>
            </span>
          </div>
          <div class="qisvc-console-sidebar-actions">
            <UColorModeButton v-if="showSidebarTheme" color="neutral" variant="ghost" size="xs" square class="qisvc-console-sidebar-action" />
            <UDashboardSidebarCollapse aria-label="折叠侧栏" icon="i-lucide-panel-left-close" size="xs" square class="qisvc-console-sidebar-action qisvc-console-desktop-collapse" />
          </div>
        </template>
      </template>
      <slot v-else name="brand" v-bind="scope" />
    </template>

    <template #default="scope">
      <div v-if="managed" class="qisvc-console-sidebar-scroll sidebar-navigation">
        <nav class="qisvc-console-sidebar-nav" :aria-label="navigationLabel">
          <slot name="navigation" v-bind="scope" />
        </nav>
      </div>
      <slot v-else name="navigation" v-bind="scope" />
    </template>

    <template #footer="scope">
      <template v-if="managed">
        <div v-if="!scope.collapsed" class="qisvc-console-user">
          <span class="qisvc-console-user-avatar" aria-hidden="true">
            <img v-if="userAvatarUrl && !avatarFailed" :src="userAvatarUrl" alt="" referrerpolicy="no-referrer" @error="avatarFailed = true">
            <span v-else>{{ resolvedUserInitial }}</span>
          </span>
          <span class="qisvc-console-user-copy">
            <span class="qisvc-console-user-name">{{ userName }}</span>
            <span class="qisvc-console-user-description">{{ userDescription }}</span>
          </span>
          <UButton color="neutral" variant="ghost" size="xs" square icon="i-lucide-log-out" aria-label="退出登录" class="qisvc-console-user-logout" @click="emit('logout')" />
        </div>
        <UButton v-else color="neutral" variant="ghost" size="sm" square icon="i-lucide-log-out" aria-label="退出登录" class="qisvc-console-user-logout" @click="emit('logout')" />
      </template>
      <slot v-else name="user" v-bind="scope" />
    </template>
  </UDashboardSidebar>
</template>

<style>
.qisvc-brand-dark{display:none}.dark .qisvc-brand-light{display:none}.dark .qisvc-brand-dark{display:block}
</style>
