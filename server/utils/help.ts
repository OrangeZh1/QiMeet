import { randomUUID } from 'node:crypto'
import type { PoolConnection } from 'mysql2/promise'
import { helpAnswerLength, helpQuestionLength, helpQuestionLimit, type HelpContent, type HelpQuestion, type HelpSettings } from '#shared/help'
import { markdownQuestions } from '#shared/markdown-tokens'

async function readHelpContent(db?: PoolConnection): Promise<HelpContent> {
  const row = await first<{ source: string | null, items: HelpQuestion[] | null }>(
    'SELECT check_in_help AS source,check_in_faq AS items FROM site_settings WHERE id=1' + (db ? ' FOR UPDATE' : ''), [], db,
  )
  const { intro, items: legacy } = markdownQuestions(row?.source || '')
  return { intro, items: row?.items ?? legacy.map((item, index) => ({ ...item, id: 'legacy-' + (index + 1) })) }
}

export async function publicHelp(): Promise<HelpContent> {
  return readHelpContent()
}

function helpSettings(content: HelpContent): HelpSettings {
  return { ...content, revision: hash(JSON.stringify(content.items.map(({ id, question, answer }) => [id, question, answer]))) }
}

export async function readHelpSettings() {
  return helpSettings(await readHelpContent())
}

export async function saveHelpSettings(input: Record<string, unknown>) {
  if (!Array.isArray(input.items) || input.items.length > helpQuestionLimit) fail(400, '问答最多可添加 ' + helpQuestionLimit + ' 条')
  const items: HelpQuestion[] = input.items.map((item) => {
    if (!item || typeof item !== 'object') fail(400, '问答格式有误')
    const id = text(item.id, 36, '问答编号', false) || randomUUID()
    if (!/^[a-z0-9-]+$/i.test(id)) fail(400, '问答编号无效')
    if (typeof item.answer !== 'string') fail(400, '答案格式有误')
    const answer = item.answer.normalize('NFC')
    if (!answer.trim() || answer.length > helpAnswerLength || answer.includes('\u0000')) fail(400, '请检查答案')
    return { id, question: text(item.question, helpQuestionLength, '问题'), answer }
  })
  if (new Set(items.map(item => item.id)).size !== items.length) fail(400, '问答编号重复')
  if (items.reduce((length, item) => length + item.question.length + item.answer.length, 0) > 30000) fail(400, '帮助内容最多 30000 字符')
  return transaction(async (db) => {
    const current = helpSettings(await readHelpContent(db))
    if (input.revision !== current.revision) fail(409, '帮助中心已被修改，请刷新后重试。')
    await mutate('UPDATE site_settings SET check_in_faq=? WHERE id=1', [JSON.stringify(items)], db)
    return helpSettings({ intro: current.intro, items })
  })
}
