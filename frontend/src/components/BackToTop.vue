<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { Icon } from '@iconify/vue'

defineProps<{ aboveAction?: boolean }>()

const visible = shallowRef(false)

function updateVisibility() {
  visible.value = window.scrollY > 480
}

function scrollToTop() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
}

onMounted(() => {
  updateVisibility()
  window.addEventListener('scroll', updateVisibility, { passive: true })
})
onUnmounted(() => window.removeEventListener('scroll', updateVisibility))
</script>

<template>
  <Transition name="back-to-top">
    <button v-if="visible" type="button" class="back-to-top" :class="{ 'above-action': aboveAction }" aria-label="回到顶部" title="回到顶部" @click="scrollToTop">
      <Icon icon="mdi:arrow-up" />
    </button>
  </Transition>
</template>

<style scoped>
.back-to-top { position: fixed; z-index: 15; right: max(22px, calc((100vw - 860px) / 2 + 38px)); bottom: calc(88px + env(safe-area-inset-bottom)); display: grid; place-items: center; width: 48px; height: 48px; border: 1px solid #dfe7f6; border-radius: 50%; color: #4d75ed; background: rgba(255,255,255,.96); box-shadow: 0 8px 24px rgba(50,75,140,.16); backdrop-filter: blur(12px); }
.back-to-top.above-action { bottom: calc(170px + env(safe-area-inset-bottom)); }
.back-to-top svg { width: 23px; height: 23px; }
.back-to-top-enter-active, .back-to-top-leave-active { transition: opacity .18s ease, transform .18s ease; }
.back-to-top-enter-from, .back-to-top-leave-to { opacity: 0; transform: translateY(8px) scale(.92); }
@media (prefers-reduced-motion: reduce) { .back-to-top-enter-active, .back-to-top-leave-active { transition: none; } }
</style>
