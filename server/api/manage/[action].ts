import { signInAdmin } from '../../utils/security'

export default defineEventHandler(async (event) => {
  privateResponse(event)
  const action = getRouterParam(event, 'action')
  const method = getMethod(event)
  if (method !== 'GET' && method !== 'POST') fail(405, '请求方法不支持')
  if (method === 'POST') sameOrigin(event)
  if (action === 'login' && method === 'POST') {
    throttle(event, 'login', 10, 15 * 60 * 1000)
    const input = await jsonBody(event)
    if (typeof input.password !== 'string' || input.password.length > 200) fail(401, '账号或密码有误')
    await signInAdmin(event, text(input.username, 64, '账号'), input.password)
    return { authenticated: true }
  }

  await assertAdmin(event)
  if (action === 'session' && method === 'GET') return { authenticated: true, ...await adminProfile() }
  if (action === 'save-profile' && method === 'POST') {
    throttle(event, 'save-profile', 15)
    return saveAdminProfile(event, await jsonBody(event))
  }
  if (action === 'save-password' && method === 'POST') {
    throttle(event, 'save-password', 10)
    return saveAdminPassword(event, await jsonBody(event))
  }
  if (action === 'logout' && method === 'POST') {
    await clearQiSession(event)
    return { ok: true }
  }
  if (action === 'events' && method === 'GET') {
    return getQuery(event).view === 'trash' ? listTrashedConferences() : listConferences()
  }
  if (action === 'users' && method === 'GET') return listAttendeeAccounts(getQuery(event))
  if (action === 'users' && method === 'POST') {
    const input = await jsonBody(event)
    const kind = oneOf(input.kind, ['phone', 'email'], '账号类型')
    const additionalPhone = kind === 'email' ? text(input.phone, 16, '手机号', false) : ''
    const user = await createAttendeeAccount(kind, contactIdentifier(kind, input.identifier), input.password, undefined, {
      displayName: text(input.displayName, 60, '名称'),
      contactPhone: additionalPhone ? contactIdentifier('phone', additionalPhone) : null,
      avatarMaterialId: text(input.avatarMaterialId, 36, '头像素材', false).toLowerCase() || null,
    })
    setResponseStatus(event, 201)
    return user
  }
  if (action === 'edit-user' && method === 'POST') return editAttendeeAccount(await jsonBody(event))
  if (action === 'set-user-status' && method === 'POST') return setAttendeeStatus(await jsonBody(event))
  if (action === 'delete-user' && method === 'POST') return deleteAttendeeAccount(positive((await jsonBody(event)).id))
  if (action === 'create' && method === 'POST') return { id: await saveConference(undefined, await jsonBody(event)) }

  const query = getQuery(event)
  if (!query.eventId) fail(404, '操作不存在')
  const eventId = positive(query.eventId)
  if (method === 'GET') {
    if (action === 'event') return getAdminEvent(eventId)
    if (action === 'registrants') return listRegistrations(eventId, query)
    if (action === 'registrant') {
      const conference = await conferenceById(eventId)
      return recordView(conference, await registrationFor(eventId, positive(query.id)), 'masked')
    }
    if (action === 'attachment') {
      await conferenceById(eventId)
      const registration = await registrationFor(eventId, positive(query.id))
      return serveAttachment(event, registration.id, text(query.attachmentId, 36, '附件'))
    }
    if (action === 'qr') {
      throttle(event, 'qr', 90)
      const [conference, point] = await Promise.all([conferenceById(eventId), checkpointFor(eventId, positive(query.id))])
      return issueQr(conference, point, oneOf(query.mode, ['fixed', 'dynamic'], '二维码类型'))
    }
    if (action === 'registration-qr') {
      throttle(event, 'registration-qr', 90)
      return issueRegistrationQr(await conferenceById(eventId))
    }
    if (action === 'audit') {
      await conferenceById(eventId)
      const entries = await rows<{ id: number, version: number, rowCount: number, createdAt: string }>(
        'SELECT e.id,f.version,e.row_count AS rowCount,e.created_at AS createdAt FROM export_audit e JOIN form_versions f ON f.id=e.form_id WHERE e.event_id=? ORDER BY e.id DESC LIMIT 100',
        [eventId],
      )
      return entries.map(entry => ({ ...entry, createdAt: iso(entry.createdAt) }))
    }
    if (action === 'export') return exportRegistrants(event, eventId, query.formId ? positive(query.formId) : undefined, false)
  }

  if (method === 'POST') {
    const input = await jsonBody(event)
    if (action === 'delete-event') return trashEvent(eventId)
    if (action === 'restore-event') return restoreTrashedEvent(eventId)
    if (action === 'purge-event') return purgeTrashedEvent(eventId, text(input.deletedAt, 35, '移入回收站时间'))
    if (action === 'save') return { id: await saveConference(eventId, input) }
    if (action === 'publish') {
      if (typeof input.published !== 'boolean') fail(400, '请选择发布状态')
      const published = input.published
      return transaction(async (db) => {
        await conferenceById(eventId, db, true)
        await mutate('UPDATE events SET published=? WHERE id=?', [published, eventId], db)
        return { published }
      })
    }
    if (action === 'close') return closeEventPart(eventId, oneOf(input.scope, ['registration', 'event'], '截止类型'))
    if (action === 'save-agenda') return saveEventAgenda(eventId, input.agenda)
    if (action === 'save-form') return saveForm(eventId, input)
    if (action === 'save-registration-sms') {
      const registrationSms = input.registrationSms
      if (typeof registrationSms !== 'boolean') fail(400, '请选择是否发送报名成功短信')
      return transaction(async (db) => {
        await conferenceById(eventId, db, true)
        await mutate('UPDATE events SET registration_sms=? WHERE id=?', [registrationSms, eventId], db)
        return { registrationSms }
      })
    }
    if (action === 'save-checkpoint') return { id: await saveCheckpoint(eventId, input) }
    if (action === 'revoke-qr') {
      return transaction(async (db) => {
        await conferenceById(eventId, db, true)
        const point = await checkpointFor(eventId, positive(input.id), db, true)
        await mutate('UPDATE checkpoints SET qr_version=qr_version+1 WHERE id=?', [point.id], db)
        return { ok: true }
      })
    }
    if (action === 'manual-checkin') {
      return transaction(async (db) => {
        await conferenceById(eventId, db, true)
        const point = await checkpointFor(eventId, positive(input.checkpointId), db, true)
        const registration = await registrationFor(eventId, positive(input.registrationId), db)
        return recordCheckin(db, point.id, registration.id, 'manual')
      })
    }
    if (action === 'export-full') {
      throttle(event, 'export-full', 30)
      return exportRegistrants(event, eventId, positive(input.formId), true)
    }
  }
  fail(404, '操作不存在')
})
