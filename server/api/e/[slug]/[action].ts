import type { Conference, EventDetails } from '#shared/models'
import type { StoredRegistration } from '#server/utils/registrations'
import type { RequestEvent } from '#server/utils/security'

async function attendeeSession(event: RequestEvent, eventId: number, full = false) {
  const account = await requireAttendeeAccount(event)
  const session = await findQiSession(event, eventId, account.id)
  if (!session?.registrationId) fail(401, '请先找回报名记录')
  if (full && session.kind !== 'attendee') fail(403, '请使用专属凭证验证后再操作')
  return { registrationId: session.registrationId, mode: session.kind === 'attendee' ? 'full' as const : 'checkin' as const }
}

async function details(event: RequestEvent, slug: string): Promise<EventDetails & { identityRecovery: boolean }> {
  const conference = await publishedConference(slug)
  const [form, checkpoints, account, identityLookup] = await Promise.all([
    activeForm(conference.id), checkpointsFor(conference.id), getAttendeeAccount(event),
    first('SELECT 1 FROM registrations WHERE event_id=? AND name IS NOT NULL AND phone IS NOT NULL LIMIT 1', [conference.id]),
  ])
  const session = await findQiSession(event, conference.id, account?.id)
  const configuredIdentity = form.legacyContact || (
    form.fields.some(field => field.contactRole === 'name') && form.fields.some(field => field.contactRole === 'phone')
  )
  return {
    conference, form, registrationOpen: registrationOpen(conference), recognized: Boolean(session?.registrationId), signedIn: Boolean(account),
    identityRecovery: configuredIdentity || Boolean(identityLookup),
    checkpoints: checkpoints.map(({ id, title, startsAt, endsAt, qrMode, directEnabled }) => ({ id, title, startsAt, endsAt, qrMode, directEnabled })),
  }
}

async function recover(event: RequestEvent, slug: string) {
  const account = await requireAttendeeAccount(event)
  const conference = await publishedConference(slug)
  throttle(event, 'attendee-recover:' + conference.id, 90, 60000)
  const input = await jsonBody(event)
  const byCredential = input.credential !== undefined
  let record: StoredRegistration | undefined
  if (byCredential) {
    const credential = text(input.credential, 70, '专属凭证')
    record = await first<StoredRegistration>(
      'SELECT ' + registrationColumns + ' FROM registrations r WHERE r.event_id=? AND r.credential_hash=?',
      [conference.id, credentialHash(credential)],
    )
  } else {
    record = await first<StoredRegistration>(
      'SELECT ' + registrationColumns + ' FROM registrations r WHERE r.event_id=? AND r.name=? AND r.phone=?',
      [conference.id, text(input.name, 80, '姓名'), phone(input.phone)],
    )
  }
  if (!record) fail(404, '未找到对应报名记录，请确认填写无误')

  const current = await findQiSession(event, conference.id, account.id)
  const sameFull = current?.kind === 'attendee' && current.registrationId === record.id
  const fullAccess = byCredential || sameFull
  const view = await recordView(conference, record, fullAccess ? 'full' : 'checkin')
  if (!sameFull) {
    const writeCookie = await transaction(async (db) => {
      if (byCredential) {
        try {
          await mutate('UPDATE registrations SET account_id=? WHERE id=? AND account_id IS NULL', [account.id, record.id], db)
        } catch (error) {
          if (!isDuplicate(error)) throw error
        }
      }
      return prepareQiSession(event, fullAccess ? 'attendee' : 'checkin', record.id, db, conference.id, account.id)
    })
    writeCookie()
  }
  return view
}

function assertRegistrationOpen(conference: Conference) {
  if (!registrationOpen(conference)) {
    fail(409, conference.endedAt ? '活动已结束' : conference.registrationClosedAt ? '报名已截止' : '当前不在报名时段内')
  }
}

async function register(event: RequestEvent, slug: string) {
  const account = await requireAttendeeAccount(event)
  const conference = await publishedConference(slug)
  throttle(event, 'attendee-register:' + conference.id, 120, 60000)
  assertRegistrationOpen(conference)
  const submission = await readAttendeeSubmission(event)
  const currentForm = await activeForm(conference.id)
  const formId = positive(submission.payload.formId)
  if (currentForm.id !== formId) fail(409, '报名表已有更新，请重新打开报名页')
  const prepared = await prepareAttendeeSubmission(currentForm, submission, submission.payload.identityConsent === true)
  const contactAnswer = (role: 'name' | 'phone') => {
    const field = currentForm.fields.find(field => field.contactRole === role)
    const value = field ? prepared.answers[field.id] : undefined
    return typeof value === 'string' ? value : null
  }
  const name = currentForm.legacyContact ? text(submission.payload.name, 80, '姓名') : contactAnswer('name')
  const contact = currentForm.legacyContact ? phone(submission.payload.phone) : contactAnswer('phone')
  const removals = validateAttendeeAttachments(prepared, [])
  const credential = newCredential()

  const { writeCookie, registration } = await transaction(async (db) => {
    // Share the event lock used by administrator edits so publication, schedule, and form version stay consistent.
    const locked = await publishedConference(slug, db, true)
    assertRegistrationOpen(locked)
    if ((await activeForm(locked.id, db)).id !== formId) fail(409, '报名表已有更新，请重新打开报名页')
    let registrationId: number
    try {
      registrationId = (await mutate(
        'INSERT INTO registrations (event_id,form_id,name,phone,credential_hash,answers,identity_consented_at,created_at,account_id) VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(3),?)',
        [locked.id, formId, name, contact, credentialHash(credential), JSON.stringify(prepared.answers),
          prepared.identityConsented ? utc() : null, account.id], db,
      )).insertId
    } catch (error) {
      if (isDuplicate(error) && await first('SELECT id FROM registrations WHERE event_id=? AND account_id=?', [locked.id, account.id], db)) {
        fail(409, '当前账号已报名，请查看我的报名')
      }
      if (isDuplicate(error) && name && contact) fail(409, '该姓名和手机号已报名，可找回已有记录')
      throw error
    }
    await saveAttendeeAttachments(db, registrationId, prepared, removals)
    const registration = await recordView(locked, await registrationFor(locked.id, registrationId, db), 'full', db)
    const writeCookie = await prepareQiSession(event, 'attendee', registrationId, db, locked.id, account.id)
    return { writeCookie, registration }
  })

  writeCookie()
  setResponseStatus(event, 201)
  return { credential, registration }
}

async function edit(event: RequestEvent, slug: string) {
  const conference = await publishedConference(slug)
  const session = await attendeeSession(event, conference.id, true)
  throttle(event, 'attendee-edit:' + conference.id, 120, 60000)
  const before = await registrationFor(conference.id, session.registrationId)
  if (!editOpen(conference, before.edits)) fail(409, '当前无法修改这份报名')
  const submission = await readAttendeeSubmission(event)
  const form = await savedForm(conference.id, before.formId)
  const edits = submission.payload.edits
  if (positive(submission.payload.formId) !== form.id || !Number.isSafeInteger(edits) || edits !== before.edits) {
    fail(409, '报名记录已更新，请重新打开报名详情')
  }
  const prepared = await prepareAttendeeSubmission(form, submission,
    Boolean(before.identityConsentedAt) || submission.payload.identityConsent === true, before.answers)
  await attendeeSession(event, conference.id, true)

  return transaction(async (db) => {
    const locked = await publishedConference(slug, db, true)
    const record = await registrationFor(locked.id, session.registrationId, db, true)
    if (record.edits !== edits) fail(409, '报名记录已更新，请重新打开报名详情')
    if (!editOpen(locked, record.edits)) fail(409, '当前无法修改这份报名')
    const removals = validateAttendeeAttachments(prepared, await attachmentsFor(record.id, db))
    await saveAttendeeAttachments(db, record.id, prepared, removals)
    await mutate(
      'UPDATE registrations SET answers=?, identity_consented_at=COALESCE(identity_consented_at,?), edits=edits+1, updated_at=UTC_TIMESTAMP(3) WHERE id=?',
      [JSON.stringify(prepared.answers), prepared.identityConsented ? utc() : null, record.id], db,
    )
    return recordView(locked, await registrationFor(locked.id, record.id, db), 'full', db)
  })
}

async function checkin(event: RequestEvent, slug: string, method: 'GET' | 'POST') {
  const conference = await publishedConference(slug)
  if (conference.endedAt) fail(410, '活动已结束，现场签到已关闭')
  const { q, point } = method === 'GET' ? getQuery(event) : await jsonBody(event)
  const decoded = q === undefined && point !== undefined ? null : decodeQr(q, conference.id)
  const checkpointId = decoded?.checkpointId ?? positive(point)
  if (method === 'GET') {
    const checkpoint = await checkpointFor(conference.id, checkpointId)
    if (decoded) verifyCheckpoint(checkpoint, decoded)
    else verifyDirectCheckpoint(checkpoint)
    const account = await getAttendeeAccount(event)
    const session = await findQiSession(event, conference.id, account?.id)
    const record = session?.registrationId ? await first<{ name: string | null, checkedAt: string | null }>(
      'SELECT r.name,c.checked_at AS checkedAt FROM registrations r LEFT JOIN checkins c ' +
      'ON c.registration_id=r.id AND c.checkpoint_id=? WHERE r.event_id=? AND r.id=?',
      [checkpoint.id, conference.id, session.registrationId],
    ) : undefined
    const { id, title, startsAt, endsAt, qrMode, directEnabled } = checkpoint
    return {
      checkpoint: { id, title, startsAt, endsAt, qrMode, directEnabled },
      recognized: Boolean(record),
      name: record?.name || null,
      checkedAt: record?.checkedAt ? iso(record.checkedAt) : null,
    }
  }

  const session = await attendeeSession(event, conference.id)
  throttle(event, 'attendee-checkin:' + conference.id, 240, 60000)
  return transaction(async (db) => {
    const locked = await publishedConference(slug, db, true)
    if (locked.endedAt) fail(410, '活动已结束，现场签到已关闭')
    const checkpoint = await checkpointFor(locked.id, checkpointId, db, true)
    // Recheck time-dependent validity after acquiring the same checkpoint lock used by revocation.
    if (decoded) verifyCheckpoint(checkpoint, decodeQr(q, locked.id))
    else verifyDirectCheckpoint(checkpoint)
    return recordCheckin(db, checkpoint.id, session.registrationId, decoded?.source ?? 'direct')
  })
}

export default defineEventHandler(async (event) => {
  privateResponse(event)
  const action = getRouterParam(event, 'action')
  const slug = getRouterParam(event, 'slug') || ''
  const method = getMethod(event)
  if (method === 'POST') {
    sameOrigin(event)
    if (action === 'register') return register(event, slug)
    if (action === 'recover') return recover(event, slug)
    if (action === 'edit') return edit(event, slug)
    if (action === 'check-in') return checkin(event, slug, method)
  }
  if (method === 'GET') {
    if (action === 'details') return details(event, slug)
    if (action === 'check-in') return checkin(event, slug, method)
    if (action === 'record' || action === 'attachment') {
      const conference = await publishedConference(slug)
      const session = await attendeeSession(event, conference.id, action === 'attachment')
      if (action === 'attachment') return serveAttachment(event, session.registrationId, text(getQuery(event).id, 36, '附件'))
      return recordView(conference, await registrationFor(conference.id, session.registrationId), session.mode)
    }
  }
  fail(404, '操作不存在')
})
