import assert from 'node:assert/strict'
import test from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPasswordHash, signInAdmin } from '../server/utils/security.ts'
import { markdownNodes } from '../shared/markdown.ts'
import { markdownParts, markdownQuestions } from '../shared/markdown-tokens.ts'

test('签到帮助在没有 toReversed 的环境下保留缩进代码和跨问答引用', async () => {
  const source = '[后一条答案的链接][later]\n\n## 第一问\n\n[前言的链接][start]\n\n## 第二问\n\n[later]: https://example.test/later'
  const { intro, items } = markdownQuestions('    echo ready\n\n[start]: https://example.test/start\n\n' + source)
  const toReversed = Object.getOwnPropertyDescriptor(Array.prototype, 'toReversed')
  let parts
  try {
    delete Array.prototype.toReversed
    parts = markdownParts([intro, ...items.map(item => item.answer), '[本条链接][start]\n\n[start]: https://example.test/local'])
  } finally {
    if (toReversed) Object.defineProperty(Array.prototype, 'toReversed', toReversed)
  }
  const render = part => renderToString(createSSRApp({ render: () => h('div', markdownNodes(part)) }))
  const [introduction, first, , last] = await Promise.all(parts.map(render))
  assert.match(introduction, /<pre><code>echo ready<\/code><\/pre>/)
  assert.match(introduction, /href="https:\/\/example\.test\/later"/)
  assert.match(first, /href="https:\/\/example\.test\/start"/)
  assert.match(last, /href="https:\/\/example\.test\/local"/)
})

test('管理员会话在事务内复核凭据，提交后才设置 Cookie', async (t) => {
  const originalOrigin = process.env.QI_ORIGIN
  process.env.QI_ORIGIN = 'http://127.0.0.1:3086'
  const db = {}, steps = []
  const password = 'local-fixture-password'
  const credentials = { username: 'admin', password_hash: await createPasswordHash(password) }
  let current = credentials
  const adapters = {
    first: async (sql, _params, connection) => {
      if (!connection) return credentials
      assert.equal(connection, db)
      assert.match(sql, /FOR UPDATE$/)
      steps.push('lock')
      return current
    },
    transaction: async (work) => {
      const result = await work(db)
      steps.push('commit')
      return result
    },
    mutate: async (sql, _params, connection) => {
      if (sql.startsWith('INSERT INTO sessions')) {
        assert.equal(connection, db)
        steps.push('insert')
      }
    },
    createError: ({ statusCode, message }) => Object.assign(new Error(message), { statusCode }),
    getCookie: () => undefined,
    setCookie: () => steps.push('cookie'),
    utc: value => value.toISOString(),
  }
  Object.assign(globalThis, adapters)
  t.after(() => {
    for (const name of Object.keys(adapters)) delete globalThis[name]
    if (originalOrigin === undefined) delete process.env.QI_ORIGIN
    else process.env.QI_ORIGIN = originalOrigin
  })

  for (const update of [{ username: 'renamed' }, { password_hash: 'new-hash' }]) {
    current = { ...credentials, ...update }
    await assert.rejects(signInAdmin({}, credentials.username, password), { statusCode: 401 })
    assert.deepEqual(steps.splice(0), ['lock'])
  }
  current = credentials
  await signInAdmin({}, credentials.username, password)
  assert.deepEqual(steps, ['lock', 'insert', 'commit', 'cookie'])
})
