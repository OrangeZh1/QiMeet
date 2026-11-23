<script setup lang="ts">
import type { AttendeeActivityCard } from '#shared/attendee-account'
import { displayDate } from '#shared/models'
import { materialImagePreviewUrl } from '#shared/materials'
definePageMeta({ layout: false, pageTransition: false })
useSeoMeta({ title: '活动' })
const { data: items, error } = await useFetch<AttendeeActivityCard[]>('/api/activities')
const { data: settings } = useSiteSettings()
const site = computed(() => settings.value || fallbackSite)
const featured = computed(() => items.value?.[0])
const more = computed(() => items.value?.slice(1) || [])
const brokenFeaturedCover = ref('')
const featuredCover = computed(() => materialImagePreviewUrl(featured.value?.coverUrl || '', 'card'))
const featuredImage = ref<HTMLImageElement>()
onMounted(() => {
  if (featuredImage.value?.complete && !featuredImage.value.naturalWidth) brokenFeaturedCover.value = featuredCover.value
})
</script>

<template>
  <NuxtLayout name="attendee" navigation dock-copyright>
    <section class="platform-banner" aria-label="QiMeet 活动首页">
      <AttendeeCoverCarousel :images="site.homeBanners" preview="card" fallback-url="/brand/venue-login.jpg" label="首页 Banner">
        <template #slide="{ image }">
          <div v-if="image.title || image.subtitle" class="platform-brand">
            <strong v-if="image.title">{{ image.title }}</strong>
            <span v-if="image.subtitle">{{ image.subtitle }}</span>
          </div>
        </template>
      </AttendeeCoverCarousel>
    </section>
    <section class="client-section">
      <h1 class="attendee-heading">活动</h1>
      <p v-if="error" class="attendee-error" role="alert">{{ errorText(error, '暂时无法加载活动') }}</p>
      <template v-else-if="featured">
        <NuxtLink class="featured-activity" :to="attendeePath(featured.slug)">
          <img v-if="featuredCover && featuredCover !== brokenFeaturedCover" ref="featuredImage" class="featured-cover" :src="featuredCover"
            alt="" width="768" height="384" decoding="async" draggable="false" @error="brokenFeaturedCover = featuredCover" />
          <div class="featured-content">
            <div class="featured-title">
              <h2>{{ featured.title }}</h2>
              <span v-if="featured.registrationOpen" class="attendee-label done">报名开放中</span>
            </div>
            <div class="featured-detail"><UIcon name="i-lucide-calendar-days" aria-hidden="true" /><time :datetime="featured.startsAt">{{ displayDate(featured.startsAt) }}</time></div>
            <div v-if="featured.venue" class="featured-detail"><UIcon name="i-lucide-map-pin" aria-hidden="true" /><span>{{ featured.venue }}</span></div>
            <span class="featured-action">查看活动 <UIcon name="i-lucide-chevron-right" aria-hidden="true" /></span>
          </div>
        </NuxtLink>
        <section v-if="more.length" class="other-activities" aria-labelledby="other-activities-title">
          <h2 id="other-activities-title">更多活动</h2>
          <AttendeeActivityList :items="more" />
        </section>
      </template>
      <p v-else class="attendee-helper">暂无已发布的活动</p>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.platform-banner { --banner-inset: clamp(16px, 6vw, 42px); position: relative; isolation: isolate; width: 100%; height: clamp(154px, 44vw, 230px); overflow: hidden; background: #122341; }
.platform-brand { position: absolute; inset: 0; display: grid; align-content: center; justify-items: start; gap: 7px; padding: 14px var(--banner-inset) 39px; background: linear-gradient(90deg, rgb(9 21 41 / 94%), rgb(9 21 41 / 65%) 41%, transparent 89%); color: #fff; pointer-events: none; }
.platform-brand strong { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; max-width: 12em; font-size: clamp(22px, 5.8vw, 36px); line-height: 1.2; font-weight: 740; overflow-wrap: anywhere; text-wrap: balance; }
.platform-brand span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; max-width: 18em; color: #e0eaff; font-size: 14px; font-weight: 530; overflow-wrap: anywhere; }
.platform-banner :deep(.event-cover-dots) { bottom: 7px; }
.platform-banner :deep(.event-cover-dots button) { width: 25px; height: 32px; }
.platform-banner :deep(.event-cover-dots button[aria-current='true'] span) { width: 17px; border-radius: 10px; }
.featured-activity { display: block; min-width: 0; overflow: hidden; border: 1px solid #dce5f2; border-radius: 10px; }
.featured-cover { display: block; width: 100%; aspect-ratio: 2 / 1; max-height: 260px; object-fit: cover; background: #edf2fb; }
.featured-content { display: grid; gap: 7px; padding: 14px; }
.featured-title { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; margin-bottom: 2px; }
.featured-title h2 { font-size: clamp(19px, 4.3vw, 25px); font-weight: 720; overflow-wrap: anywhere; }
.featured-detail { display: flex; align-items: baseline; gap: 7px; color: var(--muted); font-size: 14px; overflow-wrap: anywhere; }
.featured-detail > [aria-hidden] { flex: none; align-self: start; margin-top: 3px; color: #4264a8; }
.featured-action { display: flex; width: fit-content; min-height: 38px; align-items: center; gap: 3px; color: #2356bf; font-size: 14px; font-weight: 650; }
.featured-activity:hover .featured-action { text-decoration: underline; }
.other-activities { margin-top: 6px; }
.other-activities > h2 { font-size: 17px; font-weight: 700; }
</style>
