import type { AdminProfile } from '#shared/models'
export default defineNuxtRouteMiddleware(async () => {
  const account = useState<AdminProfile | null>('qm-admin-profile', () => null)
  try {
    account.value = await useRequestFetch()<AdminProfile>('/api/manage/session')
  } catch (error) {
    account.value = null
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401) return navigateTo('/admin/login')
    throw createError({ statusCode: status || 503, message: '暂时无法连接管理后台' })
  }
})
