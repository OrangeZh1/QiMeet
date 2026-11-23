import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import test from 'node:test'

test('032 迁移中断后保留已提交的列，重跑只补齐缺失列', async (t) => {
  const target = '032_registration_sms_and_verified_contacts.sql'
  const directory = new URL('../database/', import.meta.url)
  const recorded = new Map()
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name))) {
    if (name !== target) recorded.set(name, createHash('sha256').update(await readFile(new URL(name, directory))).digest('hex'))
  }
  const columns = new Map()
  const applied = []
  let interrupt = true
  const savedArgument = process.argv[2]
  const savedDatabase = process.env.QI_DATABASE_URL
  process.argv[2] = 'migrate'
  process.env.QI_DATABASE_URL = 'mysql://fixture:fixture@127.0.0.1/recovery_test'
  globalThis.registrationMigrationDb = {
    async query(sql) {
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) return
      const change = /^ALTER TABLE (events|attendee_accounts) ADD COLUMN (\w+) /.exec(sql)
      assert.ok(change && !sql.includes(';'), '必须分步执行 ALTER')
      const [, , column] = change
      if (column === 'verified_phone' && interrupt) throw new Error('模拟连接中断')
      assert.ok(!columns.has(column), '已提交的 ALTER 不得重复执行')
      columns.set(column, column === 'registration_sms'
        ? { type: 'tinyint(1)', nullable: 'NO', defaultValue: '0', collation: null }
        : { type: column === 'verified_phone' ? 'varchar(11)' : 'varchar(254)', nullable: 'YES', defaultValue: null, collation: 'ascii_bin' })
      applied.push(column)
    },
    async execute(sql, args = []) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT digest')) return [recorded.has(args[0]) ? [{ digest: recorded.get(args[0]) }] : []]
      if (sql.includes('information_schema.COLUMNS')) return [columns.has(args[1]) ? [columns.get(args[1])] : []]
      if (sql.startsWith('INSERT INTO schema_migrations')) return recorded.set(args[0], args[1])
      throw new Error('未知迁移查询')
    },
    async end() {},
  }
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      return specifier === 'mysql2/promise'
        ? { url: 'data:text/javascript,export default {createConnection: async () => globalThis.registrationMigrationDb}', shortCircuit: true }
        : next(specifier, context)
    },
  })
  t.after(() => {
    hooks.deregister()
    if (savedArgument === undefined) process.argv.splice(2, 1)
    else process.argv[2] = savedArgument
    if (savedDatabase === undefined) delete process.env.QI_DATABASE_URL
    else process.env.QI_DATABASE_URL = savedDatabase
    delete globalThis.registrationMigrationDb
  })

  await assert.rejects(import('../scripts/setup.mjs?first-attempt'), /模拟连接中断/)
  assert.deepEqual(applied, ['registration_sms'])
  assert.ok(!recorded.has(target))
  interrupt = false
  await import('../scripts/setup.mjs?resume')
  assert.deepEqual(applied, ['registration_sms', 'verified_phone', 'verified_email'])
  assert.equal(recorded.get(target), createHash('sha256').update(await readFile(new URL(target, directory))).digest('hex'))
  await import('../scripts/setup.mjs?already-applied')
  assert.equal(applied.length, 3)
})
