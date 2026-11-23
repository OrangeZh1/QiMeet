export default defineEventHandler(async (event) => {
  privateResponse(event)
  await assertAdmin(event)
  const kind = oneOf(getRouterParam(event, 'kind'), ['sms', 'email'], '配置类型')
  return readDeliverySettings(kind)
})
