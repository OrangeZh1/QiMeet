<script setup lang="ts">
import { fieldLabels, isFileField, type Field } from '#shared/models'

defineProps<{ fields: Field[], title: string, identityPurpose: string }>()
const previewId = useId()
const label = (field: Field) => field.label.trim() || '未命名' + fieldLabels[field.type]
const placeholder = (field: Field) => {
  if (field.type === 'phone') return '请输入手机号'
  if (field.type === 'identity') return '请输入身份证号'
  if (field.contactRole === 'name') return '请输入姓名'
  return '请输入内容'
}
</script>

<template>
  <section class="form-preview" :aria-labelledby="previewId">
    <div class="preview-sheet">
      <header><strong :id="previewId">{{ title }}</strong><p>活动报名</p></header>
      <fieldset disabled class="form-stack preview-fields">
        <legend class="sr-only">报名表预览</legend>
        <p v-if="!fields.length" class="help">当前表单没有填写项。</p>
        <template v-for="field in fields" :key="field.id">
          <h3 v-if="field.type === 'title'">{{ label(field) }}</h3>
          <p v-else-if="field.type === 'note'" class="preview-note">{{ label(field) }}</p>
          <fieldset v-else-if="field.type === 'radio' || field.type === 'checkbox'" class="preview-options">
            <legend>{{ label(field) }} <i v-if="field.required" class="required-mark">*</i></legend>
            <label v-for="(option,index) in field.options" :key="index" class="inline-label">
              <input :type="field.type" :name="field.id" /> {{ option }}
            </label>
            <p v-if="!field.options.length" class="help">还没有设置选项</p>
          </fieldset>
          <label v-else>
            <span>{{ label(field) }} <i v-if="field.required" class="required-mark">*</i></span>
            <textarea v-if="field.type === 'textarea'" placeholder="请输入内容" rows="3" />
            <span v-else-if="isFileField(field.type)" class="preview-upload">
              <UIcon :name="field.type === 'image' ? 'i-lucide-image-plus' : 'i-lucide-paperclip'" />
              {{ field.type === 'image' ? '选择图片' : '选择文件' }}
              <small>最多 {{ field.maxFiles ?? 1 }} {{ field.type === 'image' ? '张' : '个' }}</small>
            </span>
            <input v-else :type="field.type === 'phone' ? 'tel' : 'text'" :placeholder="placeholder(field)" />
          </label>
        </template>
        <label v-if="fields.some(field => field.type === 'identity')" class="inline-label consent-preview">
          <input type="checkbox" /> <span>{{ identityPurpose || '身份证号收集用途说明' }}</span>
        </label>
        <UButton disabled block>提交报名</UButton>
      </fieldset>
    </div>
  </section>
</template>

<style scoped>
.form-preview { min-width: 0; padding: 10px; border-radius: 10px; background: #f3f7ff; }
.preview-sheet { max-width: 352px; margin-inline: auto; background: #fff; border: 1px solid var(--line); border-radius: 13px; overflow: hidden; }
.preview-sheet > header { display: grid; gap: 4px; padding: 16px; background: #e9f1ff; color: var(--forest); }
.preview-sheet > header strong { min-width: 0; overflow-wrap: anywhere; font-size: 17px; }
.preview-sheet > header p { color: var(--muted); font-size: 14px; }
.preview-fields { display: grid; padding: 15px; gap: 14px; }
.preview-fields input:not([type=radio]):not([type=checkbox]), .preview-fields textarea { min-height: 38px; border-color: var(--line); }
.preview-fields label, .preview-fields legend, .preview-note { min-width: 0; overflow-wrap: anywhere; }
.preview-fields h3 { font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
.preview-note { color: var(--muted); font-size: 14px; white-space: pre-wrap; }
.preview-options { display: grid; gap: 8px; }
.required-mark { color: #a62c2c; font-style: normal; }
.preview-upload { display: flex; align-items: center; gap: 7px; padding: 10px; border: 1px dashed #b8cbec; border-radius: 8px; color: var(--jade); background: #f7faff; font-size: 14px; font-weight: 500; }
.preview-upload small { margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; }
.consent-preview { align-items: start; font-weight: 500; }
.consent-preview span { color: var(--muted); }
</style>
