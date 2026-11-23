<script setup lang="ts">
import ConsoleInput from '#qiandao-console/ConsoleInput.vue'
import ConsoleListPagination from './console/ConsoleListPagination.vue'
import { displayDate, type Material } from '#shared/models'
import { materialKinds, materialPolicy, type MaterialKind } from '#shared/materials'
import ConsoleDialog from './material/ConsoleDialog.vue'
import { uploadLibraryMaterial } from '~/composables/useMaterialUpload'
import ImageViewer from './material/ImageViewer.vue'

type MaterialPage = { items: Material[], total: number, page: number }
const props = defineProps<{
  picking?: boolean
  pickerKind?: 'image' | 'video'
  selectedId?: string | null
  selectedIds?: readonly string[]
  selectionLimit?: number
}>()
const emit = defineEmits<{
  'update:selectedId': [id: string]
  'update:selectedIds': [ids: string[]]
  busy: [value: boolean]
}>()
const selected = (id: string) => props.selectedIds ? props.selectedIds.includes(id) : props.selectedId === id
const selectionIsFull = computed(() => Boolean(props.selectedIds && props.selectionLimit && props.selectedIds.length >= props.selectionLimit))

function selectMaterial(id: string, toggle = false) {
  if (!props.selectedIds) {
    emit('update:selectedId', id)
  } else if (selected(id)) {
    if (toggle) emit('update:selectedIds', props.selectedIds.filter(value => value !== id))
  } else if (!selectionIsFull.value) {
    emit('update:selectedIds', [...props.selectedIds, id])
  }
}

const request = useRequestFetch()
const toast = useToast()
const initialKind = props.picking ? props.pickerKind ?? 'image' : 'image'
const kind = ref<MaterialKind>(initialKind)
const policy = computed(() => materialPolicy[kind.value])
const kindLoading = ref(false)
const dataKey = (props.picking ? 'material-picker:' : 'material-library:') + useId()
const initial = useAsyncData(dataKey, (_app, { signal }) => request<MaterialPage>('/api/manage/materials', { signal, query: { kind: initialKind } }), {
  lazy: props.picking,
})
const empty: MaterialPage = { items: [], total: 0, page: 1 }
const loaded = ref<MaterialPage>()
const result = computed(() => loaded.value ?? (kind.value === initialKind ? initial.data.value : undefined) ?? empty)
const initialLoading = computed(() => kindLoading.value || (kind.value === initialKind && !loaded.value
  && (initial.status.value === 'idle' || initial.status.value === 'pending')))
const searchText = ref('')
const searchTerm = ref('')
const error = ref('')
const visibleError = computed(() => error.value || (kind.value === initialKind && !loaded.value && initial.error.value ? errorText(initial.error.value, '素材加载失败') : ''))
const emptyLabel = computed(() => visibleError.value ? '素材暂不可用' : searchTerm.value ? '没有匹配的素材' : '暂无素材')
const searchAction = ref<'search' | 'reset'>()
const pageAction = ref<'previous' | 'next' | null>(null)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement>()
const preview = ref<Material>()
const previewOpen = ref(false)
const deleteOpen = ref(false)
const deleteTarget = ref<Material>()
const deleting = ref(false)
const deleteError = ref('')
const view = ref<'grid' | 'list'>('list')
const totalPages = computed(() => Math.max(1, Math.ceil(result.value.total / 12)))
let latestRequest = 0

async function load(page: number, term = searchTerm.value) {
  const requestId = ++latestRequest
  error.value = ''
  try {
    const next = await request<MaterialPage>('/api/manage/materials', {
      query: { kind: kind.value, page, q: term || undefined },
    })
    if (requestId !== latestRequest) return false
    loaded.value = next
    searchTerm.value = term
    return true
  } catch (cause) {
    if (requestId === latestRequest) error.value = errorText(cause, '素材加载失败')
    return false
  }
}

async function switchKind(value: MaterialKind) {
  if (props.picking || kind.value === value || kindLoading.value || uploading.value || deleting.value) return
  kind.value = value
  loaded.value = undefined
  searchText.value = searchTerm.value = ''
  kindLoading.value = true
  try {
    await load(1)
  } finally {
    kindLoading.value = false
  }
}

async function search(action: 'search' | 'reset' = 'search') {
  if (searchAction.value || kindLoading.value) return
  const draft = searchText.value
  searchAction.value = action
  try {
    const applied = await load(1, action === 'reset' ? '' : draft.trim())
    if (applied && action === 'reset' && searchText.value === draft) searchText.value = ''
  } finally {
    searchAction.value = undefined
  }
}

async function turn(direction: 'previous' | 'next') {
  if (pageAction.value || searchAction.value || kindLoading.value) return
  const page = result.value.page + (direction === 'next' ? 1 : -1)
  if (page < 1 || page > totalPages.value) return
  pageAction.value = direction
  try {
    await load(page)
  } finally {
    pageAction.value = null
  }
}

async function upload(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || uploading.value || kindLoading.value) return
  uploading.value = true
  emit('busy', true)
  error.value = ''
  try {
    const material = await uploadLibraryMaterial(file, kind.value)
    toast.add({ title: '素材已上传', color: 'success' })
    if (props.picking) selectMaterial(material.id)
    const draft = searchText.value
    if (await load(1, '') && searchText.value === draft) searchText.value = ''
  } catch (cause) {
    error.value = errorText(cause, cause instanceof Error ? cause.message : '素材上传失败')
  } finally {
    uploading.value = false
    emit('busy', false)
  }
}

function choose(item: Material) {
  if (props.picking) {
    selectMaterial(item.id, true)
  } else {
    preview.value = item
    previewOpen.value = true
  }
}

const sizeLabel = (bytes: number) => bytes >= 1024 * 1024
  ? (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  : (bytes / 1024).toFixed(1) + ' KB'
const formatLabel = (material: Material) => material.name.split('.').at(-1)?.toUpperCase() || materialPolicy[material.kind].label
const kindIcons: Record<MaterialKind, string> = { image: 'i-lucide-images', file: 'i-lucide-file-text', video: 'i-lucide-clapperboard' }
const downloadUrl = (item: Material) => item.url + '&download=1'

function askDelete(item: Material) {
  deleteTarget.value = item
  deleteError.value = ''
  deleteOpen.value = true
}
async function confirmDelete() {
  const item = deleteTarget.value
  if (!item || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await $fetch('/api/manage/materials/delete', { method: 'POST', query: { id: item.id } })
    deleteOpen.value = false
    toast.add({ title: '素材已删除', color: 'success' })
    const nextPage = result.value.items.length === 1 ? Math.max(1, result.value.page - 1) : result.value.page
    await load(nextPage)
  } catch (cause) {
    deleteError.value = errorText(cause, '素材删除失败，请重试')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="material-browser" :class="{ 'panel list-panel material-panel': !picking }" :aria-label="picking ? policy.label + '素材' : undefined"
    :aria-labelledby="picking ? undefined : 'materials-heading'">
    <input ref="fileInput" type="file" :accept="policy.accept" hidden @change="upload" />
    <header v-if="!picking" class="panel-toolbar list-heading">
      <h1 id="materials-heading" class="page-title">素材库</h1>
      <UButton type="button" icon="i-lucide-upload" :loading="uploading" :disabled="kindLoading" @click="fileInput?.click()">本地上传</UButton>
    </header>
    <form v-if="!picking" class="panel-toolbar list-filters" @submit.prevent="search()">
      <UInput v-model="searchText" class="list-search" placeholder="素材名称" aria-label="素材名称" maxlength="180" />
      <div class="toolbar-actions">
        <UButton type="submit" icon="i-lucide-search" :loading="searchAction === 'search'" :disabled="kindLoading || !!searchAction">搜索</UButton>
        <UButton type="button" variant="outline" color="neutral" icon="i-lucide-rotate-ccw" :loading="searchAction === 'reset'"
          :disabled="kindLoading || !!searchAction || (!searchText && !searchTerm && result.page === 1)" @click="search('reset')">重置</UButton>
      </div>
    </form>
    <div v-if="!picking" class="panel-toolbar material-display-toolbar">
      <div class="material-kind-tabs" role="group" aria-label="素材类型">
        <button v-for="item in materialKinds" :key="item" type="button" class="material-kind"
          :aria-pressed="kind === item" :disabled="kindLoading || uploading || deleting" @click="switchKind(item)">
          {{ materialPolicy[item].label }}
        </button>
      </div>
      <div class="material-views" role="group" aria-label="素材视图">
        <UButton type="button" icon="i-lucide-list" color="neutral" :variant="view === 'list' ? 'soft' : 'ghost'"
          aria-label="列表视图" title="列表视图" :aria-pressed="view === 'list'" @click="view = 'list'" />
        <UButton type="button" icon="i-lucide-layout-grid" color="neutral" :variant="view === 'grid' ? 'soft' : 'ghost'"
          aria-label="网格视图" title="网格视图" :aria-pressed="view === 'grid'" @click="view = 'grid'" />
      </div>
    </div>
    <div v-else class="material-toolbar">
      <UButton type="button" icon="i-lucide-upload" :loading="uploading" @click="fileInput?.click()">上传{{ policy.label }}</UButton>
      <form class="material-search" @submit.prevent="search()">
        <ConsoleInput v-model="searchText" placeholder="请输入名称" aria-label="素材名称" maxlength="180" />
        <UButton type="submit" icon="i-lucide-search" color="neutral" variant="outline" aria-label="搜索素材" title="搜索素材"
          :loading="searchAction === 'search'" />
      </form>
    </div>
    <div class="material-meta" :class="{ 'material-library-meta': !picking }">
      <span v-if="picking && !initialLoading">共 {{ result.total }} {{ kind === 'image' ? '张' : '个' }}{{ policy.label }}</span>
      <span class="material-policy">{{ policy.formats }} · 最大 {{ policy.maxMb }} MB</span>
    </div>
    <p v-if="visibleError" class="feedback error" :class="{ 'panel-message': !picking }" role="alert">{{ visibleError }}</p>

    <div v-if="initialLoading" class="material-empty" role="status">
      <UIcon name="i-lucide-loader-circle" class="motion-safe:animate-spin" aria-hidden="true" />
      <span>读取中…</span>
    </div>
    <ul v-else-if="result.items.length && (picking || view === 'grid')" class="material-grid">
      <li v-for="item in result.items" :key="item.id" class="material-card" :data-selected="picking && selected(item.id) || undefined">
        <button type="button" class="material-item" :aria-label="(picking ? '选择 ' : '查看 ') + item.name"
          :aria-pressed="picking ? selected(item.id) : undefined"
          :disabled="picking && selectionIsFull && !selected(item.id)" @click="choose(item)">
          <span class="material-image">
            <img v-if="item.kind === 'image'" :src="item.url" alt="" width="150" height="150" loading="lazy" decoding="async" />
            <UIcon v-else :name="kindIcons[item.kind]" class="material-kind-icon" aria-hidden="true" />
            <span v-if="picking && selected(item.id)" class="material-selected" aria-hidden="true"><UIcon name="i-lucide-check" /></span>
          </span>
          <span class="material-caption">
            <strong :title="item.name">{{ item.name }}</strong>
            <span>{{ formatLabel(item) }} · {{ sizeLabel(item.byteCount) }}</span>
          </span>
        </button>
        <div v-if="!picking" class="material-item-actions">
          <UButton :href="downloadUrl(item)" size="xs" color="neutral" variant="link" :aria-label="'下载 ' + item.name" external>下载</UButton>
          <UButton type="button" size="xs" color="error" variant="link" :aria-label="'删除 ' + item.name" @click="askDelete(item)">删除</UButton>
        </div>
      </li>
    </ul>
    <div v-else-if="!picking && view === 'list'" class="table-scroll">
      <table class="activity-table material-table">
        <thead><tr><th scope="col">名称</th><th scope="col">格式</th><th scope="col">大小</th><th scope="col">上传时间</th><th scope="col">操作</th></tr></thead>
        <tbody>
          <tr v-if="!result.items.length"><td colspan="5" class="material-table-empty">{{ emptyLabel }}</td></tr>
          <tr v-for="item in result.items" :key="item.id">
            <td><div class="material-table-name">
              <img v-if="item.kind === 'image'" :src="item.url" alt="" width="36" height="36" loading="lazy" />
              <UIcon v-else :name="kindIcons[item.kind]" class="material-kind-icon" aria-hidden="true" />
              <span :title="item.name">{{ item.name }}</span>
            </div></td>
            <td>{{ formatLabel(item) }}</td><td>{{ sizeLabel(item.byteCount) }}</td><td>{{ displayDate(item.createdAt) }}</td>
            <td><div class="material-item-actions">
              <UButton type="button" size="sm" variant="ghost" :aria-label="'查看 ' + item.name" @click="choose(item)">查看</UButton>
              <UButton :href="downloadUrl(item)" size="sm" color="neutral" variant="ghost" :aria-label="'下载 ' + item.name" external>下载</UButton>
              <UButton type="button" size="sm" color="error" variant="ghost" :aria-label="'删除 ' + item.name" @click="askDelete(item)">删除</UButton>
            </div></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="material-empty">
      <UIcon :name="kindIcons[kind]" aria-hidden="true" />
      <span>{{ emptyLabel }}</span>
    </div>

    <ConsoleListPagination v-if="!picking" label="素材库" :count="initialLoading ? '正在加载素材…' : `共 ${result.total} ${kind === 'image' ? '张' : '个'}${policy.label}`"
      :page="result.page" :pages="totalPages" :pending="pageAction ?? undefined" :disabled="initialLoading || !!searchAction" @turn="turn" />
    <div v-else-if="totalPages > 1" class="material-pagination">
      <span class="help">第 {{ result.page }} / {{ totalPages }} 页</span>
      <div class="material-views">
        <UButton type="button" color="neutral" variant="outline" :disabled="result.page <= 1 || !!pageAction || !!searchAction" :loading="pageAction === 'previous'" @click="turn('previous')">上一页</UButton>
        <UButton type="button" color="neutral" variant="outline" :disabled="result.page >= totalPages || !!pageAction || !!searchAction" :loading="pageAction === 'next'" @click="turn('next')">下一页</UButton>
      </div>
    </div>
    <ImageViewer v-if="preview?.kind === 'image'" v-model:open="previewOpen" :src="preview.url" :label="preview.name" />
    <ConsoleDialog v-if="preview && preview.kind !== 'image'" v-model:open="previewOpen" :title="preview.name" size="content">
      <template #body>
        <video v-if="previewOpen && preview.kind === 'video'" class="material-video" :src="preview.url" controls playsinline preload="metadata" />
        <p class="help">{{ formatLabel(preview) }} · {{ sizeLabel(preview.byteCount) }}</p>
      </template>
      <template #footer>
        <UButton :href="downloadUrl(preview)" external icon="i-lucide-download">下载素材</UButton>
      </template>
    </ConsoleDialog>
    <ConsoleDialog v-model:open="deleteOpen" title="删除素材" :dismissible="!deleting" :close="!deleting">
      <template #body>
        <p>是否删除「{{ deleteTarget?.name }}」？此操作无法撤销。</p>
        <p v-if="deleteError" class="feedback error mt-3" role="alert">{{ deleteError }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton type="button" color="neutral" variant="outline" :disabled="deleting" @click="deleteOpen = false">取消</UButton>
          <UButton type="button" color="error" :loading="deleting" @click="confirmDelete">确认删除</UButton>
        </div>
      </template>
    </ConsoleDialog>
  </section>
</template>

<style scoped>
.material-browser { display: grid; align-content: start; min-width: 0; gap: 12px; }
.material-panel { gap: 0; }
.material-panel .material-grid { padding: 0 20px 17px; }
.material-display-toolbar { padding-block: 0 5px; }
.material-kind-tabs { display: flex; gap: 13px; }
.material-kind { border-block-end: 2px solid transparent; padding: 6px 4px; color: var(--ui-text-muted); font-size: 14px; font-weight: 560; }
.material-kind[aria-pressed=true] { border-block-end-color: var(--ui-primary); color: var(--ui-primary); }
.material-kind:not(:disabled):hover { color: var(--ui-primary); }
.material-toolbar, .material-search, .material-views { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.material-search { flex-wrap: nowrap; }
.material-search > :first-child { min-width: 0; width: 11rem; }
.material-views { gap: 4px; }
.material-meta, .material-pagination { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; }
.material-meta { color: var(--ui-text-muted); font-size: 13px; }
.material-library-meta { padding: 0 20px 8px; }
.material-policy { margin-inline-start: auto; }
.material-empty { display: grid; min-height: 128px; place-content: center; justify-items: center; gap: 9px; color: var(--ui-text-muted); font-size: 14px; border-top: 1px solid var(--ui-border); }
.material-empty > :first-child { width: 30px; height: 30px; }
.material-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(min(100%,136px),1fr)); gap: 14px; }
.material-card { min-width: 0; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-bg); padding: 8px; }
.material-card:has(.material-item:not(:disabled):hover) { border-color: var(--ui-primary); }
.material-card[data-selected=true] { border-color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 5%, var(--ui-bg)); }
.material-item { display: block; width: 100%; text-align: left; }
.material-item:disabled { opacity: .58; cursor: not-allowed; }
.material-item-actions { display: flex; flex-wrap: wrap; gap: 5px; }
.material-card .material-item-actions { margin-block-start: 4px; }
.material-image { position: relative; display: grid; place-items: center; aspect-ratio: 1; background: var(--ui-bg-elevated); border-radius: 6px; overflow: hidden; }
.material-image img { width: 100%; height: 100%; object-fit: contain; }
.material-selected { display: grid; place-items: center; position: absolute; top: 5px; right: 5px; width: 21px; height: 21px; color: white; background: var(--ui-primary); border-radius: 50%; }
.material-caption { display: grid; gap: 2px; padding-top: 7px; }
.material-caption strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.material-caption > span { color: var(--ui-text-muted); font-size: 13px; }
.material-table { min-width: 40rem; }
.material-table :is(th, td) { white-space: nowrap; }
.material-table-empty { text-align: center; }
.material-table-name { display: flex; align-items: center; gap: 9px; max-width: 18rem; }
.material-table-name img { flex: none; object-fit: contain; border-radius: 5px; background: var(--ui-bg-elevated); }
.material-kind-icon { width: 34px; height: 34px; color: var(--ui-text-muted); flex: none; }
.material-video { width: 100%; max-height: 52vh; background: #000; border-radius: 6px; margin-block-end: 10px; }
.material-table-name span { overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 550px) {
  .material-search { flex: 1 1 10rem; }
  .material-search > :first-child { flex: 1; width: auto; }
}
</style>
