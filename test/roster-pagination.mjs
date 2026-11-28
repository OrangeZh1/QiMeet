import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

test('报名名单按筛选结果分页并校验每页条数', async (t) => {
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith('#shared/')) {
        return { url: new URL('../shared/' + specifier.slice(8) + '.ts', import.meta.url).href, shortCircuit: true }
      }
      return next(specifier, context)
    },
  })
  const [{ listRegistrations }, { positive, oneOf, text }] = await Promise.all([
    import('../server/utils/admin-data.ts'), import('../server/utils/inputs.ts'),
  ]).finally(() => hooks.deregister())
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec(`CREATE TABLE registrations(id INTEGER PRIMARY KEY, event_id, form_id, name, phone, created_at, edits);
    CREATE TABLE form_versions(id INTEGER PRIMARY KEY, version);
    INSERT INTO form_versions VALUES (1, 1);`)
  db.function('LOCATE', (term, value) => value.indexOf(term) + 1)
  const insert = db.prepare('INSERT INTO registrations VALUES (?, 1, 1, ?, ?, ?, 0)')
  for (let id = 1; id <= 107; id++) insert.run(id, id % 2 ? '单号' : '双号', '', '2026-11-28 00:00:00')

  const adapters = {
    conferenceById: async () => ({}), formsFor: async () => [], attendanceFor: async () => new Map(),
    first: (sql, args) => db.prepare(sql).get(...args), rows: (sql, args) => db.prepare(sql).all(...args),
    positive, oneOf, text, iso: value => value, fail: (_status, message) => { throw new Error(message) },
  }
  Object.assign(globalThis, adapters)
  t.after(() => { for (const key of Object.keys(adapters)) delete globalThis[key] })

  const initial = await listRegistrations(1, {})
  assert.deepEqual([initial.pageSize, initial.rows.length, initial.total], [15, 15, 107])
  for (const size of [10, 15, 20, 50, 100]) {
    const second = await listRegistrations(1, { page: '2', pageSize: String(size) })
    assert.equal(second.rows[0].id, 107 - size)
    assert.equal(second.rows.length, Math.min(size, 107 - size))
  }
  const last = await listRegistrations(1, { q: '双号', page: '99', pageSize: '20' })
  assert.deepEqual([last.page, last.total, last.rows.length], [3, 53, 13])
  const empty = await listRegistrations(1, { q: '其他', page: '2' })
  assert.deepEqual([empty.page, empty.total, empty.rows.length], [1, 0, 0])
  await assert.rejects(listRegistrations(1, { pageSize: '999' }), /每页条数/)
})
