import { siteImageKinds } from '#shared/site-settings'

export default defineEventHandler((event) => {
  privateResponse(event)
  return readSiteImage(event, oneOf(getQuery(event).kind, siteImageKinds, '站点图片类型'))
})
