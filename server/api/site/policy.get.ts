import { sitePolicyKinds } from '#shared/site-settings'

export default defineEventHandler((event) => {
  privateResponse(event)
  return readSitePolicy(oneOf(getQuery(event).kind, sitePolicyKinds, '说明类型'))
})
