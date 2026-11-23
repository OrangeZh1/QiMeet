import { brand } from './brand'

export const siteImageKinds = ['favicon', 'logo', 'login'] as const
export type SiteImageKind = typeof siteImageKinds[number]

export const sitePolicyKinds = ['privacy', 'terms'] as const
export type SitePolicyKind = typeof sitePolicyKinds[number]
export const homeBannerLimit = 8
export type HomeBanner = { id: string, url: string, title: string, subtitle: string }
export const filingSystemUrl = 'https://beian.miit.gov.cn/'

export type SitePublic = {
  title: string
  faviconUrl: string
  logoUrl: string
  loginImageUrl: string
  homeBanners: HomeBanner[]
  loginTagline: string
  loginCopyright: string
  filingNumber: string
  filingUrl: string
  hasPrivacyPolicy: boolean
  hasUserAgreement: boolean
}

export type SiteLoginSettings = {
  phoneLoginEnabled: boolean
  emailLoginEnabled: boolean
  wechatLoginEnabled: boolean
  wechatAppId: string
  wechatSecretConfigured: boolean
  wechatCallbackUrl: string
}

export type SiteSettings = SitePublic & SiteLoginSettings & {
  faviconMaterialId: string | null
  logoMaterialId: string | null
  loginImageMaterialId: string | null
  privacyPolicy: string
  userAgreement: string
}

export type SitePolicy = { title: string, source: string }

export const defaultSite: SitePublic = {
  title: brand.name,
  faviconUrl: '/brand/favicon.png',
  logoUrl: '/brand/mark.png',
  loginImageUrl: '/brand/venue-login.jpg',
  homeBanners: [
    { id: 'stage', url: '/brand/banner-stage.jpg', title: '让活动报名和签到更简单', subtitle: brand.team },
    { id: 'arrival', url: '/brand/banner-arrival.jpg', title: '扫码签到，快速入场', subtitle: brand.team },
    { id: 'ribbons', url: '/brand/banner-ribbons.jpg', title: '精彩活动，随时发现', subtitle: brand.team },
  ],
  loginTagline: '活动报名与签到',
  loginCopyright: '© ' + brand.team,
  filingNumber: '',
  filingUrl: filingSystemUrl,
  hasPrivacyPolicy: false,
  hasUserAgreement: false,
}
