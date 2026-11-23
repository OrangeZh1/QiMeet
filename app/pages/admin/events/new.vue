<script setup lang="ts">
import ConsolePageHeading from '#qiandao-console/ConsolePageHeading.vue'
definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '新建活动' })
</script>
<template>
  <div class="page-stack">
    <ConsolePageHeading title="新建活动" description="先保存活动资料，再配置表单和签到环节。" />
    <EventSettings @saved="id => navigateTo('/admin/events/' + id)" />
  </div>
</template>
