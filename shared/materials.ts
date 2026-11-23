export const materialKinds = ['image', 'file', 'video'] as const
export type MaterialKind = typeof materialKinds[number]

export const materialPreviewSizes = { thumb: 320, card: 768, display: 1440 } as const
export type MaterialPreview = keyof typeof materialPreviewSizes

export function materialImagePreviewUrl(url: string, preview: MaterialPreview = 'thumb') {
  if (!/^\/api\/(?:materials\/[a-f0-9-]+|manage\/materials\/content\?id=[a-f0-9-]+)$/i.test(url)) return url
  return url + (url.includes('?') ? '&' : '?') + 'preview=' + preview
}

export const materialPolicy = {
  image: {
    label: '图片', formats: 'JPG、PNG、WebP', accept: '.jpg,.jpeg,.png,.webp', maxMb: 5,
    mime: ['image/jpeg', 'image/png', 'image/webp'],
  },
  file: {
    label: '文件', formats: 'PDF、DOCX、XLSX', accept: '.pdf,.docx,.xlsx', maxMb: 10,
    mime: [
      'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  video: {
    label: '视频', formats: 'MP4、WebM', accept: '.mp4,.webm', maxMb: 20,
    mime: ['video/mp4', 'video/webm'],
  },
} satisfies Record<MaterialKind, { label: string, formats: string, accept: string, maxMb: number, mime: string[] }>
