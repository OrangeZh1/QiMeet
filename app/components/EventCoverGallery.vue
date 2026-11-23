<script setup lang="ts">
import type { Conference } from '#shared/models'
import MaterialBrowser from './MaterialBrowser.vue'
import MaterialDialog from './material/ConsoleDialog.vue'
import ImageSelectTile from './material/ImageSelectTile.vue'
import ImageViewer from './material/ImageViewer.vue'

type CoverImage = Conference['coverImages'][number]
const props = withDefaults(defineProps<{
  modelValue: CoverImage[], legacyUrl?: string, disabled?: boolean, label?: string, help?: string, wide?: boolean, limit?: number,
}>(), { label: '封面图片', help: '从素材库上传或选择图片。活动页面按此顺序轮播，列表使用第一张。', limit: 8 })
const emit = defineEmits<{ 'update:modelValue': [images: CoverImage[]], busy: [value: boolean] }>()
const open = ref(false)
const galleryMounted = ref(false)
const busy = ref(false)
const selectedIds = ref<string[]>([])
const previewOpen = ref(false)
const previewImage = ref<CoverImage>()
const legacyCover = computed(() => props.modelValue.length ? undefined : props.legacyUrl)
const count = computed(() => props.modelValue.length || Number(Boolean(legacyCover.value)))
const selectionChanged = computed(() => selectedIds.value.length !== props.modelValue.length
  || selectedIds.value.some((id, index) => id !== props.modelValue[index]?.id))

function pending(value: boolean) {
  busy.value = value
  emit('busy', value)
}
function choose() {
  if (props.disabled || busy.value) return
  selectedIds.value = props.modelValue.map(image => image.id)
  galleryMounted.value = true
  open.value = true
}
function afterLeave() {
  if (open.value) return
  galleryMounted.value = false
  selectedIds.value = []
}
function confirm() {
  if (busy.value || !selectionChanged.value) return
  const currentImages = new Map(props.modelValue.map(image => [image.id, image]))
  emit('update:modelValue', selectedIds.value.map(id => currentImages.get(id) || { id, url: materialPreviewUrl(id) }))
  open.value = false
}
function remove(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, itemIndex) => itemIndex !== index))
}
function move(index: number, offset: -1 | 1) {
  const target = index + offset
  const reordered = [...props.modelValue]
  if (!reordered[index] || !reordered[target]) return
  const [image] = reordered.splice(index, 1)
  if (!image) return
  reordered.splice(target, 0, image)
  emit('update:modelValue', reordered)
}
function show(image: CoverImage) {
  previewImage.value = image
  previewOpen.value = true
}
</script>

<template>
  <div class="cover-gallery" :class="{ 'cover-gallery-wide': wide }" role="group" :aria-label="label">
    <div class="cover-heading">
      <p>{{ label }} <span class="help">{{ count }} / {{ limit }} 张</span></p>
      <UButton v-if="modelValue.length" type="button" icon="i-lucide-images" size="xs" color="neutral" variant="outline"
        :disabled="disabled || busy" @click="choose">选择图片</UButton>
    </div>
    <div v-if="!modelValue.length" class="cover-banner">
      <ImageSelectTile :src="legacyCover" :label="label" fit="cover"
        :disabled="disabled || busy" :removable="!!legacyCover"
        @select="choose" @remove="remove(0)" />
    </div>
    <ol v-else class="cover-strip" :class="{ 'cover-strip-editable': $slots['image-fields'] }" :aria-label="label + '播放顺序'">
      <li v-for="(image, index) in modelValue" :key="image.id" class="cover-thumb">
        <button type="button" class="cover-thumb-image" :aria-label="'查看第 ' + (index + 1) + ' 张' + label" @click="show(image)">
          <img :src="image.url" alt="" loading="lazy" width="128" height="72" />
        </button>
        <div class="cover-thumb-footer">
          <span>{{ index === 0 && !wide ? '主封面' : '第 ' + (index + 1) + ' 张' }}</span>
          <div class="cover-thumb-actions">
            <UButton type="button" icon="i-lucide-arrow-left" variant="ghost" color="neutral" size="xs"
              :disabled="disabled || busy || index === 0" :aria-label="'前移第 ' + (index + 1) + ' 张' + label" title="前移"
              @click="move(index, -1)" />
            <UButton type="button" icon="i-lucide-arrow-right" variant="ghost" color="neutral" size="xs"
              :disabled="disabled || busy || index === modelValue.length - 1" :aria-label="'后移第 ' + (index + 1) + ' 张' + label" title="后移"
              @click="move(index, 1)" />
            <UButton type="button" icon="i-lucide-x" variant="ghost" color="neutral" size="xs"
              :disabled="disabled || busy" :aria-label="'移除第 ' + (index + 1) + ' 张' + label" title="移除"
              @click="remove(index)" />
          </div>
        </div>
        <div v-if="$slots['image-fields']" class="cover-thumb-fields">
          <slot name="image-fields" :image="image" :index="index" />
        </div>
      </li>
    </ol>
    <p class="text-xs text-muted">{{ help }}</p>
    <ImageViewer v-model:open="previewOpen" :src="previewImage?.url" :label="label" />
    <MaterialDialog v-model:open="open" :title="'选择' + label" size="wide" :dismissible="!busy" :close="!busy" @after:leave="afterLeave">
      <template #body>
        <div v-if="galleryMounted" class="p-4 sm:p-6">
          <MaterialBrowser v-model:selected-ids="selectedIds" :selection-limit="limit" picking @busy="pending" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-3">
          <span class="mr-auto text-sm text-muted" aria-live="polite">已选择 {{ selectedIds.length }} / {{ limit }}</span>
          <UButton type="button" color="neutral" variant="outline" :disabled="busy" @click="open = false">取消</UButton>
          <UButton type="button" :disabled="busy || !selectionChanged" @click="confirm">确定</UButton>
        </div>
      </template>
    </MaterialDialog>
  </div>
</template>

<style scoped>
.cover-gallery { display: grid; align-content: start; min-width: 0; gap: 8px; }
.cover-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.cover-heading p { font-size: 14px; font-weight: 630; }
.cover-heading p > span { margin-inline-start: 5px; font-size: 12px; }
.cover-banner :deep(.image-select-tile) { width: min(100%, 320px); height: auto; aspect-ratio: 5 / 2; }
.cover-strip { display: flex; align-items: stretch; gap: 8px; overflow-x: auto; overscroll-behavior-inline: contain; padding: 3px 3px 8px; }
.cover-thumb { flex: 0 0 128px; min-width: 0; }
.cover-thumb { border: 1px solid var(--ui-border); border-radius: 6px; background: var(--ui-bg); }
.cover-thumb-image { display: block; width: 100%; aspect-ratio: 16 / 9; background: var(--ui-bg-elevated); border-radius: 5px 5px 0 0; overflow: hidden; }
.cover-gallery-wide .cover-thumb-image, .cover-gallery-wide .cover-banner :deep(.image-select-tile) { aspect-ratio: 3 / 1; }
.cover-thumb-image img { display: block; width: 100%; height: 100%; object-fit: cover; }
.cover-thumb-footer { display: flex; align-items: center; justify-content: space-between; gap: 1px; padding-inline: 4px; }
.cover-thumb-footer > span { color: var(--ui-text-muted); font-size: 11px; white-space: nowrap; }
.cover-thumb-actions { display: flex; gap: 0; }
.cover-thumb-actions :deep(button) { min-width: 24px; min-height: 28px; padding: 4px; }
.cover-strip-editable { display: grid; gap: 8px; overflow: visible; padding: 0; }
.cover-strip-editable .cover-thumb {
  display: grid; grid-template-columns: 128px minmax(0, 1fr); grid-template-areas: 'image fields' 'actions fields';
  grid-template-rows: auto 1fr; gap: 0 10px; padding: 8px;
}
.cover-strip-editable .cover-thumb-image { grid-area: image; border-radius: 4px; }
.cover-strip-editable .cover-thumb-footer { grid-area: actions; align-self: start; }
.cover-thumb-fields { grid-area: fields; min-width: 0; }
@media (max-width: 480px) {
  .cover-strip-editable .cover-thumb { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'image' 'actions' 'fields'; gap: 4px; }
}
</style>
