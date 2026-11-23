<script setup lang="ts">
import ConsoleInput from '#qiandao-console/ConsoleInput.vue'
import ConsoleFormActions from '#qiandao-console/ConsoleFormActions.vue'
import ConsoleDialog from './material/ConsoleDialog.vue'
import type { Checkpoint, Conference, QrMode } from '#shared/models'
import { displayDate, fromLocalInput, toLocalInput } from '#shared/models'

const props = defineProps<{ conference: Conference, point?: Checkpoint & { attended: number } }>()
const emit = defineEmits<{ saved: [], cancelled: [] }>()
const toast = useToast()
const qrOptions = [
  { value: 'both', label: '固定码和动态码' },
  { value: 'fixed', label: '仅固定码' },
  { value: 'dynamic', label: '仅动态码' },
] as const
function values() {
  return {
    title: props.point?.title || '',
    startsAt: toLocalInput(props.point?.startsAt || props.conference.startsAt),
    endsAt: toLocalInput(props.point?.endsAt || props.conference.endsAt),
    qrMode: (props.point?.qrMode || 'both') as QrMode,
    directEnabled: props.point?.directEnabled ?? false,
  }
}
const input = reactive(values())
const editing = ref(!props.point)
const saving = ref(false)
const revoking = ref(false)
const confirming = ref(false)
const error = ref('')
const revokeError = ref('')
const clock = useState('qm-checkpoint-clock', () => Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { clock.value = Date.now(); timer = setInterval(() => { clock.value = Date.now() }, 30000) })
onBeforeUnmount(() => clearInterval(timer))
const state = computed(() => {
  if (props.conference.endedAt || (props.point && Date.parse(props.point.endsAt) <= clock.value)) return '已截止'
  if (props.point && Date.parse(props.point.startsAt) <= clock.value && props.conference.published) return '签到中'
  return '待开始'
})
const canDisplay = computed(() => props.point && props.conference.published && !props.conference.endedAt)
const qrLink = (mode: 'fixed' | 'dynamic') => '/display/' + props.conference.id + '/' + props.point?.id + '?mode=' + mode
function edit() {
  Object.assign(input, values())
  error.value = ''
  editing.value = true
}
function cancel() {
  if (!props.point) emit('cancelled')
  else editing.value = false
}
async function save() {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    await manageRequest('save-checkpoint', { method: 'POST', query: { eventId: props.conference.id }, body: {
      ...input, id: props.point?.id, startsAt: fromLocalInput(input.startsAt), endsAt: fromLocalInput(input.endsAt),
    } })
    editing.value = false
    emit('saved')
    toast.add({ title: '签到环节已保存', color: 'success' })
  } catch (cause) {
    error.value = errorText(cause)
  } finally { saving.value = false }
}
async function revoke() {
  const point = props.point
  if (revoking.value || !point) return
  revoking.value = true
  revokeError.value = ''
  try {
    await manageRequest('revoke-qr', { method: 'POST', query: { eventId: props.conference.id }, body: { id: point.id } })
    confirming.value = false
    toast.add({ title: '旧签到码已作废', description: '请重新打印固定码或打开动态码。', color: 'success' })
  } catch (cause) {
    revokeError.value = errorText(cause)
  } finally { revoking.value = false }
}
const more = [[{ label: '作废二维码', icon: 'i-lucide-shield-off', color: 'error' as const, onSelect: () => { revokeError.value = ''; confirming.value = true } }]]
</script>

<template>
  <article class="panel checkpoint-card">
    <header class="checkpoint-header">
      <span class="checkpoint-icon"><UIcon name="i-lucide-scan-line" /></span>
      <div class="checkpoint-title">
        <h2>{{ point?.title || '新增签到环节' }}</h2>
        <p v-if="point">{{ displayDate(point.startsAt) }} 至 {{ displayDate(point.endsAt) }}</p>
      </div>
      <div v-if="point" class="checkpoint-stats">
        <span class="state-pill" :class="{ live: state === '签到中' }">{{ state }}</span>
        <span><strong>{{ point.attended }}</strong> 人已签到</span>
      </div>
    </header>

    <div v-if="point && !editing" class="checkpoint-actions">
      <span class="help">{{ qrOptions.find(item => item.value === point?.qrMode)?.label }}<template v-if="point.directEnabled"> · 手机签到</template></span>
      <div class="toolbar-actions">
        <UButton v-if="canDisplay && point.qrMode !== 'dynamic'" :to="qrLink('fixed')" target="_blank" icon="i-lucide-printer" variant="outline" color="neutral">打印固定码</UButton>
        <UButton v-if="canDisplay && point.qrMode !== 'fixed'" :to="qrLink('dynamic')" target="_blank" icon="i-lucide-qr-code" variant="soft">打开动态码</UButton>
        <UButton type="button" icon="i-lucide-pencil" color="neutral" variant="ghost" @click="edit">编辑</UButton>
        <UDropdownMenu v-if="canDisplay" :items="more" :content="{ align: 'end' }">
          <UButton type="button" icon="i-lucide-ellipsis" color="neutral" variant="ghost" aria-label="更多环节操作" />
        </UDropdownMenu>
      </div>
    </div>

    <form v-if="editing" class="checkpoint-form" @submit.prevent="save">
      <div class="checkpoint-fields">
        <UFormField label="环节名称" required><ConsoleInput v-model="input.title" size="lg" required maxlength="100" /></UFormField>
        <UFormField label="二维码类型"><AdminSelect v-model="input.qrMode" :items="qrOptions" /></UFormField>
        <UFormField label="签到开始" required><ConsoleInput v-model="input.startsAt" size="lg" type="datetime-local" required /></UFormField>
        <UFormField label="签到结束" required><ConsoleInput v-model="input.endsAt" size="lg" type="datetime-local" :min="input.startsAt" required /></UFormField>
      </div>
      <UCheckbox v-model="input.directEnabled" label="允许手机签到" description="报名来宾在签到时段内可从活动详情直接签到。" />
      <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
      <ConsoleFormActions>
        <UButton type="button" variant="ghost" color="neutral" :disabled="saving" @click="cancel">取消</UButton>
        <UButton type="submit" icon="i-lucide-save" :loading="saving">{{ point ? '保存环节' : '添加环节' }}</UButton>
      </ConsoleFormActions>
    </form>

    <ConsoleDialog v-model:open="confirming" title="作废当前签到码" :dismissible="!revoking">
      <template #body>
        <p>已印刷的固定码和正在投屏的动态码会立即失效，现有签到记录会保留。</p>
        <p v-if="revokeError" class="feedback error mt-3" role="alert">{{ revokeError }}</p>
      </template>
      <template #footer>
        <UButton type="button" color="neutral" variant="outline" :disabled="revoking" @click="confirming = false">取消</UButton>
        <UButton type="button" color="error" :loading="revoking" @click="revoke">确认作废</UButton>
      </template>
    </ConsoleDialog>
  </article>
</template>

<style scoped>
.checkpoint-header, .checkpoint-actions { display: flex; align-items: center; gap: 12px; padding: 16px 20px; }
.checkpoint-icon { flex: none; display: grid; place-items: center; width: 39px; height: 39px; border-radius: 10px; background: #eaf1ff; color: #255ac6; font-size: 19px; }
.checkpoint-title { flex: 1; min-width: 0; }
.checkpoint-title h2 { font-size: 17px; font-weight: 710; overflow-wrap: anywhere; }
.checkpoint-title p { font-size: 13px; color: var(--muted); margin-top: 3px; font-variant-numeric: tabular-nums; }
.checkpoint-stats { display: grid; justify-items: end; gap: 4px; white-space: nowrap; font-size: 13px; color: var(--muted); }
.checkpoint-stats strong { color: var(--ink); }
.checkpoint-actions { justify-content: space-between; flex-wrap: wrap; border-top: 1px solid var(--line); padding-block: 10px; }
.checkpoint-form { display: grid; gap: 16px; padding: 16px 20px 20px; border-top: 1px solid var(--line); }
.checkpoint-fields { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
@media (max-width: 650px) {
  .checkpoint-fields { grid-template-columns: 1fr; }
  .checkpoint-header, .checkpoint-actions, .checkpoint-form { padding-inline: 14px; }
}
</style>
