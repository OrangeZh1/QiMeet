<script setup lang="ts">
import ImageViewer from './ImageViewer.vue'
import {computed,nextTick,ref,watch} from 'vue'
const props=withDefaults(defineProps<{src?:string|null;label:string;disabled?:boolean;removable?:boolean;removeDisabled?:boolean;removeTitle?:string;dark?:boolean;fit?:'cover'|'contain'}>(),{src:null,disabled:false,removable:false,removeDisabled:false,removeTitle:'',dark:false,fit:'contain'})
const emit=defineEmits<{select:[];remove:[]}>(),preview=ref(false),tile=ref<HTMLElement>(),focused=ref('edit')
const actions=computed(()=>props.disabled?[]:[props.src?'edit':'select',...(props.src?['view']:[]),...(props.removable&&!props.removeDisabled?['remove']:[])])
const tabIndex=(action:string)=>(actions.value.includes(focused.value)?focused.value:actions.value[0])===action?0:-1
function focusAction(action:string){focused.value=action;tile.value?.querySelector<HTMLButtonElement>('[data-image-action="'+action+'"]')?.focus()}
function keydown(event:KeyboardEvent){
 if(event.altKey||event.ctrlKey||event.metaKey||!actions.value.length||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return
 event.preventDefault();const current=Math.max(0,actions.value.indexOf(focused.value)),last=actions.value.length-1
 const index=event.key==='Home'?0:event.key==='End'?last:(current+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+actions.value.length)%actions.value.length
 focusAction(actions.value[index]!)
}
watch(actions,async next=>{if(next.includes(focused.value))return;const restore=tile.value?.contains(document.activeElement);focused.value=next[0]||'';if(restore&&focused.value){await nextTick();focusAction(focused.value)}})
</script>
<template><div ref="tile" class="image-select-tile" role="toolbar" :aria-label="label+'图片操作'" :class="{'is-empty':!src,'is-dark':dark&&!!src}" @keydown="keydown">
  <button type="button" class="image-select-target" data-image-action="select" :tabindex="src?-1:tabIndex('select')" :disabled="disabled" :aria-label="'选择'+label" @focus="focused=src?'edit':'select'" @click="emit('select')"><img v-if="src" :src="src" :alt="label+'预览'" class="size-full" :class="fit==='cover'?'object-cover':'object-contain'"/><span v-else class="grid justify-items-center gap-1 text-muted"><UIcon name="i-lucide-plus" class="size-6"/><span class="text-xs">选择图片</span></span></button>
  <div v-if="src" class="image-select-actions"><button type="button" data-image-action="edit" :tabindex="tabIndex('edit')" :disabled="disabled" :aria-label="'修改'+label" @focus="focused='edit'" @click="emit('select')">修改</button><span aria-hidden="true">|</span><button type="button" data-image-action="view" :tabindex="tabIndex('view')" :disabled="disabled" :aria-label="'查看'+label" @focus="focused='view'" @click="preview=true">查看</button></div>
  <button v-if="removable" type="button" class="image-select-remove" data-image-action="remove" :tabindex="tabIndex('remove')" :disabled="disabled||removeDisabled" :aria-label="'清除'+label" :title="removeTitle||'清除'+label" @focus="focused='remove'" @click="emit('remove')"><UIcon name="i-lucide-x" class="size-3"/></button>
  <ImageViewer v-model:open="preview" :src="src" :label="label"/>
</div></template>
<style scoped>
.image-select-tile{position:relative;width:100px;height:100px;flex:none;border-radius:6px}
.image-select-tile.is-empty{border:1px dashed var(--ui-border);background:var(--ui-bg-elevated)}
.image-select-tile.is-dark{background:#0f172a}
.image-select-target{display:grid;place-items:center;width:100%;height:100%;overflow:hidden;border-radius:inherit;cursor:pointer}
.image-select-actions{position:absolute;inset:auto 0 0;display:flex;align-items:center;justify-content:center;gap:5px;height:24px;border-radius:0 0 6px 6px;background:rgb(0 0 0 / .55);color:white;font-size:12px;opacity:0;transition:opacity .15s ease}
.image-select-actions{pointer-events:none}
.image-select-actions button{cursor:pointer;padding:2px}.image-select-actions span{opacity:.6}
.image-select-remove{position:absolute;top:-7px;right:-7px;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#94a3b8;color:white;cursor:pointer;opacity:1;pointer-events:auto;transition:opacity .15s ease}
.image-select-tile:hover .image-select-actions,.image-select-tile:has(:focus-visible) .image-select-actions,.image-select-tile:hover .image-select-remove,.image-select-tile:has(:focus-visible) .image-select-remove{opacity:1;pointer-events:auto}
.image-select-tile button:disabled{cursor:not-allowed}.image-select-tile .image-select-remove:disabled{opacity:.45;cursor:not-allowed}.image-select-tile button:focus-visible{outline:2px solid var(--ui-primary);outline-offset:2px}
@media(hover:none){.image-select-actions,.image-select-remove{opacity:1;pointer-events:auto}}
@media(prefers-reduced-motion:reduce){.image-select-actions,.image-select-remove{transition:none}}
</style>
