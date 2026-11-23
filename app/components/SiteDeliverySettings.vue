<script setup lang="ts">
import ConsoleInput from '#qiandao-console/ConsoleInput.vue'
import ConsolePageHeading from '#qiandao-console/ConsolePageHeading.vue'
import ConsoleFormActions from '#qiandao-console/ConsoleFormActions.vue'
import ConsoleSettingsField from '~/components/console/ConsoleSettingsField.vue'
import { deliveryCredentialFields, deliveryFields, deliverySecretLabels, type DeliveryChannel, type DeliveryKind, type DeliverySettingsView, type SmsProvider } from '#shared/delivery-settings'

const { kind } = defineProps<{ kind: DeliveryKind }>()
const isSms = kind === 'sms'
const title = isSms ? '短信配置' : '邮箱配置'
const action = 'delivery/' + kind
const options: { label: string, value: SmsProvider }[] = [
  { label: '不启用短信', value: 'disabled' },
  { label: '阿里云短信', value: 'aliyun' },
  { label: '腾讯云短信', value: 'tencent' },
]

const { data, error } = await useFetch<DeliverySettingsView>('/api/manage/' + action, { cache: 'no-store' })
if (!data.value) throw createError({ statusCode: attendeeErrorStatus(error.value) || 503, message: errorText(error.value, '暂时无法读取' + title) })

const saved = ref(data.value)
const provider = ref<SmsProvider>('disabled')
const drafts = reactive<Record<DeliveryChannel, Record<string, string>>>({ aliyun: {}, tencent: {}, smtp: {} })
const channel = computed<DeliveryChannel | null>(() => {
  if (!isSms) return 'smtp'
  return provider.value === 'disabled' ? null : provider.value
})
const saving = ref(false)
const feedback = ref('')
const failure = ref('')

function reset(view: DeliverySettingsView) {
  saved.value = view
  provider.value = view.provider || 'disabled'
  drafts.aliyun = { ...view.configs.aliyun?.values, secret: '' }
  drafts.tencent = { ...view.configs.tencent?.values, secret: '' }
  drafts.smtp = { ...view.configs.smtp?.values, secret: '' }
}
reset(saved.value)

function canKeepSecret(active: DeliveryChannel) {
  const current = saved.value.configs[active]
  const values: Record<string, string> | undefined = current?.values
  return current?.secretConfigured && deliveryCredentialFields[active].every(key => values?.[key] === drafts[active][key])
}

async function save() {
  if (saving.value) return
  saving.value = true
  feedback.value = failure.value = ''
  try {
    const body = { provider: provider.value, config: channel.value ? drafts[channel.value] : undefined }
    reset(await manageRequest<DeliverySettingsView>(action, { method: 'POST', body }))
    feedback.value = title + '已保存'
  } catch (cause) {
    failure.value = errorText(cause, '保存' + title + '失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page-stack delivery-settings-page" :class="{ 'delivery-email-page': !isSms }">
    <ConsolePageHeading :title="title" />
    <form class="form-stack" @submit.prevent="save">
      <section class="panel panel-content form-stack" :aria-label="title">
        <ConsoleSettingsField v-if="isSms" label="短信服务商" input-id="delivery-provider" required>
          <AdminSelect id="delivery-provider" v-model="provider" :items="options" :disabled="saving" size="md" />
          <p v-if="!channel" class="mt-2 text-xs text-muted">停用后，来宾无法通过短信获取验证码。</p>
        </ConsoleSettingsField>

        <div v-if="channel" class="delivery-fields">
          <ConsoleSettingsField v-for="[key, label] in Object.entries(deliveryFields[channel])" :key="channel + key"
            :label="label" :input-id="'delivery-' + key" required>
            <ConsoleInput :id="'delivery-' + key" v-model="drafts[channel][key]" variant="none" autocomplete="off"
              :inputmode="key === 'port' ? 'numeric' : undefined" :maxlength="key === 'port' ? 5 : 254"
              :placeholder="key === 'host' ? 'smtp.example.com' : undefined" required :readonly="saving" />
            <p v-if="key === 'port'" class="mt-2 text-xs text-muted">465 使用直接 TLS，其他端口要求 STARTTLS。</p>
            <p v-if="key === 'templateCode' || key === 'templateId'" class="mt-2 text-xs text-muted">
              {{ key === 'templateCode' ? '填写已审核的模板，验证码变量为 ${code}。' : '填写已审核的模板，验证码占用第 1 个变量 {1}。' }}
            </p>
          </ConsoleSettingsField>
          <ConsoleSettingsField :key="channel" :label="deliverySecretLabels[channel]" input-id="delivery-secret" :required="!canKeepSecret(channel)">
            <ConsoleInput id="delivery-secret" v-model="drafts[channel].secret" variant="none" type="password"
              maxlength="512" autocomplete="new-password" :readonly="saving" :required="!canKeepSecret(channel)"
              :placeholder="canKeepSecret(channel) ? '已配置，留空保留' : undefined" />
          </ConsoleSettingsField>
        </div>
        <p v-if="failure || feedback" class="feedback" :class="{ error: !!failure }" :role="failure ? 'alert' : 'status'">{{ failure || feedback }}</p>
        <ConsoleFormActions class="delivery-actions">
          <UButton type="submit" icon="i-lucide-save" :loading="saving">保存设置</UButton>
        </ConsoleFormActions>
      </section>
    </form>
  </div>
</template>

<style scoped>
.delivery-settings-page { width: min(100%, 55rem); margin-inline: auto; }
.delivery-settings-page :deep(.qisvc-console-settings-field) { width: min(100%, 33.5rem); margin-inline: auto; --settings-content-width: 24rem; }
.delivery-fields { display: contents; }
.delivery-actions { padding-top: 12px; }
.delivery-email-page .delivery-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
.delivery-email-page :is(.delivery-fields, .delivery-actions) { width: min(100%, 36rem); margin-inline: auto; }
.delivery-email-page :deep(.qisvc-console-settings-field) { width: 100%; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 4px; }
.delivery-email-page :deep(.qisvc-console-settings-label) { min-height: 0; justify-content: start; text-align: left; }
@media (max-width: 540px) { .delivery-email-page .delivery-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
