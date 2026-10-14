<script setup lang="ts">
import { watch, useTemplateRef } from 'vue'

const props = defineProps<{
  loading: boolean
  hasMore: boolean
  failed: boolean
}>()
const emit = defineEmits<{
  load: []
  retry: []
}>()
const trigger = useTemplateRef<HTMLElement>('trigger')

watch([trigger, () => props.loading, () => props.hasMore, () => props.failed],
  ([element, loading, hasMore, failed], _previous, onCleanup) => {
    if (!element || loading || !hasMore || failed) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) emit('load')
    }, { rootMargin: '200px 0px' })
    observer.observe(element)
    onCleanup(() => observer.disconnect())
  }, { flush: 'post' })
</script>

<template>
  <div ref="trigger" class="load-more-footer" role="status" aria-live="polite">
    <button v-if="failed" type="button" @click="emit('retry')">加载失败，点击重试</button>
    <span v-else-if="loading">正在加载…</span>
    <span v-else-if="hasMore">上拉加载更多</span>
    <span v-else>已加载全部</span>
  </div>
</template>

<style scoped>
.load-more-footer { min-height: 48px; padding: 16px 0; color: #9aa6bb; font-size: 12px; text-align: center; }
.load-more-footer button { border: 0; color: #527bf6; background: transparent; font-size: inherit; }
</style>
