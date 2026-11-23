import { deleteMaterial } from '../../../utils/materials'

export default defineEventHandler(async (event) => {
  privateResponse(event)
  sameOrigin(event)
  await assertAdmin(event)
  const query = getQuery(event)
  const id = typeof query.id === 'string' ? query.id : ''
  return deleteMaterial(id)
})
