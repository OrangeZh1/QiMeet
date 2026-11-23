<script setup lang="ts">
import ConsoleDataTable from '#qiandao-console/ConsoleDataTable.vue'
import ConsoleDialog from './material/ConsoleDialog.vue'
import type { AdminEvent, Registration, RegistrantRow } from '#shared/models'
import { displayDate, isContentField } from '#shared/models'

type List = { total: number, rows: RegistrantRow[] }
type AuditEntry = { id: number, version: number, rowCount: number, createdAt: string }
const props = defineProps<{ event: AdminEvent }>()
const emit = defineEmits<{ countsChanged: [] }>()
const eventId = props.event.conference.id
const pointOptions = computed(() => props.event.checkpoints.map(point => ({ label: point.title, value: point.id })))
const versionOptions = computed(() => props.event.forms.map(form => ({ label: 'V' + form.version, value: form.id })))
const stateOptions = [
  { label: '所有状态', value: 'all' }, { label: '已签到', value: 'checked' }, { label: '未签到', value: 'pending' },
]
const request = useRequestFetch()
const { data: starting, error: initialError } = await useAsyncData('roster-' + eventId,
  () => request<List>('/api/manage/registrants', { query: { eventId } }),
)
const result = ref(starting.value || { total: 0, rows: [] })
const columns = [
  { accessorKey: 'name', header: '姓名' }, { accessorKey: 'phone', header: '手机号' },
  { accessorKey: 'version', header: '表单版本' }, { accessorKey: 'createdAt', header: '报名时间' },
  { id: 'checkins', header: '签到' }, { id: 'actions', header: '操作' },
]
type ListAction = 'search' | 'reset' | 'page'
const selected = reactive({ q: '', checkpointId: 0, status: 'all' })
const applied = ref({ ...selected })
const busy = reactive({ search: false, reset: false, page: false })
const page = ref(1)
const pages = computed(() => Math.max(1, Math.ceil(result.value.total / 15)))
const currentPoint = computed(() => props.event.checkpoints.find(point => point.id === applied.value.checkpointId))
const error = ref(initialError.value ? errorText(initialError.value) : '')
const notice = ref('')
let loadSequence = 0
async function load(action?: ListAction, next = page.value) {
  const serial = ++loadSequence
  if (action) busy[action] = true
  error.value = ''
  try {
    const list = await manageRequest<List>('registrants', { query: {
      eventId, page: next, q: applied.value.q || undefined,
      checkpointId: applied.value.checkpointId || undefined, status: applied.value.status,
    } })
    if (serial === loadSequence) {
      result.value = list
      page.value = next
    }
  } catch (cause) {
    if (serial === loadSequence) error.value = errorText(cause)
  } finally {
    if (action) busy[action] = false
  }
}
function search() {
  if (busy.search) return
  applied.value = { ...selected }
  void load('search', 1)
}
function reset() {
  if (busy.reset) return
  Object.assign(selected, { q: '', checkpointId: 0, status: 'all' })
  applied.value = { ...selected }
  void load('reset', 1)
}

const detail = ref<Registration>()
const detailId = ref(0)
let detailSequence = 0
async function inspect(id: number) {
  const serial = ++detailSequence
  detailId.value = id
  error.value = ''
  try {
    const record = await manageRequest<Registration>('registrant', { query: { eventId, id } })
    if (serial === detailSequence) detail.value = record
  } catch (cause) {
    if (serial === detailSequence) error.value = errorText(cause)
  } finally {
    if (serial === detailSequence) detailId.value = 0
  }
}

const manual = ref<RegistrantRow>()
const manualPoint = ref(0)
const submitting = ref(false)
function startManual(row: RegistrantRow) {
  manual.value = row
  manualPoint.value = currentPoint.value?.id || props.event.checkpoints[0]?.id || 0
  error.value = notice.value = ''
}
async function submitManual() {
  const target = manual.value
  if (!target || !manualPoint.value) return
  submitting.value = true
  error.value = notice.value = ''
  try {
    const response = await manageRequest<{ checkedAt: string, repeated: boolean }>('manual-checkin', {
      method: 'POST', query: { eventId }, body: { registrationId: target.id, checkpointId: manualPoint.value },
    })
    notice.value = response.repeated ? '该来宾已签到 · ' + displayDate(response.checkedAt) : '已补签 · ' + registrationName(target)
    manual.value = undefined
    await load()
    if (detail.value?.id === target.id) {
      detail.value = await manageRequest<Registration>('registrant', { query: { eventId, id: target.id } })
    }
    emit('countsChanged')
  } catch (cause) { error.value = errorText(cause) }
  finally { submitting.value = false }
}

const version = ref(props.event.forms[0]?.id || 0)
const selectedForm = computed(() => props.event.forms.find(form => form.id === version.value))
const hasIdentity = computed(() => selectedForm.value?.fields.some(field => field.type === 'identity'))
const exportOpen = ref(false)
const audit = ref<AuditEntry[]>()
const loadingAudit = ref(false)
const exporting = ref(false)
const exportConfirm = ref(false)
const exportError = ref('')
const exportNotice = ref('')
const auditError = ref('')
let auditSequence = 0
const baseExport = '/api/manage/export?eventId=' + eventId
function resetExportSelection() {
  exportConfirm.value = false
  exportError.value = exportNotice.value = ''
}
function openExports() {
  resetExportSelection()
  exportOpen.value = true
}
async function loadAudit(interactive = false) {
  if (interactive && loadingAudit.value) return
  if (interactive) loadingAudit.value = true
  const serial = ++auditSequence
  auditError.value = ''
  try {
    const entries = await manageRequest<AuditEntry[]>('audit', { query: { eventId } })
    if (serial === auditSequence) audit.value = entries
  } catch (cause) {
    if (serial === auditSequence) auditError.value = errorText(cause, '无法读取导出记录，请重试')
  } finally {
    if (interactive) loadingAudit.value = false
  }
}
async function exportFull() {
  const form = selectedForm.value
  if (!form || !hasIdentity.value || !exportConfirm.value || exporting.value) return
  exporting.value = true
  exportError.value = exportNotice.value = ''
  try {
    const blob = await $fetch<Blob>('/api/manage/export-full', {
      method: 'POST', query: { eventId }, body: { formId: form.id }, responseType: 'blob',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = props.event.conference.slug + '-v' + form.version + '-full.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    exportConfirm.value = false
    exportNotice.value = '完整明细已导出并记录'
    if (audit.value || loadingAudit.value) void loadAudit()
  } catch (cause) { exportError.value = errorText(cause, '完整导出失败，请重试') }
  finally { exporting.value = false }
}
const registrationName = (record: { id: number, name: string | null }) => record.name?.trim() || '报名 #' + record.id
const fieldValue = (value: string | string[] | undefined) => Array.isArray(value) ? value.join('、') : value || '—'
const visibleAttendance = (row: RegistrantRow) => currentPoint.value
  ? row.attendance.filter(point => point.id === currentPoint.value?.id)
  : row.attendance
const tableRows = computed(() => result.value.rows as unknown as Record<string, unknown>[])
</script>

<template>
  <div class="page-stack">
    <section class="panel" aria-labelledby="registrant-list-heading">
      <div class="panel-toolbar roster-heading">
        <div class="roster-title">
          <h2 id="registrant-list-heading" class="section-title">报名名单</h2>
          <p class="muted-text">报名 {{ event.registered }} 人 · 到场 {{ event.attended }} 人</p>
        </div>
        <UButton type="button" color="neutral" variant="outline" icon="i-lucide-download" @click="openExports">导出</UButton>
      </div>
      <p v-if="error || notice" class="feedback roster-feedback" :class="{ error }" :role="error ? 'alert' : 'status'">{{ error || notice }}</p>
      <form class="panel-toolbar roster-filters" @submit.prevent="search">
        <div class="toolbar-actions">
          <UInput v-model="selected.q" maxlength="120" icon="i-lucide-search" aria-label="搜索姓名或手机号" placeholder="姓名或手机号" />
          <AdminSelect v-model="selected.checkpointId" :items="[{ label: '所有环节', value: 0 }, ...pointOptions]" compact size="md" aria-label="签到环节" />
          <AdminSelect v-model="selected.status" :items="stateOptions" compact size="md" aria-label="签到状态" />
        </div>
        <div class="toolbar-actions">
          <UButton type="submit" :loading="busy.search">搜索</UButton>
          <UButton type="button" color="neutral" variant="outline" :loading="busy.reset" @click="reset">重置</UButton>
        </div>
      </form>
      <div class="table-scroll">
        <ConsoleDataTable :data="tableRows" :columns="columns" :show-sequence="false" :client-pagination="false" empty-title="暂无匹配的报名">
          <template #name-cell="{ row }">{{ registrationName(row.original) }}</template>
          <template #phone-cell="{ row }">{{ row.original.phone || '—' }}</template>
          <template #version-cell="{ row }">V{{ row.original.version }}</template>
          <template #createdAt-cell="{ row }">{{ displayDate(row.original.createdAt) }}</template>
          <template #checkins-cell="{ row }">
            <div class="toolbar-actions">
              <span v-for="point in visibleAttendance(row.original)" :key="point.id" class="state-pill" :class="{ live: point.checkedAt }" :title="point.checkedAt ? displayDate(point.checkedAt) : '未签到'">{{ point.title }} · {{ point.checkedAt ? '已签到' : '未签到' }}</span>
            </div>
          </template>
          <template #actions-cell="{ row }">
            <div class="toolbar-actions">
              <UButton size="sm" variant="ghost" color="neutral" :loading="detailId === row.original.id" @click="inspect(row.original.id)">详情</UButton>
              <UButton size="sm" variant="ghost" :disabled="submitting" @click="startManual(row.original)">补签</UButton>
            </div>
          </template>
        </ConsoleDataTable>
      </div>
      <div class="panel-toolbar">
        <p class="help">共 {{ result.total }} 条 · 第 {{ page }} / {{ pages }} 页</p>
        <div class="toolbar-actions">
          <UButton color="neutral" variant="outline" :disabled="page <= 1 || busy.page" @click="load('page', page - 1)">上一页</UButton>
          <UButton color="neutral" variant="outline" :disabled="page >= pages || busy.page" @click="load('page', page + 1)">下一页</UButton>
        </div>
      </div>
    </section>
    <form v-if="manual" class="panel panel-content form-stack reveal-panel" @submit.prevent="submitManual">
      <h2 class="section-title">人工补签 · {{ registrationName(manual) }}</h2>
      <UFormField label="签到环节"><AdminSelect v-model="manualPoint" :items="pointOptions" /></UFormField>
      <div class="toolbar-actions">
        <UButton type="submit" :loading="submitting" :disabled="!manualPoint">确认补签</UButton>
        <UButton type="button" color="neutral" variant="ghost" :disabled="submitting" @click="manual = undefined">取消</UButton>
      </div>
    </form>
    <section v-if="detail" class="panel panel-content form-stack reveal-panel">
      <div class="split-row"><h2 class="section-title">{{ registrationName(detail) }} · 报名详情</h2><UButton color="neutral" variant="ghost" @click="detail = undefined">关闭详情</UButton></div>
      <dl class="detail-list">
        <div><dt>报名手机号</dt><dd>{{ detail.phone || '—' }}</dd></div>
        <div><dt>表单版本</dt><dd>V{{ detail.form.version }}</dd></div>
        <div><dt>报名时间</dt><dd>{{ displayDate(detail.createdAt) }}</dd></div>
        <div><dt>修改次数</dt><dd>{{ detail.edits }}</dd></div>
        <div v-for="field in detail.form.fields.filter(field => !isContentField(field.type))" :key="field.id">
          <dt>{{ field.label }}</dt>
          <dd v-if="field.type === 'file' || field.type === 'image'">
            <a v-for="file in detail.attachments.filter(file => file.fieldId === field.id)" :key="file.id" class="breadcrumb-link" :href="'/api/manage/attachment?eventId=' + eventId + '&id=' + detail.id + '&attachmentId=' + file.id" download>{{ file.filename }}</a>
            <span v-if="!detail.attachments.some(file => file.fieldId === field.id)">—</span>
          </dd>
          <dd v-else>{{ fieldValue(detail.answers[field.id]) }}</dd>
        </div>
      </dl>
      <ul class="toolbar-actions">
        <li v-for="point in detail.attendance" :key="point.id" class="state-pill" :class="{ live: point.checkedAt }">{{ point.title }} · {{ point.checkedAt ? displayDate(point.checkedAt) : '未签到' }}</li>
      </ul>
    </section>
    <ConsoleDialog v-model:open="exportOpen" title="导出报名名单" :dismissible="!exporting" :close="!exporting">
      <template #body>
        <div class="form-stack">
          <div class="export-row">
            <div>
              <h3>活动汇总</h3>
              <p class="help">包含所有报名及各环节签到结果。</p>
            </div>
            <UButton :href="baseExport" external icon="i-lucide-download" variant="outline" color="neutral">下载汇总 CSV</UButton>
          </div>
          <div class="export-row">
            <UFormField label="明细表单版本" class="export-version">
              <AdminSelect v-model="version" :items="versionOptions" :disabled="exporting" @update:model-value="resetExportSelection" />
            </UFormField>
            <UButton v-if="selectedForm" :href="baseExport + '&formId=' + version" external icon="i-lucide-download" variant="outline" color="neutral">下载明细 CSV</UButton>
          </div>
          <div class="toolbar-actions">
            <UButton v-if="hasIdentity && !exportConfirm" color="warning" variant="outline" icon="i-lucide-lock-keyhole" @click="exportConfirm = true">导出完整身份证号</UButton>
            <UButton color="neutral" variant="ghost" :loading="loadingAudit" @click="loadAudit(true)">查看完整导出记录</UButton>
          </div>
          <div v-if="exportConfirm && hasIdentity" class="feedback split-row">
            <span>完整导出包含身份证原号，导出操作会记录。</span>
            <div class="toolbar-actions">
              <UButton color="warning" :loading="exporting" @click="exportFull">确认完整导出</UButton>
              <UButton color="neutral" variant="ghost" :disabled="exporting" @click="exportConfirm = false">取消</UButton>
            </div>
          </div>
          <p v-if="exportError || exportNotice" class="feedback" :class="{ error: exportError }" :role="exportError ? 'alert' : 'status'">{{ exportError || exportNotice }}</p>
          <p v-if="auditError" class="feedback error" role="alert">{{ auditError }}</p>
          <ul v-else-if="audit?.length" class="audit-list">
            <li v-for="entry in audit" :key="entry.id">{{ displayDate(entry.createdAt) }} · V{{ entry.version }} · {{ entry.rowCount }} 条</li>
          </ul>
          <p v-else-if="audit" class="help">暂无完整导出记录</p>
        </div>
      </template>
    </ConsoleDialog>
  </div>
</template>

<style scoped>
.roster-heading { padding-bottom: 8px; }
.roster-title { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; }
.roster-filters { padding-top: 8px; }
.roster-feedback { margin: 0 20px 8px; }
.export-row { display: flex; place-content: space-between; align-items: end; flex-wrap: wrap; gap: 8px; }
.export-row h3 { font-size: 14px; font-weight: 650; }
.export-version { flex: 1 1 10rem; max-width: 15rem; }
</style>
