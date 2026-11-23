<script setup lang="ts">
import { attendeeLoginFallback, attendeeReturn, isPublicAttendeeHistory, attendeePasswordMin, attendeePasswordMax, detectAttendeeContact, type AccountIntent, type AttendeeAuth } from '#shared/attendee-account'

definePageMeta({ layout: false, pageTransition: false })
const route = useRoute()
const router = useRouter()
const next = computed(() => attendeeReturn(route.query.next))
const backTo = computed(() => attendeeLoginFallback(route.query.next))

function returnFromLogin(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
  if (!isPublicAttendeeHistory(router.options.history.state.back)) return
  event.preventDefault()
  router.back()
}
const wechatPreview = computed(() => import.meta.dev && route.query.mode === 'wechat' && route.query.preview === '1')
const { data: session } = await useFetch<AttendeeAuth>('/api/account/session', { key: 'attendee-login-session', cache: 'no-store' })
if (session.value?.account && !wechatPreview.value && route.query.wechat !== 'failed') await navigateTo(next.value, { replace: true })

const intent = computed<AccountIntent>(() => route.query.mode === 'register' ? 'register' : 'login')
const wechatAvailable = computed(() => intent.value === 'login' && !!session.value?.wechat)
const otherMode = computed(() => ({
  path: '/login',
  query: { next: next.value, mode: intent.value === 'login' ? 'register' : undefined },
}))
const otherLabel = computed(() => intent.value === 'login' ? '立即注册' : '去登录')
const contactMethods = computed(() => ([
  { kind: 'phone', label: '手机号' }, { kind: 'email', label: '邮箱' },
] as const).filter(method => session.value?.[method.kind] !== false))
const credentialMethods = [{ value: 'password', label: '账号登录' }, { value: 'code', label: '验证码登录' }] as const
const credentialMethod = ref<'password' | 'code'>('password')
const usingCode = computed(() => intent.value === 'register' || credentialMethod.value === 'code')
const usingPassword = computed(() => intent.value === 'register' || credentialMethod.value === 'password')
const identifier = ref('')
const identifierTouched = ref(false)
const code = ref('')
const password = ref('')
const passwordAgain = ref('')
const policyAccepted = ref(false)
const sending = ref(false)
const verifying = ref(false)
const wechatStarting = ref(false)
const authBusy = computed(() => sending.value || verifying.value || wechatStarting.value)
const sendError = ref('')
const verifyError = ref('')
const wechatError = ref('')
const notice = ref('')
const cooldown = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
const heading = computed(() => intent.value === 'login' ? '登录' : '注册')
const singleMethod = computed(() => contactMethods.value.length === 1 ? contactMethods.value[0] : undefined)
const identifierLabel = computed(() => singleMethod.value?.label ?? '手机号或邮箱')
const contact = computed(() => {
  const parsed = detectAttendeeContact(identifier.value)
  return parsed && contactMethods.value.some(method => method.kind === parsed.kind) ? parsed : undefined
})
const identifierError = computed(() => identifierTouched.value && identifier.value && !contact.value
  ? '请输入有效的' + (singleMethod.value?.kind === 'phone' ? '中国大陆手机号' : identifierLabel.value) : '')
const actionContext = computed(() => {
  const path = next.value.split('?')[0]
  if (path?.endsWith('/check-in')) return '登录后继续签到。'
  if (path?.endsWith('/register')) return '登录后继续报名。'
  if (path?.endsWith('/record')) return '登录后查看报名记录。'
})
const { data: site } = useSiteSettings()
const tagline = computed(() => site.value?.loginTagline ?? fallbackSite.loginTagline)
const policyQuery = computed(() => ({ from: 'client-login', next: next.value, mode: intent.value === 'register' ? 'register' : undefined }))
useSeoMeta({ title: () => wechatPreview.value || (wechatAvailable.value && !contactMethods.value.length) ? '微信扫码登录' : heading.value })
useHead({
  htmlAttrs: { class: 'qm-attendee-page' },
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
})

function resetCode() {
  code.value = ''
  sendError.value = ''
  verifyError.value = ''
  notice.value = ''
}

function resetCredentials() {
  resetCode()
  password.value = passwordAgain.value = ''
}

watch(intent, () => {
  identifierTouched.value = false
  wechatError.value = ''
  resetCredentials()
})

function setCredentialMethod(method: typeof credentialMethod.value) {
  if (credentialMethod.value === method) return
  credentialMethod.value = method
  resetCredentials()
}

async function sendCode() {
  const destination = contact.value
  if (!destination || authBusy.value || cooldown.value > 0) return
  sending.value = true
  sendError.value = ''
  notice.value = ''
  try {
    const response = await $fetch<{ retryAfter: number }>('/api/account/code', {
      method: 'POST', body: { ...destination, intent: intent.value },
    })
    notice.value = '验证码已提交发送，5 分钟内有效。'
    const until = Date.now() + response.retryAfter * 1000
    cooldown.value = response.retryAfter
    clearInterval(timer)
    timer = setInterval(() => {
      cooldown.value = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      if (!cooldown.value) clearInterval(timer)
    }, 1000)
  } catch (cause) {
    sendError.value = errorText(cause, '验证码发送失败')
  } finally {
    sending.value = false
  }
}

async function verify() {
  const destination = contact.value
  if (!destination || authBusy.value || !policyAccepted.value) return
  if (intent.value === 'register' && password.value !== passwordAgain.value) {
    verifyError.value = '两次输入的密码不一致'
    return
  }
  verifying.value = true
  verifyError.value = ''
  const loginPath = route.fullPath
  try {
    await $fetch(usingCode.value ? '/api/account/verify' : '/api/account/password', {
      method: 'POST',
      body: {
        ...destination, intent: intent.value, policyAccepted: policyAccepted.value,
        ...(usingCode.value ? { code: code.value } : {}),
        ...(usingPassword.value ? { password: password.value } : {}),
      },
    })
    if (route.fullPath !== loginPath) return
    clearNuxtData(key => key.startsWith('attendee-'))
    await navigateTo(next.value, { replace: true })
  } catch (cause) {
    verifyError.value = errorText(cause, '验证失败，请稍后重试')
  } finally {
    verifying.value = false
  }
}

async function startWechat() {
  if (!wechatAvailable.value || authBusy.value) return
  wechatStarting.value = true
  wechatError.value = ''
  const loginPath = route.fullPath
  try {
    const { authorizationUrl } = await $fetch<{ authorizationUrl: string }>('/api/account/wechat', {
      method: 'POST', mode: 'cors', body: { next: next.value, policyAccepted: true }, timeout: 12000,
    })
    if (route.fullPath === loginPath) await navigateTo(authorizationUrl, { external: true })
  } catch (cause) {
    wechatError.value = errorText(cause, '暂时无法打开微信扫码，请重试')
  } finally {
    wechatStarting.value = false
  }
}

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <main class="client-auth-page">
    <section class="client-auth">
      <div class="client-auth-hero">
        <img class="client-auth-cover" :src="site?.loginImageUrl || fallbackSite.loginImageUrl" alt="" />
        <NuxtLink :to="backTo" replace class="page-back-icon client-auth-back" aria-label="返回" @click.capture="returnFromLogin"><UIcon name="i-lucide-chevron-left" aria-hidden="true" /></NuxtLink>
        <div class="client-auth-brand">
          <img :src="site?.logoUrl || fallbackSite.logoUrl" width="35" height="35" alt="" />
          <div>
            <strong>{{ site?.title || fallbackSite.title }}</strong>
            <p v-if="tagline">{{ tagline }}</p>
          </div>
        </div>
      </div>
      <div class="client-auth-panel">
        <header class="client-auth-heading">
          <span v-if="wechatPreview" class="client-wechat-icon"><img src="/brand/wechat.png" alt="" width="17" height="17" /></span>
          <h1 class="attendee-heading">{{ wechatPreview || (wechatAvailable && !contactMethods.length) ? '微信扫码登录' : intent === 'login' ? '登录账号' : '注册账号' }}</h1>
        </header>
        <p v-if="actionContext && !wechatPreview" class="client-auth-context">{{ actionContext }}</p>
        <figure v-if="wechatPreview" class="client-wechat-preview">
          <img :src="'/api/account/wechat-preview'" alt="微信扫码登录示意二维码" width="172" height="172" />
          <figcaption>
            <strong>请使用微信扫一扫</strong>
            <span>演示二维码，扫码不会登录。</span>
          </figcaption>
        </figure>
        <div v-if="!wechatPreview && intent === 'login' && contactMethods.length" class="client-auth-methods" role="group" aria-label="登录方式">
          <button v-for="method in credentialMethods" :key="method.value" type="button" :aria-pressed="credentialMethod === method.value"
            :disabled="authBusy" @click="setCredentialMethod(method.value)">{{ method.label }}</button>
        </div>
        <form v-if="!wechatPreview && contactMethods.length" class="client-auth-form" @submit.prevent="verify">
          <label for="client-identifier">{{ identifierLabel }}</label>
          <div class="entry-input">
            <UIcon :name="singleMethod?.kind === 'phone' ? 'i-lucide-smartphone' : singleMethod?.kind === 'email' ? 'i-lucide-mail' : 'i-lucide-user-round'" aria-hidden="true" />
            <input id="client-identifier" v-model.trim="identifier" :type="singleMethod?.kind === 'phone' ? 'tel' : singleMethod?.kind === 'email' ? 'email' : 'text'"
              :autocomplete="singleMethod?.kind === 'phone' ? 'tel' : singleMethod?.kind === 'email' ? 'email' : 'username'" maxlength="254"
              autocapitalize="none" :spellcheck="false" :aria-invalid="!!identifierError" :aria-describedby="identifierError ? 'client-identifier-error' : undefined"
              :placeholder="'请输入' + identifierLabel" :readonly="authBusy" required @input="resetCode" @blur="identifierTouched = true" />
          </div>
          <p v-if="identifierError" id="client-identifier-error" class="attendee-field-error">{{ identifierError }}</p>
          <label v-if="usingCode" for="client-code">验证码</label>
          <div v-if="usingCode" class="entry-input">
            <UIcon name="i-lucide-shield-check" aria-hidden="true" />
            <input id="client-code" v-model.trim="code" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位验证码"
              required minlength="6" maxlength="6" pattern="[0-9]{6}" :readonly="verifying || wechatStarting" />
            <UButton type="button" variant="ghost" class="client-auth-code" :loading="sending"
              :disabled="!contact || verifying || wechatStarting || cooldown > 0" @click="sendCode">
              {{ cooldown ? cooldown + ' 秒后重发' : '发送验证码' }}
            </UButton>
          </div>
          <p v-if="usingCode && sendError" class="attendee-error" role="alert">{{ sendError }}</p>
          <p v-else-if="usingCode && notice" class="attendee-helper" role="status">{{ notice }}</p>
          <template v-if="usingPassword">
            <label for="client-password">{{ intent === 'register' ? '设置密码' : '密码' }}</label>
            <div class="entry-input">
              <UIcon name="i-lucide-lock-keyhole" aria-hidden="true" />
              <input id="client-password" v-model="password" type="password"
                :autocomplete="intent === 'register' ? 'new-password' : 'current-password'"
                :minlength="intent === 'register' ? attendeePasswordMin : undefined" :maxlength="attendeePasswordMax"
                :placeholder="intent === 'register' ? '至少 ' + attendeePasswordMin + ' 位密码' : '请输入密码'" required :readonly="verifying || wechatStarting" />
            </div>
            <template v-if="intent === 'register'">
              <label for="client-password-again">确认密码</label>
              <div class="entry-input">
                <UIcon name="i-lucide-lock-keyhole" aria-hidden="true" />
                <input id="client-password-again" v-model="passwordAgain" type="password" autocomplete="new-password"
                  :minlength="attendeePasswordMin" :maxlength="attendeePasswordMax" placeholder="再次输入密码" required :readonly="verifying" />
              </div>
            </template>
          </template>
          <p v-if="verifyError" class="attendee-error" role="alert">{{ verifyError }}</p>
          <div class="client-auth-consent">
            <input id="client-policy-consent" v-model="policyAccepted" type="checkbox" required :disabled="authBusy" />
            <div>
              <label for="client-policy-consent">我已阅读并同意</label>
              <NuxtLink :to="{ path: '/policies/privacy', query: policyQuery }" target="_blank" rel="noopener">《隐私政策》</NuxtLink>
              和<NuxtLink :to="{ path: '/policies/terms', query: policyQuery }" target="_blank" rel="noopener">《用户协议》</NuxtLink>
            </div>
          </div>
          <UButton type="submit" class="attendee-action client-auth-submit" :loading="verifying"
            :disabled="authBusy || !policyAccepted || !contact">
            {{ heading }}
          </UButton>
        </form>
        <p v-else-if="!wechatPreview && !wechatAvailable" class="client-auth-context">站点暂未开放手机号与邮箱{{ intent === 'register' ? '注册' : '登录' }}。</p>
        <p v-if="!wechatPreview && (intent === 'register' || contactMethods.length)" class="client-auth-links">
          <span>{{ intent === 'login' ? '还没账号？' : '已有账号？' }}</span>
          <span v-if="authBusy" aria-disabled="true">{{ otherLabel }}</span>
          <NuxtLink v-else :to="otherMode" replace>{{ otherLabel }}</NuxtLink>
        </p>
        <div v-if="!wechatPreview && wechatAvailable" class="client-wechat-row">
          <p id="client-wechat-consent" class="client-wechat-consent">
            点击「微信扫码登录」即表示同意
            <NuxtLink :to="{ path: '/policies/privacy', query: policyQuery }" target="_blank" rel="noopener">《隐私政策》</NuxtLink>
            和<NuxtLink :to="{ path: '/policies/terms', query: policyQuery }" target="_blank" rel="noopener">《用户协议》</NuxtLink>。
          </p>
          <UButton type="button" variant="ghost" class="client-wechat" :loading="wechatStarting"
            :disabled="authBusy" aria-describedby="client-wechat-consent" @click="startWechat">
            <span class="client-wechat-icon"><img src="/brand/wechat.png" alt="" width="17" height="17" /></span> 微信扫码登录
          </UButton>
          <p v-if="wechatError || (route.query.wechat === 'failed' && !wechatStarting)" class="attendee-error" role="alert">
            {{ wechatError || '微信授权未完成，请重新扫码。' }}
          </p>
        </div>
      </div>
    </section>
    <SiteFooter class="client-auth-footer" :copyright-text="site?.loginCopyright" filing-only />
  </main>
</template>

<style src="~/assets/css/attendee.css"></style>

<style scoped>
.client-auth-page {
  --attendee-form-blue: #2356bf;
  --attendee-form-line: #e8eef6;
  min-height: 100svh; display: flex; flex-direction: column;
  padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px);
  background: #f3f6fa;
}
.client-auth-back { position: absolute; inset: 4px auto auto 6px; color: white; }
.client-auth-back:hover { background: #ffffff26; }
.client-auth-back:focus-visible { outline-color: white; outline-offset: -3px; }
.client-auth { display: grid; width: min(100%, var(--qm-attendee-page-width)); margin-inline: auto; padding-bottom: 24px; }
.client-auth-hero { min-height: 164px; isolation: isolate; position: relative; overflow: hidden; background: #132d58; }
.client-auth-hero::after { content: ''; position: absolute; z-index: -1; inset: 0; background: linear-gradient(90deg, #132d58 5%, #132d58e6 42%, #132d5829); }
.client-auth-cover { position: absolute; z-index: -2; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; object-position: 75% 45%; }
.client-auth-brand { min-height: inherit; display: flex; align-items: center; gap: 10px; padding: 48px var(--qm-attendee-page-gutter) 24px; color: white; font-size: clamp(24px, 6vw, 35px); overflow-wrap: anywhere; }
.client-auth-brand p { margin-top: 1px; color: #e1eafb; font-size: 14px; }
.client-auth-brand img { flex: none; padding: 4px; border-radius: 8px; object-fit: contain; background: white; }
.client-auth-panel { position: relative; min-width: 0; margin: -13px var(--qm-attendee-page-gutter) 0; padding: 17px 17px 20px; border-radius: 12px; background: white; }
.client-auth-heading { display: flex; align-items: center; gap: 7px; }
.client-auth-heading h1 { font-size: 19px; }
.client-auth-context { margin-top: 5px; color: var(--muted); font-size: 13px; }
.client-auth-methods { display: flex; gap: 12px; margin: 3px 0 16px; border-bottom: 1px solid var(--attendee-form-line); }
.client-auth-methods button { position: relative; flex: 1; min-height: 44px; color: var(--muted); font-weight: 620; }
.client-auth-methods button[aria-pressed='true'] { color: var(--attendee-form-blue); font-weight: 710; }
.client-auth-methods button[aria-pressed='true']::after { content: ''; position: absolute; bottom: 0; left: calc(50% - 10px); width: 20px; height: 3px; border-radius: 8px; background: var(--attendee-form-blue); }
.client-auth-form { display: grid; grid-template-columns: minmax(0, 1fr); gap: 7px; }
.client-auth-form label { font-size: 14px; font-weight: 650; }
.client-auth-heading + .client-auth-form, .client-auth-context + .client-auth-form { margin-top: 14px; }
/* Input layout adapted from QiCore CoreLogin.vue. See NOTICE-QICORE. */
.entry-input { display: flex; align-items: center; gap: 9px; min-height: 48px; padding: 0 11px; border: 1px solid #e6ecf5; border-radius: 8px; background: #f5f7fb; color: #526889; }
.entry-input:focus-within { box-shadow: var(--qm-attendee-focus-shadow); border-color: var(--qm-attendee-focus-border); }
@media (forced-colors: active) {
  .entry-input:focus-within { outline: 2px solid Highlight; outline-offset: -1px; }
}
.entry-input > span { flex: none; font-size: 18px; }
.entry-input input { align-self: stretch; flex: 1 1 0; min-width: 0; background: transparent; border: 0; outline: none; color: var(--ink); font-size: 16px; }
.entry-input input::placeholder { color: #62728d; }
.entry-input + label { margin-top: 8px; }
.client-auth-code { flex: none; margin-inline-end: -5px; min-height: 40px; color: var(--attendee-form-blue); white-space: nowrap; }
.client-auth-submit { margin-top: 4px; border-radius: 7px; background: var(--attendee-form-blue); }
.client-auth-submit:hover:enabled { background: #184493; }
.client-auth-consent { display: flex; align-items: flex-start; gap: 8px; margin-top: 7px; color: var(--muted); font-size: 13px; line-height: 1.65; }
.client-auth-consent input { width: 17px; height: 17px; flex: none; margin-top: 3px; accent-color: var(--attendee-form-blue); }
.client-auth-consent label { font-size: inherit; font-weight: 500; }
.client-auth-consent a { color: var(--attendee-form-blue); }
.client-auth-consent a:hover { text-decoration: underline; }
.client-auth-links { display: flex; align-items: center; justify-content: center; margin-top: 5px; gap: 3px; color: var(--muted); font-size: 14px; }
.client-auth-links a { display: inline-flex; align-items: center; min-height: 44px; color: var(--attendee-form-blue); font-weight: 650; -webkit-tap-highlight-color: transparent; }
.client-auth-links a:hover { color: #184493; }
.client-wechat-row { display: grid; margin-top: 9px; border-top: 1px solid var(--attendee-form-line); }
.client-wechat-consent { padding: 9px 0 2px; color: var(--muted); font-size: 12px; text-align: center; }
.client-wechat-consent a { color: var(--attendee-form-blue); }
.client-wechat-consent a:hover { text-decoration: underline; }
.client-wechat { min-height: 46px; display: flex; gap: 7px; align-items: center; justify-content: center; color: var(--attendee-form-blue); font-size: 14px; font-weight: 620; }
.client-wechat-icon { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 50%; background: #07c160; }
.client-wechat-preview { display: grid; justify-items: center; gap: 9px; padding-block: 14px 5px; text-align: center; }
.client-wechat-preview img { width: min(172px, 100%); height: auto; border: 1px solid var(--attendee-form-line); border-radius: 8px; }
.client-wechat-preview figcaption { display: grid; gap: 4px; font-size: 14px; }
.client-wechat-preview figcaption span { color: var(--muted); font-size: 13px; }
.client-auth-footer { margin-top: auto; padding: 12px 16px; color: var(--muted); font-size: 13px; text-align: center; }
@media (min-width: 760px) {
  .client-auth { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); padding: 32px var(--qm-attendee-page-gutter); }
  .client-auth-hero { border-radius: 14px 0 0 14px; }
  .client-auth-brand { height: 100%; padding: 48px 25px; }
  .client-auth-panel { margin: 0; padding: 28px; border-radius: 0 14px 14px 0; }
}
</style>
