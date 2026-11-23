import type { Ref } from 'vue'

export function useConsoleListPage<T>(rows: Readonly<Ref<readonly T[]>>) {
  const page = ref(1)
  const pageSize = ref(20)
  const sizeOptions = [10, 20, 50, 100].map(value => ({ label: value + ' 条/页', value }))
  const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)))
  const offset = computed(() => (page.value - 1) * pageSize.value)
  const pageRows = computed(() => rows.value.slice(offset.value, offset.value + pageSize.value))

  watch(pages, count => { page.value = Math.min(page.value, count) })

  function turn(direction: 'previous' | 'next') {
    page.value = Math.min(pages.value, Math.max(1, page.value + (direction === 'next' ? 1 : -1)))
  }

  function resize(size: number) {
    pageSize.value = size
    page.value = 1
  }

  return { page, pageSize, sizeOptions, pages, offset, pageRows, turn, resize }
}
