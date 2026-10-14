import { onMounted, shallowRef } from 'vue'
import { showError } from '../ui'
import type { Page } from '../types'

export function usePagedList<T>(fetchPage: (page: number) => Promise<Page<T>>) {
  const items = shallowRef<T[]>([])
  const total = shallowRef(0)
  const loading = shallowRef(false)
  const initialized = shallowRef(false)
  const hasMore = shallowRef(true)
  const failed = shallowRef(false)
  let nextPage = 1
  let generation = 0

  async function loadMore() {
    if (loading.value || failed.value || !hasMore.value) return
    const requestGeneration = generation
    loading.value = true
    try {
      const page = await fetchPage(nextPage)
      if (requestGeneration !== generation) return
      items.value = [...items.value, ...page.items]
      total.value = page.total
      nextPage++
      hasMore.value = page.items.length > 0 && items.value.length < page.total
    } catch (error) {
      if (requestGeneration !== generation) return
      failed.value = true
      showError((error as Error).message)
    } finally {
      if (requestGeneration === generation) {
        initialized.value = true
        loading.value = false
      }
    }
  }

  function reset() {
    generation++
    nextPage = 1
    items.value = []
    total.value = 0
    loading.value = false
    initialized.value = false
    hasMore.value = true
    failed.value = false
    void loadMore()
  }

  function retry() {
    failed.value = false
    void loadMore()
  }

  onMounted(() => { void loadMore() })
  return { items, total, loading, initialized, hasMore, failed, loadMore, retry, reset }
}
