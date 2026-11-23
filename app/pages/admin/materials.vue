<script setup lang="ts">
import ConsolePageHeading from '#qiandao-console/ConsolePageHeading.vue'
import MaterialBrowser from '~/components/MaterialBrowser.vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '素材库' })
</script>

<template>
  <div class="page-stack">
    <ConsolePageHeading title="素材库" />
    <MaterialBrowser class="panel" />
  </div>
</template>
