<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
defineProps<{
  data: Record<string, unknown>[]
  columns: TableColumn<Record<string, unknown>>[]
  loading?: boolean
  emptyTitle?: string
  showSequence?: boolean
  clientPagination?: boolean
}>()
</script>

<template>
  <UTable :data="data" :columns="columns" :loading="loading" :empty="emptyTitle || '暂无记录'">
    <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope || {}" /></template>
  </UTable>
</template>
