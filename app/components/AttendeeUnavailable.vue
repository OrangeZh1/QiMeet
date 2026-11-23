<script setup lang="ts">
withDefaults(defineProps<{ title: string, message: string, to?: string, action?: string }>(), {
  to: '/activities', action: '返回活动首页',
})
</script>

<template>
  <section class="attendee-card attendee-unavailable">
    <div class="attendee-result-icon" aria-hidden="true"><UIcon name="i-lucide-calendar-x" /></div>
    <h1 class="attendee-heading">{{ title }}</h1>
    <p class="attendee-helper">{{ message }}</p>
    <UButton :to="to" class="attendee-action attendee-unavailable-action" color="primary">{{ action }}</UButton>
  </section>
</template>

<style scoped>
.attendee-unavailable {
  display: grid; justify-items: center; gap: 9px;
  width: min(100%, 28rem);
  max-width: calc(100% - var(--qm-attendee-page-gutter) * 2);
  margin: clamp(24px, 7svh, 72px) auto 24px;
  padding: clamp(22px, 5vw, 36px);
  text-align: center;
  box-shadow: 0 8px 24px rgb(31 67 121 / 7%);
}
.attendee-unavailable .attendee-result-icon { margin-bottom: 3px; }
.attendee-unavailable .attendee-helper { line-height: 1.65; }
.attendee-unavailable-action { width: min(100%, 12rem); margin-top: 9px; }
</style>
