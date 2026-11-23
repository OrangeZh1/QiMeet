<script setup lang="ts">
import type { Registration } from '#shared/models'

const props = withDefaults(defineProps<{ slug: string, identityRecovery?: boolean, title?: string, submitLabel?: string }>(), {
  title: '找回报名', submitLabel: '找回报名',
})
const emit = defineEmits<{ recovered: [registration: Registration] }>()
const method = ref<'identity' | 'credential'>(props.identityRecovery ? 'identity' : 'credential')
const name = ref('')
const phone = ref('')
const credential = ref('')
const pending = ref<'identity' | 'credential' | null>(null)
const error = ref('')
function changeMethod(next: 'identity' | 'credential') {
  method.value = next
  error.value = ''
}

async function recover() {
  if (pending.value) return
  const choice = method.value
  pending.value = choice
  error.value = ''
  try {
    const body = choice === 'credential'
      ? { credential: credential.value }
      : { name: name.value, phone: phone.value }
    const view = await $fetch<Registration>(attendeeApi(props.slug, 'recover'), { method: 'POST', body })
    credential.value = ''
    emit('recovered', view)
  } catch (cause) {
    error.value = errorText(cause, '找回报名失败，请稍后再试')
  } finally {
    pending.value = null
  }
}
</script>

<template>
  <section class="attendee-card padded attendee-stack">
    <h2 class="attendee-card-title">{{ title }}</h2>
    <div v-if="identityRecovery" class="attendee-tablist" aria-label="找回方式">
      <button type="button" :aria-pressed="method === 'identity'" :disabled="!!pending" @click="changeMethod('identity')">姓名和手机号</button>
      <button type="button" :aria-pressed="method === 'credential'" :disabled="!!pending" @click="changeMethod('credential')">专属凭证</button>
    </div>
    <form class="attendee-input-form" @submit.prevent="recover">
      <template v-if="method === 'identity'">
        <div class="attendee-field">
          <label :for="'recovery-name-' + slug">报名姓名</label>
          <input :id="'recovery-name-' + slug" v-model.trim="name" required maxlength="80" autocomplete="name" />
        </div>
        <div class="attendee-field">
          <label :for="'recovery-phone-' + slug">报名手机号</label>
          <input :id="'recovery-phone-' + slug" v-model.trim="phone" required type="tel" inputmode="tel" maxlength="30" autocomplete="tel" />
        </div>
      </template>
      <div v-else class="attendee-field">
        <label :for="'recovery-credential-' + slug">报名专属凭证</label>
        <input :id="'recovery-credential-' + slug" v-model.trim="credential" maxlength="70" required autocomplete="off" spellcheck="false" autocapitalize="characters" />
      </div>
      <p v-if="error" class="attendee-error" role="alert">{{ error }}</p>
      <UButton type="submit" class="attendee-action" :loading="pending === method">{{ submitLabel }}</UButton>
    </form>
  </section>
</template>
