<script setup lang="ts">
defineOptions({inheritAttrs:false})
const props=withDefaults(defineProps<{title:string;description?:string;size?:'form'|'content'|'picker'|'wide'}>(),{description:'',size:'form'})
const open=defineModel<boolean>('open',{default:false})
const workspace=computed(()=>props.size==='picker'||props.size==='wide')
const widths={form:'sm:max-w-[560px]',content:'sm:max-w-[800px]',picker:'sm:max-w-[960px]',wide:'sm:max-w-[1152px]'}
let opener:HTMLElement|null=null
watch(open,value=>{if(value&&import.meta.client)opener=document.activeElement instanceof HTMLElement?document.activeElement:null},{flush:'sync'})
function restoreFocus(event:Event){if(opener?.isConnected){event.preventDefault();opener.focus({ preventScroll: true })}}
</script>
<template><UModal v-model:open="open" v-bind="$attrs" :title="title" :description="description" :content="{onCloseAutoFocus:restoreFocus}" :ui="{overlay:'z-[60]',content:'z-[60] max-h-[90dvh] overflow-hidden '+widths[size],header:'min-h-16 shrink-0 border-b border-default px-4 py-4 sm:px-6',title:'text-base font-semibold',body:'min-h-0 overflow-y-auto overscroll-contain '+(workspace?'flex flex-none flex-col h-[min(560px,calc(90dvh-140px))] p-0 sm:p-0':'p-4 sm:p-6'),footer:'min-h-[72px] shrink-0 border-t border-default px-4 py-4 sm:px-6'}"><template v-if="$slots.body" #body><slot name="body"/></template><template v-if="$slots.footer" #footer><slot name="footer"/></template></UModal></template>
