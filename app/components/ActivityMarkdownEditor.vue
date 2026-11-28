<script setup lang="ts">
import MaterialBrowser from './MaterialBrowser.vue'
import RichMarkdown from './RichMarkdown.vue'
import ConsoleDialog from './material/ConsoleDialog.vue'

const props = withDefaults(defineProps<{
  disabled?: boolean, maxlength?: number, label?: string, placeholder?: string, allowMaterialMedia?: boolean
}>(), {
  maxlength: 12000,
  label: '活动介绍',
  placeholder: '输入活动详情，例如活动亮点、参加方式或注意事项。',
  allowMaterialMedia: true,
})
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ busy: [value: boolean] }>()
const editorId = useId()
const editor = ref<HTMLTextAreaElement>()
const previewing = ref(false)
const limitError = ref(false)
const kind = ref<'image' | 'video'>('image')
const kindLabel = computed(() => kind.value === 'image' ? '图片' : '视频')
const pickerOpen = ref(false)
const pickerMounted = ref(false)
const pickerBusy = ref(false)
const materialId = ref<string | null>(null)
const selectionRange = ref<{ start: number, end: number }>()
let focusAfterPick: readonly [number, number] | undefined
watch(model, () => { limitError.value = false })

type Insertion = { content: string, from: number, to: number }
function wrap(text: string, placeholder: string, before: string, after = ''): Insertion {
  const value = text || placeholder
  return { content: before + value + after, from: before.length, to: before.length + value.length }
}
function list(text: string, marker: (index: number) => string): Insertion {
  const content = (text || '列表项').split('\n').map((line, index) => marker(index) + line).join('\n')
  return { content, from: marker(0).length, to: content.length }
}
function webLink(text: string, image = false): Insertion {
  const before = (image ? '![' : '[') + (text || (image ? '图片说明' : '链接文字')) + ']('
  const href = 'https://'
  return { content: before + href + ')', from: before.length, to: before.length + href.length }
}
const fence = '```'
const commands = [
  { label: '标题', icon: 'i-lucide-heading-2', block: true, edit: (text: string) => wrap(text, '小节标题', '## ') },
  { label: '加粗', icon: 'i-lucide-bold', edit: (text: string) => wrap(text, '文字', '**', '**') },
  { label: '斜体', icon: 'i-lucide-italic', edit: (text: string) => wrap(text, '文字', '*', '*') },
  { label: '无序列表', icon: 'i-lucide-list', block: true, edit: (text: string) => list(text, () => '- ') },
  { label: '有序列表', icon: 'i-lucide-list-ordered', block: true, edit: (text: string) => list(text, index => (index + 1) + '. ') },
  { label: '引用', icon: 'i-lucide-quote', block: true, edit: (text: string) => list(text || '引用内容', () => '> ') },
  { label: '链接', icon: 'i-lucide-link', edit: (text: string) => webLink(text) },
  { label: '代码块', icon: 'i-lucide-code', block: true, edit: (text: string) => wrap(text, '代码', fence + '\n', '\n' + fence) },
]

function insertAt(start: number, end: number, snippet: Insertion, block?: boolean) {
  const value = model.value
  const before = block && start > 0 && value[start - 1] !== '\n' ? '\n' : ''
  const after = block && end < value.length && value[end] !== '\n' ? '\n' : ''
  const next = value.slice(0, start) + before + snippet.content + after + value.slice(end)
  if (next.length > props.maxlength) {
    limitError.value = true
    return
  }
  model.value = next
  return [start + before.length + snippet.from, start + before.length + snippet.to] as const
}

function restoreSelection(selection: readonly [number, number]) {
  editor.value?.focus()
  editor.value?.setSelectionRange(...selection)
}

async function insert(command: { edit: (text: string) => Insertion, block?: boolean }) {
  const field = editor.value
  if (!field || props.disabled) return
  const { selectionStart, selectionEnd } = field
  const snippet = command.edit(model.value.slice(selectionStart, selectionEnd))
  const selection = insertAt(selectionStart, selectionEnd, snippet, command.block)
  if (selection) {
    await nextTick()
    restoreSelection(selection)
  }
}

function openPicker(nextKind: 'image' | 'video') {
  if (!editor.value || props.disabled) return
  kind.value = nextKind
  selectionRange.value = { start: editor.value.selectionStart, end: editor.value.selectionEnd }
  materialId.value = null
  limitError.value = false
  pickerMounted.value = true
  pickerOpen.value = true
}

function pendingMaterial(value: boolean) {
  pickerBusy.value = value
  emit('busy', value)
}

function insertMaterial() {
  const range = selectionRange.value
  if (!range || !materialId.value || pickerBusy.value || props.disabled) return
  const url = '/api/materials/' + materialId.value
  const alt = model.value.slice(range.start, range.end).replace(/[\\\[\]]/g, '\\$&').replace(/\s+/g, ' ').trim() || '图片说明'
  const content = kind.value === 'image' ? '![' + alt + '](' + url + ')' : '@[video](' + url + ')'
  const from = kind.value === 'image' ? 2 : content.length
  const to = kind.value === 'image' ? from + alt.length : content.length
  const selection = insertAt(range.start, range.end, { content, from, to }, true)
  if (!selection) return
  focusAfterPick = selection
  pickerOpen.value = false
}

function afterPickerLeave() {
  if (pickerOpen.value) return
  pickerMounted.value = false
  materialId.value = null
  selectionRange.value = undefined
  if (focusAfterPick) {
    restoreSelection(focusAfterPick)
    focusAfterPick = undefined
  }
}
</script>

<template>
  <div class="activity-markdown">
    <label class="markdown-field-label" :for="editorId">{{ label }}</label>
    <div class="markdown-surface">
      <div class="markdown-toolbar">
        <div v-show="!previewing" class="markdown-actions" role="group" aria-label="Markdown 格式">
          <UButton v-for="command in commands" :key="command.label" type="button" :icon="command.icon"
            :aria-label="command.label" :title="command.label" color="neutral" variant="ghost" size="sm"
            :disabled="disabled" @click="insert(command)" />
          <UButton type="button" icon="i-lucide-image" aria-label="插入图片" title="插入图片" color="neutral" variant="ghost" size="sm"
            :disabled="disabled" @click="allowMaterialMedia ? openPicker('image') : insert({ edit: text => webLink(text, true) })" />
          <UButton v-if="allowMaterialMedia" type="button" icon="i-lucide-video" aria-label="插入视频" title="插入视频"
            color="neutral" variant="ghost" size="sm" :disabled="disabled" @click="openPicker('video')" />
        </div>
        <div class="markdown-mode" role="group" :aria-label="label + '显示模式'">
          <button type="button" :aria-pressed="!previewing" @click="previewing = false">编辑</button>
          <button type="button" :aria-pressed="previewing" @click="previewing = true">预览</button>
        </div>
      </div>
      <textarea v-show="!previewing" :id="editorId" ref="editor" v-model="model" class="markdown-source"
        :aria-describedby="allowMaterialMedia ? editorId + '-hint' : undefined" :disabled="disabled" :maxlength="maxlength" rows="8"
        :placeholder="placeholder" />
      <div v-if="previewing" class="markdown-preview" role="region" :aria-label="label + '预览'" tabindex="0">
        <RichMarkdown v-if="model.trim()" :source="model" :private-media="allowMaterialMedia" />
        <p v-else class="text-muted text-sm">输入内容后可查看显示效果。</p>
      </div>
    </div>
    <div class="markdown-footnote">
      <p v-if="allowMaterialMedia" :id="editorId + '-hint'" class="text-muted text-xs">图片和视频可从素材库选择，也可另起一行填写 <code>@[video](https://example.com/video.mp4)</code>，支持 MP4、WebM。</p>
      <p v-if="limitError" class="text-error text-xs" role="alert">{{ label }}最多 {{ maxlength }} 字符。</p>
      <span v-else class="text-muted text-xs">{{ model.length }} / {{ maxlength }}</span>
    </div>
    <ConsoleDialog v-if="allowMaterialMedia" v-model:open="pickerOpen" :title="'选择' + kindLabel" size="wide" :close="!pickerBusy" :dismissible="!pickerBusy" @after:leave="afterPickerLeave">
      <template #body>
        <div v-if="pickerMounted" class="p-4 sm:p-6">
          <MaterialBrowser :key="kind" v-model:selected-id="materialId" :picker-kind="kind" picking @busy="pendingMaterial" />
          <p v-if="limitError" class="feedback error mt-3" role="alert">插入{{ kindLabel }}后超过活动介绍的字符上限。</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton type="button" color="neutral" variant="outline" :disabled="pickerBusy" @click="pickerOpen = false">取消</UButton>
          <UButton type="button" :disabled="!materialId || pickerBusy" @click="insertMaterial">插入{{ kindLabel }}</UButton>
        </div>
      </template>
    </ConsoleDialog>
  </div>
</template>

<style scoped>
.activity-markdown { display: grid; gap: 7px; min-width: 0; }
.markdown-field-label { width: fit-content; color: var(--ui-text); font-size: 14px; font-weight: 630; }
.markdown-surface { display: grid; min-width: 0; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg); overflow: hidden; }
.markdown-surface:focus-within { border-color: var(--ui-primary); }
.markdown-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 5px; min-height: 43px; background: var(--ui-bg-elevated); border-block-end: 1px solid var(--ui-border); padding: 5px 7px; }
.markdown-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; }
.markdown-mode { display: flex; align-items: center; gap: 4px; margin-inline-start: auto; }
.markdown-mode button { min-height: 32px; padding-inline: 12px; border-radius: 5px; color: var(--ui-text-muted); font-size: 13px; }
.markdown-mode button[aria-pressed='true'] { background: var(--ui-bg); color: var(--ui-primary); font-weight: 650; }
.markdown-source, .markdown-preview { display: block; box-sizing: border-box; min-width: 0; width: 100%; height: 13rem; margin: 0; padding: 14px; overflow: auto; background: var(--ui-bg); }
.activity-markdown .markdown-source { border: 0; border-radius: 0; resize: none; outline: none; box-shadow: none; color: var(--ui-text); font: 14px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; }
.markdown-source:disabled { color: var(--ui-text-muted); cursor: not-allowed; }
.markdown-footnote { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 5px 12px; }
@media (max-width: 760px) {
  .markdown-source, .markdown-preview { height: 11rem; }
}
</style>
