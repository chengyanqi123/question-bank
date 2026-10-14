import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { api } from '../api'
import type { Overview } from '../types'

export const useOverviewStore = defineStore('overview', () => {
  const overview = shallowRef<Overview | null>(null)
  const loading = shallowRef(false)

  async function refresh() {
    loading.value = true
    try {
      overview.value = await api.overview()
    } finally {
      loading.value = false
    }
  }

  return { overview, loading, refresh }
})
