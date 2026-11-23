import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import mysql from 'mysql2/promise'

const phone = '13900000001'
const identityBase = '99999920000229001'
const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const checksum = weights.reduce((sum, weight, index) => sum + weight * Number(identityBase[index]), 0)
const syntheticIdentity = identityBase + '10X98765432'[checksum % 11]
const pdf = '%PDF-1.4\n% synthetic example\n%%EOF'
const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64')
const isoFromNow = hours => new Date(Date.now() + hours * 3600000).toISOString()

test('报名、找回、历史表单编辑、附件和签到', async (t) => {
  const config = process.env
  assert.ok(config.QI_TEST_ADMIN_PASSWORD, '请用 QI_TEST_ADMIN_PASSWORD 指定测试管理员密码')
  const app = new URL(config.QI_ORIGIN)
  const database = new URL(config.QI_DATABASE_URL)
  assert.ok(['127.0.0.1', 'localhost'].includes(app.hostname) &&
    ['127.0.0.1', 'localhost'].includes(database.hostname), '此测试使用本机开发服务器和合成数据')
  const baseUrl = app.origin
  const db = await mysql.createConnection(database.href)
  const slug = 'qi-flow-' + randomUUID()
  const fieldId = {
    name: randomUUID(), phone: randomUUID(), text: randomUUID(), identity: randomUUID(),
    file: randomUUID(), choice: randomUUID(),
  }
  const attendeeName = '测试来宾'
  let eventId
  const manage = '/api/manage/'
  const attendee = '/api/e/' + slug + '/'
  const admin = {}
  const coverFiles = []
  const accountIds = []

  async function fixtureAccount(client) {
    if (client.accountCookie) return
    const [account] = await db.execute("INSERT INTO attendee_accounts (kind,identifier) VALUES ('email',?)", [randomUUID() + '@example.test'])
    accountIds.push(account.insertId)
    const token = randomBytes(32).toString('base64url')
    const digest = createHash('sha256').update(token).digest('hex')
    await db.execute("INSERT INTO sessions (token_hash,kind,registration_id,expires_at,account_id) VALUES (?,'account',NULL,UTC_TIMESTAMP(3)+INTERVAL 1 HOUR,?)",
      [digest, account.insertId])
    client.accountCookie = 'qm_account=' + token
    client.cookie = client.accountCookie
  }

  async function request(path, { method = 'GET', data, client = {}, status = 200 } = {}) {
    const headers = {}
    if (path.startsWith(attendee) || path.startsWith('/e/' + slug)) await fixtureAccount(client)
    if (client.cookie) headers.Cookie = client.cookie
    let body = data
    if (method !== 'GET') {
      headers.Origin = baseUrl
      if (!(data instanceof FormData)) {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(data || {})
      }
    }
    const response = await fetch(baseUrl + path, { method, body, headers, signal: AbortSignal.timeout(12000) })
    assert.equal(response.status, status, method + ' ' + path.split('?')[0] +
      (response.status === status ? '' : ' ' + (await response.text()).slice(0, 600)))
    const cookie = response.headers.getSetCookie()[0]
    if (cookie) client.cookie = [client.accountCookie, cookie.split(';')[0]].filter(Boolean).join('; ')
    const contentType = response.headers.get('content-type') || ''
    return contentType.includes('application/json') ? response.json() : response.text()
  }

  function post(path, data, client, status) {
    return request(path, { method: 'POST', data, client, status })
  }

  async function uploadCover() {
    const name = slug + '-' + coverFiles.length + '.png'
    const bytes = Buffer.concat([pixelPng, Buffer.from(randomUUID())])
    const response = await fetch(baseUrl + manage + 'materials/upload?name=' + name, {
      method: 'POST', headers: { Cookie: admin.cookie, Origin: baseUrl, 'Content-Type': 'image/png' },
      body: bytes, signal: AbortSignal.timeout(12000),
    })
    assert.equal(response.status, 200)
    const uploaded = await response.json()
    coverFiles.push({ id: uploaded.id, name })
    return uploaded.id
  }

  t.after(async () => {
    try {
      const [[fixture]] = await db.execute('SELECT id FROM events WHERE slug=?', [slug])
      if (fixture) {
        const id = fixture.id
        await db.beginTransaction()
        await db.execute('DELETE FROM export_audit WHERE event_id=?', [id])
        await db.execute('DELETE FROM sessions WHERE registration_id IN (SELECT id FROM registrations WHERE event_id=?)', [id])
        await db.execute('DELETE FROM attachments WHERE registration_id IN (SELECT id FROM registrations WHERE event_id=?)', [id])
        await db.execute('DELETE FROM checkins WHERE checkpoint_id IN (SELECT id FROM checkpoints WHERE event_id=?)', [id])
        await db.execute('DELETE FROM registrations WHERE event_id=?', [id])
        await db.execute('DELETE FROM checkpoints WHERE event_id=?', [id])
        await db.execute('DELETE FROM form_versions WHERE event_id=?', [id])
        await db.execute('DELETE FROM events WHERE id=? AND slug=?', [id, slug])
        await db.commit()
      }
      for (const file of coverFiles) await db.execute('DELETE FROM materials WHERE id=? AND name=?', [file.id, file.name])
      for (const id of accountIds) {
        await db.execute('DELETE FROM sessions WHERE account_id=?', [id])
        await db.execute('DELETE FROM attendee_accounts WHERE id=?', [id])
      }
      if (admin.cookie) await post(manage + 'logout', {}, admin)
    } finally {
      await db.end()
    }
  })

  await post(manage + 'login', {
    username: config.QI_TEST_ADMIN_USERNAME || 'admin', password: config.QI_TEST_ADMIN_PASSWORD,
  }, admin)
  const coverMaterialIds = [await uploadCover(), await uploadCover()]
  const settings = {
    title: '报名流程自动测试', slug, description: '**开场资料**\n\n- 请携带报名凭证\n\n<script>window.qmUnsafe = true</script>',
    organizer: '', venue: '', coverMaterialIds,
    startsAt: isoFromNow(-1), endsAt: isoFromNow(2), registrationStartsAt: isoFromNow(-2),
    registrationEndsAt: isoFromNow(1), editPolicy: 'once', editDeadline: 'registration',
  }
  eventId = (await post(manage + 'create', settings, admin)).id
  const eventQuery = '?eventId=' + eventId
  await request(attendee + 'details', { status: 404 })
  await request('/api/materials/' + coverMaterialIds[1], { status: 404 })
  const event = await request(manage + 'event' + eventQuery, { client: admin })
  const openingAgenda = { id: randomUUID(), title: '主旨分享', startsAt: isoFromNow(-0.5), endsAt: isoFromNow(0.5), description: '介绍当日议程与讨论方式。' }
  const closingAgenda = { id: randomUUID(), title: '自由交流', startsAt: isoFromNow(1), endsAt: null, description: '' }
  const savedAgenda = await post(manage + 'save-agenda' + eventQuery, { agenda: [closingAgenda, openingAgenda] }, admin)
  assert.deepEqual(savedAgenda.map(item => item.id), [openingAgenda.id, closingAgenda.id])
  await post(manage + 'publish' + eventQuery, { published: true }, admin)
  const initial = await request(attendee + 'details')
  assert.equal(initial.form.legacyContact, false)
  assert.equal(initial.identityRecovery, false)
  const anonymousEntry = await request('/e/' + slug + '/record')
  assert.ok(anonymousEntry.includes('id="record-recovery-entry"'))
  assert.ok(anonymousEntry.includes('使用报名凭证'))
  assert.ok(!anonymousEntry.includes('id="recovery-credential-'))
  assert.ok(!anonymousEntry.includes('id="recovery-name-'))
  // Represent a pre-migration form version without changing any registered history.
  await db.execute('UPDATE form_versions SET legacy_contact=1 WHERE id=?', [initial.form.id])
  assert.equal((await request(attendee + 'details')).identityRecovery, true)
  const legacy = await post(attendee + 'register', {
    name: '历史表单', phone: '13900000002', formId: initial.form.id, answers: {},
  }, {}, 201)
  assert.equal(legacy.registration.form.legacyContact, true)
  assert.equal(legacy.registration.name, '历史表单')
  assert.equal((await post(attendee + 'recover', { name: '历史表单', phone: '13900000002' }, {})).fullAccess, false)
  const primaryPoint = event.checkpoints[0].id
  const extraPoint = (await post(manage + 'save-checkpoint' + eventQuery, {
    title: '第二环节', qrMode: 'both', startsAt: isoFromNow(-1), endsAt: isoFromNow(2),
  }, admin)).id
  const form = await post(manage + 'save-form' + eventQuery, {
    formId: event.forms[0].id, identityPurpose: '合成身份测试',
    fields: [
      { id: fieldId.name, type: 'text', label: '参会人', contactRole: 'name', required: true },
      { id: fieldId.phone, type: 'phone', label: '联系方式', contactRole: 'phone', required: true },
      { id: fieldId.text, type: 'text', label: '留言', required: true },
      { id: fieldId.identity, type: 'identity', label: '身份证号', required: true },
      { id: fieldId.file, type: 'file', label: '资料', required: true, maxFiles: 2 },
      { id: fieldId.choice, type: 'checkbox', label: '意向', required: true, options: ['专题一', '专题二'] },
    ],
  }, admin)
  const details = await request(attendee + 'details')
  assert.equal(details.form.id, form.id)
  assert.equal(details.registrationOpen, true)
  assert.equal(details.recognized, false)
  assert.equal(details.checkpoints.length, 2)
  assert.equal(details.identityRecovery, true)
  assert.equal(details.form.legacyContact, false)
  assert.deepEqual(details.conference.coverImages.map(image => image.id), coverMaterialIds)
  const cover = await fetch(baseUrl + '/api/materials/' + coverMaterialIds[1])
  assert.equal(cover.status, 200)
  assert.equal(cover.headers.get('content-type'), 'image/png')
  await cover.arrayBuffer()
  const entry = '/e/' + slug
  const site = await request('/api/site')
  for (const [path, title] of [
    [entry, '报名流程自动测试 · ' + site.title],
    [entry + '/register', '活动报名 · 报名流程自动测试 · ' + site.title],
    [entry + '/record', '报名详情 · 报名流程自动测试 · ' + site.title],
    [entry + '/record?recover=1', '找回报名 · 报名流程自动测试 · ' + site.title],
    [entry + '/check-in', '现场签到 · 报名流程自动测试 · ' + site.title],
  ]) {
    const html = await request(path)
    const firstTitle = html.match(/<title>([^<]*)<\/title>/)?.[1]
      ?.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[entity])
    assert.equal(firstTitle, title, 'initial HTML title for ' + path)
    assert.ok(html.includes('attendee-footer') && html.includes('© 活动组 &amp; 2026'), 'copyright for ' + path)
    if (path === entry) {
      assert.ok(html.includes('aria-label="活动封面，可左右滑动"'))
      assert.ok(html.includes('attendee-cover-track'))
      assert.ok(html.includes('<strong>开场资料</strong>'))
      assert.ok(!html.slice(html.indexOf('<body')).includes('<script>window.qmUnsafe = true</script>'))
      assert.ok(html.includes('&lt;script&gt;window.qmUnsafe = true&lt;/script&gt;'))
      assert.ok(html.includes('活动流程</h2>'))
      assert.ok(html.indexOf('主旨分享</h3>') < html.indexOf('自由交流</h3>'))
      assert.ok(html.includes('介绍当日议程与讨论方式。</p>'))
    }
    if (path.endsWith('/register')) {
      assert.ok(html.includes('signup-with-dock'))
      assert.ok(html.includes('signup-upload-button'))
      assert.ok(html.includes('viewport-fit=cover'))
      assert.ok(!html.includes('class="attendee-back"'))
      assert.ok(!html.includes('id="attendee-registration-name"'))
      assert.ok(html.includes('id="attendee-field-' + fieldId.name + '"'))
      assert.match(html, /<input\b(?=[^>]*\btype="file")(?=[^>]*\bmultiple(?:[=\s>]))[^>]*>/)
    }
  }

  const original = {
    formId: form.id, identityConsent: true,
    answers: {
      [fieldId.name]: attendeeName, [fieldId.phone]: '+86 ' + phone, [fieldId.text]: '原回答',
      [fieldId.identity]: syntheticIdentity, [fieldId.choice]: ['专题一'],
    },
  }

  const originalFiles = [[pdf, '会议资料.pdf'], [pdf + '\nretained', '保留.pdf']]
  function submission(input, files = originalFiles) {
    const formData = new FormData()
    formData.append('payload', JSON.stringify(input))
    for (const [bytes, filename] of files) formData.append(fieldId.file, new Blob([bytes]), filename)
    return formData
  }

  await post(attendee + 'register', submission({ ...original, identityConsent: false }), {}, 400)
  await post(attendee + 'register', submission(original, [['<svg></svg>', '试图上传.pdf']]), {}, 415)
  await post(attendee + 'register', original, {}, 400)
  await post(attendee + 'register', submission(original, [...originalFiles, [pdf, '超额.pdf']]), {}, 400)

  const firstDevice = {}
  const saved = await post(attendee + 'register', submission(original), firstDevice, 201)
  assert.match(saved.credential, /^(?:[2-9A-HJ-NP-Z]{4}-){3}[2-9A-HJ-NP-Z]{4}$/)
  assert.match(saved.credential, /^([A-F0-9]{6}-){4}[A-F0-9]{6}$/)
  assert.equal(saved.registration.answers[fieldId.identity], syntheticIdentity)
  assert.equal(saved.registration.name, attendeeName)
  assert.equal(saved.registration.phone, phone)
  assert.equal(saved.registration.answers[fieldId.phone], phone)
  assert.deepEqual(saved.registration.attachments.map(file => file.filename).sort(), ['会议资料.pdf', '保留.pdf'].sort())
  const removed = saved.registration.attachments.find(file => file.filename === '会议资料.pdf')
  const retained = saved.registration.attachments.find(file => file.filename === '保留.pdf')
  assert.equal(saved.registration.canEdit, true)
  assert.equal((await request(attendee + 'details', { client: firstDevice })).recognized, true)
  const priorRecord = await request(entry + '/record', { client: firstDevice })
  assert.ok(priorRecord.includes('>原回答</dd>'), 'same-browser SSR displays the existing signup')
  assert.ok(!priorRecord.includes('>报名专属凭证</label>'))
  const publicRecord = await request(entry + '/record')
  assert.ok(publicRecord.includes('当前活动暂无报名记录'))
  assert.ok(!publicRecord.includes('id="recovery-name-'))
  assert.ok(!publicRecord.includes('id="recovery-credential-'))
  assert.ok(!publicRecord.includes('>原回答</dd>'))
  const recognizedSignup = await fetch(baseUrl + entry + '/register', {
    headers: { Cookie: firstDevice.cookie }, redirect: 'manual',
  })
  assert.equal(recognizedSignup.status, 302)
  assert.equal(recognizedSignup.headers.get('location'), entry + '/record')
  const recognizedDetail = await request(entry, { client: firstDevice })
  assert.ok(recognizedDetail.includes('>已报名</span>'))
  assert.ok(recognizedDetail.includes('查看报名详情'))
  assert.ok(!recognizedDetail.includes('立即报名'))
  const publicDetail = await request(entry)
  assert.ok(publicDetail.includes('立即报名'))
  assert.ok(publicDetail.includes('我的报名'))
  assert.ok(!publicDetail.includes('找回报名'))
  const guestRecord = await fetch(baseUrl + entry + '/record', { redirect: 'manual' })
  assert.equal(guestRecord.status, 302)
  assert.equal(new URL(guestRecord.headers.get('location'), baseUrl).searchParams.get('next'), entry + '/record')
  await post(attendee + 'register', submission(original), {}, 409)
  const attachmentPath = attendee + 'attachment?id=' + removed.id
  await request(attachmentPath, { status: 401 })
  assert.equal(await request(attachmentPath, { client: firstDevice }), pdf)

  const [[stored]] = await db.execute('SELECT answers,credential_hash FROM registrations WHERE id=?', [saved.registration.id])
  assert.notEqual(stored.answers[fieldId.identity], syntheticIdentity)
  assert.notEqual(stored.credential_hash, saved.credential)
  const [[file]] = await db.execute('SELECT payload FROM attachments WHERE id=?', [removed.id])
  assert.notDeepEqual(file.payload, Buffer.from(pdf))

  const weakDevice = {}
  const recovery = await post(attendee + 'recover', { name: attendeeName, phone }, weakDevice)
  assert.equal(recovery.fullAccess, false)
  assert.deepEqual(recovery.answers, {})
  assert.deepEqual(recovery.attachments, [])
  assert.equal(recovery.phone, '139****0001')
  await request(attachmentPath, { client: weakDevice, status: 403 })
  await post(attendee + 'edit', {}, weakDevice, 403)

  const otherDevice = {}
  const recovered = await post(attendee + 'recover', { credential: saved.credential.toLowerCase().replaceAll('-', '') }, otherDevice)
  assert.equal(recovered.fullAccess, true)
  assert.equal(recovered.answers[fieldId.text], '原回答')
  assert.equal((await post(attendee + 'recover', { name: attendeeName, phone }, otherDevice)).fullAccess, true)

  const newer = await post(manage + 'save-form' + eventQuery, { formId: form.id, fields: [] }, admin)
  assert.equal((await request(attendee + 'details')).form.id, newer.id)
  assert.equal((await request(attendee + 'details')).identityRecovery, true)
  await post(attendee + 'register', submission(original), {}, 409)
  const unmatched = await post(attendee + 'register', { formId: newer.id, name: '未采集的姓名', phone: '13900000003', answers: {} }, {}, 201)
  assert.equal(unmatched.registration.name, null)
  assert.equal(unmatched.registration.phone, null)
  assert.equal((await post(attendee + 'recover', { credential: unmatched.credential }, {})).id, unmatched.registration.id)
  await post(attendee + 'recover', { name: '未采集的姓名', phone: '13900000003' }, {}, 404)
  await post(attendee + 'edit', { formId: form.id, edits: 0, answers: { ...original.answers, [fieldId.name]: '篡改' } }, otherDevice, 400)
  const revised = {
    formId: form.id, edits: 0, removeAttachments: [removed.id],
    answers: { ...original.answers, [fieldId.text]: '新回答' },
  }
  delete revised.answers[fieldId.name]
  delete revised.answers[fieldId.phone]
  const attempts = await Promise.all([0, 1].map(async () => {
    const response = await fetch(baseUrl + attendee + 'edit', {
      method: 'POST', headers: { Cookie: otherDevice.cookie, Origin: baseUrl },
      body: submission(revised, [[pdf + '\nupdated', '替换资料.pdf']]),
    })
    return [response.status, await response.json()]
  }))
  assert.deepEqual(attempts.map(([status]) => status).sort(), [200, 409])
  const edited = attempts.find(([status]) => status === 200)[1]
  assert.equal(edited.form.id, form.id)
  assert.equal(edited.edits, 1)
  assert.equal(edited.canEdit, false)
  assert.equal(edited.answers[fieldId.text], '新回答')
  assert.deepEqual(edited.attachments.map(file => file.filename).sort(), ['替换资料.pdf', '保留.pdf'].sort())
  assert.equal(edited.answers[fieldId.name], attendeeName)
  assert.equal(edited.answers[fieldId.phone], phone)
  assert.equal(await request(attendee + 'attachment?id=' + retained.id, { client: otherDevice }), pdf + '\nretained')
  await request(attachmentPath, { client: otherDevice, status: 404 })

  async function qr(pointId, mode) {
    const item = await request(manage + 'qr' + eventQuery + '&id=' + pointId + '&mode=' + mode, { client: admin })
    return new URL(item.url).searchParams.get('q')
  }
  const fixed = await qr(primaryPoint, 'fixed')
  const dynamic = await qr(extraPoint, 'dynamic')
  const prefix = attendee + 'check-in'
  assert.equal((await request(prefix + '?q=' + fixed)).recognized, false)
  const qrWithoutCookie = await request(entry + '/check-in?q=' + fixed)
  assert.ok(qrWithoutCookie.includes('id="recovery-name-'))
  assert.ok(qrWithoutCookie.includes('>专属凭证</button>'))
  await post(prefix, { q: fixed }, {}, 401)
  const fixedCheckin = await post(prefix, { q: fixed }, weakDevice)
  assert.equal(fixedCheckin.source, 'fixed')
  assert.equal(fixedCheckin.repeated, false)
  const repeated = await post(prefix, { q: fixed }, otherDevice)
  assert.equal(repeated.repeated, true)
  assert.equal(repeated.checkedAt, fixedCheckin.checkedAt)
  assert.equal((await request(prefix + '?q=' + fixed, { client: otherDevice })).checkedAt, fixedCheckin.checkedAt)
  assert.equal((await post(prefix, { q: dynamic }, otherDevice)).source, 'dynamic')
  await request(prefix + '?point=' + primaryPoint, { status: 409 })
  const directPoint = (await post(manage + 'save-checkpoint' + eventQuery, {
    title: '手机签到环节', qrMode: 'both', directEnabled: true, startsAt: isoFromNow(-1), endsAt: isoFromNow(2),
  }, admin)).id
  await post(prefix, { point: directPoint }, {}, 401)
  const direct = await post(prefix, { point: directPoint }, otherDevice)
  assert.equal(direct.source, 'direct')
  assert.equal(direct.repeated, false)
  const afterDirect = await post(prefix, { q: await qr(directPoint, 'fixed') }, otherDevice)
  assert.equal(afterDirect.checkedAt, direct.checkedAt)
  assert.equal(afterDirect.repeated, true)
  await request(prefix + '?q=' + dynamic + 'x', { status: 400 })
  const tokenParts = dynamic.split('.')
  tokenParts[5] = String(Math.floor(Date.now() / 1000) - 1)
  const expired = tokenParts.slice(0, 6).join('.')
  const signature = createHmac('sha256', Buffer.from(config.QI_SIGNING_KEY, 'hex')).update(expired).digest('base64url')
  await post(prefix, { q: expired + '.' + signature }, otherDevice, 410)
  await post(manage + 'revoke-qr' + eventQuery, { id: primaryPoint }, admin)
  await post(prefix, { q: fixed }, weakDevice, 410)

  const ordinary = await request(manage + 'export' + eventQuery + '&formId=' + form.id, { client: admin })
  assert.match(ordinary, /手机签到/)
  assert.match(ordinary, /\*{11}/)
  assert.ok(!ordinary.includes(syntheticIdentity))
  const full = await post(manage + 'export-full' + eventQuery, { formId: form.id }, admin)
  assert.ok(full.includes(syntheticIdentity))
  const audit = await request(manage + 'audit' + eventQuery, { client: admin })
  assert.equal(audit[0].rowCount, 1)

  const activeFixed = await qr(primaryPoint, 'fixed')
  const activeDynamic = await qr(extraPoint, 'dynamic')
  const closedRegistration = await post(manage + 'close' + eventQuery, { scope: 'registration' }, admin)
  assert.ok(closedRegistration.registrationClosedAt)
  assert.equal(closedRegistration.endedAt, null)
  assert.equal(closedRegistration.registrationEndsAt, settings.registrationEndsAt)
  const closedDetails = await request(attendee + 'details')
  assert.equal(closedDetails.registrationOpen, false)
  assert.equal(closedDetails.conference.registrationClosedAt, closedRegistration.registrationClosedAt)
  const closedRegistrationPage = await request(entry)
  assert.match(closedRegistrationPage, /<span[^>]*class="event-registration-state"[^>]*>报名已截止<\/span>/)
  assert.match(closedRegistrationPage, new RegExp('href="' + entry + '/check-in\\?point=' + directPoint + '"[^>]*>手机签到</a>'))
  assert.match(await request(entry + '/register'), /报名已截止<\/h1>/)
  await post(attendee + 'register', { formId: newer.id, answers: {} }, {}, 409)
  assert.equal((await post(prefix, { q: activeFixed }, otherDevice)).repeated, true)

  const ended = await post(manage + 'close' + eventQuery, { scope: 'event' }, admin)
  assert.ok(ended.endedAt)
  assert.equal(ended.endsAt, settings.endsAt)
  assert.equal(ended.registrationClosedAt, closedRegistration.registrationClosedAt)
  assert.match(await request(entry), /<button\b(?=[^>]*class="event-enroll-action")(?=[^>]*\bdisabled(?:[=\s>]))[^>]*>活动已结束<\/button>/)
  const endedPage = await request(entry + '/check-in?q=' + activeFixed, { status: 410 })
  assert.match(endedPage, /活动已结束<\/h1>/)
  await request(prefix + '?q=' + activeDynamic, { status: 410 })
  await post(prefix, { q: activeFixed }, otherDevice, 410)
  await post(prefix, { q: activeDynamic }, otherDevice, 410)
  await request(manage + 'qr' + eventQuery + '&id=' + primaryPoint + '&mode=fixed', { client: admin, status: 409 })
  const preservedRecord = await request(attendee + 'record', { client: otherDevice })
  assert.equal(preservedRecord.id, saved.registration.id)
  assert.ok(preservedRecord.attendance.every(item => item.checkedAt))
})
