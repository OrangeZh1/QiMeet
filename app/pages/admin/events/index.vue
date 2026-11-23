<script setup lang="ts">
import ConsolePageHeading from '#qiandao-console/ConsolePageHeading.vue'
import ConsoleDialog from '~/components/material/ConsoleDialog.vue'
import type { EventListItem } from '#shared/models'
import type { TrashedEvent } from '#shared/event-trash'
import { displayDate } from '#shared/models'
import { activityStage, activityStages, type ActivityStage } from '#shared/activity-status'

definePageMeta({ layout: 'admin', middleware: 'admin' })
const route = useRoute()
const trashMode = computed(() => route.query.view === 'trash')
useSeoMeta({ title: () => trashMode.value ? '回收站 · 活动管理' : '活动管理' })

const request = useRequestFetch()
const { data, error, refresh } = await useAsyncData('admin-events', () => request<EventListItem[]>('/api/manage/events'))
const { data: trashData, error: trashError, pending: trashPending, refresh: refreshTrash } = await useAsyncData(
  'admin-trashed-events',
  () => request<TrashedEvent[]>('/api/manage/events', { query: { view: 'trash' } }),
  { immediate: trashMode.value },
)
const now = useState('activity-list-now', () => Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  now.value = Date.now()
  timer = setInterval(() => {
    now.value = Date.now()
    void (trashMode.value ? refreshTrash : refresh)({ dedupe: 'defer' })
  }, 45000)
})
onBeforeUnmount(() => clearInterval(timer))
const events = computed(() => (data.value || []).map(event => ({ ...event, stage: activityStage(event, now.value) })))
const stages = Object.entries(activityStages) as [ActivityStage, string][]
const filters = computed(() => [
  { key: 'all' as const, label: '全部', count: events.value.length },
  ...stages.map(([key, label]) => ({ key, label, count: events.value.filter(event => event.stage === key).length })),
])
const filter = ref<ActivityStage | 'all'>('all')
const search = ref('')
const visible = computed(() => {
  const term = search.value.trim().toLocaleLowerCase()
  return events.value.filter(event => (filter.value === 'all' || filter.value === event.stage) &&
    (!term || [event.title, event.organizer, event.venue].some(part => part.toLocaleLowerCase().includes(term))))
})
const visibleTrash = computed(() => {
  const term = search.value.trim().toLocaleLowerCase()
  return (trashData.value ?? []).filter(item => !term || item.title.toLocaleLowerCase().includes(term))
})
const restoring = ref<number>()
const purgeOpen = ref(false)
const purgeTarget = ref<TrashedEvent>()
const purging = ref(false)
const purgeError = ref('')
const toast = useToast()

watch(trashMode, (showTrash) => {
  search.value = ''
  if (showTrash) void refreshTrash({ dedupe: 'defer' })
  else void refresh({ dedupe: 'defer' })
})

function selectFilter(key: ActivityStage | 'all') {
  filter.value = key
  if (trashMode.value) void navigateTo('/admin/events')
}

async function restore(id: number) {
  if (restoring.value !== undefined || purging.value) return
  restoring.value = id
  try {
    await manageRequest('restore-event', { method: 'POST', query: { eventId: id }, body: {} })
    trashData.value = (trashData.value ?? []).filter(item => item.id !== id)
    toast.add({ title: '活动已恢复为草稿', color: 'success' })
    void refresh({ dedupe: 'defer' })
  } catch (cause) {
    toast.add({ title: errorText(cause), color: 'error' })
  } finally {
    restoring.value = undefined
  }
}

function askPurge(item: TrashedEvent) {
  if (restoring.value !== undefined || purging.value) return
  purgeTarget.value = item
  purgeError.value = ''
  purgeOpen.value = true
}

async function purge() {
  const item = purgeTarget.value
  if (!item || purging.value || restoring.value !== undefined) return
  purging.value = true
  purgeError.value = ''
  try {
    await manageRequest('purge-event', { method: 'POST', query: { eventId: item.id }, body: { deletedAt: item.deletedAt } })
    trashData.value = (trashData.value ?? []).filter(entry => entry.id !== item.id)
    purgeOpen.value = false
    toast.add({ title: '活动已永久删除', color: 'success' })
  } catch (cause) {
    purgeError.value = errorText(cause)
  } finally {
    purging.value = false
  }
}
</script>

<template>
  <div class="page-stack">
    <div class="page-heading-row">
      <ConsolePageHeading title="活动管理" description="管理活动发布、报名和现场签到。" />
      <UButton to="/admin/events/new" icon="i-lucide-plus" size="lg">新建活动</UButton>
    </div>
    <section class="panel activity-list">
      <div class="activity-toolbar">
        <div class="activity-filters" role="group" aria-label="活动状态">
          <button v-for="item in filters" :key="item.key" type="button" :aria-pressed="!trashMode && filter === item.key" @click="selectFilter(item.key)">
            {{ item.label }} <span>{{ item.count }}</span>
          </button>
          <button type="button" :aria-pressed="trashMode" @click="navigateTo('/admin/events?view=trash')">回收站</button>
        </div>
        <UInput v-model="search" class="activity-search" icon="i-lucide-search" :aria-label="trashMode ? '搜索回收站' : '搜索活动'"
          :placeholder="trashMode ? '搜索活动名称' : '搜索活动名称、主办方或会场'" maxlength="160" />
      </div>
      <template v-if="trashMode">
        <p v-if="trashError" class="feedback error panel-message" role="alert">暂时无法加载回收站。</p>
        <p v-else-if="trashPending && !trashData" class="activity-list-loading" role="status">正在加载回收站…</p>
        <div v-else-if="!visibleTrash.length" class="empty-state activity-empty">
          <UIcon name="i-lucide-trash-2" aria-hidden="true" />
          <strong>{{ trashData?.length ? '没有匹配的活动' : '回收站暂无活动' }}</strong>
        </div>
        <div v-else class="table-scroll">
          <table class="activity-table trash-table">
            <thead><tr><th>活动</th><th>活动时间</th><th>移入回收站时间</th><th class="row-cta">操作</th></tr></thead>
            <tbody>
              <tr v-for="item in visibleTrash" :key="item.id">
                <td>{{ item.title }}</td>
                <td class="date-cell">{{ displayDate(item.startsAt) }}</td>
                <td class="date-cell">{{ displayDate(item.deletedAt) }}</td>
                <td class="row-cta">
                  <div class="trash-actions">
                    <UButton type="button" size="sm" variant="outline" color="neutral" icon="i-lucide-rotate-ccw"
                      :loading="restoring === item.id" :disabled="purging || (restoring !== undefined && restoring !== item.id)"
                      @click="restore(item.id)">恢复为草稿</UButton>
                    <UButton type="button" size="sm" variant="ghost" color="error" icon="i-lucide-trash-2"
                      :disabled="restoring !== undefined || purging" @click="askPurge(item)">永久删除</UButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <p v-else-if="error" class="feedback error panel-message" role="alert">暂时无法加载活动。</p>
      <div v-else-if="!visible.length" class="empty-state activity-empty">
        <UIcon name="i-lucide-calendar-search" aria-hidden="true" />
        <strong>{{ events.length ? '没有匹配的活动' : '还没有活动' }}</strong>
      </div>
      <div v-else class="table-scroll">
        <table class="activity-table">
          <thead><tr><th>活动</th><th>状态</th><th>活动时间</th><th>报名</th><th>到场</th><th class="row-cta">操作</th></tr></thead>
          <tbody>
            <tr v-for="event in visible" :key="event.id">
              <td>
                <div class="event-cell">
                  <span class="event-thumb"><img v-if="event.coverUrl" :src="event.coverUrl" alt="" loading="lazy" /><UIcon v-else name="i-lucide-calendar-range" /></span>
                  <div><NuxtLink :to="'/admin/events/' + event.id">{{ event.title }}</NuxtLink><small>{{ event.venue || event.organizer || '会场待定' }}</small></div>
                </div>
              </td>
              <td><span class="activity-badge" :data-stage="event.stage">{{ activityStages[event.stage] }}</span></td>
              <td class="date-cell">{{ displayDate(event.startsAt) }}<small>至 {{ displayDate(event.endsAt) }}</small></td>
              <td class="count-cell">{{ event.registered }}</td><td class="count-cell">{{ event.attended }}</td>
              <td class="row-cta"><UButton :to="'/admin/events/' + event.id" icon="i-lucide-sliders-horizontal" variant="soft" color="primary">管理活动</UButton></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <ConsoleDialog v-model:open="purgeOpen" title="永久删除活动" :dismissible="!purging" :close="!purging">
      <template #body>
        <p>「{{ purgeTarget?.title }}」的活动资料、报名、签到和报名附件将永久删除，无法恢复。素材库图片会保留。</p>
        <p v-if="purgeError" class="feedback error purge-error" role="alert">{{ purgeError }}</p>
      </template>
      <template #footer>
        <div class="purge-actions">
          <UButton type="button" color="neutral" variant="outline" :disabled="purging" @click="purgeOpen = false">取消</UButton>
          <UButton type="button" color="error" :loading="purging" @click="purge">永久删除</UButton>
        </div>
      </template>
    </ConsoleDialog>
  </div>
</template>

<style scoped>
.activity-list { overflow: hidden; }
.activity-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 13px 17px; flex-wrap: wrap; }
.activity-filters { display: flex; gap: 13px; overflow-x: auto; max-width: 100%; padding: 1px 2px; }
.activity-filters button { flex: none; display: flex; align-items: center; gap: 5px; min-height: 36px; padding: 6px 1px; border-bottom: 2px solid transparent; color: var(--muted); font-size: 14px; font-weight: 570; }
.activity-filters button span { color: var(--muted); font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
.activity-filters button:hover { color: var(--forest); border-bottom-color: #d7e5ff; }
.activity-filters button[aria-pressed=true] { color: #244db4; border-bottom-color: #3162d1; font-weight: 680; }
.activity-empty { gap: 7px; padding: 22px 14px; }
.activity-empty > span { font-size: 23px; }
.activity-list-loading { padding: 17px; color: var(--muted); font-size: 14px; }
.trash-table { min-width: 590px; }
.trash-actions, .purge-actions { display: flex; justify-content: flex-end; gap: 8px; }
.purge-actions { width: 100%; }
.purge-error { margin-top: 12px; }
.activity-search { width: min(100%, 255px); }
.activity-badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 7px; padding: 4px 8px; font-size: 13px; font-weight: 640; color: #4e5d73; background: #eef1f6; white-space: nowrap; }
.activity-badge[data-stage='registering'] { color: #214eb2; background: #e8f0ff; }
.activity-badge[data-stage='scheduled'] { color: #5946a3; background: #f0edfc; }
.activity-badge[data-stage='underway'] { color: #156442; background: #e8f6ed; }
.activity-badge[data-stage='ended'] { color: #59667a; background: #edf0f4; }
.date-cell, .count-cell { font-variant-numeric: tabular-nums; white-space: nowrap; }
.date-cell small { display: block; color: var(--muted); margin-top: 3px; font-size: 12px; }
.row-cta { white-space: nowrap; }
@media (max-width: 690px) { .activity-toolbar { align-items: start; } .activity-search { width: 100%; } }
</style>
