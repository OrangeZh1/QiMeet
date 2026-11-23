<script setup lang="ts">
import ConsoleInput from '#qiandao-console/ConsoleInput.vue'
import ConsoleSettingsField from '~/components/console/ConsoleSettingsField.vue'
import ActivityMarkdownEditor from '~/components/ActivityMarkdownEditor.vue'
import { homeBannerLimit, type SiteSettings } from '#shared/site-settings'
import type { Conference } from '#shared/models'
import { siteSettingsPath, siteSettingsSections } from '~/utils/siteSettingsSections'

definePageMeta({
  layout: 'admin',
  key: route => route.path,
  middleware: ['admin', (to) => {
    const section = to.params.section
    if (section === 'login' || section === 'filing') {
      return navigateTo({ path: siteSettingsPath + '/brand', hash: section === 'login' ? '#site-login' : '#site-filing' },
        { redirectCode: 302, replace: true })
    }
    if (section === 'privacy' || section === 'terms') {
      return navigateTo({ path: siteSettingsPath + '/policies', hash: '#site-' + section }, { redirectCode: 302, replace: true })
    }
  }],
})
const sectionId = useRoute().params.section
const section = siteSettingsSections.find(item => item.id === sectionId)
if (!section) throw createError({ statusCode: 404, message: '找不到该站点设置' })
const fields = section.fields
useSeoMeta({ title: section.label + ' · 站点设置' })

const { data, error } = await useFetch<SiteSettings>('/api/manage/site-settings', { key: 'site-settings:' + section.id, cache: 'no-store' })
if (!data.value) throw createError({ statusCode: attendeeErrorStatus(error.value) || 503, message: errorText(error.value, '暂时无法读取站点设置') })

const saved = ref(data.value)
const wechatCallbackDomain = computed(() => new URL(saved.value.wechatCallbackUrl).hostname)
function formValues(site: SiteSettings) {
  return {
    title: site.title, loginTagline: site.loginTagline, loginCopyright: site.loginCopyright,
    faviconMaterialId: site.faviconMaterialId, logoMaterialId: site.logoMaterialId, loginImageMaterialId: site.loginImageMaterialId,
    filingNumber: site.filingNumber,
    privacyPolicy: site.privacyPolicy, userAgreement: site.userAgreement,
    phoneLoginEnabled: site.phoneLoginEnabled, emailLoginEnabled: site.emailLoginEnabled, wechatLoginEnabled: site.wechatLoginEnabled,
    wechatAppId: site.wechatAppId, wechatAppSecret: '',
  }
}
const input = reactive(formValues(saved.value))
const banners = ref(saved.value.homeBanners.map(image => ({ ...image })))
function chooseBanners(images: Conference['coverImages']) {
  const previous = new Map(banners.value.map(image => [image.id, image]))
  banners.value = images.map(image => previous.get(image.id) ?? { ...image, title: '', subtitle: '' })
}
const imageFields = [
  { name: '浏览器图标', id: 'faviconMaterialId', url: 'faviconUrl' },
  { name: '站点 Logo', id: 'logoMaterialId', url: 'logoUrl' },
] as const
const pickerBusy = reactive({ faviconMaterialId: false, logoMaterialId: false, loginImageMaterialId: false, homeBanners: false })
function brandImagePreview(field: typeof imageFields[number]) {
  if (input[field.id] !== saved.value[field.id]) return undefined
  if (field.id === 'faviconMaterialId' && !saved.value.faviconMaterialId) return fallbackSite.logoUrl
  return saved.value[field.url]
}
const uploading = computed(() => Object.values(pickerBusy).some(Boolean))
const saving = ref(false)
const feedback = ref('')
const failure = ref('')

async function save() {
  if (saving.value || uploading.value) return
  saving.value = true
  feedback.value = failure.value = ''
  try {
    const previous = formValues(saved.value)
    const body = Object.fromEntries(fields.filter(field => input[field] !== previous[field]).map(field => [field, input[field]]))
    if (section.id === 'brand') {
      const values = banners.value.map(({ id, title, subtitle }) => ({ id, title, subtitle }))
      const previousValues = saved.value.homeBanners.map(({ id, title, subtitle }) => ({ id, title, subtitle }))
      if (JSON.stringify(values) !== JSON.stringify(previousValues)) Object.assign(body, { homeBanners: values })
    }
    saved.value = await manageRequest<SiteSettings>('site-settings', { method: 'POST', body })
    banners.value = saved.value.homeBanners.map(image => ({ ...image }))
    Object.assign(input, formValues(saved.value))
    feedback.value = '站点设置已保存'
    void refreshNuxtData(siteDataKey)
  } catch (cause) {
    failure.value = errorText(cause, '保存站点设置失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="panel site-settings-form" aria-labelledby="site-settings-heading" @submit.prevent="save">
      <header class="panel-toolbar">
        <h1 id="site-settings-heading" class="page-title">{{ section.label }}</h1>
      </header>
      <template v-if="section.id === 'brand'">
        <section class="settings-section form-stack" aria-labelledby="site-info-heading">
          <h2 id="site-info-heading" class="section-title">站点信息</h2>
          <ConsoleSettingsField label="站点名称" input-id="settings-site-name">
            <ConsoleInput id="settings-site-name" v-model="input.title" variant="none" maxlength="120" required :readonly="saving" />
          </ConsoleSettingsField>
          <ConsoleSettingsField label="站点标识">
            <div class="site-images">
              <MaterialPicker v-for="field in imageFields" :key="field.id" v-model="input[field.id]"
                :current-url="brandImagePreview(field)"
                :label="field.name" shape="square" fit="contain" :disabled="saving" @busy="pickerBusy[field.id] = $event" />
            </div>
          </ConsoleSettingsField>
          <ConsoleSettingsField id="site-login" label="客户端登录标语" input-id="settings-login-tagline">
            <ConsoleInput id="settings-login-tagline" v-model="input.loginTagline" variant="none" maxlength="80" :readonly="saving" />
          </ConsoleSettingsField>
          <ConsoleSettingsField label="登录封面">
            <MaterialPicker v-model="input.loginImageMaterialId"
              :current-url="input.loginImageMaterialId === saved.loginImageMaterialId ? saved.loginImageUrl : undefined"
              label="登录封面" hide-label :disabled="saving" @busy="pickerBusy.loginImageMaterialId = $event" />
          </ConsoleSettingsField>
        </section>
        <section class="settings-section form-stack" aria-labelledby="site-banner-heading">
          <h2 id="site-banner-heading" class="section-title">活动首页</h2>
          <ConsoleSettingsField label="轮播图片">
            <EventCoverGallery :model-value="banners" label="Banner 图片" :limit="homeBannerLimit" wide :disabled="saving"
              help="从素材库选择图片，建议比例为 3:1。按列表顺序轮播，清空后使用默认图片。"
              @update:model-value="chooseBanners" @busy="pickerBusy.homeBanners = $event">
              <template #image-fields="{ index }">
                <div v-if="banners[index]" class="banner-text-fields" role="group" :aria-label="'第 ' + (index + 1) + ' 张 Banner 文案'">
                  <label :for="'settings-banner-title-' + banners[index].id">主标题</label>
                  <ConsoleInput :id="'settings-banner-title-' + banners[index].id" v-model="banners[index].title"
                    variant="none" maxlength="80" :readonly="saving" />
                  <label :for="'settings-banner-subtitle-' + banners[index].id">副标题</label>
                  <ConsoleInput :id="'settings-banner-subtitle-' + banners[index].id" v-model="banners[index].subtitle"
                    variant="none" maxlength="80" :readonly="saving" />
                </div>
              </template>
            </EventCoverGallery>
          </ConsoleSettingsField>
        </section>
        <section id="site-filing" class="settings-section form-stack" aria-labelledby="site-filing-heading">
          <h2 id="site-filing-heading" class="section-title">版权与备案</h2>
          <ConsoleSettingsField label="默认版权" input-id="settings-login-copyright">
            <ConsoleInput id="settings-login-copyright" v-model="input.loginCopyright" variant="none" maxlength="240" :readonly="saving" />
          </ConsoleSettingsField>
          <ConsoleSettingsField label="备案号" input-id="settings-filing-number">
            <ConsoleInput id="settings-filing-number" v-model="input.filingNumber" variant="none" maxlength="120" :readonly="saving" />
          </ConsoleSettingsField>
        </section>
        <section class="settings-section form-stack" aria-labelledby="site-user-login">
          <h2 id="site-user-login" class="section-title">用户登录</h2>
          <ConsoleSettingsField label="登录与注册">
            <div class="grid gap-3 pt-2">
              <UCheckbox v-model="input.phoneLoginEnabled" label="开放手机号登录与注册" :disabled="saving" />
              <UCheckbox v-model="input.emailLoginEnabled" label="开放邮箱登录与注册" :disabled="saving" />
            </div>
          </ConsoleSettingsField>
        </section>
        <section class="settings-section form-stack" aria-labelledby="site-wechat">
          <h2 id="site-wechat" class="section-title">微信开放平台</h2>
          <ConsoleSettingsField label="扫码登录">
            <UCheckbox v-model="input.wechatLoginEnabled" label="启用微信扫码登录" class="pt-2" :disabled="saving" />
          </ConsoleSettingsField>
          <ConsoleSettingsField label="AppID" input-id="settings-wechat-app-id">
            <ConsoleInput id="settings-wechat-app-id" v-model="input.wechatAppId" variant="none" maxlength="64" autocomplete="off" :readonly="saving" />
          </ConsoleSettingsField>
          <ConsoleSettingsField label="AppSecret" input-id="settings-wechat-app-secret">
            <ConsoleInput id="settings-wechat-app-secret" v-model="input.wechatAppSecret" variant="none" type="password"
              maxlength="128" autocomplete="off" :readonly="saving"
              :placeholder="saved.wechatSecretConfigured && input.wechatAppId === saved.wechatAppId ? '已配置，留空保留' : '填写网站应用的 AppSecret'" />
          </ConsoleSettingsField>
          <ConsoleSettingsField label="授权回调域" input-id="settings-wechat-callback">
            <ConsoleInput id="settings-wechat-callback" :model-value="wechatCallbackDomain" variant="none" readonly />
            <p class="mt-2 text-xs text-muted">将此域名填写到微信开放平台的「授权回调域」。</p>
          </ConsoleSettingsField>
        </section>
      </template>
      <template v-else>
        <section id="site-terms" class="settings-section form-stack" aria-label="用户协议">
          <ActivityMarkdownEditor v-model="input.userAgreement" label="用户协议" placeholder="输入用户协议内容" :maxlength="30000"
            :allow-material-video="false" :disabled="saving" />
        </section>
        <section id="site-privacy" class="settings-section form-stack" aria-label="隐私政策">
          <ActivityMarkdownEditor v-model="input.privacyPolicy" label="隐私政策" placeholder="输入隐私政策内容" :maxlength="30000"
            :allow-material-video="false" :disabled="saving" />
        </section>
      </template>
      <footer class="panel-toolbar settings-actions">
        <p v-if="failure || feedback" class="feedback" :class="{ error: !!failure }" :role="failure ? 'alert' : 'status'">{{ failure || feedback }}</p>
        <UButton type="submit" icon="i-lucide-save" :loading="saving" :disabled="uploading">保存设置</UButton>
      </footer>
  </form>
</template>

<style scoped>
.site-settings-form { --settings-label-width: 8rem; --settings-content-width: 24rem; }
.site-settings-form :deep(.qisvc-console-settings-field) { width: min(100%, 33.5rem); }
.site-images { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.banner-text-fields { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 6px 8px; }
.banner-text-fields > label { color: var(--ui-text-muted); font-size: 12px; font-weight: 500; white-space: nowrap; }
#site-login, #site-filing, #site-terms, #site-privacy { scroll-margin-top: 70px; }
</style>
