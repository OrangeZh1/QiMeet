import test from 'node:test'
import assert from 'node:assert/strict'
import mysql from 'mysql2/promise'

test('短信与邮箱配置保存、密钥保留和访问控制', async () => {
  const { QI_ORIGIN, QI_DATABASE_URL, QI_TEST_ADMIN_PASSWORD, QI_SMS_PROVIDER } = process.env
  const origin = new URL(QI_ORIGIN).origin
  const database = new URL(QI_DATABASE_URL)
  const loopback = ['127.0.0.1', 'localhost']
  assert.ok(loopback.includes(new URL(origin).hostname) && loopback.includes(database.hostname) &&
    database.pathname === '/qimeet_delivery_test', '请使用本机独立测试库 qimeet_delivery_test')
  assert.ok(QI_TEST_ADMIN_PASSWORD, '请用 QI_TEST_ADMIN_PASSWORD 指定测试管理员密码')

  let cookie = ''
  const request = (path, { body, admin = true, source = origin } = {}) => fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(admin && cookie ? { cookie } : {}), ...(body ? { origin: source, 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  })
  const login = await request('/api/manage/login', { body: { username: 'admin', password: QI_TEST_ADMIN_PASSWORD } })
  assert.equal(login.status, 200)
  cookie = login.headers.getSetCookie()[0].split(';')[0]
  const sms = '/api/manage/delivery/sms'
  const email = '/api/manage/delivery/email'
  const aliyun = { accessKeyId: 'aliyun-fixture', signName: '测试签名', templateCode: 'SMS_1002', secret: 'aliyun-fixture-secret' }
  const tencent = { secretId: 'tencent-fixture', region: 'ap-guangzhou', smsSdkAppId: '1400000000',
    signName: '测试签名', templateId: '1003', secret: 'tencent-fixture-secret' }
  const smtp = { host: 'localhost', port: '587', user: 'fixture', from: 'sender@example.test', secret: 'smtp-fixture-secret' }
  const secrets = [aliyun.secret, tencent.secret, smtp.secret, process.env.QI_ALIYUN_ACCESS_KEY_SECRET].filter(Boolean)

  async function save(path, body) {
    const response = await request(path, { body })
    assert.equal(response.status, 200)
    const content = await response.text()
    assert.ok(secrets.every(secret => !content.includes(secret)), '保存响应包含密钥')
    return JSON.parse(content)
  }

  const db = await mysql.createConnection(database.href)
  const columns = 'sms_provider,aliyun_sms_config,tencent_sms_config,smtp_config'
  const readRow = async () => (await db.query('SELECT ' + columns + ' FROM site_settings WHERE id=1'))[0][0]
  try {
    assert.ok(Object.values(await readRow()).every(value => value === null), '测试需要配置为空的独立测试数据库')
    try {
      assert.equal((await request(sms, { admin: false })).status, 401)
      assert.equal((await request(email, { body: { config: smtp }, admin: false })).status, 401)
      assert.equal((await request(sms, { body: { provider: 'disabled' }, source: 'https://example.test' })).status, 403)

      const before = await (await request(sms)).text()
      assert.equal(JSON.parse(before).provider, ['aliyun', 'tencent'].includes(QI_SMS_PROVIDER) ? QI_SMS_PROVIDER : 'disabled')
      assert.ok(secrets.every(secret => !before.includes(secret)), '读取响应包含环境变量中的密钥')

      await save(sms, { provider: 'aliyun', config: aliyun })
      await save(sms, { provider: 'tencent', config: tencent })
      const changed = await save(sms, { provider: 'aliyun', config: { ...aliyun, secret: '', templateCode: 'SMS_1004' } })
      assert.equal(changed.provider, 'aliyun')
      assert.equal(changed.configs.aliyun.values.templateCode, 'SMS_1004')
      assert.equal(changed.configs.aliyun.secretConfigured, true)
      assert.equal(changed.configs.tencent.values.templateId, tencent.templateId)
      assert.equal((await request(sms, { body: { provider: 'aliyun', config: { ...aliyun, accessKeyId: 'changed', secret: '' } } })).status, 400)
      await save(sms, { provider: 'disabled' })
      assert.equal((await request('/api/account/code', { admin: false, body: {
        kind: 'phone', identifier: '13900000001', intent: 'register', policyAccepted: true,
      } })).status, 503)

      assert.equal((await request(email, { body: { config: { ...smtp, port: '65536' } } })).status, 400)
      await save(email, { config: smtp })
      const updated = await save(email, { config: { ...smtp, secret: '', from: 'updated@example.test' } })
      assert.equal(updated.configs.smtp.secretConfigured, true)
      assert.equal((await request(email, { body: { config: { ...smtp, host: 'different.example.test', secret: '' } } })).status, 400)
      const { sms_provider, ...encrypted } = await readRow()
      assert.equal(sms_provider, 'disabled')
      assert.ok(Object.values(encrypted).every(value => Buffer.isBuffer(value) && secrets.every(secret => !value.includes(secret))))
      const publicSettings = await (await request('/api/site', { admin: false })).text()
      assert.ok(!publicSettings.includes(smtp.from) && !publicSettings.includes(aliyun.accessKeyId))
    } finally {
      await db.query('UPDATE site_settings SET sms_provider=NULL,aliyun_sms_config=NULL,tencent_sms_config=NULL,smtp_config=NULL WHERE id=1')
    }
  } finally {
    await db.end()
  }
})
