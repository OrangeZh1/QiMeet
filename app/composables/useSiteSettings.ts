import { defaultSite, type SitePublic } from '#shared/site-settings'

export const siteDataKey = 'site-public'
export const fallbackSite = defaultSite


export function useSiteSettings() {
  return useNuxtData<SitePublic>(siteDataKey)
}

export function hasSiteLinks(site?: SitePublic | null) {
  return Boolean(site?.filingNumber?.trim() || site?.hasPrivacyPolicy || site?.hasUserAgreement)
}
