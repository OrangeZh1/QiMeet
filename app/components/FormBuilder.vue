<script setup lang="ts">
import { fieldLabels, isContentField, isFileField, legacyContactFields, type Field, type FieldType, type FormVersion } from '#shared/models'
import ConsoleDialog from './material/ConsoleDialog.vue'

const props = defineProps<{ eventId: number, forms: FormVersion[], activityTitle: string, registrationSms: boolean }>()
const emit = defineEmits<{ saved: [value: FormVersion], notificationSaved: [enabled: boolean] }>()

type DraftOption = { id: string, value: string }
type DraftField = Omit<Field, 'options'> & { options: DraftOption[] }
type Panel = 'palette' | 'canvas' | 'properties'
type ContactRole = NonNullable<Field['contactRole']>

const fieldLimit = 40
const optionLimit = 30
const fileLimits = Array.from({ length: 10 }, (_, index) => index + 1)
const palette: { label: string, types: FieldType[] }[] = [
  { label: '内容', types: ['title', 'note'] },
  { label: '输入', types: ['text', 'textarea', 'phone', 'identity'] },
  { label: '选择', types: ['radio', 'checkbox'] },
  { label: '上传', types: ['file', 'image'] },
]
const icons: Record<FieldType, string> = {
  title: 'i-lucide-heading', note: 'i-lucide-align-left', text: 'i-lucide-text-cursor-input',
  textarea: 'i-lucide-text-align-start', phone: 'i-lucide-phone', identity: 'i-lucide-id-card',
  radio: 'i-lucide-circle-dot', checkbox: 'i-lucide-list-checks',
  file: 'i-lucide-paperclip', image: 'i-lucide-image',
}
const typeItems = palette.flatMap(group => group.types.map(type => ({ value: type, label: fieldLabels[type], icon: icons[type] })))
const panels: { id: Panel, label: string }[] = [
  { id: 'palette', label: '添加字段' }, { id: 'canvas', label: '表单画布' }, { id: 'properties', label: '字段属性' },
]
const versions = ref([...props.forms])
const active = computed(() => versions.value[0]!)
const versionFields = (form: FormVersion) => form.legacyContact ? [...legacyContactFields, ...form.fields] : form.fields
const draft = (form: FormVersion): DraftField[] => versionFields(form).map(field => ({
  ...field,
  options: field.options.map((value, index) => ({ id: field.id + '-' + index, value })),
}))
const text = (value: string) => value.trim().normalize('NFC')
const hasOptions = (type: FieldType) => type === 'radio' || type === 'checkbox'
const roleFor = (type: FieldType): ContactRole | undefined => type === 'text' ? 'name' : type === 'phone' ? 'phone' : undefined
const roleName = { name: '姓名', phone: '手机号' }
const roleCaption = { name: '找回用姓名', phone: '找回用手机号' }
const smsRoleLabel = { name: '用作短信姓名变量', phone: '用作短信收件手机号' }
const smsRoleCaption = { name: '短信姓名', phone: '短信收件号码' }
const fieldName = (field: DraftField) => text(field.label) || '未命名' + fieldLabels[field.type]
const fields = ref(draft(active.value))
const nameField = computed(() => fields.value.find(field => field.contactRole === 'name')
  ?? fields.value.find(field => field.type === 'text' && text(field.label) === '姓名'))
const selectedId = ref<string | null>(fields.value[0]?.id ?? null)
const selected = computed(() => fields.value.find(field => field.id === selectedId.value))
const selectedRole = computed(() => selected.value && roleFor(selected.value.type))
const boundElsewhere = computed(() => fields.value.find(field => selectedRole.value && field.contactRole === selectedRole.value && field.id !== selectedId.value))
const smsBoundElsewhere = computed(() => fields.value.find(field => selectedRole.value && field.smsRole === selectedRole.value && field.id !== selectedId.value))
const identityPurpose = ref(active.value.identityPurpose)
const view = ref<Panel>('canvas')
const saving = ref(false)
const feedback = ref('')
const error = ref('')
const registrationSms = ref(props.registrationSms)
const notificationSaving = ref(false)
const notificationError = ref('')
const notificationFeedback = ref('')
watch(registrationSms, () => { notificationFeedback.value = notificationError.value = '' })
const previewOpen = ref(false)
const historyOpen = ref(false)
const historicId = ref<number>()
const historic = computed(() => versions.value.find(form => form.id === historicId.value && form.id !== active.value.id))
const historyItems = computed(() => versions.value.slice(1).map(form => ({ value: form.id, label: 'V' + form.version })))
const editorId = useId()
const sortingId = ref<string>()
const target = ref<{ id: string, after: boolean }>()
const sortMessage = ref('')
const currentFields = computed<Field[]>(() => fields.value.map(field => ({
  id: field.id, type: field.type, label: text(field.label), required: !isContentField(field.type) && field.required,
  options: hasOptions(field.type) ? field.options.map(option => text(option.value)) : [],
  contactRole: field.contactRole === roleFor(field.type) ? field.contactRole : undefined,
  smsRole: field.smsRole === roleFor(field.type) ? field.smsRole : undefined,
  maxFiles: isFileField(field.type) ? field.maxFiles ?? 1 : undefined,
})))
const previewFields = computed(() => currentFields.value.map(field => ({ ...field, options: field.options.filter(Boolean) })))
const hasIdentity = computed(() => currentFields.value.some(field => field.type === 'identity'))
const purpose = computed(() => hasIdentity.value ? text(identityPurpose.value) : '')
const snapshot = (items: Field[], description: string) => JSON.stringify([
  description, items.map(field => [
    field.id, field.type, field.label, field.required, field.options,
    field.contactRole, field.smsRole, isFileField(field.type) ? field.maxFiles ?? 1 : undefined,
  ]),
])
const dirty = computed(() => snapshot(currentFields.value, purpose.value) !== snapshot(versionFields(active.value), active.value.identityPurpose))
const canSave = computed(() => active.value.legacyContact || dirty.value)

function select(id: string) {
  selectedId.value = id
  view.value = 'properties'
}

function newOption(): DraftOption { return { id: crypto.randomUUID(), value: '' } }

function add(type: FieldType, preset?: Pick<Field, 'label' | 'required' | 'contactRole'>) {
  if (fields.value.length >= fieldLimit || saving.value) return
  const id = crypto.randomUUID()
  fields.value.push({ id, type, label: '', required: false, options: hasOptions(type) ? [newOption(), newOption()] : [], ...preset })
  select(id)
}

function addName() {
  if (nameField.value) select(nameField.value.id)
  else add('text', { label: '姓名', required: true, contactRole: 'name' })
}

function duplicateField(index: number) {
  const source = fields.value[index]
  if (!source || fields.value.length >= fieldLimit || saving.value) return
  const id = crypto.randomUUID()
  fields.value.splice(index + 1, 0, {
    ...source, id, contactRole: undefined, smsRole: undefined,
    options: source.options.map(option => ({ id: crypto.randomUUID(), value: option.value })),
  })
  select(id)
}

function bindContact(enabled: boolean) {
  const field = selected.value
  const role = selectedRole.value
  if (!field || !role) return
  const previous = boundElsewhere.value
  if (enabled && previous) previous.contactRole = undefined
  field.contactRole = enabled ? role : undefined
}

function bindSms(enabled: boolean) {
  const field = selected.value
  const role = selectedRole.value
  if (!field || !role) return
  const previous = smsBoundElsewhere.value
  if (enabled && previous) previous.smsRole = undefined
  field.smsRole = enabled ? role : undefined
}

function changeType(type: FieldType) {
  const field = selected.value
  if (!field) return
  field.type = type
  if (field.contactRole !== roleFor(type)) field.contactRole = undefined
  if (field.smsRole !== roleFor(type)) field.smsRole = undefined
  if (!isFileField(type)) field.maxFiles = undefined
  if (hasOptions(type) && !field.options.length) field.options = [newOption(), newOption()]
}

function addOption(field: DraftField) {
  if (field.options.length < optionLimit) field.options.push(newOption())
}

function removeField(index: number) {
  const [removed] = fields.value.splice(index, 1)
  if (removed?.id !== selectedId.value) return
  selectedId.value = (fields.value[index] ?? fields.value[index - 1])?.id ?? null
}

function moveField(from: number, to: number) {
  if (from === to || from < 0 || to < 0 || to >= fields.value.length) return
  const [field] = fields.value.splice(from, 1)
  if (!field) return
  fields.value.splice(to, 0, field)
  sortMessage.value = fieldName(field) + '已移到第 ' + (to + 1) + ' 位'
}

function dragStart(event: DragEvent, id: string) {
  if (!event.dataTransfer || saving.value) return
  sortingId.value = id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', id)
}

function dragOver(event: DragEvent, id: string) {
  if (!sortingId.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  if (sortingId.value === id || !(event.currentTarget instanceof HTMLElement)) {
    target.value = undefined
    return
  }
  const bounds = event.currentTarget.getBoundingClientRect()
  target.value = { id, after: event.clientY >= bounds.top + bounds.height / 2 }
}

function dragEnd() {
  sortingId.value = undefined
  target.value = undefined
}

function drop(event: DragEvent, id: string) {
  if (!sortingId.value) return
  event.preventDefault()
  if (target.value?.id === id) {
    const from = fields.value.findIndex(field => field.id === sortingId.value)
    const insertion = fields.value.findIndex(field => field.id === id) + Number(target.value.after)
    moveField(from, insertion - Number(from < insertion))
  }
  dragEnd()
}

function invalidField(field: Field) {
  const limit = field.type === 'note' ? 800 : 120
  if (!field.label || field.label.length > limit) return '请填写' + fieldLabels[field.type] + '，最多 ' + limit + ' 字'
  if (hasOptions(field.type) && (field.options.length < 2 || field.options.some(option => !option || option.length > 120))) {
    return '请为「' + field.label + '」填写每个选项，至少 2 项，每项最多 120 字'
  }
  if (new Set(field.options).size !== field.options.length) return '「' + field.label + '」有重复选项'
  return ''
}

async function save() {
  if (saving.value || !canSave.value) return
  error.value = feedback.value = ''
  if (fields.value.length > fieldLimit) {
    error.value = '新版本最多保存 ' + fieldLimit + ' 个字段，请先移除超出的字段'
    return
  }
  for (const field of currentFields.value) {
    const problem = invalidField(field)
    if (!problem) continue
    select(field.id)
    error.value = problem
    return
  }
  if (hasIdentity.value && (!purpose.value || purpose.value.length > 800)) {
    const field = currentFields.value.find(field => field.type === 'identity')
    if (field) select(field.id)
    error.value = '请填写身份证号收集用途，最多 800 字'
    return
  }
  saving.value = true
  try {
    const result = await manageRequest<FormVersion>('save-form', {
      method: 'POST', query: { eventId: props.eventId },
      body: { formId: active.value.id, identityPurpose: purpose.value, fields: currentFields.value },
    })
    versions.value.unshift(result)
    fields.value = draft(result)
    identityPurpose.value = result.identityPurpose
    feedback.value = '报名表已保存为 V' + result.version
    emit('saved', result)
  } catch (cause) {
    error.value = errorText(cause)
  } finally {
    saving.value = false
  }
}

function showHistory() {
  historicId.value = historyItems.value[0]?.value
  historyOpen.value = true
}

async function saveNotification() {
  if (notificationSaving.value || registrationSms.value === props.registrationSms) return
  notificationSaving.value = true
  notificationFeedback.value = notificationError.value = ''
  try {
    const result = await manageRequest<{ registrationSms: boolean }>('save-registration-sms', {
      method: 'POST', query: { eventId: props.eventId }, body: { registrationSms: registrationSms.value },
    })
    emit('notificationSaved', result.registrationSms)
    notificationFeedback.value = '报名通知已保存'
  } catch (cause) {
    notificationError.value = errorText(cause, '暂时无法保存报名通知')
  } finally {
    notificationSaving.value = false
  }
}
</script>

<template>
  <div class="form-builder">
    <form class="builder-shell" novalidate @submit.prevent="save">
      <div class="builder-toolbar">
        <div class="builder-heading">
          <h2>报名表编辑</h2>
          <p>当前版本 V{{ active.version }}<span v-if="dirty"> · 有未保存的更改</span><span v-else-if="active.legacyContact"> · 可保存为自定义版本</span></p>
        </div>
        <div class="builder-actions">
          <UButton v-if="historyItems.length" type="button" color="neutral" variant="ghost" icon="i-lucide-history" @click="showHistory">历史版本</UButton>
          <UButton type="button" color="neutral" variant="outline" icon="i-lucide-smartphone" @click="previewOpen = true">手机预览</UButton>
          <UButton type="submit" icon="i-lucide-save" :loading="saving" :disabled="!canSave">保存新版本</UButton>
        </div>
      </div>

      <p v-if="error || feedback" class="feedback builder-feedback" :class="{ error }" :role="error ? 'alert' : 'status'">{{ error || feedback }}</p>
      <section class="builder-notification" :aria-labelledby="editorId + '-notification'">
        <div>
          <h3 :id="editorId + '-notification'">报名通知</h3>
          <USwitch v-model="registrationSms" label="报名成功后发送短信" :disabled="notificationSaving"
            description="优先使用报名表中的手机号，并核对来宾已验证的号码。短信模板在站点设置中配置。" />
        </div>
        <UButton type="button" color="neutral" variant="outline" :loading="notificationSaving"
          :disabled="registrationSms === props.registrationSms" @click="saveNotification">保存通知设置</UButton>
        <p v-if="notificationError || notificationFeedback" class="feedback" :class="{ error: notificationError }"
          :role="notificationError ? 'alert' : 'status'">{{ notificationError || notificationFeedback }}</p>
      </section>

      <nav class="builder-nav" aria-label="报名表编辑分区">
        <button v-for="item in panels" :key="item.id" type="button" :aria-pressed="view === item.id" :aria-controls="editorId + '-' + item.id" @click="view = item.id">
          {{ item.label }}
        </button>
      </nav>

      <div class="builder-workspace" :data-view="view">
        <section :id="editorId + '-palette'" class="builder-panel builder-palette" aria-label="可添加的字段类型">
          <div class="builder-side-content">
            <h3>字段类型</h3>
            <div v-for="group in palette" :key="group.label" class="palette-group">
              <h4>{{ group.label }}</h4>
              <div class="palette-items">
                <UButton v-if="group.types.includes('text')" type="button" variant="ghost" color="neutral" icon="i-lucide-user-round"
                  :aria-label="nameField ? '定位姓名字段' : '添加姓名'" :disabled="saving || (!nameField && fields.length >= fieldLimit)"
                  class="palette-button" @click="addName">姓名</UButton>
                <UButton v-for="type in group.types" :key="type" type="button" variant="ghost" color="neutral" :icon="icons[type]" :aria-label="'添加' + fieldLabels[type]"
                  :disabled="fields.length >= fieldLimit || saving" class="palette-button" @click="add(type)">
                  {{ fieldLabels[type] }}
                </UButton>
              </div>
            </div>
          </div>
        </section>

        <section :id="editorId + '-canvas'" class="builder-panel builder-canvas" aria-label="报名表画布">
          <div class="canvas-heading">
            <h3>{{ activityTitle }}</h3>
            <p>报名表</p>
          </div>
          <TransitionGroup v-if="fields.length" name="qm-fields" tag="ol" class="canvas-fields" aria-label="自定义字段">
            <li v-for="(field, index) in fields" :key="field.id" class="canvas-field"
              :class="{
                'is-selected': selectedId === field.id, 'is-dragging': sortingId === field.id,
                'drop-before': target?.id === field.id && !target.after, 'drop-after': target?.id === field.id && target.after,
              }"
              @dragover="dragOver($event, field.id)" @drop="drop($event, field.id)">
              <div class="field-heading">
                <span class="field-grip" :draggable="!saving" aria-hidden="true" title="拖动排序" @dragstart="dragStart($event, field.id)" @dragend="dragEnd">
                  <UIcon name="i-lucide-grip-vertical" />
                </span>
                <button type="button" class="field-select" :aria-pressed="selectedId === field.id" @click="select(field.id)">
                  <span>{{ fieldName(field) }} <i v-if="field.required && !isContentField(field.type)" class="required-mark">*</i></span>
                  <small>{{ fieldLabels[field.type] }}<template v-if="field.contactRole"> · {{ roleCaption[field.contactRole] }}</template><template v-if="field.smsRole"> · {{ smsRoleCaption[field.smsRole] }}</template></small>
                </button>
                <div class="field-actions">
                  <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-arrow-up" size="xs" square
                    :aria-label="'上移' + fieldName(field)" title="上移字段" :disabled="index === 0 || saving" @click="moveField(index,index-1)" />
                  <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-arrow-down" size="xs" square
                    :aria-label="'下移' + fieldName(field)" title="下移字段" :disabled="index === fields.length-1 || saving" @click="moveField(index,index+1)" />
                  <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-copy" size="xs" square
                    :aria-label="'复制' + fieldName(field)" title="复制字段" :disabled="fields.length >= fieldLimit || saving" @click="duplicateField(index)" />
                  <UButton type="button" color="error" variant="ghost" icon="i-lucide-trash-2" size="xs" square
                    :aria-label="'移除' + fieldName(field)" title="移除字段" :disabled="saving" @click="removeField(index)" />
                </div>
              </div>
              <ul v-if="hasOptions(field.type)" class="canvas-options">
                <li v-for="option in field.options.slice(0,3)" :key="option.id">
                  <UIcon :name="field.type === 'radio' ? 'i-lucide-circle' : 'i-lucide-square'" aria-hidden="true" />
                  <span>{{ option.value || '待填写选项' }}</span>
                </li>
                <li v-if="field.options.length > 3" class="remaining-options">还有 {{ field.options.length - 3 }} 项</li>
              </ul>
              <p v-else-if="!isContentField(field.type)" class="field-example">
                <UIcon :name="icons[field.type]" aria-hidden="true" />{{ field.type === 'file' ? '上传文件' : field.type === 'image' ? '上传图片' : '报名者填写' }}
                <small v-if="isFileField(field.type)">最多 {{ field.maxFiles ?? 1 }} 个</small>
              </p>
            </li>
          </TransitionGroup>
          <p v-else class="canvas-empty">从字段类型中添加自定义字段。</p>
          <p class="sr-only" aria-live="polite">{{ sortMessage }}</p>
        </section>

        <section :id="editorId + '-properties'" class="builder-panel builder-properties" aria-label="字段属性">
          <div class="builder-side-content">
            <h3>字段属性</h3>
            <div v-if="selected" :key="selected.id" class="property-fields">
              <UFormField label="字段类型">
                <USelect :model-value="selected.type" :items="typeItems" class="w-full" :disabled="saving" @update:model-value="changeType" />
              </UFormField>
              <UFormField :label="selected.type === 'note' ? '说明文字' : '字段名称'" required>
                <UTextarea v-if="selected.type === 'note'" v-model="selected.label" class="w-full" :rows="4" :maxlength="800" :disabled="saving" />
                <UInput v-else v-model="selected.label" class="w-full" :maxlength="120" :disabled="saving" />
              </UFormField>
              <USwitch v-if="!isContentField(selected.type)" v-model="selected.required" label="设为必填" :disabled="saving" />
              <div v-if="selectedRole" class="contact-config">
                <USwitch :model-value="selected.contactRole === selectedRole" :label="'用作找回报名的' + roleName[selectedRole]" :disabled="saving" @update:model-value="bindContact" />
                <p>同时绑定姓名和手机号，并填写这两项，才能使用姓名和手机号找回报名。报名凭证也可找回。</p>
                <p v-if="boundElsewhere">启用后将从「{{ fieldName(boundElsewhere) }}」解除绑定。</p>
              </div>
              <div v-if="selectedRole" class="contact-config">
                <USwitch :model-value="selected.smsRole === selectedRole" :label="smsRoleLabel[selectedRole]" :disabled="saving" @update:model-value="bindSms" />
                <p>{{ selectedRole === 'phone' ? '短信发送给这里填写的号码。来宾已验证手机号时，两个号码须一致；仅验证了邮箱时，使用填写的号码。' : '已配置姓名通知模板时，会把这里填写的姓名和活动标题发到短信中。' }}</p>
                <p v-if="smsBoundElsewhere">启用后将从「{{ fieldName(smsBoundElsewhere) }}」解除短信绑定。</p>
              </div>
              <UFormField v-if="isFileField(selected.type)" label="最大上传数量">
                <USelect :model-value="selected.maxFiles ?? 1" :items="fileLimits" class="w-full" :disabled="saving"
                  @update:model-value="selected.maxFiles = $event" />
              </UFormField>
              <fieldset v-if="hasOptions(selected.type)" class="option-editor">
                <legend>选项</legend>
                <div v-for="(option,index) in selected.options" :key="option.id" class="option-edit-row">
                  <UInput v-model="option.value" class="min-w-0 flex-1" :aria-label="'选项 ' + (index+1)" :placeholder="'选项 ' + (index+1)" :maxlength="120" :disabled="saving" />
                  <UButton type="button" icon="i-lucide-x" variant="ghost" color="neutral" size="xs" square :aria-label="'移除选项 ' + (index+1)"
                    :disabled="selected.options.length <= 2 || saving" @click="selected.options.splice(index,1)" />
                </div>
                <UButton type="button" icon="i-lucide-plus" variant="ghost" :disabled="selected.options.length >= optionLimit || saving" @click="addOption(selected)">添加选项</UButton>
              </fieldset>
              <UFormField v-if="selected.type === 'identity'" label="身份证号收集用途" required>
                <UTextarea v-model="identityPurpose" class="w-full" :rows="3" :maxlength="800" :disabled="saving" />
              </UFormField>
            </div>
            <p v-else class="property-empty">在画布中选择自定义字段。</p>
          </div>
        </section>
      </div>
    </form>

    <ConsoleDialog v-model:open="previewOpen" title="手机预览">
      <template #body>
        <RegistrationFormPreview :title="activityTitle" :fields="previewFields" :identity-purpose="purpose" />
      </template>
    </ConsoleDialog>
    <ConsoleDialog v-model:open="historyOpen" title="历史版本">
      <template #body>
        <div class="property-fields">
          <UFormField label="报名表版本">
            <USelect v-model="historicId" :items="historyItems" class="w-full" />
          </UFormField>
          <RegistrationFormPreview v-if="historic" :title="activityTitle" :fields="versionFields(historic)" :identity-purpose="historic.identityPurpose" />
        </div>
      </template>
    </ConsoleDialog>
  </div>
</template>

<style scoped>
.form-builder { container: form-builder / inline-size; min-width: 0; }
.builder-shell { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); overflow: clip; }
.builder-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 13px 16px; border-bottom: 1px solid var(--line); }
.builder-heading h2 { font-size: 17px; font-weight: 690; }
.builder-heading p { color: var(--muted); font-size: 13px; }
.builder-heading p span { color: var(--jade); }
.builder-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.builder-feedback { margin: 10px 16px 0; }
.builder-notification { display: flex; align-items: end; justify-content: space-between; flex-wrap: wrap; gap: 10px 18px; padding: 13px 16px; border-bottom: 1px solid var(--line); }
.builder-notification h3 { margin-bottom: 8px; font-size: 15px; font-weight: 650; }
.builder-notification > .feedback { flex-basis: 100%; }
.builder-nav { display: flex; gap: 2px; padding: 5px 9px; border-bottom: 1px solid var(--line); background: #f7f9fe; }
.builder-nav button { min-width: 0; flex: 1; border-radius: 6px; padding: 7px 4px; color: var(--muted); font-size: 14px; }
.builder-nav button[aria-pressed=true] { color: var(--forest); font-weight: 650; background: #e9f1ff; }
.builder-workspace { display: grid; grid-template-columns: minmax(0,1fr); align-items: start; background: #f4f7fc; }
.builder-panel { display: none; min-width: 0; }
.builder-workspace[data-view=palette] .builder-palette,
.builder-workspace[data-view=canvas] .builder-canvas,
.builder-workspace[data-view=properties] .builder-properties { display: block; }
.builder-palette, .builder-properties { padding: 14px; background: var(--surface); }
.builder-panel h3 { font-size: 16px; font-weight: 680; }
.palette-group { margin-top: 12px; }
.palette-group h4 { margin-bottom: 4px; color: var(--muted); font-size: 13px; font-weight: 600; }
.palette-items { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 3px; }
.palette-button { justify-content: flex-start; color: var(--ink); white-space: nowrap; }
.palette-button:hover { color: var(--jade); background: #edf3ff; }
.builder-canvas { padding: 14px; }
.canvas-heading h3 { overflow-wrap: anywhere; }
.canvas-heading p { color: var(--muted); font-size: 13px; }
.canvas-fields { margin-top: 10px; display: grid; gap: 7px; }
.required-mark { color: #a62c2c; font-style: normal; }
.canvas-field { position: relative; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.canvas-field.is-selected { border-color: #6290ed; background: #f7faff; box-shadow: 0 0 0 1px #a0bbf8; }
.canvas-field.is-dragging { opacity: .48; }
.canvas-field.drop-before::before, .canvas-field.drop-after::after { position: absolute; z-index: 2; right: 0; left: 0; height: 2px; border-radius: 2px; background: var(--jade); content: ''; }
.canvas-field.drop-before::before { top: -5px; }
.canvas-field.drop-after::after { bottom: -5px; }
.field-heading { display: flex; align-items: start; gap: 5px; padding: 7px 6px; }
.field-grip { display: flex; justify-content: center; width: 19px; padding-top: 4px; color: var(--muted); cursor: grab; user-select: none; }
.field-grip:active { cursor: grabbing; }
.field-grip :deep(svg) { width: 15px; height: 15px; pointer-events: none; }
.field-select { display: grid; gap: 2px; flex: 1; min-width: 0; text-align: left; padding: 2px 3px; border-radius: 4px; }
.field-select > span { font-size: 14px; font-weight: 650; overflow-wrap: anywhere; white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.field-select small { color: var(--muted); font-size: 12px; }
.field-actions { display: flex; flex: none; gap: 1px; }
.field-example, .canvas-options { margin: 0 10px 9px 33px; border-radius: 5px; color: var(--muted); font-size: 13px; }
.field-example { display: flex; align-items: center; gap: 6px; padding: 4px 7px; background: #edf2fa; }
.field-example small { margin-left: auto; font-size: 12px; white-space: nowrap; }
.canvas-options { display: grid; gap: 3px; padding-left: 1px; }
.canvas-options li { display: flex; align-items: start; gap: 5px; overflow-wrap: anywhere; }
.canvas-options li :deep(svg) { flex: none; margin-top: 3px; }
.canvas-empty, .property-empty { margin-top: 11px; color: var(--muted); font-size: 14px; }
.property-fields { display: grid; gap: 12px; }
.contact-config { display: grid; gap: 5px; }
.contact-config p { color: var(--muted); font-size: 13px; }
.builder-properties .property-fields { margin-top: 10px; }
.option-editor { display: grid; gap: 7px; min-width: 0; }
.option-editor legend { margin-bottom: 6px; font-size: 14px; font-weight: 600; }
.option-editor > button { justify-self: start; }
.option-edit-row { display: flex; gap: 4px; align-items: center; min-width: 0; }
@container form-builder (min-width: 820px) {
  .builder-toolbar { position: sticky; top: 4rem; z-index: 3; background: var(--surface); }
  .builder-nav { display: none; }
  .builder-workspace { grid-template-columns: 164px minmax(0,1fr) 275px; align-items: stretch; }
  .builder-workspace .builder-panel { display: block; }
  .builder-palette { border-right: 1px solid var(--line); }
  .builder-properties { border-left: 1px solid var(--line); }
  .builder-side-content { position: sticky; top: 8.5rem; max-height: calc(100dvh - 9.5rem); padding: 3px; overflow-y: auto; scrollbar-width: thin; }
  .palette-items { grid-template-columns: minmax(0,1fr); }
}
</style>
