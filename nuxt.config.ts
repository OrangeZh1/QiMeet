import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const usePrivateConsole = process.env.QI_PRIVATE_UI === '1'
const root = fileURLToPath(new URL('.', import.meta.url))
const consoleCss = usePrivateConsole
  ? createRequire(import.meta.url).resolve('@orangezh1/qisvc-console-ui/styles.css')
  : undefined

export default defineNuxtConfig({
  compatibilityDate: '2026-11-23',
  modules: ['@nuxt/ui'],
  ui: { fonts: false },
  css: ['~/assets/css/main.css', '~/assets/css/motion.css', '~/assets/css/sidebar.css', '~/assets/css/field-focus.css', '~/assets/css/scrollbars.css', ...(consoleCss ? ['~/assets/css/private-console.css'] : [])],
  alias: {
    '#qiandao-console': consoleCss
      ? resolve(dirname(consoleCss), '../components')
      : resolve(root, 'app/components/console'),
  },
  icon: { serverBundle: { collections: ['lucide'] } },
  colorMode: { preference: 'light', fallback: 'light' },
  app: {
    pageTransition: { name: 'qm-page' },
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      link: [
        { rel: 'apple-touch-icon', href: '/brand/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
      meta: [{ name: 'theme-color', content: '#f4f7fd' }],
    },
  },
  nitro: { preset: 'node-server' },
  devtools: { enabled: false },
})
