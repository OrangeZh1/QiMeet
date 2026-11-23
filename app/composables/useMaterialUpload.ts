import type { Material } from '#shared/models'
import { materialPolicy, type MaterialKind } from '#shared/materials'

export async function uploadLibraryMaterial(file: File, kind: MaterialKind) {
  const policy = materialPolicy[kind]
  if (file.size > policy.maxMb * 1024 * 1024) throw new Error(policy.label + '不能超过 ' + policy.maxMb + ' MB')
  return $fetch<Material>('/api/manage/materials/upload', {
    method: 'POST',
    query: { name: file.name, kind },
    body: file,
    retry: 0,
  })
}

export function materialPreviewUrl(id: string) {
  return '/api/manage/materials/content?id=' + encodeURIComponent(id)
}
