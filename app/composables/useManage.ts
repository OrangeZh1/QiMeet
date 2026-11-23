export function errorText(error: unknown, fallback = '操作失败，请稍后重试') {
  const request = error as { data?: { data?: { message?: string }, message?: string } }
  return request?.data?.data?.message || request?.data?.message || fallback
}

export function manageRequest<T>(action: string, options: {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number | undefined>
  body?: Record<string, unknown>
} = {}) {
  return $fetch<T>('/api/manage/' + action, options)
}

export async function copyText(text: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text)
  const previous = document.activeElement
  const input = document.createElement('textarea')
  input.value = text
  input.readOnly = true
  input.style.cssText = 'position:fixed;inset:0 auto auto 0;opacity:0;pointer-events:none'
  document.body.append(input)
  try {
    input.select()
    input.setSelectionRange(0, text.length)
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
  } finally {
    input.remove()
    if (previous instanceof HTMLElement) previous.focus({ preventScroll: true })
  }
}
