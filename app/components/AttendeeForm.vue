<script setup lang="ts">
import { isFileField, type Answer, type Attachment, type Field, type FormVersion, type Registration } from '#shared/models'

const props = defineProps<{ slug: string, form: FormVersion, registration?: Registration, fixedSubmit?: boolean }>()
const emit = defineEmits<{ saved: [result: { registration: Registration, credential?: string }], cancel: [] }>()
const editing = Boolean(props.registration)
const name = ref(props.registration?.name || '')
const phone = ref(props.registration?.phone || '')
const answers = reactive<Record<string, Answer>>(Object.fromEntries(
  Object.entries(props.registration?.answers || {}).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
))
const files = reactive<Record<string, File[]>>({})
const removals = reactive(new Set<string>())
const fileErrors = reactive<Record<string, string>>({})
const consent = ref(Boolean(props.registration?.identityConsented))
const saving = ref(false)
const error = ref('')
const identityFields = props.form.fields.filter(field => field.type === 'identity')
const shouldConsent = computed(() => identityFields.some(field => field.required || Boolean(answers[field.id])))
const uploaded = props.registration?.attachments || []

const fieldInputId = (id: string) => 'attendee-field-' + id
const choiceValues = (field: Field) => Array.isArray(answers[field.id]) ? answers[field.id] as string[] : []
const fieldAttachments = (field: Field) => uploaded.filter(file => file.fieldId === field.id)
const currentFileLink = (file: Attachment) => attendeeApi(props.slug, 'attachment') + '?id=' + file.id
const maxFiles = (field: Field) => field.maxFiles ?? 1
const activeFiles = (field: Field) => fieldAttachments(field).filter(file => !removals.has(file.id)).length + (files[field.id]?.length || 0)

function pickFiles(field: Field) {
  const input = document.getElementById(fieldInputId(field.id))
  if (input instanceof HTMLInputElement && !input.disabled) input.click()
}

function toggleChoice(field: Field, value: string, event: Event) {
  const chosen = choiceValues(field)
  answers[field.id] = (event.target as HTMLInputElement).checked
    ? [...chosen, value]
    : chosen.filter(option => option !== value)
}

function chooseFiles(field: Field, event: Event) {
  const input = event.target as HTMLInputElement
  const chosen = Array.from(input.files || [])
  input.value = ''
  if (!chosen.length) return
  delete fileErrors[field.id]

  const megabytes = field.type === 'image' ? 5 : 10
  const extensions = field.type === 'image' ? /\.(jpe?g|png|webp)$/i : /\.(pdf|docx|xlsx)$/i
  if (chosen.some(file => !file.size || file.size > megabytes * 1024 * 1024 || !extensions.test(file.name))) {
    fileErrors[field.id] = '请选择支持的格式，单个文件最大 ' + megabytes + ' MB。'
    return
  }
  if (activeFiles(field) + chosen.length > maxFiles(field)) {
    fileErrors[field.id] = field.label + '最多可上传 ' + maxFiles(field) + ' 个附件。'
    return
  }
  files[field.id] = [...(files[field.id] || []), ...chosen]
}

function toggleAttachment(field: Field, file: Attachment) {
  if (!removals.has(file.id)) {
    removals.add(file.id)
    delete fileErrors[field.id]
  } else if (activeFiles(field) < maxFiles(field)) {
    removals.delete(file.id)
    delete fileErrors[field.id]
  } else {
    fileErrors[field.id] = '请先移除一个附件，再撤销移除。'
  }
}

function removePending(field: Field, index: number) {
  if (files[field.id]) files[field.id] = files[field.id].filter((_, position) => position !== index)
  delete fileErrors[field.id]
}

function validateCustomFields() {
  for (const field of props.form.fields) {
    if (field.type === 'checkbox' && field.required && !choiceValues(field).length) return '请选择' + field.label
    if (isFileField(field.type) && field.required && !activeFiles(field)) return '请上传' + field.label
  }
  const keptBytes = uploaded.reduce((total, item) => total + (removals.has(item.id) ? 0 : item.byteCount), 0)
  const incomingBytes = Object.values(files).flat().reduce((total, file) => total + file.size, 0)
  if (keptBytes + incomingBytes > 20 * 1024 * 1024) return '每份报名的附件合计不得超过 20 MB。'
  return ''
}

async function submit() {
  if (saving.value) return
  error.value = validateCustomFields()
  if (error.value) return

  saving.value = true
  try {
    const data = new FormData()
    data.append('payload', JSON.stringify({
      formId: props.form.id, answers, identityConsent: consent.value,
      ...(props.registration
        ? { edits: props.registration.edits, removeAttachments: [...removals] }
        : props.form.legacyContact ? { name: name.value, phone: phone.value } : {}),
    }))
    for (const [id, pending] of Object.entries(files)) for (const file of pending) data.append(id, file)

    if (editing) {
      const registration = await $fetch<Registration>(attendeeApi(props.slug, 'edit'), { method: 'POST', body: data })
      emit('saved', { registration })
    } else {
      const result = await $fetch<{ registration: Registration, credential: string }>(
        attendeeApi(props.slug, 'register'), { method: 'POST', body: data },
      )
      emit('saved', result)
    }
  } catch (cause) {
    error.value = errorText(cause, '提交失败，请稍后再试')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="attendee-input-form" :class="{ 'signup-form': fixedSubmit }" @submit.prevent="submit">
    <div v-if="form.legacyContact" class="attendee-field">
      <label for="attendee-registration-name">姓名 <span v-if="!editing" class="attendee-required" aria-hidden="true">*</span></label>
      <input id="attendee-registration-name" v-model.trim="name" :readonly="editing" maxlength="80" required autocomplete="name" />
    </div>
    <div v-if="form.legacyContact" class="attendee-field">
      <label for="attendee-registration-phone">报名手机号 <span v-if="!editing" class="attendee-required" aria-hidden="true">*</span></label>
      <input id="attendee-registration-phone" v-model.trim="phone" :readonly="editing" maxlength="30" required type="tel" inputmode="tel" autocomplete="tel" />
    </div>
    <template v-for="field in form.fields" :key="field.id">
      <h2 v-if="field.type === 'title'" class="attendee-field-title">{{ field.label }}</h2>
      <p v-else-if="field.type === 'note'" class="attendee-field-note">{{ field.label }}</p>
      <fieldset v-else-if="field.type === 'radio' || field.type === 'checkbox'" class="attendee-field attendee-choice-field">
        <legend>{{ field.label }} <span v-if="field.required" class="attendee-required" aria-hidden="true">*</span><span v-if="field.required" class="sr-only">必填</span></legend>
        <label v-for="option in field.options" :key="option" class="attendee-option">
          <input v-if="field.type === 'radio'" v-model="answers[field.id]" type="radio" :name="fieldInputId(field.id)" :value="option" :required="field.required" />
          <input v-else type="checkbox" :checked="choiceValues(field).includes(option)" :value="option" @change="toggleChoice(field, option, $event)" />
          {{ option }}
        </label>
      </fieldset>
      <div v-else-if="isFileField(field.type)" class="attendee-field">
        <label :for="fieldInputId(field.id)">{{ field.label }} <span v-if="field.required" class="attendee-required" aria-hidden="true">*</span></label>
        <ul v-if="fieldAttachments(field).length || files[field.id]?.length" class="attendee-file-list">
          <li v-for="file in fieldAttachments(field)" :key="file.id" class="attendee-file-current">
            <a :href="currentFileLink(file)" class="attendee-inline-link" download>{{ file.filename }}</a>
            <span v-if="removals.has(file.id)" class="attendee-helper">保存后移除</span>
            <UButton type="button" color="neutral" size="sm" variant="ghost" :aria-label="(removals.has(file.id) ? '撤销移除 ' : '移除附件 ') + file.filename" @click="toggleAttachment(field, file)">
              {{ removals.has(file.id) ? '撤销移除' : '移除附件' }}
            </UButton>
          </li>
          <li v-for="(file, index) in files[field.id] || []" :key="'pending-' + index" class="attendee-file-current">
            <span>{{ file.name }}</span>
            <UButton type="button" color="neutral" size="sm" variant="ghost" :aria-label="'取消上传 ' + file.name" @click="removePending(field, index)">取消上传</UButton>
          </li>
        </ul>
        <input
          :id="fieldInputId(field.id)" type="file" :hidden="fixedSubmit"
          :multiple="maxFiles(field) > 1" :disabled="activeFiles(field) >= maxFiles(field)"
          :accept="field.type === 'image' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.docx,.xlsx'"
          :aria-describedby="fieldInputId(field.id) + '-format'"
          :aria-invalid="!!fileErrors[field.id]"
          @change="chooseFiles(field, $event)"
        />
        <button
          v-if="fixedSubmit" type="button" class="signup-upload-button"
          :aria-label="(field.type === 'image' ? '添加图片：' : '添加文件：') + field.label"
          :aria-describedby="fieldInputId(field.id) + '-format'"
          :disabled="activeFiles(field) >= maxFiles(field)" @click="pickFiles(field)"
        >
          <UIcon :name="field.type === 'image' ? 'i-lucide-image-plus' : 'i-lucide-paperclip'" aria-hidden="true" />
          <span>{{ field.type === 'image' ? '添加图片' : '添加文件' }}</span>
          <span class="signup-upload-count">{{ activeFiles(field) }} / {{ maxFiles(field) }}</span>
        </button>
        <small :id="fieldInputId(field.id) + '-format'" class="attendee-helper">
          {{ field.type === 'image' ? 'JPG、PNG 或 WebP，单个最大 5 MB。' : 'PDF、DOCX 或 XLSX，单个最大 10 MB。' }}
          <span v-if="!fixedSubmit">{{ activeFiles(field) }} / {{ maxFiles(field) }} 个附件。</span>
        </small>
        <p v-if="fileErrors[field.id]" class="attendee-field-error" role="alert">{{ fileErrors[field.id] }}</p>
      </div>
      <div v-else class="attendee-field">
        <label :for="fieldInputId(field.id)">{{ field.label }} <span v-if="field.required" class="attendee-required" aria-hidden="true">*</span></label>
        <textarea v-if="field.type === 'textarea'" :id="fieldInputId(field.id)" v-model="answers[field.id]" :required="field.required" maxlength="4000"></textarea>
        <input
          v-else :id="fieldInputId(field.id)" v-model="answers[field.id]" :required="field.required" :readonly="editing && !!field.contactRole"
          :type="field.type === 'phone' ? 'tel' : 'text'" :inputmode="field.type === 'phone' ? 'tel' : 'text'"
          :maxlength="field.contactRole === 'name' ? 80 : field.type === 'identity' ? 18 : field.type === 'phone' ? 30 : 500"
          :autocomplete="field.type === 'phone' ? 'tel' : 'off'"
        />
      </div>
    </template>

    <aside v-if="identityFields.length" class="attendee-consent">
      <strong>身份证号收集用途</strong>
      <p class="attendee-field-note">{{ form.identityPurpose }}</p>
      <label>
        <input v-model="consent" type="checkbox" :required="shouldConsent" />
        <span>我已阅读上述说明，并同意收集身份证号码。</span>
      </label>
    </aside>
    <p v-if="error && !fixedSubmit" class="attendee-error" role="alert">{{ error }}</p>
    <div class="attendee-actions" :class="{ 'signup-action-dock': fixedSubmit }">
      <p v-if="error && fixedSubmit" class="attendee-error" role="alert">{{ error }}</p>
      <UButton type="submit" class="attendee-action" :loading="saving">{{ editing ? '保存修改' : '提交报名' }}</UButton>
      <UButton v-if="editing" type="button" class="attendee-action" color="neutral" variant="outline" :disabled="saving" @click="emit('cancel')">取消修改</UButton>
    </div>
  </form>
</template>
