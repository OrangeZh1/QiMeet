<script setup lang="ts">
import type { InputSlots } from '@nuxt/ui'

defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' }>(), { size: 'md' })
const model = defineModel<string | number>()
defineSlots<InputSlots>()
</script>

<template>
  <UInput v-model="model" v-bind="$attrs" :size="size" class="qisvc-console-input min-w-0 w-full" :class="{'qisvc-console-input-custom-trailing':!!$slots.trailing}">
    <template v-if="$slots.leading" #leading="scope"><slot name="leading" v-bind="scope" /></template>
    <template v-if="$slots.default" #default="scope"><slot v-bind="scope" /></template>
    <template v-if="$slots.trailing" #trailing="scope"><slot name="trailing" v-bind="scope" /></template>
  </UInput>
</template>

<style scoped>
/* Keep a single reveal control when the caller supplies its own password button. */
.qisvc-console-input-custom-trailing :deep(input[type="password"]::-ms-reveal) { display: none; }
</style>
