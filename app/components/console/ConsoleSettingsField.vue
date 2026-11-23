<script setup lang="ts">
defineProps<{ label: string, inputId?: string, required?: boolean }>()
</script>

<template>
  <div class="qisvc-console-settings-field">
    <label v-if="inputId" :for="inputId" class="qisvc-console-settings-label">
      {{ label }}<span v-if="required" class="settings-required" aria-hidden="true">*</span>
    </label>
    <span v-else class="qisvc-console-settings-label">{{ label }}</span>
    <div class="qisvc-console-settings-control"><slot /></div>
  </div>
</template>

<style scoped>
/* Settings field layout adapted from QiCore. See NOTICE-QICORE. */
.qisvc-console-settings-field { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: .5rem; min-width: 0; }
.qisvc-console-settings-label { display: flex; align-items: center; font-size: .875rem; line-height: 1.25rem; color: var(--ui-text-muted); }
label.qisvc-console-settings-label { display: flex; gap: 4px; }
.settings-required { color: var(--ui-error); }
.qisvc-console-settings-control { min-width: 0; }
@media (min-width: 640px) {
  .qisvc-console-settings-field { grid-template-columns: var(--settings-label-width, 8rem) minmax(0, var(--settings-content-width, 28rem)); gap: 1.5rem; }
  .qisvc-console-settings-label { justify-content: flex-end; min-height: var(--qm-admin-control-height, 2rem); text-align: right; }
}
</style>
