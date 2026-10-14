<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import { api } from '../api'
import { showError } from '../ui'
import type { Answer, Attempt } from '../types'
import QuestionCard from '../components/QuestionCard.vue'

const route = useRoute()
const router = useRouter()
const attempt = ref<Attempt | null>(null)
const currentIndex = shallowRef(0)
const navigatorOpen = shallowRef(false)
const busy = shallowRef(false)
const loading = shallowRef(true)
const question = computed(() => attempt.value?.questions[currentIndex.value])
const answered = computed(() => attempt.value ? Object.keys(attempt.value.answers).length : 0)
const progress = computed(() => attempt.value ? Math.round(answered.value / attempt.value.total * 100) : 0)
const questionTypes = ['choice', 'boolean'] as const

onMounted(async () => {
  try {
    const data = await api.attempt(route.params.id as string)
    if (data.submittedAt) {
      await router.replace(`/records/${data.id}`)
      return
    }
    attempt.value = data
    const firstUnanswered = data.questions.findIndex((item) => !data.answers[item.id])
    currentIndex.value = firstUnanswered >= 0 ? firstUnanswered : 0
  } catch (error) {
    showError((error as Error).message)
    await router.replace('/')
  } finally {
    loading.value = false
  }
})

async function choose(answer: Answer) {
  if (!attempt.value || !question.value || busy.value) return
  const currentAttempt = attempt.value
  const id = question.value.id
  if (Object.hasOwn(currentAttempt.answers, id)) return
  busy.value = true
  try {
    const saved = await api.answer(currentAttempt.id, id, answer)
    currentAttempt.answers[id] = answer
    const index = currentAttempt.questions.findIndex((item) => item.id === id)
    currentAttempt.questions[index] = saved.question
  } catch (error) {
    showError((error as Error).message)
    try {
      const latest = await api.attempt(currentAttempt.id)
      if (latest.submittedAt) await router.replace(`/records/${latest.id}`)
      else attempt.value = latest
    } catch { /* Keep the current screen when the network is unavailable. */ }
  } finally {
    busy.value = false
  }
}

async function submit() {
  if (!attempt.value || busy.value) return
  const currentAttempt = attempt.value
  const missing = currentAttempt.total - answered.value
  try {
    await ElMessageBox.confirm(
      missing ? `还有 ${missing} 道题未作答，交卷后这些题将计入错题。确定交卷吗？` : '确定交卷并查看成绩吗？',
      '确认交卷', { confirmButtonText: '确认交卷', cancelButtonText: '继续答题', showClose: false },
    )
  } catch { return }
  busy.value = true
  try {
    await api.submit(currentAttempt.id)
    await router.replace(`/records/${currentAttempt.id}`)
  } catch (error) {
    showError((error as Error).message)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="exam-page">
    <div v-if="loading" class="page loading-panel"><el-skeleton :rows="8" animated /></div>
    <template v-else-if="attempt && question">
      <header class="exam-topbar">
        <RouterLink to="/" class="back-link" aria-label="返回首页"><Icon icon="mdi:chevron-left" /></RouterLink>
        <div><strong>{{ attempt.mode === 'exam' ? '模拟考试' : '错题重刷' }}</strong><small>已自动保存答题进度</small></div>
        <button type="button" class="text-action" @click="navigatorOpen = true">答题卡</button>
      </header>
      <div class="exam-content">
        <div class="exam-progress-heading"><span>题目进度</span><strong>{{ currentIndex + 1 }} <small>/ {{ attempt.total }}</small></strong></div>
        <el-progress :percentage="progress" :show-text="false" :stroke-width="8" color="#4d7cff" />
        <div class="exam-info-line"><span>已完成 {{ answered }} 题</span><span>作答后显示答案，不能修改</span></div>
        <QuestionCard
          :key="question.id"
          :question="question"
          :number="currentIndex + 1"
          :selected="attempt.answers[question.id]"
          :reveal="question.answer !== undefined"
          :disabled="busy"
          @select="choose"
        />
      </div>
      <footer class="exam-footer">
        <button type="button" class="footer-secondary" :disabled="currentIndex === 0" @click="currentIndex--">上一题</button>
        <button v-if="currentIndex < attempt.total - 1" type="button" class="footer-primary" @click="currentIndex++">下一题 <Icon icon="mdi:arrow-right" /></button>
        <button v-else type="button" class="footer-primary" :disabled="busy" @click="submit">交卷查看成绩 <Icon icon="mdi:arrow-right" /></button>
      </footer>
      <el-drawer v-model="navigatorOpen" direction="btt" size="75%" :show-close="false" class="answer-drawer">
        <template #header><div class="drawer-header"><strong>答题卡</strong><button type="button" aria-label="关闭答题卡" @click="navigatorOpen = false"><Icon icon="mdi:close" /></button></div></template>
        <div class="drawer-summary">已答 {{ answered }} / {{ attempt.total }} 题</div>
        <div v-for="type in questionTypes" :key="type" class="navigator-group">
          <h3>{{ type === 'choice' ? '选择题' : '判断题' }}</h3>
          <div class="navigator-grid">
            <button
              v-for="(item, index) in attempt.questions"
              v-show="item.type === type"
              :key="item.id"
              type="button"
              :class="{ answered: !!attempt.answers[item.id], current: index === currentIndex }"
              @click="currentIndex = index; navigatorOpen = false"
            >{{ index + 1 }}</button>
          </div>
        </div>
        <el-button class="drawer-submit" type="primary" round :disabled="busy" @click="navigatorOpen = false; submit()">交卷</el-button>
      </el-drawer>
    </template>
  </main>
</template>
