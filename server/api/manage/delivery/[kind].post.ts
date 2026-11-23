export default defineEventHandler(async (event) => {
  privateResponse(event)
  sameOrigin(event)
  await assertAdmin(event)
  const kind = oneOf(getRouterParam(event, 'kind'), ['sms', 'email'], '配置类型')
  return saveDeliverySettings(kind, await jsonBody(event))
})
