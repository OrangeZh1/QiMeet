<script setup lang="ts">
import ConsolePageHeading from '#qiandao-console/ConsolePageHeading.vue'
import type { AdminProfile } from '#shared/models'
definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '个人资料' })

const account = useState<AdminProfile | null>('qm-admin-profile', () => null)
const profile = reactive({ username: account.value?.username || '', displayName: account.value?.displayName || '',
  avatarMaterialId: account.value?.avatarMaterialId || null, currentPassword: '' })
const editingUsername = computed(() => profile.username.trim() !== account.value?.username)
const avatarBusy = ref(false)
const profileBusy = ref(false)
const profileError = ref('')
const profileMessage = ref('')
async function saveProfile() {
  if (profileBusy.value || avatarBusy.value) return
  profileBusy.value = true
  profileError.value = profileMessage.value = ''
  try {
    account.value = await manageRequest<AdminProfile>('save-profile', { method: 'POST', body: { ...profile } })
    profile.username = account.value.username
    profile.displayName = account.value.displayName
    profile.currentPassword = ''
    profileMessage.value = '个人资料已保存'
  } catch (cause) { profileError.value = errorText(cause) }
  finally { profileBusy.value = false }
}

const password = reactive({ currentPassword: '', newPassword: '', confirm: '' })
const passwordBusy = ref(false)
const passwordError = ref('')
const passwordMessage = ref('')
async function savePassword() {
  if (passwordBusy.value) return
  passwordError.value = passwordMessage.value = ''
  if (password.newPassword !== password.confirm) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }
  passwordBusy.value = true
  try {
    await manageRequest('save-password', { method: 'POST', body: { currentPassword: password.currentPassword, newPassword: password.newPassword } })
    Object.assign(password, { currentPassword: '', newPassword: '', confirm: '' })
    passwordMessage.value = '密码已修改，其他设备需要重新登录'
  } catch (cause) { passwordError.value = errorText(cause) }
  finally { passwordBusy.value = false }
}
</script>

<template>
  <div class="page-stack">
    <ConsolePageHeading title="个人资料" description="管理显示信息和登录凭据。" />
    <form class="panel panel-content form-stack" @submit.prevent="saveProfile">
      <h2 class="section-title">基本资料</h2>
      <MaterialPicker v-model="profile.avatarMaterialId" :current-url="account?.avatarUrl" label="头像" shape="square" @busy="avatarBusy = $event" />
      <div class="form-grid">
        <label>昵称 <input v-model="profile.displayName" maxlength="60" autocomplete="nickname" required /></label>
        <label>登录账号 <input v-model="profile.username" maxlength="64" autocomplete="username" required /></label>
        <label v-if="editingUsername">当前密码 <input v-model="profile.currentPassword" type="password" autocomplete="current-password" maxlength="200" required /></label>
      </div>
      <p v-if="profileError || profileMessage" class="feedback" :class="{ error: profileError }" :role="profileError ? 'alert' : 'status'">{{ profileError || profileMessage }}</p>
      <div><UButton type="submit" icon="i-lucide-save" :loading="profileBusy" :disabled="avatarBusy">保存资料</UButton></div>
    </form>
    <form class="panel panel-content form-stack" @submit.prevent="savePassword">
      <h2 class="section-title">修改密码</h2>
      <div class="form-grid">
        <label>当前密码 <input v-model="password.currentPassword" type="password" autocomplete="current-password" maxlength="200" required /></label>
        <label>新密码 <input v-model="password.newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="200" required /><small class="help">至少 12 个字符。</small></label>
        <label>确认新密码 <input v-model="password.confirm" type="password" autocomplete="new-password" minlength="12" maxlength="200" required /></label>
      </div>
      <p v-if="passwordError || passwordMessage" class="feedback" :class="{ error: passwordError }" :role="passwordError ? 'alert' : 'status'">{{ passwordError || passwordMessage }}</p>
      <div><UButton type="submit" icon="i-lucide-lock-keyhole" :loading="passwordBusy">修改密码</UButton></div>
    </form>
  </div>
</template>
