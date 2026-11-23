<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  icon: string
  to: string
  active?: boolean
  collapsed?: boolean
  subitem?: boolean
  external?: boolean
  tone?: 'console' | 'account'
}>(), {
  active: false,
  collapsed: false,
  subitem: false,
  external: false,
  tone: 'console',
})
</script>

<template>
  <UButton
    :to="external ? undefined : to"
    :prefetch-on="{ visibility: false, interaction: true }"
    :href="external ? to : undefined"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
    color="neutral"
    variant="ghost"
    :icon="icon"
    :label="collapsed ? undefined : label"
    :square="collapsed"
    :aria-label="collapsed ? label : undefined"
    :aria-current="active ? 'page' : undefined"
    :data-active="active || undefined"
    :data-collapsed="collapsed || undefined"
    block
    :ui="{ leadingIcon: 'qisvc-console-sidebar-link-icon' }"
    :class="[
      'qisvc-console-sidebar-link',
      'rounded-md',
      collapsed ? 'size-10 justify-center p-0' : subitem ? 'min-h-9 justify-start' : 'min-h-10 justify-start',
      tone === 'account' || subitem ? 'text-muted' : 'text-default',
    ]"
  >
    <template v-if="external && !collapsed" #trailing>
      <UIcon name="i-lucide-external-link" class="size-3.5 opacity-60" />
    </template>
  </UButton>
</template>
