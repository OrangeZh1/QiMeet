<script setup lang="ts">
import ConsoleDataTable from '#qiandao-console/ConsoleDataTable.vue'
import ConsoleFormActions from '#qiandao-console/ConsoleFormActions.vue'
import ConsoleInput from '#qiandao-console/ConsoleInput.vue'
import ConsolePageHeading from '#qiandao-console/ConsolePageHeading.vue'
import ConsoleDialog from '~/components/material/ConsoleDialog.vue'
import { helpAnswerLength, helpQuestionLength, helpQuestionLimit, type HelpQuestion, type HelpSettings } from '#shared/help'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useSeoMeta({ title: '帮助中心' })
const { data, error, refresh } = await useFetch<HelpSettings>('/api/manage/help', { key: 'admin-check-in-help', cache: 'no-store' })
if (!data.value) throw createError({ statusCode: attendeeErrorStatus(error.value) || 503, message: errorText(error.value, '暂时无法读取帮助中心') })

const columns = [
  { id: 'position', header: '序号' },
  { accessorKey: 'question', header: '问题' },
  { accessorKey: 'answer', header: '答案' },
  { id: 'actions', header: '操作' },
]
const items = computed(() => data.value?.items || [])
const editorOpen = ref(false)
const deleting = ref<HelpQuestion>()
const draft = ref<HelpQuestion>({ id: '', question: '', answer: '' })
const action = ref<'save' | 'delete'>()
const failure = ref('')
const toast = useToast()

function edit(item?: HelpQuestion) {
  failure.value = ''
  draft.value = item ? { ...item } : { id: '', question: '', answer: '' }
  editorOpen.value = true
}
function askDelete(item: HelpQuestion) {
  failure.value = ''
  deleting.value = item
}

async function update(next: HelpQuestion[], kind: 'save' | 'delete') {
  if (action.value || !data.value) return
  action.value = kind
  failure.value = ''
  try {
    data.value = await manageRequest<HelpSettings>('help', { method: 'POST', body: { items: next, revision: data.value.revision } })
    if (kind === 'save') editorOpen.value = false
    else deleting.value = undefined
    toast.add({ title: kind === 'save' ? '问答已保存' : '问答已删除', color: 'success' })
    void refreshNuxtData('check-in-help')
  } catch (cause) {
    failure.value = errorText(cause, '暂时无法更新问答')
    if (attendeeErrorStatus(cause) === 409) await refresh()
  } finally {
    action.value = undefined
  }
}
function save() {
  const item = { ...draft.value, question: draft.value.question.trim(), answer: draft.value.answer.trim() }
  if (!item.question || !item.answer) return
  const next = item.id ? items.value.map(row => row.id === item.id ? item : row) : [...items.value, item]
  return update(next, 'save')
}
function remove() {
  if (deleting.value) return update(items.value.filter(item => item.id !== deleting.value?.id), 'delete')
}
</script>

<template>
  <div class="page-stack help-settings-page">
    <div class="page-heading-row">
      <ConsolePageHeading title="帮助中心" />
      <UButton type="button" icon="i-lucide-plus" :disabled="items.length >= helpQuestionLimit || !!action" @click="edit()">新增问答</UButton>
    </div>
    <section class="panel help-table" aria-label="常见问题">
      <ConsoleDataTable :data="items" :columns="columns" empty-title="暂无问答">
        <template #position-cell="{ row }">{{ row.index + 1 }}</template>
        <template #question-cell="{ row }"><strong class="help-question-text">{{ row.original.question }}</strong></template>
        <template #answer-cell="{ row }"><span class="help-answer-preview">{{ row.original.answer }}</span></template>
        <template #actions-cell="{ row }">
          <div class="help-actions">
            <UButton type="button" variant="link" size="sm" :disabled="!!action" @click="edit(row.original)">编辑</UButton>
            <UButton type="button" variant="link" size="sm" color="error" :disabled="!!action" @click="askDelete(row.original)">删除</UButton>
          </div>
        </template>
      </ConsoleDataTable>
    </section>

    <ConsoleDialog v-model:open="editorOpen" :title="draft.id ? '编辑问答' : '新增问答'" size="form" :dismissible="!action" :close="!action">
      <template #body>
        <form id="help-question-form" class="form-stack" @submit.prevent="save">
          <UFormField label="问题" required>
            <ConsoleInput v-model="draft.question" class="w-full" :maxlength="helpQuestionLength" required :readonly="!!action" />
          </UFormField>
          <UFormField label="答案" required>
            <UTextarea v-model="draft.answer" class="w-full" :rows="6" :maxlength="helpAnswerLength" required :readonly="!!action" />
          </UFormField>
          <p v-if="failure" class="feedback error" role="alert">{{ failure }}</p>
        </form>
      </template>
      <template #footer>
        <ConsoleFormActions>
          <UButton type="button" color="neutral" variant="outline" :disabled="!!action" @click="editorOpen = false">取消</UButton>
          <UButton type="submit" form="help-question-form" :loading="action === 'save'">保存问答</UButton>
        </ConsoleFormActions>
      </template>
    </ConsoleDialog>

    <ConsoleDialog :open="!!deleting" title="删除问答" size="form" :dismissible="!action" :close="!action"
      @update:open="!$event && (deleting = undefined)">
      <template #body>
        <div class="form-stack">
          <p>删除「{{ deleting?.question }}」后，客户端将无法查看。</p>
          <p v-if="failure" class="feedback error" role="alert">{{ failure }}</p>
        </div>
      </template>
      <template #footer>
        <ConsoleFormActions>
          <UButton type="button" color="neutral" variant="outline" :disabled="!!action" @click="deleting = undefined">取消</UButton>
          <UButton type="button" color="error" :loading="action === 'delete'" @click="remove">删除问答</UButton>
        </ConsoleFormActions>
      </template>
    </ConsoleDialog>
  </div>
</template>

<style scoped>
.help-settings-page { width: min(100%, 55rem); margin-inline: auto; }
.help-table { overflow: hidden; }
.help-table :deep(table) { width: 100%; min-width: 480px; }
.help-question-text { display: block; max-width: 16rem; white-space: normal; overflow-wrap: anywhere; }
.help-answer-preview { display: block; max-width: 29rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
.help-actions { display: flex; flex-wrap: nowrap; }
</style>
