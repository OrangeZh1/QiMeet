<script setup lang="ts">
defineProps<{ title: string, message: string, to?: string, action?: string }>()
</script>

<template>
  <section class="attendee-card padded attendee-result">
    <div class="attendee-result-icon warning" aria-hidden="true"><UIcon name="i-lucide-circle-alert" /></div>
    <h1 class="attendee-heading">{{ title }}</h1>
    <p class="attendee-helper">{{ message }}</p>
    <UButton v-if="to && action" :to="to" class="attendee-action" color="primary" variant="outline">{{ action }}</UButton>
  </section>
</template>
