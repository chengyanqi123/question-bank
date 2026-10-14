<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { Answer, Question } from '../types'

const props = defineProps<{
  question: Question
  number?: number
  selected?: Answer | null
  reveal?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ select: [answer: Answer] }>()
const options = computed(() => props.question.type === 'choice'
  ? props.question.options
  : [{ key: '正确' as const, text: '正确' }, { key: '错误' as const, text: '错误' }])

function state(key: Answer) {
  if (props.reveal) {
    if (key === props.question.answer) return 'is-correct'
    if (key === props.selected) return 'is-wrong'
    return ''
  }
  return key === props.selected ? 'is-selected' : ''
}
</script>

<template>
  <article class="question-card">
    <div class="question-meta">
      <span class="type-pill">{{ question.type === 'choice' ? '单选题' : '判断题' }}</span>
      <span class="category-text">{{ question.category }}</span>
    </div>
    <h2 class="question-title"><span v-if="number" class="question-number">{{ number }}.</span>{{ question.prompt }}</h2>
    <div class="option-list">
      <button
        v-for="option in options"
        :key="option.key"
        type="button"
        class="option-button"
        :class="state(option.key)"
        :disabled="reveal || disabled"
        @click="emit('select', option.key)"
      >
        <span class="option-key">{{ option.key }}</span>
        <span class="option-text">{{ option.text }}</span>
        <Icon v-if="reveal && option.key === question.answer" class="answer-mark" icon="mdi:check" />
        <Icon v-else-if="option.key === selected" class="answer-mark" :icon="reveal ? 'mdi:close' : 'mdi:check'" />
      </button>
    </div>
    <div v-if="reveal" class="answer-explain">
      <strong>正确答案：{{ question.answer }}</strong>
      <span v-if="selected">你的答案：{{ selected }}</span>
      <span v-else>本题未作答</span>
      <p v-if="question.note">{{ question.note }}</p>
    </div>
  </article>
</template>
