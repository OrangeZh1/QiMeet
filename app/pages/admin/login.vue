<script setup lang="ts">
import { brand } from '#shared/brand'
useSeoMeta({ title: '管理员登录' })
const { data: settings } = useSiteSettings()
const site = computed(() => settings.value || fallbackSite)

const request = useRequestFetch()
const hasSession = await request('/api/manage/session').then(() => true).catch(() => false)
if (hasSession) await navigateTo('/admin')

const username = ref('')
const password = ref('')
const passwordVisible = ref(false)
const error = ref('')
const busy = ref(false)
watch(password, value => { if (!value) passwordVisible.value = false })
async function login() {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    await manageRequest('login', { method: 'POST', body: { username: username.value, password: password.value } })
    await navigateTo('/admin')
  } catch (cause) {
    error.value = errorText(cause, '登录失败，请重试')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="login-screen">
    <div class="login-frame">
      <div class="login-shell">
        <section class="login-brand" :aria-label="site.title">
          <img class="login-illustration" :src="site.loginImageUrl || fallbackSite.loginImageUrl" alt="" />
          <NuxtLink class="login-logo" to="/admin/login" :aria-label="site.title">
            <span class="brand-icon"><img :src="site.logoUrl || fallbackSite.logoUrl" width="32" height="32" alt="" /></span>
            <span>{{ site.title }}</span>
          </NuxtLink>
          <p class="login-caption">{{ brand.description }}</p>
        </section>
        <section class="login-panel" aria-labelledby="login-heading">
          <form class="login-form" @submit.prevent="login">
            <header>
              <h1 id="login-heading" class="page-title">管理员登录</h1>
            </header>
            <div class="login-field">
              <label for="login-account">账号</label>
              <div class="login-input">
                <UIcon name="i-lucide-user-round" aria-hidden="true" />
                <input id="login-account" v-model="username" name="username" autocomplete="username" maxlength="64" :aria-invalid="!!error" :aria-describedby="error ? 'login-error' : undefined" required />
              </div>
            </div>
            <div class="login-field">
              <label for="login-password">密码</label>
              <div class="login-input">
                <UIcon name="i-lucide-lock-keyhole" aria-hidden="true" />
                <input id="login-password" v-model="password" name="password" :type="passwordVisible ? 'text' : 'password'" autocomplete="current-password" maxlength="200" :aria-invalid="!!error" :aria-describedby="error ? 'login-error' : undefined" required />
                <button type="button" class="password-toggle" :disabled="!password" @pointerdown.prevent :aria-label="passwordVisible ? '隐藏密码' : '显示密码'" :title="passwordVisible ? '隐藏密码' : '显示密码'" @click="passwordVisible = !passwordVisible">
                  <UIcon :name="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'" aria-hidden="true" />
                </button>
              </div>
            </div>
            <p v-if="error" id="login-error" class="feedback error" role="alert">{{ error }}</p>
            <UButton class="login-submit" type="submit" block size="xl" :loading="busy">{{ busy ? '正在登录' : '登录后台' }}</UButton>
          </form>
        </section>
      </div>
      <SiteFooter class="login-footer" :copyright-text="site.loginCopyright" filing-only />
    </div>
  </main>
</template>

<style scoped>
.login-screen {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: clamp(16px, 4vw, 52px);
  background: radial-gradient(ellipse at 10% 5%, #f8faff 0%, transparent 62%),
    linear-gradient(135deg, #eef3fb 0%, #e2eaf9 100%);
}
.login-frame { width: min(100%, 984px); }
.login-shell {
  display: grid;
  grid-template-columns: 1.06fr 1fr;
  width: 100%;
  min-height: clamp(480px, 67vh, 562px);
  border: 1px solid #d8e3f3;
  border-radius: 26px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 34px 78px #132d6029, 0 5px 19px #132d600b;
}
.login-brand {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: #132c59;
  color: #f8fbff;
  padding: clamp(26px, 4.5vw, 48px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 30px;
}
.login-illustration { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 46%; }
.login-brand::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, #0a1838d3 0%, #0b1c3e15 43%, #08152dd9 100%); }
.login-logo, .login-caption { position: relative; z-index: 1; overflow-wrap: anywhere; }
.login-logo .brand-icon { flex: none; }
.login-logo .brand-icon img { object-fit: contain; }
.login-footer { margin-top: 13px; text-align: center; color: var(--muted); font-size: 13px; }
.login-logo { align-self: flex-start; display: inline-flex; align-items: center; gap: 12px; font-size: 27px; font-weight: 760; letter-spacing: -.05em; }
.login-caption { font-size: clamp(20px, 2.7vw, 37px); line-height: 1.2; letter-spacing: -.04em; font-weight: 690; }
.login-panel { display: grid; place-items: center; padding: clamp(25px, 5.2vw, 67px); }
.login-form { display: grid; width: min(100%, 352px); gap: 18px; }
.login-form header { margin-bottom: 8px; }
.login-field { display: grid; min-width: 0; gap: 7px; }
.login-field label { font-size: 14px; font-weight: 650; }
.login-input {
  display: flex; min-height: 49px; padding: 0 13px; gap: 10px; align-items: center;
  border: 1px solid #cbd8eb; border-radius: 11px; color: #5c6d89; background: #fafcff;
}
.login-input:focus-within { background: #fff; border-color: #255cc9; box-shadow: 0 0 0 3px #326ddd26; }
.login-input > span, .password-toggle > span { font-size: 18px; flex: none; }
.login-input input { align-self: stretch; flex: 1; min-width: 0; width: 100%; border: 0; color: var(--ink); font-size: 16px; outline: none; }
.password-toggle { display: grid; place-items: center; width: 38px; height: 38px; margin-right: -7px; border-radius: 8px; }
#login-password::-ms-reveal, #login-password::-ms-clear { display: none; }
.password-toggle:disabled { opacity: .45; cursor: default; }
.password-toggle:not(:disabled):hover { background: #edf3ff; color: #1647a0; }
.login-submit { min-height: 48px; margin-top: 5px; border-radius: 11px; font-size: 16px; font-weight: 670; background: #2257c5; color: #fff; }
.login-submit:hover { background: #1b459f; }
@media (max-width: 680px) {
  .login-screen { padding: 18px; }
  .login-shell { grid-template-columns: minmax(0, 1fr); min-height: 0; border-radius: 20px; }
  .login-frame { max-width: 440px; }
  .login-brand { padding: 22px 25px; gap: 18px; }
  .login-illustration { object-position: center 42%; }
  .login-caption { font-size: 17px; font-weight: 560; letter-spacing: normal; }
  .login-logo { font-size: 24px; }
  .login-panel { padding: 29px 25px 34px; }
}
@media (max-width: 360px) { .login-screen { padding: 10px; } .login-panel { padding-inline: 20px; } }
</style>
