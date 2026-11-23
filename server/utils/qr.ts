import QRCode from 'qrcode'
import type { CheckInIssue, Checkpoint, Conference, QrDisplay } from '#shared/models'

type Mode = 'fixed' | 'dynamic'
type SignedCheckpoint = Checkpoint & { qrVersion: number }
export const canIssue = (checkpoint: Checkpoint, mode: Mode) => checkpoint.qrMode === 'both' || checkpoint.qrMode === mode

const qrImage = (url: string) => QRCode.toDataURL(url, {
  width: 480, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#163474', light: '#ffffff' },
})
const qrProblem = (status: number, message: string, checkInIssue: CheckInIssue): never =>
  fail(status, message, { checkInIssue })

export async function issueRegistrationQr(conference: Conference) {
  if (!conference.published) fail(409, '发布活动后即可生成报名二维码')
  const url = origin() + '/e/' + conference.slug + '/register'
  return { url, dataUrl: await qrImage(url) }
}

export async function issueQr(conference: Conference, checkpoint: SignedCheckpoint, mode: Mode): Promise<QrDisplay> {
  if (!conference.published) fail(409, '发布活动后即可生成签到码')
  if (conference.endedAt) fail(409, '活动已经结束')
  if (!canIssue(checkpoint, mode)) fail(409, '该环节未启用此类二维码')
  const expires = mode === 'dynamic' ? Math.floor(Date.now() / 1000) + 90 : 0
  const body = ['1', conference.id, checkpoint.id, checkpoint.qrVersion, mode === 'fixed' ? 'f' : 'd', expires].join('.')
  const url = origin() + '/e/' + conference.slug + '/check-in?q=' + body + '.' + sign(body)
  const dataUrl = await qrImage(url)
  return { url, dataUrl, expiresAt: expires ? new Date(expires * 1000).toISOString() : null }
}

export function decodeQr(raw: unknown, eventId: number) {
  const token = text(raw, 150, '签到码')
  const pieces = token.split('.')
  if (pieces.length !== 7) fail(400, '签到码无效')
  const [format, eid, point, version, mode, expires, signature] = pieces
  if (format !== '1' || eid !== String(eventId) || !/^[1-9]\d{0,9}$/.test(point!) ||
    !/^[1-9]\d{0,9}$/.test(version!) || !['f', 'd'].includes(mode!) ||
    !/^\d{1,12}$/.test(expires!) || !safeEqual(sign(pieces.slice(0, 6).join('.')), signature!)) fail(400, '签到码无效')
  const source = mode === 'f' ? 'fixed' : 'dynamic'
  if (source === 'dynamic' && Number(expires) <= Math.floor(Date.now() / 1000)) {
    qrProblem(410, '请重新扫描现场的动态签到码。', { reason: 'expired' })
  }
  return { checkpointId: Number(point), version: Number(version), source: source as Mode }
}
export function verifyCheckpoint(checkpoint: SignedCheckpoint, decoded: ReturnType<typeof decodeQr>) {
  if (checkpoint.qrVersion !== decoded.version || !canIssue(checkpoint, decoded.source)) {
    qrProblem(410, '请向现场工作人员获取新的签到码。', { reason: 'revoked' })
  }
  verifyCheckinWindow(checkpoint)
}

export function verifyDirectCheckpoint(checkpoint: Checkpoint) {
  if (!checkpoint.directEnabled) fail(409, '该环节未开放手机签到，请扫描现场二维码。')
  verifyCheckinWindow(checkpoint)
}

function verifyCheckinWindow(checkpoint: Checkpoint) {
  const { title, startsAt, endsAt } = checkpoint
  const now = Date.now()
  if (now < Date.parse(startsAt)) {
    qrProblem(409, '请在本环节开放后签到。', { reason: 'waiting', checkpoint: { title, startsAt, endsAt } })
  }
  if (now >= Date.parse(endsAt)) {
    qrProblem(409, '如需补签，请联系现场工作人员。', { reason: 'closed', checkpoint: { title, startsAt, endsAt } })
  }
}
