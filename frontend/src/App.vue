<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed, shallowRef, watch } from 'vue'
import { Icon } from '@iconify/vue'

const route = useRoute()
const active = computed(() => route.path.startsWith('/records') ? 'records'
  : route.path.startsWith('/wrong') ? 'wrong' : 'home')
const tabOrder: Record<string, number> = { '/': 0, '/records': 1, '/wrong': 2 }
const pageTransition = shallowRef('')

watch(() => route.path, (next, previous) => {
  pageTransition.value = next in tabOrder && previous in tabOrder
    ? (tabOrder[next]! > tabOrder[previous]! ? 'page-slide-next' : 'page-slide-prev')
    : ''
}, { flush: 'sync' })
</script>

<template>
  <div class="app-shell">
    <RouterView v-slot="{ Component, route: viewRoute }">
      <Transition :name="pageTransition" mode="out-in">
        <component :is="Component" :key="viewRoute.path" />
      </Transition>
    </RouterView>
    <nav v-if="!route.path.startsWith('/exam/') && route.path !== '/quick'" class="bottom-nav" aria-label="主导航">
      <RouterLink to="/" :class="{ active: active === 'home' }"><Icon class="nav-icon" icon="mdi:home-outline" />首页</RouterLink>
      <RouterLink to="/records" :class="{ active: active === 'records' }"><Icon class="nav-icon" icon="mdi:clipboard-text-outline" />记录</RouterLink>
      <RouterLink to="/wrong" :class="{ active: active === 'wrong' }"><Icon class="nav-icon" icon="mdi:book-alert-outline" />错题</RouterLink>
    </nav>
  </div>
</template>
