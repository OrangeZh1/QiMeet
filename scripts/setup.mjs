import mysql from 'mysql2/promise'
import { createHash, randomBytes, scryptSync } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'

const task = process.argv[2]
if (!process.env.QI_DATABASE_URL) throw new Error('请配置 QI_DATABASE_URL')
if (!['migrate', 'admin', 'demo'].includes(task)) throw new Error('请选择 migrate、admin 或 demo')

const url = new URL(process.env.QI_DATABASE_URL)
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port || 3306),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)),
  timezone: 'Z', multipleStatements: task === 'migrate',
})
try {
  if (task === 'migrate') {
    const [[{ acquired }]] = await db.execute("SELECT GET_LOCK(CONCAT('qimeet:', DATABASE()), 15) AS acquired")
    if (acquired !== 1) throw new Error('未取得迁移锁')
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(120) PRIMARY KEY, digest CHAR(64) NOT NULL)')
    const dir = new URL('../database/', import.meta.url)
    for (const name of (await readdir(dir)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
      const sql = await readFile(new URL(name, dir), 'utf8')
      const digest = createHash('sha256').update(sql).digest('hex')
      const [[existing]] = await db.execute('SELECT digest FROM schema_migrations WHERE version=?', [name])
      if (existing) {
        if (existing.digest !== digest) throw new Error('已执行的迁移发生变化 ' + name)
        continue
      }
      await db.query(sql)
      await db.execute('INSERT INTO schema_migrations VALUES (?,?)', [name, digest])
      console.log('已应用', name)
    }
  }
  if (task === 'admin') {
    const name = (process.env.QI_ADMIN_USERNAME || 'admin').trim()
    const password = process.env.QI_ADMIN_PASSWORD
    if (!name || name.length > 64 || !password || password.length < 12 || password.length > 200) {
      throw new Error('请临时设置 QI_ADMIN_PASSWORD（12–200 字符），账号默认 admin')
    }
    const salt = randomBytes(16).toString('hex')
    const hash = salt + ':' + scryptSync(password, salt, 64).toString('hex')
    await db.beginTransaction()
    await db.execute('INSERT INTO admin_account (id,username,password_hash) VALUES (1,?,?) ON DUPLICATE KEY UPDATE username=?,password_hash=?', [name, hash, name, hash])
    await db.execute("DELETE FROM sessions WHERE kind='admin'")
    await db.commit()
    console.log('管理员已初始化')
  }
  if (task === 'demo') {
    const [[existing]] = await db.execute("SELECT id FROM events WHERE slug='demo'")
    if (!existing) {
      await db.beginTransaction()
      const [result] = await db.execute(
        "INSERT INTO events (slug,title,organizer,venue,description,starts_at,ends_at,registration_starts_at,registration_ends_at,published,edit_policy) VALUES ('demo',?,?,?,?,UTC_TIMESTAMP(3) + INTERVAL 1 DAY,UTC_TIMESTAMP(3) + INTERVAL 2 DAY,UTC_TIMESTAMP(3) - INTERVAL 1 DAY,UTC_TIMESTAMP(3) + INTERVAL 7 DAY,1,'once')",
        ['城市创意交流会', 'QiMeet 活动组', '城市文化中心 · 一楼主会场', '一场面向创意从业者与本地社区的线下交流。现场设有主题分享、小组讨论与自由交流。\n\n请提前完成报名，到场后扫描会场入口的二维码完成签到。'],
      )
      const fields = [
        { id: '41361430-396a-4b05-916c-d7ba42334c00', type: 'text', label: '单位或团队', required: false, options: [] },
        { id: '9d098023-05a7-4995-ac11-5f6f9de672cc', type: 'radio', label: '感兴趣的环节', required: false, options: ['主题分享', '小组讨论', '自由交流'] },
      ]
      await db.execute("INSERT INTO form_versions (event_id,version,fields) VALUES (?,1,?)", [result.insertId, JSON.stringify(fields)])
      await db.execute("INSERT INTO checkpoints (event_id,title,starts_at,ends_at) VALUES (?,'主会场签到',UTC_TIMESTAMP(3) - INTERVAL 1 DAY,UTC_TIMESTAMP(3) + INTERVAL 7 DAY)", [result.insertId])
      await db.commit()
    }
    console.log('示例活动 /e/demo')
  }
} finally {
  await db.end()
}
