export default defineEventHandler(async (event) => {
  privateResponse(event)
  sameOrigin(event)
  await assertAdmin(event)
  return saveSiteSettings(await jsonBody(event))
})
