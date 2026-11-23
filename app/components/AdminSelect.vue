<script setup lang="ts" generic="T extends string | number">
withDefaults(defineProps<{
  items: readonly { label: string, value: T }[]
  size?: 'sm' | 'md' | 'lg'
  compact?: boolean
}>(), { size: 'lg', compact: false })
const value = defineModel<T>({ required: true })
</script>

<template>
  <USelect v-model="value" :items="items" :size="size" :class="compact ? 'min-w-28' : 'w-full'"
    :ui="{ content: 'motion-reduce:animate-none' }" />
</template>
