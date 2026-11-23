import type { RequestEvent } from './security'

export function imageNotModified(event: RequestEvent, tag: string, fresh: boolean, authenticated = false) {
  const etag = '"' + tag + '"'
  setResponseHeaders(event, { etag, 'cache-control': fresh ? 'private, max-age=300' : 'private, no-cache' })
  if (authenticated) appendResponseHeader(event, 'vary', 'Cookie')
  const matched = getHeader(event, 'if-none-match')?.split(',').some(tag => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag)
  if (matched) setResponseStatus(event, 304)
  return Boolean(matched)
}
