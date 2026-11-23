export default defineEventHandler(event => materialContent(event, getRouterParam(event, 'id') || '', true))
