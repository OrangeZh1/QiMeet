export default defineEventHandler(async (event) => {
  privateResponse(event)
  await assertAdmin(event)
  const { id, download } = getQuery(event)
  if (typeof id !== 'string') fail(404, '找不到该素材')
  return materialContent(event, id, false, download === '1')
})
