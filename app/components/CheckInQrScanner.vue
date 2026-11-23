<script setup lang="ts">
import { scannedCheckInPath } from '#shared/attendee-account'

const video = ref<HTMLVideoElement>()
const starting = ref(false)
const scanning = ref(false)
const message = ref('')
let stream: MediaStream | undefined
let scanTimer: ReturnType<typeof setTimeout> | undefined
let attempt = 0

function stop() {
  attempt++
  clearTimeout(scanTimer)
  stream?.getTracks().forEach(track => track.stop())
  stream = undefined
  if (video.value) video.value.srcObject = null
  scanning.value = starting.value = false
  message.value = ''
}

async function start() {
  if (starting.value || scanning.value) return
  if (!navigator.mediaDevices?.getUserMedia || !video.value) {
    message.value = '当前浏览器无法打开相机，请用微信扫一扫或手机相机。'
    return
  }
  const current = ++attempt
  starting.value = true
  message.value = ''
  const preview = video.value
  try {
    const { default: decode } = await import('jsqr')
    if (attempt !== current) return
    const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
    if (attempt !== current) {
      camera.getTracks().forEach(track => track.stop())
      return
    }

    stream = camera
    scanning.value = true
    preview.srcObject = camera
    await nextTick()
    if (attempt !== current) return
    await preview.play()
    if (attempt !== current) return
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Camera decoder unavailable')
    starting.value = false

    function scan() {
      if (attempt !== current) return
      if (preview.readyState >= 2 && preview.videoWidth && context) {
        const scale = Math.min(1, 560 / Math.max(preview.videoWidth, preview.videoHeight))
        const width = Math.max(1, Math.round(preview.videoWidth * scale))
        const height = Math.max(1, Math.round(preview.videoHeight * scale))
        if (canvas.width !== width) canvas.width = width
        if (canvas.height !== height) canvas.height = height
        context.drawImage(preview, 0, 0, canvas.width, canvas.height)
        const frame = context.getImageData(0, 0, canvas.width, canvas.height)
        const code = decode(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })
        if (code) {
          const path = scannedCheckInPath(code.data, window.location.origin)
          if (path) {
            stop()
            void navigateTo(path)
            return
          }
          message.value = '请对准 QiMeet 现场签到码。'
        }
      }
      scanTimer = setTimeout(scan, 180)
    }
    scan()
  } catch {
    if (attempt !== current) return
    stop()
    message.value = '相机未能打开。你可以检查相机权限，或用微信扫一扫。'
  }
}

onMounted(() => window.addEventListener('pagehide', stop))
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', stop)
  stop()
})
</script>

<template>
  <div class="check-in-scanner">
    <video v-show="scanning" ref="video" playsinline muted aria-label="签到码扫描预览" />
    <div v-if="!scanning" class="check-in-scanner-idle">
      <span><UIcon name="i-lucide-qr-code" aria-hidden="true" /></span>
      <p>打开相机，对准主办方提供的签到码。</p>
    </div>
    <div class="check-in-scanner-actions">
      <UButton v-if="!scanning" type="button" icon="i-lucide-camera" :loading="starting" @click="start">打开相机</UButton>
      <UButton v-if="scanning || starting" type="button" color="neutral" variant="outline" @click="stop">关闭相机</UButton>
    </div>
    <p v-if="message" class="attendee-helper check-in-scanner-note" role="status">{{ message }}</p>
  </div>
</template>

<style scoped>
.check-in-scanner { display: grid; justify-items: center; gap: 14px; }
.check-in-scanner video { width: 100%; max-height: 300px; border-radius: 10px; background: #132341; }
.check-in-scanner-idle { display: grid; justify-items: center; gap: 10px; text-align: center; }
.check-in-scanner-idle > span { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 12px; background: #eaf1ff; color: #2356bf; font-size: 24px; }
.check-in-scanner-idle p { font-size: 14px; }
.check-in-scanner-actions { width: min(100%, 18rem); display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.check-in-scanner-actions > button { flex: 1 1 120px; min-height: 44px; justify-content: center; }
.check-in-scanner-note { text-align: center; }
</style>
