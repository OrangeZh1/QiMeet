import type { AttendeeActivityCard } from '#shared/attendee-account'
import type { Ref } from 'vue'

export function useAttendeeActivitySearch<T extends AttendeeActivityCard>(items: Ref<T[] | null | undefined>) {
  const search = ref('')
  const query = computed(() => search.value.trim().toLowerCase())
  const filtered = computed(() => (items.value || []).filter(item =>
    !query.value || [item.title, item.venue].some(value => value.toLowerCase().includes(query.value))))
  return { search, query, filtered }
}
