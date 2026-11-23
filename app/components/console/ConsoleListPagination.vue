<script setup lang="ts">
defineProps<{
  label: string
  count: string
  page: number
  pages: number
  pageSize?: number
  sizeOptions?: { label: string, value: number }[]
  disabled?: boolean
  pending?: 'previous' | 'next' | 'size'
}>()

const emit = defineEmits<{ turn: [direction: 'previous' | 'next'], resize: [size: number] }>()
</script>

<template>
  <footer class="panel-toolbar list-pagination">
    <p class="help" role="status">{{ count }}</p>
    <nav class="toolbar-actions" :aria-label="label + '分页'">
      <AdminSelect v-if="pageSize !== undefined && sizeOptions" :model-value="pageSize" :items="sizeOptions" size="sm" compact
        aria-label="每页条数" :loading="pending === 'size'" :disabled="disabled || !!pending" @update:model-value="emit('resize', $event)" />
      <UButton type="button" color="neutral" variant="outline" size="sm" icon="i-lucide-chevron-left" aria-label="上一页"
        :disabled="page <= 1 || disabled || !!pending" :loading="pending === 'previous'" @click="emit('turn', 'previous')" />
      <span class="help list-page-number">第 {{ page }} / {{ pages }} 页</span>
      <UButton type="button" color="neutral" variant="outline" size="sm" icon="i-lucide-chevron-right" aria-label="下一页"
        :disabled="page >= pages || disabled || !!pending" :loading="pending === 'next'" @click="emit('turn', 'next')" />
    </nav>
  </footer>
</template>
