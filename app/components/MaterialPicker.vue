<script setup lang="ts">
import MaterialDialog from './material/ConsoleDialog.vue'
import ImageSelectTile from './material/ImageSelectTile.vue'

const props = withDefaults(defineProps<{
  modelValue: string | null
  label: string
  currentUrl?: string
  disabled?: boolean
  shape?: 'cover' | 'square'
  fit?: 'cover' | 'contain'
  hideLabel?: boolean
}>(), { shape: 'cover', fit: 'cover' })
const emit = defineEmits<{ 'update:modelValue': [id: string | null], busy: [value: boolean] }>()
const open = ref(false)
const galleryMounted = ref(false)
const busy = ref(false)
const cleared = ref(false)
const selectedId = ref<string | null>(null)
const preview = computed(() => props.modelValue ? materialPreviewUrl(props.modelValue) : cleared.value ? null : props.currentUrl)
watch(() => props.modelValue, value => { if (value) cleared.value = false })

function pending(value: boolean) {
  busy.value = value
  emit('busy', value)
}
function choose() {
  if (props.disabled || busy.value) return
  selectedId.value = null
  galleryMounted.value = true
  open.value = true
}
function afterLeave() {
  if (open.value) return
  galleryMounted.value = false
  selectedId.value = null
}
function remove() {
  cleared.value = true
  emit('update:modelValue', null)
}
function confirm() {
  if (!selectedId.value || busy.value) return
  cleared.value = false
  emit('update:modelValue', selectedId.value)
  open.value = false
}
</script>

<template>
  <div class="media-field" role="group" :aria-label="label">
    <p v-if="!hideLabel" class="media-label">{{ label }}</p>
    <div :class="{ 'media-banner': shape === 'cover' }">
      <ImageSelectTile
        :src="preview" :label="label" :fit="fit"
        :disabled="disabled || busy" :removable="!!preview"
        @select="choose" @remove="remove"
      />
    </div>
    <p class="text-xs text-muted">从素材库选择，或在素材库上传图片</p>
    <MaterialDialog v-model:open="open" title="选择图片" size="wide" :dismissible="!busy" :close="!busy" @after:leave="afterLeave">
      <template #body>
        <div v-if="galleryMounted" class="p-4 sm:p-6">
          <MaterialBrowser v-model:selected-id="selectedId" picking @busy="pending" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-3">
          <span class="mr-auto text-sm text-muted">已选择 {{ selectedId ? 1 : 0 }} / 1</span>
          <UButton type="button" color="neutral" variant="outline" :disabled="busy" @click="open = false">取消</UButton>
          <UButton type="button" :disabled="!selectedId || busy" @click="confirm">确定</UButton>
        </div>
      </template>
    </MaterialDialog>
  </div>
</template>

<style scoped>
.media-field { display: grid; gap: 8px; }
.media-label { font-size: 14px; font-weight: 630; }
.media-banner :deep(.image-select-tile) { width: min(100%, 320px); height: auto; aspect-ratio: 5 / 2; }
</style>
