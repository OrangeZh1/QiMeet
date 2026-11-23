<script setup lang="ts">
import ConsoleInput from '#qiandao-console/ConsoleInput.vue'
import ConsoleFormActions from '#qiandao-console/ConsoleFormActions.vue'
import ActivityMarkdownEditor from './ActivityMarkdownEditor.vue'
import EventCoverGallery from './EventCoverGallery.vue'
import type { Conference, EditDeadline, EditMode } from '#shared/models'
import { fromLocalInput, toLocalInput } from '#shared/models'

const props = defineProps<{ conference?: Conference }>()
const emit = defineEmits<{ saved: [id: number] }>()
const base = props.conference
const initial = useState('event-new-dates', () => {
  const now = Date.now()
  return { starts: new Date(now + 86400000).toISOString(), ends: new Date(now + 90000000).toISOString(), now: new Date(now).toISOString() }
})
const input = reactive({
  title: base?.title || '',
  slug: base?.slug || '',
  organizer: base?.organizer || '',
  venue: base?.venue || '',
  description: base?.description || '',
  startsAt: toLocalInput(base?.startsAt || initial.value.starts),
  endsAt: toLocalInput(base?.endsAt || initial.value.ends),
  registrationStartsAt: toLocalInput(base?.registrationStartsAt || initial.value.now),
  registrationEndsAt: toLocalInput(base?.registrationEndsAt || initial.value.starts),
  editPolicy: (base?.editPolicy || 'off') as EditMode,
  editDeadline: (base?.editDeadline || 'registration') as EditDeadline,
})
const coverImages = ref<Conference['coverImages']>(base?.coverImages?.length
  ? [...base.coverImages]
  : base?.coverMaterialId ? [{ id: base.coverMaterialId, url: materialPreviewUrl(base.coverMaterialId) }] : [])
const coverChanged = ref(false)
const coverBusy = ref(false)
const introBusy = ref(false)
function setCovers(images: Conference['coverImages']) {
  coverImages.value = images
  coverChanged.value = true
}

const saving = ref<'draft' | 'publish' | 'save' | null>(null)
const error = ref('')
async function save(event: SubmitEvent) {
  if (saving.value || coverBusy.value || introBusy.value) return
  const publish = !base && (event.submitter as HTMLButtonElement | null)?.value === 'publish'
  saving.value = base ? 'save' : publish ? 'publish' : 'draft'
  error.value = ''
  try {
    const body = {
      ...input,
      ...(!base ? { published: publish } : {}),
      ...(coverChanged.value || !base ? { coverMaterialIds: coverImages.value.map(image => image.id) } : {}),
      startsAt: fromLocalInput(input.startsAt), endsAt: fromLocalInput(input.endsAt),
      registrationStartsAt: fromLocalInput(input.registrationStartsAt), registrationEndsAt: fromLocalInput(input.registrationEndsAt),
    }
    const result = await manageRequest<{ id: number }>(base ? 'save' : 'create', {
      method: 'POST', query: { eventId: base?.id }, body,
    })
    emit('saved', result.id)
  } catch (cause) {
    error.value = errorText(cause, '保存活动失败，请检查时间和内容')
  } finally {
    saving.value = null
  }
}

const editOptions = [
  { label: '关闭', value: 'off' },
  { label: '允许一次', value: 'once' },
  { label: '不限次数', value: 'unlimited' },
] as const
const deadlineOptions = [
  { label: '报名截止时关闭', value: 'registration' },
  { label: '管理员手动关闭', value: 'manual' },
] as const
</script>

<template>
  <form class="panel event-editor" @submit.prevent="save">
    <section class="event-editor-section" aria-labelledby="event-summary">
      <header class="event-section-heading"><span><UIcon name="i-lucide-clipboard-list" /></span><h2 id="event-summary">活动资料</h2></header>
      <div class="event-input-grid">
        <UFormField label="活动名称" required>
          <ConsoleInput v-model="input.title" size="lg" maxlength="160" required placeholder="例如 城市创意交流会" />
        </UFormField>
        <UFormField label="活动链接标识" :help="base ? '活动链接创建后固定。' : '留空自动生成，可用小写字母、数字和连字符。'">
          <ConsoleInput v-model="input.slug" size="lg" :readonly="!!base" maxlength="64" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="例如 spring-meet">
            <template #leading><span class="muted-text">/e/</span></template>
          </ConsoleInput>
        </UFormField>
        <UFormField label="主办方"><ConsoleInput v-model="input.organizer" size="lg" maxlength="160" /></UFormField>
        <UFormField label="会场地点"><ConsoleInput v-model="input.venue" size="lg" maxlength="200" /></UFormField>
      </div>
      <div class="event-media-grid">
        <EventCoverGallery class="event-cover-field" :model-value="coverImages"
          :legacy-url="coverChanged ? undefined : base?.coverUrl" :disabled="!!saving"
          @update:model-value="setCovers" @busy="coverBusy = $event" />
        <ActivityMarkdownEditor v-model="input.description" :disabled="!!saving" @busy="introBusy = $event" />
      </div>
    </section>

    <section class="event-editor-section" aria-labelledby="event-schedule">
      <header class="event-section-heading"><span><UIcon name="i-lucide-calendar-clock" /></span><h2 id="event-schedule">时间安排</h2></header>
      <div class="event-input-grid">
        <fieldset class="schedule-group">
          <legend>活动时间</legend>
          <div class="schedule-fields">
            <UFormField label="活动开始" required><ConsoleInput v-model="input.startsAt" size="lg" type="datetime-local" required /></UFormField>
            <UFormField label="活动结束" required><ConsoleInput v-model="input.endsAt" size="lg" type="datetime-local" :min="input.startsAt" required /></UFormField>
          </div>
        </fieldset>
        <fieldset class="schedule-group">
          <legend>报名窗口</legend>
          <div class="schedule-fields">
            <UFormField label="报名开始" required><ConsoleInput v-model="input.registrationStartsAt" size="lg" type="datetime-local" required /></UFormField>
            <UFormField label="报名截止" required><ConsoleInput v-model="input.registrationEndsAt" size="lg" type="datetime-local" :min="input.registrationStartsAt" required /></UFormField>
          </div>
        </fieldset>
      </div>
    </section>

    <section class="event-editor-section" aria-labelledby="event-edit-rules">
      <header class="event-section-heading"><span><UIcon name="i-lucide-list-checks" /></span><h2 id="event-edit-rules">报名后修改</h2></header>
      <div class="event-input-grid">
        <UFormField label="修改次数">
          <AdminSelect v-model="input.editPolicy" :items="editOptions" />
        </UFormField>
        <UFormField v-if="input.editPolicy !== 'off'" label="修改期限">
          <AdminSelect v-model="input.editDeadline" :items="deadlineOptions" />
        </UFormField>
      </div>
    </section>

    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <ConsoleFormActions class="event-editor-actions">
      <template v-if="!base">
        <UButton type="submit" name="intent" value="draft" color="neutral" variant="outline" icon="i-lucide-file-pen-line"
          :loading="saving === 'draft'" :disabled="coverBusy || introBusy || saving === 'publish'">保存为草稿</UButton>
        <UButton type="submit" name="intent" value="publish" icon="i-lucide-radio"
          :loading="saving === 'publish'" :disabled="coverBusy || introBusy || saving === 'draft'">发布活动</UButton>
      </template>
      <UButton v-else type="submit" icon="i-lucide-save" :loading="saving === 'save'" :disabled="coverBusy || introBusy">保存活动</UButton>
    </ConsoleFormActions>
  </form>
</template>

<style scoped>
.event-editor { display: grid; --editor-padding: clamp(18px, 2.6vw, 28px); }
.event-editor-section { display: grid; gap: 16px; padding: var(--editor-padding); }
.event-editor-section + .event-editor-section { border-top: 1px solid var(--line); }
.event-section-heading { display: flex; align-items: center; gap: 10px; }
.event-section-heading > span { width: 33px; height: 33px; border-radius: 9px; background: #eaf1ff; color: #2c59bb; display: grid; place-items: center; font-size: 17px; }
.event-section-heading h2 { font-size: 18px; font-weight: 710; }
.event-input-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; }
.event-media-grid { display: grid; gap: 18px; padding-top: 15px; border-top: 1px solid var(--line); }
.event-cover-field { width: 100%; max-width: 35rem; }
.schedule-group { min-width: 0; padding: 0; }
.schedule-group legend { color: var(--muted); font-size: 14px; font-weight: 650; margin-bottom: 8px; }
.schedule-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.schedule-fields :deep(input) { min-width: 0; }
.event-editor-actions { padding: 14px var(--editor-padding); border-top: 1px solid var(--line); }
.event-editor > .feedback { margin: 0 var(--editor-padding) 14px; }
@media (max-width: 1220px) { .schedule-fields { grid-template-columns: 1fr; } }
@media (max-width: 670px) {
  .event-input-grid { grid-template-columns: 1fr; }
  .schedule-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 430px) { .schedule-fields { grid-template-columns: 1fr; } }
</style>
