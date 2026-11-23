export default defineEventHandler((event) => {
  privateResponse(event)
  return publicHelp()
})
