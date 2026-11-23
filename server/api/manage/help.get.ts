export default defineEventHandler(async (event) => {
  privateResponse(event)
  await assertAdmin(event)
  return readHelpSettings()
})
