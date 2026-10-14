<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { api } from '../api'
import BackToTop from '../components/BackToTop.vue'
import LoadMoreFooter from '../components/LoadMoreFooter.vue'
import { usePagedList } from '../composables/usePagedList'
import { showError } from '../ui'
import type { Question } from '../types'

const router = useRouter()
const filter = shallowRef<Question['type'] | 'all'>('all')
const tabIndex = { all: 0, choice: 1, boolean: 2 }
const transitionName = shallowRef('tab-slide-next')
const { items: questions, total, loading, initialized, hasMore, failed, loadMore, retry, reset } =
  usePagedList((page) => api.wrongQuestions(page, filter.value))
watch(filter, (next, previous) => {
  transitionName.value = tabIndex[next] > tabIndex[previous] ? 'tab-slide-next' : 'tab-slide-prev'
  reset()
})
const emptyTitle = computed(() => ({
  all: '这里还空空的', choice: '还没有选择题错题', boolean: '还没有判断题错题',
})[filter.value])
const emptyDescription = computed(() => filter.value === 'all'
  ? '交卷后，做错或未作答的题目会出现在这里。' : '交卷后，这类做错或未作答的题目会出现在这里。')
const starting = shallowRef(false)

async function start() {
  starting.value = true
  try {
    const attempt = await api.start('wrong')
    await router.push(`/exam/${attempt.id}`)
  } catch (error) { showError((error as Error).message) }
  finally { starting.value = false }
}
</script>

<template>
  <main class="page list-page wrong-page">
    <header class="page-header"><p class="eyebrow">FOCUS PRACTICE</p><h1>错题本</h1><p>把不会的题，变成会做的题。</p></header>
    <div class="wrong-banner"><span class="wrong-banner-icon"><Icon icon="mdi:book-alert-outline" /></span><div><strong>{{ total }}</strong><span>道题等待巩固</span></div></div>
    <div class="list-filter-bar" role="group" aria-label="错题筛选">
      <div class="segmented-control list-filter-control" :data-active-index="tabIndex[filter]">
        <button type="button" :aria-pressed="filter === 'all'" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button type="button" :aria-pressed="filter === 'choice'" :class="{ active: filter === 'choice' }" @click="filter = 'choice'">选择题</button>
        <button type="button" :aria-pressed="filter === 'boolean'" :class="{ active: filter === 'boolean' }" @click="filter = 'boolean'">判断题</button>
      </div>
    </div>
    <Transition :name="transitionName" mode="out-in">
      <div :key="filter">
        <div v-if="loading && !initialized" class="list-stack"><el-skeleton v-for="i in 3" :key="i" :rows="2" animated /></div>
        <div v-else-if="!questions.length && !failed" class="empty-panel"><span class="empty-symbol"><Icon icon="mdi:sparkles" /></span><h2>{{ emptyTitle }}</h2><p>{{ emptyDescription }}</p><RouterLink to="/" class="solid-link">去模拟考试</RouterLink></div>
        <template v-else>
          <div class="section-heading"><h2>待巩固题目</h2><span>答对后自动移除</span></div>
          <div class="wrong-list">
            <div v-for="(item, index) in questions" :key="item.id" class="wrong-item"><span class="wrong-number">{{ String(index + 1).padStart(2, '0') }}</span><div><small>{{ item.type === 'choice' ? '选择题' : '判断题' }} · {{ item.category }}</small><p>{{ item.prompt }}</p></div></div>
          </div>
          <LoadMoreFooter :loading="loading" :has-more="hasMore" :failed="failed" @load="loadMore" @retry="retry" />
        </template>
      </div>
    </Transition>
    <div v-if="questions.length" class="wrong-action"><el-button type="primary" round :disabled="starting" @click="start">{{ starting ? '正在创建练习' : '开始错题重刷' }} <Icon icon="mdi:arrow-right" /></el-button></div>
    <BackToTop above-action />
  </main>
</template>
