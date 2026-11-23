<script setup lang="ts">
import type { AttendeeContacts, ContactKind } from '#shared/attendee-account'

const props = defineProps<{ kind: ContactKind, initialIdentifier?: string, currentContact?: string | null, verifyCurrent?: boolean }>()
const emit = defineEmits<{ saved: [contacts: Partial<AttendeeContacts>] }>()
const label = computed(() => props.kind === 'phone' ? '手机号' : '邮箱')
const contactIcon = computed(() => props.kind === 'phone' ? 'i-lucide-smartphone' : 'i-lucide-mail')
const identifier = ref(props.initialIdentifier || '')
const identifierInput = ref<HTMLInputElement>()
const code = ref('')
const sentTo = ref('')
const cooldown = ref(0)
const sending = ref(false)
const saving = ref(false)
const error = ref('')
let timer: ReturnType<typeof setInterval> | undefined
let disposed = false

watch(identifier, () => { code.value = ''; error.value = '' })
onBeforeUnmount(() => { disposed = true; clearInterval(timer) })

async function sendCode() {
  if (sending.value || saving.value || cooldown.value || !identifierInput.value?.reportValidity()) return
  const target = identifier.value
  sending.value = true
  error.value = ''
  try {
    const { retryAfter } = await $fetch<{ retryAfter: number }>('/api/account/contact-code', {
      method: 'POST', body: { kind: props.kind, identifier: target },
    })
    if (disposed) return
    sentTo.value = target
    code.value = ''
    const until = Date.now() + retryAfter * 1000
    cooldown.value = retryAfter
    clearInterval(timer)
    timer = setInterval(() => {
      cooldown.value = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      if (!cooldown.value) clearInterval(timer)
    }, 1000)
  } catch (cause) {
    error.value = errorText(cause, '验证码发送失败')
  } finally {
    sending.value = false
  }
}

const readyToSave = computed(() => sentTo.value === identifier.value && /^\d{6}$/.test(code.value))
async function save() {
  if (sending.value || saving.value || !readyToSave.value) return
  saving.value = true
  error.value = ''
  try {
    const contacts = await $fetch<Partial<AttendeeContacts>>('/api/account/contact', {
      method: 'POST', body: { kind: props.kind, identifier: identifier.value, code: code.value },
    })
    if (disposed) await refreshNuxtData('attendee-mine-session')
    else emit('saved', contacts)
  } catch (cause) {
    error.value = errorText(cause, '保存' + label.value + '失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="attendee-input-form contact-form" @submit.prevent="save">
    <div v-if="currentContact" class="contact-current">
      <span>当前{{ label }}</span>
      <strong>{{ currentContact }}</strong>
    </div>
    <p v-else class="attendee-helper">验证码将发送到你填写的{{ label }}。</p>

    <div class="attendee-field">
      <label for="profile-contact-identifier">{{ currentContact && !verifyCurrent ? '新' + label : label }}</label>
      <div class="contact-input-wrap">
        <UIcon :name="contactIcon" class="contact-input-icon" aria-hidden="true" />
        <input id="profile-contact-identifier" ref="identifierInput" v-model.trim="identifier" class="contact-input"
          :type="kind === 'phone' ? 'tel' : 'email'" :autocomplete="kind === 'phone' ? 'tel' : 'email'"
          :placeholder="'请输入' + (currentContact && !verifyCurrent ? '新' : '') + label"
          :maxlength="kind === 'phone' ? 16 : 254" required :readonly="sending || saving" />
      </div>
    </div>
    <div class="attendee-field">
      <label for="profile-contact-code">验证码</label>
      <div class="contact-code-row">
        <input id="profile-contact-code" v-model.trim="code" class="contact-code-input" inputmode="numeric"
          autocomplete="one-time-code" placeholder="6 位数字" pattern="[0-9]{6}" maxlength="6" required :readonly="sending || saving" />
        <UButton type="button" variant="ghost" class="contact-send" :loading="sending"
          :disabled="!identifier || saving || cooldown > 0" @click="sendCode">{{ cooldown ? cooldown + ' 秒后重发' : '获取验证码' }}</UButton>
      </div>
    </div>
    <p v-if="error" class="attendee-error" role="alert">{{ error }}</p>
    <p v-else-if="sentTo && sentTo === identifier" class="attendee-notice" role="status">验证码已提交发送，5 分钟内有效。</p>
    <UButton type="submit" class="attendee-action contact-save" :loading="saving" :disabled="sending || !readyToSave">
      {{ verifyCurrent ? '确认验证' : currentContact ? '确认更换' : '确认绑定' }}
    </UButton>
  </form>
</template>

<style scoped>
.contact-form { --contact-control-height: 48px; gap: 18px; }
.contact-current {
  display: flex; justify-content: space-between; gap: 12px; align-items: baseline;
  min-width: 0; padding-block: 4px 14px; border-bottom: 1px solid #dce4ef;
  color: var(--muted); font-size: 14px;
}
.contact-current > span { flex: none; }
.contact-current strong { min-width: 0; font-size: 16px; color: var(--ink); font-weight: 650; text-align: end; overflow-wrap: anywhere; }
.contact-input-wrap { position: relative; min-width: 0; }
.contact-input-icon {
  position: absolute; inset-inline-start: 12px; top: 50%; transform: translateY(-50%);
  color: #526785; pointer-events: none; font-size: 17px;
}
.attendee-input-form .contact-input:not([type='radio']):not([type='checkbox']) {
  min-height: var(--contact-control-height); padding-inline-start: 38px;
}
.contact-form input::placeholder { color: #586984; }
.contact-code-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch;
  border: 1px solid #cad7eb; border-radius: 9px; background: #fff;
}
.contact-code-row:focus-within { border-color: var(--qm-attendee-focus-border); box-shadow: var(--qm-attendee-focus-shadow); }
.attendee-input-form .contact-code-input:not([type='radio']):not([type='checkbox']) {
  min-width: 0; min-height: calc(var(--contact-control-height) - 2px); border: 0; background: transparent;
}
.attendee-input-form .contact-code-input:not([type='radio']):not([type='checkbox']):focus { outline: none; box-shadow: none; }
.contact-send:focus-visible { outline-offset: -3px; }
@media (forced-colors: active) {
  .contact-code-row:focus-within { outline: 2px solid Highlight; outline-offset: -1px; }
}
.contact-send {
  min-height: calc(var(--contact-control-height) - 2px); inline-size: 112px; padding-inline: 10px;
  border-inline-start: 1px solid #e2e8f2; border-radius: 0 8px 8px 0;
  white-space: nowrap; justify-content: center; color: var(--attendee-form-blue);
}
.contact-send:disabled { color: #536581; background: transparent; opacity: 1; }
.contact-save { min-height: var(--contact-control-height); margin-top: 2px; background: var(--attendee-form-blue); }
.contact-save:hover:not(:disabled) { background: #184493; }
.contact-save:disabled { color: #51617c; background: #e7edf7; opacity: 1; }
@media (max-width: 360px) {
  .contact-form { gap: 15px; }
  .contact-send { inline-size: 104px; padding-inline: 6px; }
}
</style>
