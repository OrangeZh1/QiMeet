<script setup lang="ts">
import type { AccountRegistration, AttendeeActivityCard } from '#shared/attendee-account'
import { displayDate } from '#shared/models'
import { materialImagePreviewUrl } from '#shared/materials'
defineProps<{ items: (AttendeeActivityCard | AccountRegistration)[], recover?: boolean }>()
</script>

<template>
  <ul class="client-activities">
    <li v-for="event in items" :key="event.slug">
      <NuxtLink :to="attendeePath(event.slug) + (recover ? '/record?recover=1' : 'registrationId' in event ? '/record' : '')" class="client-activity">
        <img v-if="event.coverUrl" class="client-activity-cover" :src="materialImagePreviewUrl(event.coverUrl)" alt="" width="64" height="52" loading="lazy" />
        <div class="client-activity-copy">
          <strong>{{ event.title }}</strong>
          <div class="client-activity-meta">
            <time :datetime="event.startsAt">{{ displayDate(event.startsAt) }}</time>
            <span v-if="'registrationId' in event" class="attendee-label" :class="{ done: event.checkedIn }">
              {{ event.checkedIn ? '已签到' : event.recovered ? '已找回' : '已报名' }}
            </span>
            <span v-else-if="!recover && event.registrationOpen" class="attendee-label done">报名开放</span>
          </div>
          <small v-if="event.venue">{{ event.venue }}</small>
        </div>
        <UIcon name="i-lucide-chevron-right" class="client-activity-chevron" aria-hidden="true" />
      </NuxtLink>
    </li>
  </ul>
</template>

<style scoped>
.client-activities { list-style: none; margin: 0; padding: 0; }
.client-activities li + li { border-top: 1px solid var(--attendee-form-line); }
.client-activity { display: flex; gap: 10px; align-items: center; padding-block: 12px; }
.client-activity-cover { flex: none; width: 64px; height: 52px; border-radius: 7px; object-fit: cover; background: #edf2fb; }
.client-activity-copy { flex: 1; min-width: 0; display: grid; gap: 3px; overflow-wrap: anywhere; }
.client-activity-copy strong { font-size: 15px; line-height: 1.35; }
.client-activity-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 3px 7px; }
.client-activity-copy :is(time,small) { color: var(--muted); font-size: 12px; }
.client-activity-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.client-activity-chevron { flex: none; color: var(--muted); }
</style>
