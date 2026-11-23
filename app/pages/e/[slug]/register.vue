<script setup lang="ts">
import { displayDate, type Registration, type RegistrationSmsStatus } from '#shared/models'

definePageMeta({ layout: false, pageTransition: false, key: route => route.fullPath })
const route = useRoute()
const { slug, path, details } = useAttendeeEvent()
const checkinQuery = attendeeCheckinQuery(route.query)
const returnToCheckIn = checkinQuery ? { path: path + '/check-in', query: checkinQuery } : undefined
const { data, error } = await details
if (data.value?.registrationOpen && !data.value.signedIn) await navigateTo(attendeeLogin(route.fullPath), { redirectCode: 302 })
if (data.value?.recognized) await navigateTo(returnToCheckIn || path + '/record', { replace: true, redirectCode: 302 })
setAttendeeErrorStatus(error.value)
useSeoMeta({ title: () => data.value ? '活动报名 · ' + data.value.conference.title : '活动报名' })
useHead({ meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }] })

const unavailableTitle = computed(() => {
  if (!data.value) return '活动暂不可查看'
  if (data.value.conference.endedAt) return '活动已结束'
  if (data.value.conference.registrationClosedAt) return '报名已截止'
  return '当前无法报名'
})
const unavailableMessage = computed(() => {
  if (!data.value) return errorText(error.value, '请向活动主办方确认链接。')
  const conference = data.value.conference
  if (conference.endedAt) return '活动已于 ' + displayDate(conference.endedAt) + ' 结束。'
  if (conference.registrationClosedAt) return '报名已于 ' + displayDate(conference.registrationClosedAt) + ' 截止。'
  return '当前不在报名时段内，可在活动详情查看报名时间。'
})

const credential = ref('')
const smsStatus = ref<RegistrationSmsStatus>()
const contactRecovery = ref(false)
const showForm = computed(() => Boolean(data.value?.registrationOpen && data.value.signedIn && !credential.value))
const keyboardOpen = ref(false)
let viewport: VisualViewport | null = null

function updateKeyboard() {
  const focused = document.activeElement
  const textControl = focused instanceof HTMLTextAreaElement ||
    focused instanceof HTMLInputElement && ['text', 'tel'].includes(focused.type)
  keyboardOpen.value = Boolean(viewport && viewport.scale === 1 && textControl &&
    window.innerHeight - viewport.height - viewport.offsetTop > 90)
}

onMounted(() => {
  viewport = window.visualViewport
  viewport?.addEventListener('resize', updateKeyboard)
})
onBeforeUnmount(() => viewport?.removeEventListener('resize', updateKeyboard))
const copyStatus = ref('')
const copying = ref(false)
function saved(result: { registration: Registration, credential?: string, smsStatus?: RegistrationSmsStatus }) {
  if (!result.credential) return
  credential.value = result.credential
  smsStatus.value = result.smsStatus
  contactRecovery.value = Boolean(result.registration.name && result.registration.phone)
  if (data.value) {
    data.value = {
      ...data.value, recognized: true,
      identityRecovery: data.value.identityRecovery || Boolean(result.registration.name && result.registration.phone),
    }
  }
  clearNuxtData(['attendee-record:' + slug, 'attendee-pending-checkins'])
}
async function copy() {
  if (copying.value) return
  copying.value = true
  try {
    await copyText(credential.value)
    copyStatus.value = '凭证已复制'
  } catch {
    copyStatus.value = '未能自动复制，请选中上方凭证后手动复制。'
  } finally {
    copying.value = false
  }
}
</script>

<template>
  <NuxtLayout
    name="attendee" toolbar-title="活动报名" :back-to-event="Boolean(data)"
    :class="{
      'signup-with-dock': showForm,
      'signup-keyboard-open': keyboardOpen,
    }"
  >
    <div class="signup-screen">

      <section v-if="credential" class="signup-receipt attendee-stack" aria-labelledby="attendee-registration-result">
        <header class="signup-receipt-heading">
          <div class="attendee-result-icon success" aria-hidden="true"><UIcon name="i-lucide-check" /></div>
          <div>
            <h1 id="attendee-registration-result" class="attendee-heading">报名成功</h1>
            <p class="attendee-subheading">{{ data?.conference.title }}</p>
          </div>
        </header>
        <div class="signup-receipt-ticket">
          <h2>报名凭证</h2>
          <code class="attendee-credential">{{ credential }}</code>
          <UButton type="button" class="signup-copy" variant="ghost" icon="i-lucide-copy" :loading="copying" @click="copy">复制</UButton>
          <p class="attendee-helper">{{ contactRecovery ? '换设备签到可用姓名和手机号。凭证用于找回并管理报名。' : '请保存凭证，换设备时可用它找回报名或签到。' }}</p>
        </div>
        <p v-if="copyStatus" role="status" class="attendee-notice">{{ copyStatus }}</p>
        <p v-if="smsStatus" role="status" class="attendee-helper">
          <template v-if="smsStatus === 'submitted'">报名短信已提交发送。</template>
          <template v-else-if="smsStatus === 'missing-phone'">还没有已验证的手机号。<NuxtLink to="/mine/profile?edit=phone" class="attendee-inline-link">验证手机号</NuxtLink>后可接收后续活动的短信。</template>
          <template v-else-if="smsStatus === 'form-phone-unverified'">报名表填写的短信收件号码与已验证的手机号不同，短信未发送。</template>
          <template v-else-if="smsStatus === 'missing-template-values'">短信未发送，通知模板缺少可用的姓名或活动标题。</template>
          <template v-else>报名短信暂未发送。你可以在「我的报名」查看记录。</template>
        </p>
        <div class="attendee-actions">
          <UButton v-if="returnToCheckIn" :to="returnToCheckIn" class="attendee-action">继续签到</UButton>
          <UButton v-else :to="path + '/record'" class="attendee-action">查看我的报名</UButton>
        </div>
      </section>

      <section v-else-if="data?.registrationOpen" class="signup-entry" aria-labelledby="attendee-register-heading">
        <h1 id="attendee-register-heading" class="attendee-form-event-title">{{ data.conference.title }}</h1>
        <p v-if="data.conference.registrationSms" class="attendee-helper signup-sms-hint">
          用于接收短信的报名手机号须与<a href="/mine/profile?edit=phone" target="_blank" rel="noopener" class="attendee-inline-link">个人资料</a>中已验证的号码一致。
        </p>
        <AttendeeForm v-if="data.signedIn" :slug="slug" :form="data.form" fixed-submit @saved="saved" />
      </section>

      <AttendeeUnavailable
        v-else class="signup-unavailable" :title="unavailableTitle"
        :message="unavailableMessage"
        :to="data ? path : undefined" :action="data ? '查看活动详情' : undefined"
      />
    </div>
  </NuxtLayout>
</template>

<style scoped>
.signup-sms-hint { margin-bottom: 14px; }
.signup-receipt-heading { display: flex; align-items: center; gap: 12px; }
.signup-receipt-heading .attendee-result-icon { flex: none; width: 44px; height: 44px; font-size: 23px; }
.signup-receipt-heading .attendee-subheading { margin-top: 2px; }
.signup-receipt-ticket {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 10px;
  padding: 13px; border: 1px solid #dbe5f5; border-radius: 8px; background: #f6f9ff;
}
.signup-receipt-ticket h2, .signup-receipt-ticket p { grid-column: 1 / -1; }
.signup-receipt-ticket h2 { font-size: 14px; color: var(--muted); font-weight: 600; }
.signup-receipt-ticket .attendee-credential {
  border: 0; background: transparent; padding: 0; text-align: left; font-size: clamp(16px, 4.5vw, 20px); font-weight: 650;
}
.signup-copy { min-height: 42px; }
.signup-receipt .attendee-actions .attendee-action { width: 100%; border-radius: 7px; background: var(--attendee-form-blue); }
</style>
