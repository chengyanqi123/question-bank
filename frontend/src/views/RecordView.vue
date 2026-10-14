<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { api } from '../api'
import { formatAccuracy } from '../format'
import { showError } from '../ui'
import type { Attempt } from '../types'
import BackToTop from '../components/BackToTop.vue'
import QuestionCard from '../components/QuestionCard.vue'

const route = useRoute()
const router = useRouter()
const attempt = shallowRef<Attempt | null>(null)
const loading = shallowRef(true)
const filter = shallowRef<'wrong' | 'all'>('wrong')
const visibleQuestions = computed(() => attempt.value?.questions
  .map((question, index) => ({ question, number: index + 1 }))
  .filter(({ question }) => filter.value === 'all' || !question.correct) ?? [])
const percent = computed(() => attempt.value
  ? Math.round((attempt.value.correctCount ?? 0) / attempt.value.total * 100) : 0)
const percentText = computed(() => formatAccuracy(attempt.value?.correctCount, attempt.value?.total ?? 0))

onMounted(async () => {
  try {
    const data = await api.attempt(route.params.id as string)
    if (!data.submittedAt) {
      await router.replace(`/exam/${data.id}`)
      return
    }
    attempt.value = data
  } catch (error) {
    showError((error as Error).message)
    await router.replace('/records')
  } finally { loading.value = false }
})
</script>

<template>
  <main class="page result-page">
    <div v-if="loading" class="loading-panel"><el-skeleton :rows="8" animated /></div>
    <template v-else-if="attempt">
      <RouterLink to="/records" class="plain-back"><Icon icon="mdi:chevron-left" /> 返回记录</RouterLink>
      <section class="result-hero">
        <span class="result-caption">{{ attempt.mode === 'exam' ? '模拟考试' : '错题重刷' }} · 已完成</span>
        <div class="score-line"><strong>{{ attempt.correctCount }}</strong><span>/ {{ attempt.total }} 题</span></div>
        <h1>{{ percent >= 80 ? '表现很棒，继续保持' : '稳步积累，继续加油' }}</h1>
        <p>正确率 {{ percentText }}% · 错题已自动加入错题本</p>
        <div class="result-progress"><span :style="{ width: `${percent}%` }"></span></div>
      </section>
      <div class="review-heading"><div><p class="eyebrow">REVIEW</p><h2>逐题回顾</h2></div><span>{{ attempt.total - (attempt.correctCount ?? 0) }} 道待巩固</span></div>
      <div class="segmented-control">
        <button type="button" :class="{ active: filter === 'wrong' }" @click="filter = 'wrong'">只看错题</button>
        <button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部题目</button>
      </div>
      <div v-if="!visibleQuestions.length" class="empty-panel compact"><span class="empty-symbol"><Icon icon="mdi:sparkles" /></span><h2>全部答对了！</h2><p>这场练习没有需要回顾的错题。</p></div>
      <div v-else class="review-list">
        <QuestionCard
          v-for="item in visibleQuestions" :key="item.question.id"
          :question="item.question" :number="item.number"
          :selected="item.question.userAnswer" reveal
        />
      </div>
      <BackToTop />
    </template>
  </main>
</template>
