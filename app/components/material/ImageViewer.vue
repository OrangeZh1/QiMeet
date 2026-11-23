<script setup lang="ts">
const props=withDefaults(defineProps<{src?:string|null;label?:string}>(),{src:null,label:'图片'})
const open=defineModel<boolean>('open',{default:false}),displaySrc=ref(props.src),viewScale=ref(1),angle=ref(0),pan=reactive({x:0,y:0}),dragging=ref(false),failed=ref(false)
let drag:{id:number;x:number;y:number;left:number;top:number}|null=null
let closedByPointer=false
function closeView(event:MouseEvent){closedByPointer=event.detail>0;open.value=false}
function closeAutoFocus(event:Event){if(closedByPointer)event.preventDefault()}
function resetView(){viewScale.value=1;angle.value=0;pan.x=0;pan.y=0;drag=null;dragging.value=false}
function zoom(direction:number){viewScale.value=Math.min(5,Math.max(.2,Math.round(viewScale.value*(direction>0?1.2:1/1.2)*1000)/1000))}
function rotate(degrees:number){angle.value=(angle.value+degrees+360)%360}
watch(open,value=>{if(value){closedByPointer=false;displaySrc.value=props.src;failed.value=false;resetView()}})
watch(()=>props.src,value=>{if(open.value){displaySrc.value=value;failed.value=false;resetView()}})
function startDrag(event:PointerEvent){if(event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:pan.x,top:pan.y};dragging.value=true;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)}
function moveDrag(event:PointerEvent){if(drag?.id!==event.pointerId)return;pan.x=drag.left+event.clientX-drag.x;pan.y=drag.top+event.clientY-drag.y}
function endDrag(){drag=null;dragging.value=false}
</script>
<template><UModal v-model:open="open" :title="label+'预览'" fullscreen :close="false" :content="{onCloseAutoFocus:closeAutoFocus}" :ui="{overlay:'bg-black/50 backdrop-blur-none',content:'w-screen h-dvh max-w-none max-h-none bg-transparent ring-0 shadow-none rounded-none'}" @after:leave="resetView"><template #content>
  <div class="image-viewer" @wheel.prevent="zoom($event.deltaY<0?1:-1)" @click.self="closeView">
    <img v-if="displaySrc&&!failed" :src="displaySrc" :alt="label" class="image-viewer-image" :class="{'is-dragging':dragging}" :style="{transform:`translate(${pan.x}px,${pan.y}px) rotate(${angle}deg) scale(${viewScale})`}" draggable="false" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag" @error="failed=true"/>
    <p v-if="failed" role="alert" class="text-sm text-white">图片暂时无法加载</p>
    <button type="button" class="image-viewer-close" aria-label="关闭图片预览" @click="closeView"><UIcon name="i-lucide-x" class="size-6"/></button>
    <div class="image-viewer-toolbar" role="toolbar" aria-label="图片预览操作" @wheel.stop>
      <button type="button" aria-label="缩小图片" title="缩小" :disabled="viewScale<=.2" @click="zoom(-1)"><UIcon name="i-lucide-zoom-out" class="size-5"/></button>
      <button type="button" aria-label="放大图片" title="放大" :disabled="viewScale>=5" @click="zoom(1)"><UIcon name="i-lucide-zoom-in" class="size-5"/></button>
      <button type="button" aria-label="适应屏幕" title="适应屏幕" @click="resetView"><UIcon name="i-lucide-maximize" class="size-5"/></button>
      <button type="button" aria-label="向左旋转图片" title="向左旋转" @click="rotate(-90)"><UIcon name="i-lucide-rotate-ccw" class="size-5"/></button>
      <button type="button" aria-label="向右旋转图片" title="向右旋转" @click="rotate(90)"><UIcon name="i-lucide-rotate-cw" class="size-5"/></button>
    </div>
  </div>
</template></UModal></template>
<style scoped>
.image-viewer{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;overflow:hidden;padding:72px 48px 108px}
.image-viewer-image{max-width:100%;max-height:100%;object-fit:contain;user-select:none;touch-action:none;cursor:grab;transition:transform .15s ease}
.image-viewer-image.is-dragging{cursor:grabbing;transition:none}
.image-viewer-close{position:absolute;top:24px;right:24px;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:rgb(0 0 0 / .35);color:white;cursor:pointer}
.image-viewer-toolbar{position:absolute;bottom:24px;left:50%;display:flex;gap:12px;align-items:center;transform:translateX(-50%);padding:6px 18px;border-radius:999px;background:rgb(0 0 0 / .4);color:white}
.image-viewer-toolbar button{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;cursor:pointer}.image-viewer-toolbar button:hover,.image-viewer-close:hover{background:rgb(255 255 255 / .15)}
.image-viewer-toolbar button:disabled{opacity:.4;cursor:not-allowed}.image-viewer button:focus-visible{outline:2px solid white;outline-offset:2px}
@media(max-width:640px){.image-viewer{padding:64px 20px 96px}.image-viewer-close{top:16px;right:16px}}
@media(prefers-reduced-motion:reduce){.image-viewer-image{transition:none}}
</style>
