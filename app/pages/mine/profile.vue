<script setup lang="ts">
import { attendeePasswordMin, attendeePasswordMax, type AttendeeAuth, type AttendeeProfile } from '#shared/attendee-account'
import { materialPolicy } from '#shared/materials'
import { brand } from '#shared/brand'

definePageMeta({ layout: false, pageTransition: false })
const route = useRoute()

const { data: session, error } = await useFetch<AttendeeAuth>('/api/account/session', {
  key: 'attendee-mine-session', cache: 'no-store',
})
if (!error.value && !session.value?.account) {
  await navigateTo(attendeeLogin(route.fullPath), { redirectCode: 302 })
}

const profile = computed(() => session.value?.account)
const mode = computed(() => {
  if (route.query.edit === 'name') return 'name'
  if (route.query.edit === 'password' && profile.value?.kind !== 'wechat') return 'password'
})
const title = computed(() => mode.value === 'name' ? '修改用户名'
  : mode.value === 'password' ? (profile.value?.hasPassword ? '修改密码' : '设置密码') : '个人资料')
useSeoMeta({ title })
const back = computed(() => mode.value ? { to: '/mine/profile', label: '个人资料' } : { to: '/mine', label: '我的' })
const contactLabel = computed(() => profile.value?.kind === 'phone' ? '手机号' : profile.value?.kind === 'email' ? '邮箱' : '登录方式')
const contactValue = computed(() => {
  const account = profile.value
  if (!account) return ''
  if (account.kind === 'phone') return account.label.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
  return account.kind === 'wechat' ? '微信登录' : account.label
})
const displayName = ref(profile.value?.displayName ?? '')
const avatarInput = ref<HTMLInputElement>()
const nameBusy = ref(false)
const avatarBusy = ref(false)
const passwordBusy = ref(false)
const quitting = ref(false)
const logoutOpen = ref(false)
const nameError = ref('')
const avatarError = ref('')
const passwordError = ref('')
const logoutError = ref('')
const passwords = reactive({ current: '', next: '', repeat: '' })
const toast = useToast()

watch(mode, page => {
  if (page === 'name') displayName.value = profile.value?.displayName ?? ''
  if (page !== 'password') Object.assign(passwords, { current: '', next: '', repeat: '' })
  nameError.value = passwordError.value = ''
})

function updateProfile(patch: Partial<AttendeeProfile>) {
  if (session.value?.account) session.value = { ...session.value, account: { ...session.value.account, ...patch } }
}

async function saveName() {
  if (nameBusy.value) return
  nameBusy.value = true
  nameError.value = ''
  try {
    const saved = await $fetch<{ displayName: string }>('/api/account/profile', { method: 'POST', body: { displayName: displayName.value } })
    updateProfile(saved)
    displayName.value = saved.displayName
    toast.add({ title: '用户名已保存', color: 'success' })
    await navigateTo('/mine/profile', { replace: true })
  } catch (cause) {
    nameError.value = errorText(cause, '保存用户名失败')
  } finally {
    nameBusy.value = false
  }
}

async function changeAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || avatarBusy.value) return
  avatarError.value = ''
  if (file.size > materialPolicy.image.maxMb * 1024 * 1024) {
    avatarError.value = '头像不能超过 ' + materialPolicy.image.maxMb + ' MB'
    return
  }
  avatarBusy.value = true
  try {
    const saved = await $fetch<{ avatarUrl: string }>('/api/account/avatar', {
      method: 'POST', query: { name: file.name }, body: file, retry: 0,
    })
    updateProfile(saved)
    toast.add({ title: '头像已更新', color: 'success' })
  } catch (cause) {
    avatarError.value = errorText(cause, '更新头像失败')
  } finally {
    avatarBusy.value = false
  }
}

async function savePassword() {
  if (passwordBusy.value) return
  if (passwords.next !== passwords.repeat) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }
  passwordBusy.value = true
  passwordError.value = ''
  try {
    await $fetch('/api/account/change-password', {
      method: 'POST', body: { currentPassword: passwords.current, newPassword: passwords.next },
    })
    updateProfile({ hasPassword: true })
    Object.assign(passwords, { current: '', next: '', repeat: '' })
    toast.add({ title: '密码已保存', color: 'success' })
    await navigateTo('/mine/profile', { replace: true })
  } catch (cause) {
    passwordError.value = errorText(cause, '保存密码失败')
  } finally {
    passwordBusy.value = false
  }
}

async function logout() {
  if (quitting.value) return
  quitting.value = true
  logoutError.value = ''
  try {
    await $fetch('/api/account/logout', { method: 'POST' })
    logoutOpen.value = false
    clearNuxtData(key => key.startsWith('attendee-'))
    await navigateTo('/mine')
  } catch (cause) {
    logoutError.value = errorText(cause, '退出登录失败')
  } finally {
    quitting.value = false
  }
}
</script>

<template>
  <NuxtLayout name="attendee" class="qm-account-profile" :toolbar-title="title" :back="back">
    <section class="client-section account-profile">
      <h1 class="sr-only">{{ title }}</h1>
      <p v-if="error" class="attendee-error" role="alert">{{ errorText(error, '暂时无法读取个人资料') }}</p>
      <template v-else-if="profile">
        <template v-if="!mode">
          <div class="account-group">
            <label class="sr-only" for="attendee-avatar-file">选择头像文件</label>
            <input id="attendee-avatar-file" ref="avatarInput" type="file" class="sr-only"
              :accept="materialPolicy.image.accept" :disabled="avatarBusy" @change="changeAvatar" />
            <button type="button" class="account-row account-avatar-row" :disabled="avatarBusy" @click="avatarInput?.click()">
              <span>{{ avatarBusy ? '正在上传头像…' : '头像' }}</span>
              <span class="account-row-end">
                <span class="account-avatar">
                  <img :src="profile.avatarUrl || brand.defaultAvatar" alt="" width="48" height="48" />
                </span>
                <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
              </span>
            </button>
            <NuxtLink :to="{ path: '/mine/profile', query: { edit: 'name' } }" class="account-row">
              <span>用户名</span>
              <span class="account-row-end">
                <span>{{ profile.displayName || '去设置' }}</span>
                <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
              </span>
            </NuxtLink>
          </div>
          <p v-if="avatarError" class="attendee-error" role="alert">{{ avatarError }}</p>
          <h2 class="account-group-label">账号安全</h2>
          <div class="account-group">
            <div class="account-row">
              <span>{{ contactLabel }}</span><span class="account-row-end">{{ contactValue }}</span>
            </div>
            <NuxtLink v-if="profile.kind !== 'wechat'" :to="{ path: '/mine/profile', query: { edit: 'password' } }" class="account-row">
              <span>{{ profile.hasPassword ? '修改密码' : '设置密码' }}</span>
              <span class="account-row-end">
                <span>{{ profile.hasPassword ? '已设置' : '未设置' }}</span>
                <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
              </span>
            </NuxtLink>
          </div>
          <button type="button" class="account-logout" @click="logoutOpen = true">退出登录</button>
        </template>
        <form v-else-if="mode === 'name'" class="profile-card attendee-input-form" @submit.prevent="saveName">
          <div class="attendee-field">
            <label for="attendee-display-name">用户名</label>
            <input id="attendee-display-name" v-model.trim="displayName" maxlength="60" autocomplete="nickname" required :readonly="nameBusy" />
          </div>
          <p v-if="nameError" class="attendee-error" role="alert">{{ nameError }}</p>
          <UButton type="submit" class="profile-action" :disabled="!displayName || displayName === profile.displayName"
            :loading="nameBusy">保存用户名</UButton>
        </form>
        <form v-else class="profile-card attendee-input-form" @submit.prevent="savePassword">
          <div v-if="profile.hasPassword" class="attendee-field">
            <label for="profile-current-password">当前密码</label>
            <input id="profile-current-password" v-model="passwords.current" type="password" autocomplete="current-password"
              :maxlength="attendeePasswordMax" required :readonly="passwordBusy" />
          </div>
          <div class="attendee-field">
            <label for="profile-new-password">新密码</label>
            <input id="profile-new-password" v-model="passwords.next" type="password" autocomplete="new-password"
              :minlength="attendeePasswordMin" :maxlength="attendeePasswordMax" :placeholder="'至少 ' + attendeePasswordMin + ' 个字符'"
              required :readonly="passwordBusy" />
          </div>
          <div class="attendee-field">
            <label for="profile-repeat-password">确认新密码</label>
            <input id="profile-repeat-password" v-model="passwords.repeat" type="password" autocomplete="new-password"
              :minlength="attendeePasswordMin" :maxlength="attendeePasswordMax" required :readonly="passwordBusy" />
          </div>
          <p v-if="passwordError" class="attendee-error" role="alert">{{ passwordError }}</p>
          <UButton type="submit" class="profile-action" :loading="passwordBusy">保存密码</UButton>
        </form>
        <UModal v-model:open="logoutOpen" title="退出登录？" description="重新登录后可继续查看个人资料和报名记录。"
          :dismissible="!quitting" :close="!quitting" :ui="{ overlay: 'z-[60]', content: 'z-[60]' }">
          <template #footer>
            <p v-if="logoutError" class="attendee-error" role="alert">{{ logoutError }}</p>
            <div class="attendee-actions">
              <UButton type="button" variant="outline" color="neutral" :disabled="quitting" @click="logoutOpen = false">取消</UButton>
              <UButton type="button" color="error" :loading="quitting" @click="logout">确认退出</UButton>
            </div>
          </template>
        </UModal>
      </template>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.account-profile { max-width: 34rem; margin-inline: auto; gap: 10px; }
:global(.qm-account-profile .attendee-main) { background: #f3f6fa; }
.account-group { padding: 0 15px; border: 1px solid #e1e8f2; border-radius: 10px; background: #fff; }
.account-group-label { padding: 4px 2px 0; color: var(--muted); font-size: 13px; font-weight: 570; }
.account-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 52px; padding-block: 9px; text-align: left; }
.account-row + .account-row { border-top: 1px solid var(--attendee-form-line); }
.account-row > span:first-child { flex: none; font-size: 15px; font-weight: 600; }
.account-avatar-row { min-height: 70px; }
.account-row-end { display: flex; min-width: 0; align-items: center; gap: 8px; color: var(--muted); font-size: 14px; text-align: right; overflow-wrap: anywhere; }
.account-row-end > [aria-hidden] { flex: none; font-size: 17px; color: #74849e; }
.account-avatar { display: grid; place-items: center; flex: none; width: 48px; height: 48px; overflow: hidden; border-radius: 50%; background: #eaf1ff; color: #315daa; font-size: 22px; }
.account-avatar img { width: 100%; height: 100%; object-fit: cover; }
.account-logout { min-height: 46px; margin-top: 7px; border: 1px solid #e1e8f2; border-radius: 9px; background: #fff; color: #9b3440; font-size: 15px; font-weight: 630; }
.profile-card { display: grid; gap: 14px; padding: 16px; border: 1px solid #e1e8f2; border-radius: 10px; background: #fff; }
.profile-action { min-height: 44px; justify-content: center; }
</style>
