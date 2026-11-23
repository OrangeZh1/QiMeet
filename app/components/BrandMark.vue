<script setup lang="ts">
import { brand } from '#shared/brand'
withDefaults(defineProps<{ compact?: boolean, to?: string }>(), { to: '/admin' })
</script>

<template>
  <NuxtLink class="brand-mark" :to="to" :aria-label="brand.name">
    <span class="brand-icon"><img src="/brand/mark.png" width="31" height="31" alt="" /></span>
    <span v-if="!compact" class="brand-word">{{ brand.name }}<small>{{ brand.description }}</small></span>
  </NuxtLink>
</template>
