<script setup lang="ts">
import { siteSettingsPath } from '~/utils/siteSettingsSections'

definePageMeta({ middleware: 'admin' })
await navigateTo(siteSettingsPath + '/brand', { redirectCode: 302, replace: true })
</script>

<template><span /></template>
