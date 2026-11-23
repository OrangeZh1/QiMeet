export const siteSettingsPath = '/admin/site-settings'

export const siteSettingsSections = [
  {
    id: 'brand', label: '基本设置', icon: 'i-lucide-globe',
    fields: [
      'title', 'faviconMaterialId', 'logoMaterialId', 'loginTagline', 'loginImageMaterialId', 'loginCopyright', 'filingNumber',
      'phoneLoginEnabled', 'emailLoginEnabled', 'wechatLoginEnabled', 'wechatAppId', 'wechatAppSecret',
    ],
  },
  { id: 'sms', label: '短信配置', icon: 'i-lucide-message-square', fields: [] },
  { id: 'email', label: '邮箱配置', icon: 'i-lucide-mail', fields: [] },
  { id: 'policies', label: '协议管理', icon: 'i-lucide-file-text', fields: ['userAgreement', 'privacyPolicy'] },
] as const
