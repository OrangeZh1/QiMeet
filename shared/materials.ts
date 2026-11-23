export const materialKinds = ['image', 'file', 'video'] as const
export type MaterialKind = typeof materialKinds[number]

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
