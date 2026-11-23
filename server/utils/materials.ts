import { createHash, randomUUID } from 'node:crypto'
import type { PoolConnection } from 'mysql2/promise'
import type { Material } from '#shared/models'
import { materialKinds, type MaterialKind } from '#shared/materials'

const columns = 'm.id,m.name,m.kind,m.mime,m.byte_count AS byteCount,m.created_at AS createdAt'
const toMaterial = (row: Omit<Material, 'url'>): Material => ({
  ...row, createdAt: iso(row.createdAt), url: '/api/manage/materials/content?id=' + row.id,
})
const queryKind = (value: unknown) => value === undefined ? 'image' : oneOf(value, materialKinds, '素材类型')

export async function assertMaterial(id: string, db?: PoolConnection) {
  if (!uuidPattern.test(id) || !await first("SELECT id FROM materials WHERE id=? AND kind='image'", [id], db)) {
    fail(404, '找不到该图片素材')
  }
}

export async function listMaterials(query: Record<string, unknown>) {
  const kind = queryKind(query.kind)
  const term = text(query.q, 180, '素材名称', false)
  const page = query.page === undefined ? 1 : positive(query.page)
  const args = term ? [kind, term] : [kind]
  const where = ' WHERE m.kind=?' + (term ? ' AND LOCATE(?,m.name)>0' : '')
  const [items, count] = await Promise.all([
    rows<Omit<Material, 'url'>>('SELECT ' + columns + ' FROM materials m' + where + ' ORDER BY m.created_at DESC,m.id DESC LIMIT 12 OFFSET ?', [...args, (page - 1) * 12]),
    first<{ total: number }>('SELECT COUNT(*) AS total FROM materials m' + where, args),
  ])
  return { items: items.map(toMaterial), total: count!.total, page }
}

export async function uploadMaterial(event: RequestEvent, query: Record<string, unknown>) {
  const kind = queryKind(query.kind)
  const filename = cleanFilename(query.name)
  const bytes = await rawUpload(event, uploadLimit(kind))
  const mime = await verifyUpload(bytes, kind, filename)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const id = randomUUID()
  await mutate('INSERT INTO materials (id,name,kind,mime,digest,byte_count,payload) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id',
    [id, filename, kind, mime, digest, bytes.length, bytes])
  return toMaterial((await first<Omit<Material, 'url'>>('SELECT ' + columns + ' FROM materials m WHERE m.digest=?', [digest]))!)
}

export async function deleteMaterial(id: string) {
  if (!uuidPattern.test(id)) fail(404, '找不到该素材')
  await transaction(async (db) => {
    if (!await first('SELECT id FROM materials WHERE id=? FOR UPDATE', [id], db)) fail(404, '找不到该素材')
    const used = await first<{ cover: number, avatar: number, video: number, site: number }>(
      'SELECT (EXISTS (SELECT 1 FROM events WHERE cover_material_id=?) OR EXISTS (SELECT 1 FROM event_covers WHERE material_id=?)) AS cover, ' +
      'EXISTS (SELECT 1 FROM admin_account WHERE avatar_material_id=?) AS avatar, ' +
      'EXISTS (SELECT 1 FROM event_videos WHERE material_id=?) AS video, ' +
      '(EXISTS (SELECT 1 FROM site_settings WHERE ? IN (favicon_material_id,logo_material_id,login_image_material_id)) ' +
      'OR EXISTS (SELECT 1 FROM site_home_banners WHERE material_id=?)) AS site',
      [id, id, id, id, id, id], db,
    )
    if (used?.cover) fail(409, '该图片已用作活动封面（含回收站中的活动），请先解除引用。')
    if (used?.avatar) fail(409, '该图片已用作管理员头像，请先更换头像。')
    if (used?.video) fail(409, '该视频已用于活动介绍（含回收站中的活动），请先解除引用。')
    if (used?.site) fail(409, '该图片已用作站点素材，请先在站点设置中更换。')
    try {
      await mutate('DELETE FROM materials WHERE id=?', [id], db)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ER_ROW_IS_REFERENCED_2') {
        fail(409, '该素材正在使用中，请先解除引用。')
      }
      throw error
    }
  })
  return { ok: true }
}

function filenameDisposition(mode: 'inline' | 'attachment', filename: string) {
  const encoded = encodeURIComponent(filename.toWellFormed()).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16))
  return mode + "; filename*=UTF-8''" + encoded
}

function videoRange(value: string, length: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value)
  if (!match || (!match[1] && !match[2])) return
  // With no starting offset the second number specifies bytes from the end.
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(length - 1, Number(match[2])) : length - 1
  if (!Number.isSafeInteger(start) || start > end || !Number.isSafeInteger(end)) return
  return { start, end }
}

export async function materialContent(event: RequestEvent, id: string, publishedOnly: boolean, download = false) {
  if (!uuidPattern.test(id)) fail(404, '找不到该素材')
  const material = await first<{ name: string, kind: MaterialKind, mime: string, payload: Buffer }>(
    'SELECT m.name,m.kind,m.mime,m.payload FROM materials m WHERE m.id=?' +
    (publishedOnly
      ? " AND ((m.kind='image' AND (EXISTS (SELECT 1 FROM events e WHERE e.cover_material_id=m.id AND e.published=1 AND e.deleted_at IS NULL)" +
        ' OR EXISTS (SELECT 1 FROM event_covers c JOIN events e ON e.id=c.event_id WHERE c.material_id=m.id AND e.published=1 AND e.deleted_at IS NULL)' +
        ' OR EXISTS (SELECT 1 FROM site_home_banners WHERE material_id=m.id)))' +
        " OR (m.kind='video' AND EXISTS (SELECT 1 FROM event_videos v JOIN events e ON e.id=v.event_id WHERE v.material_id=m.id AND e.published=1 AND e.deleted_at IS NULL)))"
      : ''),
    [id],
  )
  if (!material) fail(404, '找不到该素材')
  const attachment = download || material.kind === 'file'
  setResponseHeaders(event, {
    'content-type': material.mime, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; sandbox",
    'content-disposition': filenameDisposition(attachment ? 'attachment' : 'inline', material.name),
  })
  if (!attachment && material.kind === 'video') {
    const length = material.payload.length
    setResponseHeader(event, 'accept-ranges', 'bytes')
    const header = getHeader(event, 'range')
    if (header) {
      const selected = videoRange(header, length)
      if (!selected) {
        setResponseStatus(event, 416)
        setResponseHeader(event, 'content-range', 'bytes */' + length)
        return Buffer.alloc(0)
      }
      setResponseStatus(event, 206)
      setResponseHeader(event, 'content-range', 'bytes ' + selected.start + '-' + selected.end + '/' + length)
      return material.payload.subarray(selected.start, selected.end + 1)
    }
  }
  return material.payload
}
