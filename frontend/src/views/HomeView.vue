<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Icon } from '@iconify/vue'
import { api } from '../api'
import { showError } from '../ui'
import { useOverviewStore } from '../stores/overview'
import OfflineMigration from '../components/migration/OfflineMigration.vue'
import OnlineMigration from '../components/migration/OnlineMigration.vue'

const router = useRouter()
const store = useOverviewStore()
const { overview, loading } = storeToRefs(store)
const starting = shallowRef(false)

onMounted(() => store.refresh().catch((error: Error) => showError(error.message)))

function refreshOverview() {
  store.refresh().catch((error: Error) => showError(error.message))
}

async function start() {
  starting.value = true
  try {
    const attempt = await api.start('exam')
    await router.push(`/exam/${attempt.id}`)
  } catch (error) {
    showError((error as Error).message)
  } finally {
    starting.value = false
  }
}
</script>

<template>
  <main class="page home-page">
    <header class="home-header">
      <div class="brand-mark"><Icon icon="mdi:steering" /></div>
      <div>
        <p class="eyebrow">车驾管知识题库</p>
        <h1>备考练习</h1>
      </div>
      <span class="header-dot" aria-hidden="true"></span>
    </header>

    <section class="hero-card">
      <div class="hero-orb" aria-hidden="true"></div>
      <p class="hero-label">今天，也向目标更近一步</p>
      <h2>随时练习<br />从容应考</h2>
      <p class="hero-description">每次随机抽取 50 道选择题和 50 道判断题，完成一场完整模拟考试。</p>
      <el-button class="hero-button" round :disabled="starting" @click="start">{{ starting ? '正在创建考试' : '开始模拟考试' }} <Icon icon="mdi:arrow-top-right" /></el-button>
    </section>

    <RouterLink v-if="overview?.activeAttemptId" :to="`/exam/${overview.activeAttemptId}`" class="resume-card">
      <span class="resume-icon"><Icon icon="mdi:refresh" /></span>
      <span><strong>继续上次练习</strong><small>你的答题进度已保存</small></span>
      <Icon class="chevron" icon="mdi:chevron-right" />
    </RouterLink>

    <section class="section-block">
      <div class="section-heading">
        <h2>学习概览</h2>
        <span>每一步都算数</span>
      </div>
      <div v-if="loading && !overview" class="stats-grid"><el-skeleton v-for="i in 3" :key="i" animated /></div>
      <div v-else class="stats-grid">
        <div class="stat-card">
          <span class="stat-symbol blue"><Icon icon="mdi:clipboard-text-outline" /></span><strong>{{ overview?.examCount ?? 0 }}</strong
          ><small>完成考试</small>
        </div>
        <div class="stat-card">
          <span class="stat-symbol orange"><Icon icon="mdi:book-alert-outline" /></span><strong>{{ overview?.wrongCount ?? 0 }}</strong
          ><small>待复习错题</small>
        </div>
        <div class="stat-card">
          <span class="stat-symbol green"><Icon icon="mdi:target" /></span><strong>{{ overview?.lastScore ?? '—' }}</strong
          ><small>上次得分</small>
        </div>
      </div>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <h2>针对性练习</h2>
        <span>哪里薄弱练哪里</span>
      </div>
      <RouterLink to="/quick" class="feature-card">
        <span class="feature-icon quick"><Icon icon="mdi:lightning-bolt-outline" /></span>
        <span class="feature-copy"><strong>快捷刷题</strong><small>打开即练，自动续接未完成的题目</small></span>
        <Icon class="chevron" icon="mdi:chevron-right" />
      </RouterLink>
      <RouterLink to="/wrong" class="feature-card">
        <span class="feature-icon"><Icon icon="mdi:sparkles" /></span>
        <span class="feature-copy"><strong>错题重刷</strong><small>集中巩固做错的题目</small></span>
        <Icon class="chevron" icon="mdi:chevron-right" />
      </RouterLink>
      <RouterLink to="/records" class="feature-card">
        <span class="feature-icon lavender"><Icon icon="mdi:clipboard-text-outline" /></span>
        <span class="feature-copy"><strong>考试记录</strong><small>回看成绩与逐题解析</small></span>
        <Icon class="chevron" icon="mdi:chevron-right" />
      </RouterLink>
    </section>

    <section class="section-block">
      <div class="section-heading">
        <h2>数据迁移</h2>
        <span>历史记录随你走</span>
      </div>
      <div class="migration-stack">
        <OnlineMigration @migrated="refreshOverview" />
        <OfflineMigration @migrated="refreshOverview" />
      </div>
    </section>

    <div class="bank-note">题库收录 {{ overview ? overview.bank.choice + overview.bank.boolean : '—' }} 道题 · 持续积累，每天进步</div>
  </main>
</template>

<style scoped>
.migration-stack {
  display: grid;
  gap: 10px;
}
</style>
