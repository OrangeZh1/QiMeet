import { fileTypeFromBuffer } from 'file-type'
import { materialPolicy, type MaterialKind } from '#shared/materials'

const megabyte = 1024 * 1024
export const uploadLimit = (kind: MaterialKind) => materialPolicy[kind].maxMb * megabyte
export const totalUploadsLimit = 20 * megabyte

export function cleanFilename(value: unknown) {
  const name = text(value, 180, '文件名').replace(/[/\\\u0000-\u001f\u007f]/g, '_')
  if (/^\.+$/.test(name)) fail(400, '文件名有误')
  return name
}

export async function verifyUpload(bytes: Buffer, kind: MaterialKind, filename: string) {
  const policy = materialPolicy[kind]
  if (!bytes.length || bytes.length > uploadLimit(kind)) fail(413, policy.label + '最大为 ' + policy.maxMb + ' MB')
  const type = await fileTypeFromBuffer(bytes).catch(() => undefined)
  if (!type || !policy.mime.includes(type.mime)) fail(415, '仅支持 ' + policy.formats + ' ' + policy.label)
  const extension = filename.split('.').at(-1)?.toLowerCase()
  if (extension !== type.ext && !(type.ext === 'jpg' && extension === 'jpeg')) fail(415, '文件扩展名与实际内容不符')
  return type.mime
}

export async function rawUpload(event: RequestEvent, max: number) {
  const req = event.node.req
  const length = Number(getHeader(event, 'content-length') || 0)
  if (length > max) fail(413, '文件超过大小限制')
  if (getHeader(event, 'content-encoding')) fail(415, '上传不支持压缩传输')
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += bytes.length
    if (total > max) {
      req.resume()
      fail(413, '文件超过大小限制')
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, total)
}
