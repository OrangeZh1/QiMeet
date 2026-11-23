import type { MarkedToken, Token } from 'marked'
import { h, type VNodeChild } from 'vue'
import { isVideoToken, markdownDepthLimit, markdownTokens } from './markdown-tokens.ts'
const linkSchemes = ['https:', 'http:', 'mailto:', 'tel:']

function safeUrl(value: string, image = false) {
  if (!value || value.startsWith('//') || /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(value)) return undefined
  try {
    const url = new URL(value, 'https://qimeet.invalid')
    if (url.username || url.password) return undefined
    return (image ? url.protocol === 'https:' : linkSchemes.includes(url.protocol)) ? value : undefined
  } catch {
    return undefined
  }
}

function renderTokens(tokens: Token[], privateMedia: boolean, depth = 0): VNodeChild[] {
  return tokens.map(token => renderToken(token, privateMedia, depth))
}

function renderToken(input: Token, privateMedia: boolean, depth: number): VNodeChild {
  const raw = input.raw
  if (depth >= markdownDepthLimit) return raw
  if (isVideoToken(input)) {
    if (!input.source) return h('p', { class: 'qm-markdown-plain' }, raw.trimEnd())
    const mediaPath = privateMedia ? '/api/manage/materials/content?id=' : '/api/materials/'
    const src = 'materialId' in input.source ? mediaPath + input.source.materialId : input.source.url
    return h('video', { src, controls: true, playsinline: true, preload: 'metadata', 'aria-label': '活动视频' })
  }
  const token = input as MarkedToken
  const children = (tokens: Token[]) => renderTokens(tokens, privateMedia, depth + 1)
  switch (token.type) {
    case 'heading': return h('h' + Math.min(6, token.depth + 2), children(token.tokens))
    case 'paragraph': return h('p', children(token.tokens))
    case 'strong': return h('strong', children(token.tokens))
    case 'em': return h('em', children(token.tokens))
    case 'del': return h('del', children(token.tokens))
    case 'blockquote': return h('blockquote', children(token.tokens))
    case 'br': return h('br')
    case 'hr': return h('hr')
    case 'code': return h('pre', [h('code', token.text)])
    case 'codespan': return h('code', token.text)
    case 'list': return token.ordered
      ? h('ol', { start: token.start || undefined }, children(token.items))
      : h('ul', children(token.items))
    case 'list_item': return h('li', children(token.tokens))
    case 'checkbox': return token.checked ? '☑ ' : '☐ '
    case 'link': {
      const href = safeUrl(token.href)
      const content = children(token.tokens)
      return href ? h('a', { href, title: token.title || undefined }, content) : content
    }
    case 'image': {
      const src = safeUrl(token.href, true)
      return src ? h('img', { src, alt: token.text, title: token.title || undefined, loading: 'lazy', referrerpolicy: 'no-referrer' }) : token.text
    }
    case 'table': return h('div', { class: 'qm-markdown-table' }, [
      h('table', [
        h('thead', [h('tr', token.header.map(cell => h('th', { scope: 'col', style: cell.align ? { textAlign: cell.align } : undefined }, children(cell.tokens))))]),
        h('tbody', token.rows.map(row => h('tr', row.map(cell => h('td', { style: cell.align ? { textAlign: cell.align } : undefined }, children(cell.tokens)))))),
      ]),
    ])
    case 'text': return token.tokens ? children(token.tokens) : token.text
    case 'html': return token.block ? h('p', { class: 'qm-markdown-plain' }, token.text) : token.text
    case 'escape': return token.text
    case 'space':
    case 'def': return null
    default: return raw
  }
}

export function markdownNodes(source: string | Token[], privateMedia = false): VNodeChild[] {
  if (typeof source !== 'string') return renderTokens(source, privateMedia)
  try {
    return renderTokens(markdownTokens(source), privateMedia)
  } catch {
    return [h('p', { class: 'qm-markdown-plain' }, source)]
  }
}
