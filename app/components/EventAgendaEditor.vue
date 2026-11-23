<script setup lang="ts">
import ConsoleInput from '#qiandao-console/ConsoleInput.vue'
import ConsoleFormActions from '#qiandao-console/ConsoleFormActions.vue'
import { fromLocalInput, toLocalInput, type AgendaItem } from '#shared/models'

const props = defineProps<{ eventId: number, initial: AgendaItem[], startsAt: string }>()
const emit = defineEmits<{ saved: [items: AgendaItem[]] }>()
const toDraft = (item: AgendaItem) => ({
  ...item, startsAt: toLocalInput(item.startsAt), endsAt: item.endsAt ? toLocalInput(item.endsAt) : '',
})
const draft = ref(props.initial.map(toDraft))
const saving = ref(false)
const error = ref('')
const toast = useToast()

function add() {
  const previous = draft.value.at(-1)
  draft.value.push({
    id: crypto.randomUUID(), title: '', startsAt: previous?.endsAt || previous?.startsAt || toLocalInput(props.startsAt),
    endsAt: '', description: '',
  })
}
async function save() {
  if (saving.value) return
  error.value = ''
  saving.value = true
  try {
    const agenda = draft.value.map(item => ({
      ...item, startsAt: fromLocalInput(item.startsAt), endsAt: item.endsAt ? fromLocalInput(item.endsAt) : null,
    }))
    const items = await manageRequest<AgendaItem[]>('save-agenda', { method: 'POST', query: { eventId: props.eventId }, body: { agenda } })
    draft.value = items.map(toDraft)
    emit('saved', items)
    toast.add({ title: '活动流程已保存', color: 'success' })
  } catch (cause) { error.value = errorText(cause) }
  finally { saving.value = false }
}
</script>

<template>
  <form class="panel panel-content form-stack" @submit.prevent="save">
    <header class="split-row">
      <h2 class="section-title">活动流程</h2>
      <UButton type="button" icon="i-lucide-plus" variant="outline" :disabled="saving || draft.length >= 30" @click="add">添加环节</UButton>
    </header>
    <div v-if="!draft.length" class="empty-state agenda-empty">
      <UIcon name="i-lucide-list-ordered" /><strong>还没有活动流程</strong>
    </div>
    <TransitionGroup v-else name="qm-fields" tag="div" class="form-stack">
      <fieldset v-for="(item, index) in draft" :key="item.id" class="field-card agenda-item">
        <legend class="sr-only">流程第 {{ index + 1 }} 项</legend>
        <div class="agenda-controls">
          <UFormField label="环节名称" required><ConsoleInput v-model="item.title" size="lg" maxlength="120" required /></UFormField>
          <UFormField label="开始时间" required><ConsoleInput v-model="item.startsAt" size="lg" type="datetime-local" required /></UFormField>
          <UFormField label="结束时间"><ConsoleInput v-model="item.endsAt" size="lg" type="datetime-local" :min="item.startsAt" /></UFormField>
          <UButton type="button" color="error" variant="ghost" icon="i-lucide-trash-2" :aria-label="'移除环节 ' + (index + 1)" :disabled="saving" @click="draft.splice(index, 1)" />
        </div>
        <UFormField label="环节说明"><UTextarea v-model="item.description" class="w-full" :rows="2" maxlength="1000" /></UFormField>
      </fieldset>
    </TransitionGroup>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <ConsoleFormActions><UButton type="submit" icon="i-lucide-save" :loading="saving">保存流程</UButton></ConsoleFormActions>
  </form>
</template>

<style scoped>
.agenda-item { display: grid; gap: 12px; }
.agenda-controls { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .85fr) minmax(0, .85fr) auto; align-items: end; gap: 11px; }
.agenda-empty { padding-block: 23px; }
@media (max-width: 900px) { .agenda-controls { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
@media (max-width: 510px) { .agenda-controls { grid-template-columns: minmax(0, 1fr); } }
</style>
