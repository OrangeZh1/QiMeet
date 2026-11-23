<script setup lang="ts">
defineProps<{ next: string, message: string }>()
</script>

<template>
  <section class="login-prompt" aria-label="未登录">
    <span class="login-prompt-icon"><UIcon name="i-lucide-user-round" aria-hidden="true" /></span>
    <div>
      <h2>未登录</h2>
      <p>{{ message }}</p>
    </div>
    <UButton :to="attendeeLogin(next)" class="login-prompt-action" size="sm">去登录</UButton>
  </section>
</template>

<style scoped>
.login-prompt {
  display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 10px;
  padding: 13px; border: 1px solid #e0e8f5; border-radius: 9px; background: #f6f9ff;
}
.login-prompt-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 8px; background: #e8f0ff; color: #2356bf; font-size: 18px; }
.login-prompt h2 { font-size: 16px; font-weight: 690; }
.login-prompt p { margin-top: 2px; color: var(--muted); font-size: 13px; }
.login-prompt-action { min-height: 38px; white-space: nowrap; background: #2356bf; }
</style>
