<script setup lang="ts">
import { attendeeCheckinSourceLabel, attendeeCheckinSources, displayDate, isContentField, isFileField, type Field, type Registration } from '#shared/models'
import { materialImagePreviewUrl } from '#shared/materials'

definePageMeta({ layout: false, pageTransition: false, key: route => route.path })
const { slug, path, details } = useAttendeeEvent()
const route = useRoute()
const recovering = computed(() => route.query.recover === '1')
const request = useRequestFetch()
const { data: event, error: eventError } = await details
if (event.value && !event.value.signedIn) await navigateTo(attendeeLogin(path + '/record' + (recovering.value ? '?recover=1' : '')), { redirectCode: 302 })
setAttendeeErrorStatus(eventError.value)
const pageLabel = computed(() => recovering.value ? '找回报名' : '报名详情')
const back = computed(() => recovering.value ? { to: '/mine/recover', label: '活动列表' }
  : !event.value ? { to: '/activities', label: '活动首页' } : undefined)
useSeoMeta({ title: () => event.value ? pageLabel.value + ' · ' + event.value.conference.title : pageLabel.value })

const { data, error } = await useAsyncData('attendee-record:' + slug, async () => {
  if (!event.value?.signedIn) return { registration: null }
  try {
    return { registration: await request<Registration>(attendeeApi(slug, 'record')) }
  } catch (cause) {
    if (attendeeErrorStatus(cause) !== 401) throw cause
    return { registration: null }
  }
})
const record = computed(() => data.value?.registration)
const directPoints = computed(() => new Set(event.value?.conference.endedAt ? [] : event.value?.checkpoints
  .filter(point => point.directEnabled && Date.parse(point.endsAt) > Date.now()).map(point => point.id)))
const editing = ref(false)
const status = ref('')
const heading = ref<HTMLElement>()

async function recovered(registration: Registration) {
  data.value = { registration }
  if (event.value) event.value = { ...event.value, recognized: true, checkedInSources: attendeeCheckinSources(registration.attendance) }
  clearNuxtData(['attendee-account-registrations', 'attendee-pending-checkins', 'attendee-checkin-history'])
  status.value = '已找回报名记录。'
  await navigateTo(path + '/record', { replace: true })
  void nextTick(() => heading.value?.focus())
}

function saveEdited(result: { registration: Registration }) {
  data.value = { registration: result.registration }
  editing.value = false
  status.value = '修改已保存。'
  void nextTick(() => heading.value?.focus())
}

const fieldValue = (field: Field) => {
  const answer = record.value?.answers[field.id]
  return Array.isArray(answer) ? answer.join('、') : answer
}
const attachments = (field: Field) => record.value?.attachments.filter(item => item.fieldId === field.id) || []
const attachmentLink = (id: string) => attendeeApi(slug, 'attachment') + '?id=' + id
</script>

<template>
  <NuxtLayout name="attendee" :toolbar-title="pageLabel" :back="back" :navigation="!recovering">
    <div class="record-screen">
      <AttendeeUnavailable
        v-if="!event" title="活动暂不可查看"
        :message="errorText(eventError, '请向活动主办方确认链接。')"
      />
      <template v-else>
        <header class="record-event-heading">
          <div class="attendee-event-summary">
            <img v-if="event.conference.coverUrl" :src="materialImagePreviewUrl(event.conference.coverUrl)" class="attendee-event-summary-cover" alt="" width="64" height="48" />
            <div>
              <h1 ref="heading" tabindex="-1">{{ event.conference.title }}</h1>
              <time :datetime="event.conference.startsAt">{{ displayDate(event.conference.startsAt) }}</time>
            </div>
          </div>
          <p v-if="status" class="attendee-notice" role="status">{{ status }}</p>
          <p v-if="!record && error" role="alert" class="attendee-error">{{ errorText(error, '暂时无法读取报名记录，可尝试找回。') }}</p>
        </header>

        <div v-if="recovering" class="record-stack">
          <AttendeeRecovery class="record-block attendee-compact-recovery" :slug="slug"
            :identity-recovery="event.identityRecovery" @recovered="recovered" />
        </div>

        <section v-else-if="!record" class="record-block record-empty">
          <h2>当前活动暂无报名记录</h2>
        </section>

        <template v-else>
          <section class="record-block attendee-stack" aria-labelledby="record-receipt-title">
            <div class="split-row">
              <h2 id="record-receipt-title" class="attendee-card-title">报名回执</h2>
              <span class="attendee-label done">报名成功</span>
            </div>
            <dl class="attendee-answers">
              <div class="attendee-answer-row"><dt>报名编号</dt><dd>#{{ record.id }}</dd></div>
              <div class="attendee-answer-row"><dt>提交时间</dt><dd><time :datetime="record.createdAt">{{ displayDate(record.createdAt) }}</time></dd></div>
              <div v-if="record.name && (record.form.legacyContact || !record.fullAccess)" class="attendee-answer-row"><dt>姓名</dt><dd>{{ record.name }}</dd></div>
              <div v-if="record.phone && (record.form.legacyContact || !record.fullAccess)" class="attendee-answer-row"><dt>报名手机号</dt><dd>{{ record.phone }}</dd></div>
            </dl>
          </section>
          <section v-if="record.attendance.length" class="record-block attendee-stack">
            <h2 class="attendee-card-title">现场签到</h2>
            <ul class="attendee-attendance">
              <li v-for="item in record.attendance" :key="item.id">
                <div>
                  <strong>{{ item.title }}</strong>
                  <time v-if="item.checkedAt" :datetime="item.checkedAt" class="attendee-helper">{{ displayDate(item.checkedAt) }}</time>
                  <span v-if="item.source" class="attendee-helper">{{ attendeeCheckinSourceLabel(item.source) }}</span>
                </div>
                <NuxtLink v-if="!item.checkedAt && directPoints.has(item.id)" class="attendee-top-link"
                  :to="{ path: path + '/check-in', query: { point: item.id } }">手机签到</NuxtLink>
                <span v-else class="attendee-label" :class="{ done: !!item.checkedAt }">{{ item.checkedAt ? '已签到' : '未签到' }}</span>
              </li>
            </ul>
          </section>

          <section v-if="editing" class="record-block attendee-stack">
            <h2 class="attendee-card-title">修改报名</h2>
            <AttendeeForm :slug="slug" :form="record.form" :registration="record" @saved="saveEdited" @cancel="editing = false" />
          </section>
          <section v-else-if="record.fullAccess && record.form.fields.some(field => !isContentField(field.type))" class="record-block attendee-stack">
            <div>
              <h2 class="attendee-card-title">报名资料</h2>
              <p v-if="record.updatedAt" class="attendee-subheading">上次修改于 {{ displayDate(record.updatedAt) }}</p>
            </div>
            <dl class="attendee-answers">
              <div v-for="field in record.form.fields.filter(field => !isContentField(field.type))" :key="field.id" class="attendee-answer-row">
                <dt>{{ field.label }}</dt>
                <dd v-if="isFileField(field.type) && attachments(field).length">
                  <ul class="attendee-file-list">
                    <li v-for="file in attachments(field)" :key="file.id">
                      <a :href="attachmentLink(file.id)" class="attendee-inline-link" download>{{ file.filename }}</a>
                    </li>
                  </ul>
                </dd>
                <dd v-else>{{ fieldValue(field) || '—' }}</dd>
              </div>
            </dl>
          </section>

          <div v-if="!editing && record.canEdit" class="record-actions attendee-actions">
            <UButton type="button" class="attendee-action" @click="editing = true">修改报名</UButton>
          </div>
        </template>
      </template>
    </div>
  </NuxtLayout>
</template>
