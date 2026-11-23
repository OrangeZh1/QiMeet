import type { PoolConnection } from 'mysql2/promise'
import type { AdminProfile } from '#shared/models'

type StoredProfile = Omit<AdminProfile, 'avatarUrl'> & { passwordHash: string }
async function readAdmin(db?: PoolConnection) {
  const profile = await first<StoredProfile>(
    'SELECT username,display_name AS displayName,avatar_material_id AS avatarMaterialId,password_hash AS passwordHash FROM admin_account WHERE id=1' + (db ? ' FOR UPDATE' : ''),
    [], db,
  )
  if (!profile) fail(401, '请先初始化管理员')
  return profile
}
function exposed({ username, displayName, avatarMaterialId }: StoredProfile): AdminProfile {
  return { username, displayName, avatarMaterialId, avatarUrl: avatarMaterialId ? '/api/manage/materials/content?id=' + avatarMaterialId : '' }
}
export async function adminProfile() { return exposed(await readAdmin()) }

async function revokeOtherSessions(event: RequestEvent, db: PoolConnection) {
  const token = getCookie(event, 'qm_admin')
  if (!token) fail(401, '请先登录管理后台')
  const found = await first<{ valid: number }>("SELECT 1 AS valid FROM sessions WHERE token_hash=? AND kind='admin' AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE", [hash(token)], db)
  if (!found) fail(401, '登录已过期，请重新登录')
  await mutate("DELETE FROM sessions WHERE kind='admin' AND token_hash<>?", [hash(token)], db)
}

export async function saveAdminProfile(event: RequestEvent, input: Record<string, unknown>) {
  const username = text(input.username, 64, '登录账号')
  const displayName = text(input.displayName, 60, '昵称')
  const avatarMaterialId = input.avatarMaterialId === null ? null : text(input.avatarMaterialId, 36, '头像素材')
  return transaction(async (db) => {
    const current = await readAdmin(db)
    if (current.username !== username) {
      if (!await verifyPassword(input.currentPassword, current.passwordHash)) fail(403, '当前密码有误')
      await revokeOtherSessions(event, db)
    }
    if (avatarMaterialId) await assertMaterial(avatarMaterialId, db)
    await mutate('UPDATE admin_account SET username=?,display_name=?,avatar_material_id=? WHERE id=1', [username, displayName, avatarMaterialId], db)
    return exposed({ ...current, username, displayName, avatarMaterialId })
  })
}

export async function saveAdminPassword(event: RequestEvent, input: Record<string, unknown>) {
  if (typeof input.newPassword !== 'string' || input.newPassword.length < 12 || input.newPassword.length > 200) fail(400, '新密码需要 12–200 个字符')
  if (input.newPassword === input.currentPassword) fail(400, '新密码须与当前密码不同')
  const newHash = await createPasswordHash(input.newPassword)
  await transaction(async (db) => {
    const current = await readAdmin(db)
    if (!await verifyPassword(input.currentPassword, current.passwordHash)) fail(403, '当前密码有误')
    await revokeOtherSessions(event, db)
    await mutate('UPDATE admin_account SET password_hash=? WHERE id=1', [newHash], db)
  })
  return { ok: true }
}
