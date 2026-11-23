<script setup lang="ts">
const route = useRoute()
await navigateTo({
  path: '/display/' + encodeURIComponent(String(route.params.id)) + '/' + encodeURIComponent(String(route.params.point)),
  query: route.query,
}, { replace: true, redirectCode: 302 })
</script>
<template><span /></template>
