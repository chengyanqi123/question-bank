<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { api } from '../api'

const router = useRouter()
const loading = shallowRef(true)
const error = shallowRef('')
let cancelled = false

async function enter() {
  loading.value = true
  error.value = ''
  try {
    const attempt = await api.quick()
    if (!cancelled) await router.replace(`/exam/${attempt.id}`)
  } catch (reason) {
    if (!cancelled) error.value = (reason as Error).message
  } finally {
    if (!cancelled) loading.value = false
  }
}

onMounted(enter)
onUnmounted(() => { cancelled = true })
</script>

<template>
  <main class="page quick-page">
    <div class="quick-panel">
      <span class="quick-icon"><Icon icon="mdi:lightning-bolt-outline" /></span>
      <h1>{{ loading ? '正在进入刷题…' : '暂时无法进入' }}</h1>
      <p>{{ loading ? '正在查找上次未完成的练习' : error }}</p>
      <div v-if="!loading" class="quick-actions">
        <button type="button" class="solid-link" @click="enter">重试</button>
        <RouterLink to="/">返回首页</RouterLink>
      </div>
    </div>
  </main>
</template>
