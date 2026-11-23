import sharp from 'sharp'
import { materialPreviewSizes, type MaterialPreview } from '#shared/materials'

const pending = new Map<string, Promise<Buffer | undefined>>()

export async function imageMaterialPreview(id: string, preview: MaterialPreview, picture: Buffer) {
  const key = id + ':' + preview
  const existing = pending.get(key)
  if (existing) return existing
  const job = (async () => {
    const size = materialPreviewSizes[preview]
    let payload: Buffer
    try {
      const image = sharp(picture, { limitInputPixels: 20_000_000, autoOrient: true })
      if (preview === 'display' && ((await image.metadata()).pages ?? 1) > 1) return undefined
      payload = await image.resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    } catch {
      return undefined
    }
    try {
      await mutate('INSERT IGNORE INTO material_image_previews (material_id,variant,payload) VALUES (?,?,?)', [id, preview, payload])
    } catch {
      // An image can be deleted while its preview is being generated.
    }
    return payload
  })()
  pending.set(key, job)
  try {
    return await job
  } finally {
    pending.delete(key)
  }
}
