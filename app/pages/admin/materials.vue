<script setup lang="ts">
import MaterialBrowser from '~/components/MaterialBrowser.vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '素材库' })
</script>

<template>
  <div class="page-stack">
    <MaterialBrowser />
  </div>
</template>
