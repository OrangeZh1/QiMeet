<script setup lang="ts">
import ConsoleShell from '#qiandao-console/ConsoleShell.vue'
import ConsoleSidebarLink from '#qiandao-console/ConsoleSidebarLink.vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { brand } from '#shared/brand'
import type { AdminProfile } from '#shared/models'
import { siteSettingsPath, siteSettingsSections } from '~/utils/siteSettingsSections'

const route = useRoute()
useHead({ htmlAttrs: { class: 'qm-admin-page' } })
const account = useState<AdminProfile | null>('qm-admin-profile', () => null)
const busy = ref(false)
const toast = useToast()
const menu = [
  { to: '/admin', label: '概览', icon: 'i-lucide-layout-dashboard' },
  { to: '/admin/events', label: '活动管理', icon: 'i-lucide-calendar-days' },
  { to: '/admin/users', label: '用户列表', icon: 'i-lucide-users' },
  { to: '/admin/materials', label: '素材库', icon: 'i-lucide-images' },
  { to: '/admin/help', label: '帮助中心', icon: 'i-lucide-circle-help' },
]
const active = computed(() => menu.find(item => route.path === item.to) ||
  (route.path.startsWith('/admin/events/') ? menu[1] : undefined))
const inActivity = computed(() => route.path.startsWith('/admin/events/'))
const settingSection = computed(() => siteSettingsSections.find(section => route.path === siteSettingsPath + '/' + section.id))
const settingsOpen = ref(!!settingSection.value)
watch(settingSection, section => { if (section) settingsOpen.value = true })
const settingsMenu: DropdownMenuItem[] = siteSettingsSections.map(section => ({
  label: section.label, icon: section.icon, to: siteSettingsPath + '/' + section.id,
}))
const title = computed(() => {
  if (route.path === '/admin/profile') return '个人资料'
  if (route.path === '/admin/events/new') return '新建活动'
  if (settingSection.value) return settingSection.value.label
  return inActivity.value ? '活动详情' : active.value?.label || '概览'
})

async function logout() {
  if (busy.value) return
  busy.value = true
  try {
    await manageRequest('logout', { method: 'POST' })
    account.value = null
    clearNuxtData()
    await navigateTo('/admin/login')
  } catch (cause) {
    toast.add({ title: errorText(cause), color: 'error' })
  } finally {
    busy.value = false
  }
}
const userItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: account.value?.username || 'admin', type: 'label' }],
  [
    { label: '个人资料', icon: 'i-lucide-user-round', to: '/admin/profile' },
    { label: '退出登录', icon: 'i-lucide-log-out', onSelect: () => { void logout() } },
  ],
])
</script>

<template>
  <ConsoleShell
    managed-sidebar :show-sidebar-theme="false" storage-key="qimeet-dashboard"
    :brand-name="brand.name" :brand-caption="brand.description" brand-logo-src="/brand/app-192.png" brand-to="/admin"
    :sidebar="{ id: 'navigation', menu: { title: '主导航', description: '选择要打开的页面' }, ui: { footer: 'hidden' } }"
    stage-class="admin-stage"
  >
    <template #navigation="{ collapsed }">
      <ConsoleSidebarLink v-for="item in menu" :key="item.to" :to="item.to" :label="item.label" :icon="item.icon" :collapsed="collapsed" :active="active?.to === item.to" :title="collapsed ? item.label : undefined" />
      <UDropdownMenu v-if="collapsed" :items="settingsMenu" :content="{ side: 'right', align: 'start' }">
        <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-settings" square aria-label="站点设置" title="站点设置"
          class="qisvc-console-sidebar-link size-10 justify-center p-0" :data-active="!!settingSection || undefined" />
      </UDropdownMenu>
      <template v-else>
        <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-settings" label="站点设置" block
          class="qisvc-console-sidebar-link min-h-10 justify-start"
          :data-active="!!settingSection && !settingsOpen || undefined" :aria-expanded="settingsOpen" aria-controls="site-settings-navigation"
          @click="settingsOpen = !settingsOpen">
          <template #trailing>
            <UIcon :name="settingsOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="ms-auto size-4" aria-hidden="true" />
          </template>
        </UButton>
        <div v-show="settingsOpen" id="site-settings-navigation" class="settings-navigation" role="group" aria-label="站点设置">
          <ConsoleSidebarLink v-for="section in siteSettingsSections" :key="section.id" :to="siteSettingsPath + '/' + section.id"
            :label="section.label" :icon="section.icon" :active="settingSection?.id === section.id" subitem />
        </div>
      </template>
    </template>
    <template #header>
      <div class="qimeet-toolbar">
        <div class="top-path">
          <UDashboardSidebarToggle icon="i-lucide-menu" aria-label="打开导航" />
          <NuxtLink v-if="route.path !== '/admin'" to="/admin" class="top-parent">概览</NuxtLink>
          <UIcon v-if="route.path !== '/admin'" class="top-divider" name="i-lucide-chevron-right" />
          <template v-if="inActivity">
            <NuxtLink to="/admin/events" class="top-parent">活动管理</NuxtLink>
            <UIcon class="top-divider" name="i-lucide-chevron-right" />
          </template>
          <template v-if="settingSection">
            <NuxtLink :to="siteSettingsPath" class="top-parent">站点设置</NuxtLink>
            <UIcon class="top-divider" name="i-lucide-chevron-right" />
          </template>
          <strong>{{ title }}</strong>
        </div>
        <UDropdownMenu :items="userItems" :disabled="busy" :content="{ align: 'end', sideOffset: 8 }" :ui="{ content: 'min-w-40 motion-reduce:animate-none' }">
          <UButton class="account-toggle" color="neutral" variant="ghost" :loading="busy" aria-label="管理员账号菜单">
            <span class="avatar">
              <img :src="account?.avatarUrl || brand.defaultAvatar" width="32" height="32" alt="" />
            </span>
            <span class="account-name">{{ account?.displayName || '管理员' }}</span>
            <UIcon name="i-lucide-chevron-down" class="account-chevron" />
          </UButton>
        </UDropdownMenu>
      </div>
    </template>
    <slot />
  </ConsoleShell>
</template>

<style scoped>
.settings-navigation { display: grid; gap: 3px; margin-inline-start: 12px; padding-inline-start: 7px; border-inline-start: 1px solid var(--line); }
</style>
