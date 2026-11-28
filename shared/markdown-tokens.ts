import { Lexer, Marked, type Token, type Tokens, type TokenizerExtension } from 'marked'

type VideoSource = { materialId: string } | { url: string }
type VideoToken = Tokens.Generic & { type: 'qm_video', source?: VideoSource }
export const markdownDepthLimit = 48

export function markdownMaterialId(value: string) {
  return /^\/api\/materials\/([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})$/i.exec(value)?.[1]?.toLowerCase()
}

function videoSource(value: string): VideoSource | undefined {
  const id = markdownMaterialId(value)
  if (id) return { materialId: id }
  if (!/^https:\/\//i.test(value) || /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(value)) return
  try {
    const address = new URL(value)
    if (!address.username && !address.password && /\.(?:mp4|webm)$/i.test(address.pathname)) return { url: address.href }
  } catch {
    return undefined
  }
}

const nativeVideo: TokenizerExtension = {
  name: 'qm_video',
  level: 'block',
  start(source) {
    return /^ {0,3}@\[video\]\(/m.exec(source)?.index
  },
  tokenizer(source) {
    const match = /^ {0,3}@\[video\]\(([^)\r\n]*)\)[ \t]*(?:\r?\n|$)/.exec(source)
    if (match) return { type: 'qm_video', raw: match[0], source: videoSource(match[1] || '') } satisfies VideoToken
  },
}

const markdown = new Marked({ gfm: true, breaks: true, extensions: [nativeVideo] })
const stripBom = (source: string) => source.replace(/^\uFEFF/u, '')
export const markdownTokens = (source: string) => markdown.lexer(stripBom(source))
export const isVideoToken = (token: Token): token is VideoToken => token.type === 'qm_video'

export function markdownParts(sources: string[]): (string | Token[])[] {
  try {
    const parts = sources.map((source) => {
      const lexer = new Lexer({ ...markdown.defaults })
      return { lexer, tokens: lexer.blockTokens(stripBom(source).replace(/\r\n?/g, '\n')) }
    })
    // Resolve references after reading every block, keeping each part's own definitions first.
    const links = Object.assign(Object.create(null), ...parts.slice().reverse().map(({ lexer }) => lexer.tokens.links))
    return parts.map(({ lexer, tokens }) => {
      lexer.tokens.links = Object.assign(Object.create(null), links, lexer.tokens.links)
      for (const entry of lexer.inlineQueue) lexer.inlineTokens(entry.src, entry.tokens)
      return tokens
    })
  } catch {
    return sources
  }
}

function inlineText(tokens: Token[], depth = 0): string {
  if (depth >= markdownDepthLimit) return ''
  return tokens.map((token) => {
    if (token.type === 'image' || token.type === 'html') return ''
    if (token.type === 'br') return ' '
    if ('tokens' in token && Array.isArray(token.tokens)) return inlineText(token.tokens, depth + 1)
    return ['text', 'escape', 'codespan'].includes(token.type) && 'text' in token ? token.text : ''
  }).join('')
}

export function markdownIntro(source: string) {
  try {
    for (const token of markdownTokens(source)) {
      if (token.type !== 'paragraph') continue
      const text = inlineText((token as Tokens.Paragraph).tokens).replace(/\s+/g, ' ').trim()
      if (text) return text
    }
  } catch {
    return ''
  }
  return ''
}

export function markdownQuestions(source: string) {
  let intro = ''
  const items: { question: string, answer: string }[] = []
  let current: typeof items[number] | undefined
  try {
    for (const token of markdownTokens(source)) {
      const heading = token.type === 'heading' ? token as Tokens.Heading : undefined
      if (heading?.depth === 2) {
        current = { question: inlineText(heading.tokens).trim() || heading.text, answer: '' }
        items.push(current)
      } else if (current) {
        current.answer += token.raw
      } else {
        intro += token.raw
      }
    }
    return { intro, items }
  } catch {
    return { intro: source, items: [] }
  }
}

export function markdownMediaIds(source: string) {
  const image = new Set<string>()
  const video = new Set<string>()
  if (source.includes('/api/materials/')) {
    markdown.walkTokens(markdownTokens(source), token => {
      if (isVideoToken(token) && token.source && 'materialId' in token.source) video.add(token.source.materialId)
      if (token.type === 'image') {
        const id = markdownMaterialId(token.href)
        if (id) image.add(id)
      }
    })
  }
  return { image: [...image], video: [...video] }
}
