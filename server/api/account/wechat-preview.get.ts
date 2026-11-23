import QRCode from 'qrcode'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) fail(404, '页面不存在')
  setResponseHeaders(event, { 'content-type': 'image/png', 'cache-control': 'no-store' })
  return QRCode.toBuffer('QiMeet 微信扫码登录预览', { width: 320, margin: 4, errorCorrectionLevel: 'M' })
})
