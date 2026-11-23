<script setup lang="ts">
import ConsoleInput from '#qiandao-console/ConsoleInput.vue'
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
const templateModes = [{ label: '姓名与活动标题', value: 'name-activity' }, { label: '无变量', value: 'plain' }]

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
  for (const key of ['aliyun', 'tencent'] as const) {
    const values = view.configs[key]?.values
    drafts[key] = { ...values, registrationTemplateMode: values?.registrationTemplateMode ?? (values?.registrationTemplate ? 'plain' : 'name-activity'), secret: '' }
  }
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
  <form class="panel delivery-settings-page" :class="{ 'delivery-email-page': !isSms }" aria-labelledby="delivery-settings-heading" @submit.prevent="save">
      <header class="panel-toolbar">
        <h1 id="delivery-settings-heading" class="page-title">{{ title }}</h1>
      </header>
      <div class="settings-section form-stack">
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
          <ConsoleSettingsField v-if="channel !== 'smtp'" :key="channel + '-registration-template'" label="报名成功短信模板" input-id="delivery-registration-template">
            <ConsoleInput id="delivery-registration-template" v-model="drafts[channel].registrationTemplate" variant="none"
              maxlength="100" autocomplete="off" :placeholder="channel === 'aliyun' ? '短信模板 CODE' : '短信模板 ID'" :readonly="saving" />
            <p class="mt-2 text-xs text-muted">填写一个已审核的报名通知模板编号。</p>
          </ConsoleSettingsField>
          <ConsoleSettingsField v-if="channel !== 'smtp'" :key="channel + '-registration-template-mode'" label="报名短信模板类型" input-id="delivery-registration-template-mode">
            <AdminSelect id="delivery-registration-template-mode" v-model="drafts[channel].registrationTemplateMode" :items="templateModes" :disabled="saving" size="md" />
            <p v-if="drafts[channel].registrationTemplateMode === 'name-activity'" class="mt-2 text-xs text-muted">{{ channel === 'aliyun' ? '模板需包含 ${name} 和 ${activity}。' : '模板需包含 {1}（姓名）和 {2}（活动标题）。' }} 活动标题最多 35 字。</p>
          </ConsoleSettingsField>
          <ConsoleSettingsField :key="channel" :label="deliverySecretLabels[channel]" input-id="delivery-secret" :required="!canKeepSecret(channel)">
            <ConsoleInput id="delivery-secret" v-model="drafts[channel].secret" variant="none" type="password"
              maxlength="512" autocomplete="new-password" :readonly="saving" :required="!canKeepSecret(channel)"
              :placeholder="canKeepSecret(channel) ? '已配置，留空保留' : undefined" />
          </ConsoleSettingsField>
        </div>
      </div>
      <footer class="panel-toolbar settings-actions">
        <p v-if="failure || feedback" class="feedback" :class="{ error: !!failure }" :role="failure ? 'alert' : 'status'">{{ failure || feedback }}</p>
        <UButton type="submit" icon="i-lucide-save" :loading="saving">保存设置</UButton>
      </footer>
  </form>
</template>

<style scoped>
.delivery-settings-page :deep(.qisvc-console-settings-field) { width: min(100%, 33.5rem); --settings-content-width: 24rem; }
.delivery-fields { display: contents; }
.delivery-email-page .delivery-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; width: min(100%, 36rem); }
.delivery-email-page :deep(.qisvc-console-settings-field) { width: 100%; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 4px; }
.delivery-email-page :deep(.qisvc-console-settings-label) { min-height: 0; justify-content: start; text-align: left; }
@media (max-width: 540px) { .delivery-email-page .delivery-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
