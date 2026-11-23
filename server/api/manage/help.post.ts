export default defineEventHandler(async (event) => {
  privateResponse(event)
  sameOrigin(event)
  await assertAdmin(event)
  return saveHelpSettings(await jsonBody(event))
})
