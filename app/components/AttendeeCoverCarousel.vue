<script setup lang="ts">
const props = withDefaults(defineProps<{
  images: { id: string, url: string, title?: string, subtitle?: string }[], label?: string, fallbackUrl?: string,
}>(), { label: '活动封面' })
const track = ref<HTMLElement>()
const active = ref(0)
const engaged = ref(false)
const hovering = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
let preference: MediaQueryList | undefined

function sync() {
  const element = track.value
  if (element?.clientWidth) active.value = Math.max(0, Math.min(props.images.length - 1, Math.round(element.scrollLeft / element.clientWidth)))
}

function slide(index: number, smooth = true) {
  const element = track.value
  if (!element) return
  element.scrollTo({ left: index * element.clientWidth, behavior: smooth && !preference?.matches ? 'smooth' : 'auto' })
}

function choose(index: number) {
  engaged.value = true
  slide(index)
}

function move(offset: number) {
  if (props.images.length > 1) choose((active.value + offset + props.images.length) % props.images.length)
}

function loadFallback(event: Event) {
  const image = event.currentTarget as HTMLImageElement
  if (props.fallbackUrl && image.src !== new URL(props.fallbackUrl, document.baseURI).href) {
    image.src = props.fallbackUrl
    return
  }
  image.style.visibility = 'hidden'
}

onMounted(() => {
  preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  for (const image of track.value?.querySelectorAll('img') || []) {
    if (image.complete && !image.naturalWidth) image.dispatchEvent(new Event('error'))
  }
  if (props.images.length < 2) return
  timer = setInterval(() => {
    if (engaged.value || hovering.value || preference?.matches || document.hidden) return
    const next = (active.value + 1) % props.images.length
    slide(next, next > 0)
  }, 5000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="event-cover" role="group"
    :aria-label="images.length > 1 ? label + '，可左右滑动' : label"
    @mouseenter="hovering = true" @mouseleave="hovering = false"
    @focusin="engaged = true" @pointerdown.passive="engaged = true">
    <div ref="track" class="attendee-cover-track" :class="{ 'attendee-cover-track-static': images.length === 1 }"
      :tabindex="images.length > 1 ? 0 : undefined"
      @scroll.passive="sync" @keydown.left.prevent="move(-1)" @keydown.right.prevent="move(1)">
      <div v-for="(image, index) in images" :key="image.id + image.url" class="attendee-cover-slide"
        :aria-hidden="images.length > 1 && index !== active ? 'true' : undefined">
        <img :src="image.url" alt="" :loading="index === 0 ? 'eager' : 'lazy'" :fetchpriority="index === 0 ? 'high' : 'auto'"
          referrerpolicy="no-referrer" draggable="false" @error="loadFallback" />
        <slot name="slide" :image="image" />
      </div>
    </div>
    <div v-if="images.length > 1" class="event-cover-dots" role="group" :aria-label="'切换' + label">
      <button v-for="image, index in images" :key="image.id" type="button"
        :aria-label="'查看第 ' + (index + 1) + ' 张' + label"
        :aria-current="index === active ? 'true' : undefined" @click="choose(index)"><span /></button>
    </div>
  </div>
</template>

<style scoped>
.event-cover { position: relative; width: 100%; height: 100%; min-width: 0; }
.attendee-cover-track {
  display: grid; grid-auto-flow: column; grid-auto-columns: 100%; height: 100%;
  overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain;
  scrollbar-width: none; scroll-snap-type: x mandatory;
}
.attendee-cover-track::-webkit-scrollbar { display: none; }
.attendee-cover-track-static { overflow: hidden; }
.attendee-cover-track:focus-visible { outline-offset: -3px; }
.attendee-cover-slide { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; scroll-snap-align: start; }
.attendee-cover-slide img { display: block; width: 100%; height: 100%; object-fit: cover; }
.event-cover-dots {
  position: absolute; z-index: 1; bottom: 2px; left: 50%; transform: translateX(-50%);
  display: flex; justify-content: center;
}
.event-cover-dots button { width: 26px; height: 28px; display: grid; place-items: center; }
.event-cover-dots button span {
  width: 6px; height: 6px; border-radius: 50%; background: #ffffff79; box-shadow: 0 0 2px #000b;
}
.event-cover-dots button[aria-current='true'] span { background: #fff; }
.event-cover-dots button:focus-visible { outline-color: #fff; outline-offset: -2px; }
</style>
