<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { api } from '../api'
import BackToTop from '../components/BackToTop.vue'
import LoadMoreFooter from '../components/LoadMoreFooter.vue'
import { usePagedList } from '../composables/usePagedList'
import { formatAccuracy } from '../format'
import type { Attempt } from '../types'

const filter = shallowRef<Attempt['mode'] | 'all'>('all')
const tabIndex = { all: 0, exam: 1, wrong: 2 }
const transitionName = shallowRef('tab-slide-next')
const { items: records, loading, initialized, hasMore, failed, loadMore, retry, reset } =
  usePagedList((page) => api.attempts(page, filter.value))
watch(filter, (next, previous) => {
  transitionName.value = tabIndex[next] > tabIndex[previous] ? 'tab-slide-next' : 'tab-slide-prev'
  reset()
})
const emptyTitle = computed(() => ({
  all: '还没有练习记录', exam: '还没有考试记录', wrong: '还没有错题重刷记录',
})[filter.value])
const emptyDescription = computed(() => filter.value === 'all'
  ? '从一场模拟考试开始，记录你的每一步。' : '当前分类还没有练习记录。')
const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))
</script>

<template>
  <main class="page list-page">
    <header class="page-header"><p class="eyebrow">MY PROGRESS</p><h1>考试记录</h1><p>每一次练习，都是看得见的进步。</p></header>
    <div class="list-filter-bar" role="group" aria-label="记录筛选">
      <div class="segmented-control list-filter-control" :data-active-index="tabIndex[filter]">
        <button type="button" :aria-pressed="filter === 'all'" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button type="button" :aria-pressed="filter === 'exam'" :class="{ active: filter === 'exam' }" @click="filter = 'exam'">模拟考试</button>
        <button type="button" :aria-pressed="filter === 'wrong'" :class="{ active: filter === 'wrong' }" @click="filter = 'wrong'">错题重刷</button>
      </div>
    </div>
    <Transition :name="transitionName" mode="out-in">
      <div :key="filter">
        <div v-if="loading && !initialized" class="list-stack"><el-skeleton v-for="i in 3" :key="i" :rows="3" animated /></div>
        <div v-else-if="!records.length && !failed" class="empty-panel">
          <span class="empty-symbol"><Icon icon="mdi:clipboard-text-outline" /></span><h2>{{ emptyTitle }}</h2><p>{{ emptyDescription }}</p>
          <RouterLink to="/" class="solid-link">去开始考试</RouterLink>
        </div>
        <template v-else>
          <div class="list-stack">
            <RouterLink
              v-for="item in records" :key="item.id"
              :to="item.submittedAt ? `/records/${item.id}` : `/exam/${item.id}`"
              class="record-card"
            >
              <div class="record-main"><span class="record-icon"><Icon :icon="item.mode === 'exam' ? 'mdi:clipboard-text-outline' : 'mdi:book-alert-outline'" /></span>
                <span><strong>{{ item.mode === 'exam' ? '模拟考试' : '错题重刷' }}</strong><small>{{ formatDate(item.startedAt) }} · {{ item.total }} 道题</small></span>
              </div>
              <div class="record-score">
                <strong>{{ item.submittedAt ? item.correctCount : '继续' }}</strong>
                <small>{{ item.submittedAt ? '答对题数' : `已答 ${item.answered} 题` }}</small>
                <small v-if="item.submittedAt">正确率 {{ formatAccuracy(item.correctCount, item.total) }}%</small>
              </div>
            </RouterLink>
          </div>
          <LoadMoreFooter :loading="loading" :has-more="hasMore" :failed="failed" @load="loadMore" @retry="retry" />
        </template>
      </div>
    </Transition>
    <BackToTop />
  </main>
</template>
