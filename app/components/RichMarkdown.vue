<script lang="ts">
import type { Token } from 'marked'
import { defineComponent, h, type PropType } from 'vue'
import { markdownNodes } from '#shared/markdown'

export default defineComponent({
  props: { source: { type: [String, Array] as PropType<string | Token[]>, required: true }, privateMedia: Boolean },
  setup(props) {
    return () => h('div', { class: 'qm-markdown' }, markdownNodes(props.source, props.privateMedia))
  },
})
</script>

<style>
.qm-markdown { min-width: 0; color: var(--ui-text); line-height: 1.7; overflow-wrap: anywhere; }
.qm-markdown > :first-child { margin-top: 0; }
.qm-markdown > :last-child { margin-bottom: 0; }
.qm-markdown :is(p, ul, ol, blockquote, pre, hr, .qm-markdown-table) { margin-block: .55rem .85rem; }
.qm-markdown :is(h3, h4, h5, h6) { color: var(--ui-text-highlighted); margin: 1rem 0 .35rem; line-height: 1.4; font-weight: 690; }
.qm-markdown h3 { font-size: 1.2rem; }
.qm-markdown h4 { font-size: 1.08rem; }
.qm-markdown ul { list-style: disc; }
.qm-markdown ol { list-style: decimal; }
.qm-markdown :is(ul, ol) { padding-inline-start: 1.5rem; }
.qm-markdown li > :is(p, ul, ol) { margin-block: .2rem; }
.qm-markdown a { color: var(--ui-primary); text-decoration: underline; text-underline-offset: .2em; }
.qm-markdown blockquote { border-inline-start: 3px solid var(--ui-border-accented); padding-inline-start: .85rem; color: var(--ui-text-muted); }
.qm-markdown :is(pre, code) { background: var(--ui-bg-elevated); border-radius: 5px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.qm-markdown code { padding: .13em .32em; font-size: .9em; }
.qm-markdown pre { padding: .8rem .95rem; overflow-x: auto; }
.qm-markdown pre code { padding: 0; white-space: pre; }
.qm-markdown img { display: block; max-width: 100%; height: auto; border-radius: 6px; }
.qm-markdown video { display: block; width: 100%; max-height: 55vh; margin-block: .55rem .85rem; border-radius: 7px; background: #15171c; }
.qm-markdown hr { border: 0; border-top: 1px solid var(--ui-border); }
.qm-markdown-table { overflow-x: auto; }
.qm-markdown table { border-collapse: collapse; min-width: 100%; }
.qm-markdown :is(th, td) { padding: .4rem .65rem; border: 1px solid var(--ui-border); white-space: normal; }
.qm-markdown th { background: var(--ui-bg-elevated); font-weight: 650; }
.qm-markdown-plain { white-space: pre-wrap; }
</style>
