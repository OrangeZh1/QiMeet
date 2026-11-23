export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  })
  const path = getRequestURL(event).pathname
  if (path.startsWith('/e/') || path.startsWith('/admin') || path.startsWith('/display/') ||
    path === '/mine' || path.startsWith('/mine/') || path === '/login') {
    setResponseHeaders(event, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' })
  }
})
