import type { PoolConnection } from 'mysql2/promise'
import { defaultSite, homeBannerLimit, type HomeBanner, type SiteImageKind, type SiteLoginSettings, type SitePolicy, type SitePolicyKind, type SitePublic, type SiteSettings } from '#shared/site-settings'

type BannerDraft = Omit<HomeBanner, 'url'>
type SiteRow = Omit<SiteSettings, keyof SiteLoginSettings | 'faviconUrl' | 'logoUrl' | 'loginImageUrl' | 'filingUrl' | 'homeBanners' | 'hasPrivacyPolicy' | 'hasUserAgreement'>
  & { bannerEntries: Record<string, BannerDraft> | null }
const brandingColumns = 'title,favicon_material_id AS faviconMaterialId,logo_material_id AS logoMaterialId,' +
  'login_image_material_id AS loginImageMaterialId,' +
  "(SELECT JSON_OBJECTAGG(position, JSON_OBJECT('id', COALESCE(material_id,preset), 'title', title, 'subtitle', subtitle)) FROM site_home_banners) AS bannerEntries," +
  'login_tagline AS loginTagline,login_copyright AS loginCopyright,filing_number AS filingNumber'
const imageColumns: Record<SiteImageKind, string> = {
  favicon: 'favicon_material_id', logo: 'logo_material_id', login: 'login_image_material_id',
}
const policyColumns = {
  privacy: { column: 'privacy_policy', title: '隐私政策' },
  terms: { column: 'user_agreement', title: '用户协议' },
} as const

async function siteRow(db?: PoolConnection) {
  const row = await first<SiteRow>('SELECT ' + brandingColumns +
    ',privacy_policy AS privacyPolicy,user_agreement AS userAgreement FROM site_settings WHERE id=1' +
    (db ? ' FOR UPDATE' : ''), [], db)
  if (!row) fail(503, '站点设置尚未初始化')
  return row
}

function imageUrl(kind: SiteImageKind, id: string | null, fallback: string) {
  return id ? '/api/site/image?kind=' + kind + '&v=' + id : fallback
}

function bannerImages(value: SiteRow['bannerEntries']) {
  return value ? Object.values(value).map(image => ({
    ...image, url: defaultSite.homeBanners.find(preset => preset.id === image.id)?.url || '/api/materials/' + image.id,
  })) : defaultSite.homeBanners
}

function publicSite(row: SiteRow): SitePublic {
  return {
    title: row.title || defaultSite.title,
    faviconUrl: imageUrl('favicon', row.faviconMaterialId, defaultSite.faviconUrl),
    logoUrl: imageUrl('logo', row.logoMaterialId, defaultSite.logoUrl),
    loginImageUrl: imageUrl('login', row.loginImageMaterialId, defaultSite.loginImageUrl),
    homeBanners: bannerImages(row.bannerEntries),
    loginTagline: row.loginTagline,
    loginCopyright: row.loginCopyright,
    filingNumber: row.filingNumber,
    filingUrl: defaultSite.filingUrl,
    hasPrivacyPolicy: Boolean(row.privacyPolicy.trim()),
    hasUserAgreement: Boolean(row.userAgreement.trim()),
  }
}

function adminSite(row: SiteRow, login: SiteLoginSettings): SiteSettings {
  return {
    ...publicSite(row),
    ...login,
    faviconMaterialId: row.faviconMaterialId,
    logoMaterialId: row.logoMaterialId,
    loginImageMaterialId: row.loginImageMaterialId,
    privacyPolicy: row.privacyPolicy,
    userAgreement: row.userAgreement,
  }
}

export async function readPublicSite(): Promise<SitePublic> {
  const row = await first<SiteRow>(
    'SELECT ' + brandingColumns +
    ",IF(privacy_policy='', '', '1') AS privacyPolicy,IF(user_agreement='', '', '1') AS userAgreement " +
    'FROM site_settings WHERE id=1',
  )
  return row ? publicSite(row) : defaultSite
}

export async function readSiteSettings() {
  const [site, login] = await Promise.all([siteRow(), clientLoginRow()])
  return adminSite(site, clientLoginView(login))
}

function materialSetting(value: unknown, current: string | null, label: string) {
  if (value === undefined) return current
  return text(value, 36, label, false).toLowerCase() || null
}

export async function saveSiteSettings(input: Record<string, unknown>) {
  return transaction(async (db) => {
    const current = await siteRow(db)
    let bannerEntries = current.bannerEntries
    if (input.homeBanners !== undefined) {
      if (!Array.isArray(input.homeBanners) || input.homeBanners.length > homeBannerLimit) {
        fail(400, '活动首页 Banner 最多可选择 ' + homeBannerLimit + ' 张图片')
      }
      const selected: BannerDraft[] = input.homeBanners.map((item) => {
        if (!item || typeof item !== 'object') fail(400, '活动首页 Banner 格式有误')
        return {
          id: text(item.id, 36, '活动首页 Banner 素材').toLowerCase(),
          title: text(item.title, 80, 'Banner 主标题', false),
          subtitle: text(item.subtitle, 80, 'Banner 副标题', false),
        }
      })
      if (new Set(selected.map(item => item.id)).size !== selected.length) fail(400, '活动首页 Banner 图片不能重复')
      bannerEntries = selected.length ? Object.fromEntries(selected.entries()) : null
    }
    const next: SiteRow = {
      title: input.title === undefined ? current.title : text(input.title, 120, '站点标题', false) || defaultSite.title,
      faviconMaterialId: materialSetting(input.faviconMaterialId, current.faviconMaterialId, '浏览器图标素材'),
      logoMaterialId: materialSetting(input.logoMaterialId, current.logoMaterialId, '站点标识素材'),
      loginImageMaterialId: materialSetting(input.loginImageMaterialId, current.loginImageMaterialId, '登录插画素材'),
      bannerEntries,
      loginTagline: input.loginTagline === undefined ? current.loginTagline : text(input.loginTagline, 80, '客户端登录标语', false),
      loginCopyright: input.loginCopyright === undefined ? current.loginCopyright : text(input.loginCopyright, 240, '登录页版权', false),
      filingNumber: input.filingNumber === undefined ? current.filingNumber : text(input.filingNumber, 120, '备案号', false),
      privacyPolicy: input.privacyPolicy === undefined ? current.privacyPolicy : text(input.privacyPolicy, 30000, '隐私政策', false),
      userAgreement: input.userAgreement === undefined ? current.userAgreement : text(input.userAgreement, 30000, '用户协议', false),
    }
    const banners = bannerEntries ? Object.values(bannerEntries) : []
    const presets = new Set<string>(defaultSite.homeBanners.map(image => image.id))
    const images = new Set([next.faviconMaterialId, next.logoMaterialId, next.loginImageMaterialId,
      ...banners.filter(image => !presets.has(image.id)).map(image => image.id)])
    for (const id of images) if (id) await assertMaterial(id, db)

    try {
      await mutate(
        'UPDATE site_settings SET title=?,favicon_material_id=?,logo_material_id=?,login_image_material_id=?,' +
        'login_tagline=?,login_copyright=?,filing_number=?,privacy_policy=?,user_agreement=? WHERE id=1',
        [next.title, next.faviconMaterialId, next.logoMaterialId, next.loginImageMaterialId,
          next.loginTagline, next.loginCopyright, next.filingNumber, next.privacyPolicy, next.userAgreement],
        db,
      )
      if (input.homeBanners !== undefined) {
        await mutate('DELETE FROM site_home_banners', [], db)
        for (const [position, image] of banners.entries()) {
          const preset = presets.has(image.id)
          await mutate('INSERT INTO site_home_banners (position,material_id,preset,title,subtitle) VALUES (?,?,?,?,?)',
            [position, preset ? null : image.id, preset ? image.id : null, image.title, image.subtitle], db)
        }
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ER_NO_REFERENCED_ROW_2') {
        fail(409, '已选图片素材发生变化，请重新选择')
      }
      throw error
    }
    await saveClientLoginSettings(input, db)
    return adminSite(next, clientLoginView(await clientLoginRow(db)))
  })
}

export async function readSitePolicy(kind: SitePolicyKind): Promise<SitePolicy> {
  const policy = policyColumns[kind]
  const entry = await first<{ source: string }>('SELECT ' + policy.column + ' AS source FROM site_settings WHERE id=1')
  if (!entry?.source.trim()) fail(404, '找不到该说明')
  return { title: policy.title, source: entry.source }
}

export async function readSiteImage(event: RequestEvent, kind: SiteImageKind) {
  const material = await first<{ mime: string, payload: Buffer }>(
    'SELECT m.mime,m.payload FROM site_settings s JOIN materials m ON m.id=s.' + imageColumns[kind] +
    " WHERE s.id=1 AND m.kind='image'",
  )
  if (!material) fail(404, '找不到该站点图片')
  setResponseHeaders(event, {
    'content-type': material.mime,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  })
  return material.payload
}
