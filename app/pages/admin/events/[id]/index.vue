<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import ConsoleDialog from '~/components/material/ConsoleDialog.vue'
import type { AdminEvent, FormVersion, QrDisplay } from '#shared/models'
import { displayDate } from '#shared/models'
definePageMeta({ layout: 'admin', middleware: 'admin', key: route => route.path })
const route = useRoute()
const id = Number(route.params.id)
if (!Number.isSafeInteger(id) || id <= 0) throw createError({ statusCode: 404, message: '活动不存在' })
const request = useRequestFetch()
const { data, error, refresh } = await useAsyncData('admin-event-' + id, () => request<AdminEvent>('/api/manage/event', { query: { eventId: id } }))
if (!data.value) throw createError({ statusCode: error.value?.statusCode || 503, message: errorText(error.value, '无法加载活动') })

const tabs = { analytics: '活动数据', settings: '活动设置', agenda: '活动流程', form: '报名表', checkpoints: '签到环节', roster: '报名名单' } as const
type Tab = keyof typeof tabs
const tab = computed<Tab>(() => typeof route.query.tab === 'string' && Object.hasOwn(tabs, route.query.tab) ? route.query.tab as Tab : 'analytics')
const conference = computed(() => data.value!.conference)
useSeoMeta({ title: () => conference.value.title + ' · ' + tabs[tab.value] })
const publishBusy = ref(false)
const addPoint = ref(false)
const toast = useToast()
const shareDialog = ref(false)
const shareQr = ref<Pick<QrDisplay, 'url' | 'dataUrl'> | null>(null)
const sharePending = ref(false)
const shareError = ref('')
const copyingShare = ref(false)

type CloseScope = 'registration' | 'event'
type EventOperation = CloseScope | 'delete'
const closeScope = ref<EventOperation>('registration')
const closeDialog = ref(false)
const closing = ref(false)
const closeError = ref('')
const closeActions = {
  registration: {
    label: '提前截止报名', confirm: '确认截止报名', icon: 'i-lucide-user-round-x',
    description: '立即停止新的报名。已报名的参会者仍可按签到环节设置自助签到。',
    success: '报名已提前截止',
  },
  event: {
    label: '提前结束活动', confirm: '确认结束活动', icon: 'i-lucide-circle-stop',
    description: '立即停止报名和自助签到。已有报名和签到记录仍可查看。',
    success: '活动已提前结束',
  },
  delete: {
    label: '删除活动', confirm: '移入回收站', icon: 'i-lucide-trash-2',
    description: '移入回收站后，报名和签到将对外关闭。活动资料、报名和签到记录会保留，可恢复为草稿。',
    success: '活动已移入回收站',
  },
} as const
const chosenAction = computed(() => closeActions[closeScope.value])
const stateItems = computed<DropdownMenuItem[][]>(() => {
  const item = conference.value
  const deleteItems: DropdownMenuItem[] = [
    { label: closeActions.delete.label, icon: closeActions.delete.icon, color: 'error', onSelect: () => openClose('delete') },
  ]
  if (!item.published) return [deleteItems]
  const publishItems: DropdownMenuItem[] = [
    { label: '取消发布', icon: 'i-lucide-eye-off', onSelect: () => { void publish() } },
  ]
  if (item.endedAt) return [publishItems, deleteItems]
  const enabled: CloseScope[] = []
  const now = Date.now()
  if (!item.registrationClosedAt && Date.parse(item.registrationEndsAt) > now) enabled.push('registration')
  if (Date.parse(item.endsAt) > now) enabled.push('event')
  if (!enabled.length) return [publishItems, deleteItems]
  return [publishItems, enabled.map(scope => ({
    label: closeActions[scope].label,
    icon: closeActions[scope].icon,
    color: scope === 'event' ? 'error' : 'neutral',
    onSelect: () => openClose(scope),
  })), deleteItems]
})

function openClose(scope: EventOperation) {
  if (closing.value) return
  closeScope.value = scope
  closeError.value = ''
  closeDialog.value = true
}

async function confirmClose() {
  if (closing.value) return
  const scope = closeScope.value
  closing.value = true
  closeError.value = ''
  try {
    if (scope === 'delete') {
      await manageRequest('delete-event', { method: 'POST', query: { eventId: id }, body: {} })
      closeDialog.value = false
      clearNuxtData(['admin-events', 'admin-trashed-events', 'operations-overview'])
      toast.add({ title: closeActions.delete.success, color: 'success' })
      await navigateTo('/admin/events?view=trash')
      return
    }
    const updatedConference = await manageRequest<AdminEvent['conference']>('close', {
      method: 'POST', query: { eventId: id }, body: { scope },
    })
    if (data.value) data.value = { ...data.value, conference: updatedConference }
    closeDialog.value = false
    toast.add({ title: closeActions[scope].success, color: 'success' })
    void refreshNuxtData('event-analytics-' + id)
  } catch (cause) {
    closeError.value = errorText(cause)
  } finally {
    closing.value = false
  }
}

async function publish() {
  if (publishBusy.value || closing.value) return
  publishBusy.value = true
  try {
    const { published } = await manageRequest<{ published: boolean }>('publish', {
      method: 'POST', query: { eventId: id }, body: { published: !conference.value.published },
    })
    if (data.value) data.value = { ...data.value, conference: { ...data.value.conference, published } }
    toast.add({ title: published ? '活动已发布' : '活动已取消发布', color: 'success' })
  } catch (cause) { toast.add({ title: errorText(cause), color: 'error' }) }
  finally { publishBusy.value = false }
}
async function share() {
  shareDialog.value = true
  if (sharePending.value) return
  sharePending.value = true
  shareError.value = ''
  shareQr.value = null
  try {
    shareQr.value = await manageRequest<Pick<QrDisplay, 'url' | 'dataUrl'>>('registration-qr', { query: { eventId: id } })
  } catch (cause) {
    shareError.value = errorText(cause, '未能生成活动二维码')
  } finally {
    sharePending.value = false
  }
}
async function copyEventLink() {
  if (!shareQr.value || copyingShare.value) return
  copyingShare.value = true
  try {
    await copyText(shareQr.value.url)
    toast.add({ title: '活动链接已复制', color: 'success' })
  } catch { toast.add({ title: '无法复制，请手动复制活动链接', color: 'error' }) }
  finally { copyingShare.value = false }
}
async function updated() {
  await refresh()
  toast.add({ title: '活动已保存', color: 'success' })
}
function formSaved(form: FormVersion) { data.value?.forms.unshift(form) }
function registrationSmsSaved(enabled: boolean) {
  if (data.value) data.value = { ...data.value, conference: { ...data.value.conference, registrationSms: enabled } }
}
function agendaSaved(agenda: AdminEvent['conference']['agenda']) {
  if (data.value) data.value = { ...data.value, conference: { ...data.value.conference, agenda } }
}
</script>

<template>
  <div v-if="data" class="page-stack">
    <NuxtLink class="breadcrumb-link" to="/admin/events"><UIcon name="i-lucide-chevron-left" /> 活动管理</NuxtLink>
    <div class="page-heading-row">
      <header class="page-heading activity-heading">
        <div class="activity-title">
          <h1>{{ conference.title }}</h1>
          <span class="state-pill" :class="{ live: conference.published }">{{ conference.published ? '已发布' : '草稿' }}</span>
          <span v-if="conference.endedAt" class="state-pill" :title="displayDate(conference.endedAt)">已提前结束</span>
          <span v-else-if="conference.registrationClosedAt" class="state-pill" :title="displayDate(conference.registrationClosedAt)">报名已提前截止</span>
        </div>
        <p>{{ displayDate(conference.startsAt) }}<template v-if="conference.venue"> · {{ conference.venue }}</template></p>
      </header>
      <div class="toolbar-actions">
        <UButton v-if="conference.published" :to="'/e/' + conference.slug" target="_blank" color="neutral" variant="outline" icon="i-lucide-external-link">查看活动页</UButton>
        <UButton v-if="conference.published" type="button" color="neutral" variant="outline" icon="i-lucide-qr-code" @click="share">活动二维码</UButton>
        <UButton v-if="!conference.published" color="primary" :loading="publishBusy" @click="publish">发布活动</UButton>
        <UDropdownMenu :items="stateItems" :disabled="publishBusy || closing" :content="{ align: 'end' }">
          <UButton v-if="conference.published" type="button" color="neutral" variant="outline" trailing-icon="i-lucide-chevron-down"
            :loading="publishBusy">活动状态</UButton>
          <UButton v-else type="button" color="neutral" variant="outline" icon="i-lucide-ellipsis" aria-label="更多活动操作" />
        </UDropdownMenu>
      </div>
    </div>
    <ConsoleDialog v-model:open="shareDialog" title="活动二维码" description="来宾扫码打开活动详情，可在详情页报名。">
      <template #body>
        <p v-if="sharePending" class="help py-8 text-center" role="status">正在生成活动二维码…</p>
        <div v-else-if="shareError" class="grid gap-3">
          <p class="feedback error" role="alert">{{ shareError }}</p>
          <UButton class="justify-self-start" type="button" variant="outline" @click="share">重试</UButton>
        </div>
        <div v-else-if="shareQr" class="grid gap-4">
          <img :src="shareQr.dataUrl" alt="活动二维码" width="240" height="240" class="mx-auto max-w-full rounded-lg border border-default" />
          <UInput :model-value="shareQr.url" readonly aria-label="活动链接" />
        </div>
      </template>
      <template #footer>
        <div v-if="shareQr" class="closure-actions">
          <UButton :href="shareQr.dataUrl" :download="conference.slug + '-活动二维码.png'" color="neutral" variant="outline" icon="i-lucide-download">下载二维码</UButton>
          <UButton type="button" icon="i-lucide-link" :loading="copyingShare" @click="copyEventLink">复制活动链接</UButton>
        </div>
      </template>
    </ConsoleDialog>
    <ConsoleDialog v-model:open="closeDialog" :title="chosenAction.label" :dismissible="!closing" :close="!closing">
      <template #body>
        <p>{{ chosenAction.description }}</p>
        <p v-if="closeError" class="feedback error closure-error" role="alert">{{ closeError }}</p>
      </template>
      <template #footer>
        <div class="closure-actions">
          <UButton type="button" color="neutral" variant="outline" :disabled="closing" @click="closeDialog = false">取消</UButton>
          <UButton type="button" color="error" :loading="closing" @click="confirmClose">{{ chosenAction.confirm }}</UButton>
        </div>
      </template>
    </ConsoleDialog>
    <div class="segment" aria-label="活动管理分区">
      <button v-for="(label,key) in tabs" :key="key" type="button" :aria-pressed="tab === key" @click="navigateTo({ query: key === 'analytics' ? {} : { tab: key } })">{{ label }}</button>
    </div>
    <Transition name="qm-panel">
    <div :key="tab" class="page-stack">
    <EventAnalytics v-if="tab === 'analytics'" :conference="conference" />
    <EventSettings v-else-if="tab === 'settings'" :conference="conference" @saved="updated" />
    <EventAgendaEditor v-else-if="tab === 'agenda'" :event-id="id" :initial="conference.agenda" :starts-at="conference.startsAt" @saved="agendaSaved" />
    <FormBuilder v-else-if="tab === 'form'" :event-id="id" :forms="data.forms" :activity-title="conference.title"
      :registration-sms="conference.registrationSms" @saved="formSaved" @notification-saved="registrationSmsSaved" />
    <div v-else-if="tab === 'checkpoints'" class="page-stack">
      <div class="split-row">
        <p class="help">按环节配置签到时段和现场二维码。</p>
        <UButton :disabled="addPoint" icon="i-lucide-plus" variant="outline" @click="addPoint = true">新增环节</UButton>
      </div>
      <CheckpointEditor v-if="addPoint" :conference="conference" @saved="addPoint = false; refresh()" @cancelled="addPoint = false" />
      <CheckpointEditor v-for="point in data.checkpoints" :id="'checkpoint-' + point.id" :key="point.id" :point="point" :conference="conference" @saved="refresh()" />
    </div>
    <RegistrantPanel v-else :event="data" @counts-changed="refresh()" />
    </div>
    </Transition>
  </div>
</template>

<style scoped>
.activity-heading { min-width: 0; }
.activity-title { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 9px; }
.activity-title h1 { overflow-wrap: anywhere; }
.closure-error { margin-top: 12px; }
.closure-actions { display: flex; justify-content: flex-end; gap: 8px; width: 100%; }
</style>
