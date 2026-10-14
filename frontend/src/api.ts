import type { Answer, Attempt, AttemptSummary, MigrationData, MigrationResult, Overview, Page, Question } from './types'
import FingerprintJS from '@fingerprintjs/fingerprintjs'

const legacyDeviceId = localStorage.getItem('question-bank-device-id')
const visitorIdPromise = FingerprintJS.load()
  .then((agent) => agent.get())
  .then((result) => result.visitorId)

export const getVisitorId = () => visitorIdPromise

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const visitorId = await visitorIdPromise
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Visitor-Id': visitorId,
      // 'X-Visitor-Id': '38d7bbcb3697c8a4120a34ab94fe8372',
      ...(legacyDeviceId ? { 'X-Legacy-Device-Id': legacyDeviceId } : {}),
      ...options.headers,
    },
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || '请求失败，请稍后重试')
  return payload as T
}

export const api = {
  overview: () => request<Overview>('/overview'),
  start: (mode: 'exam' | 'wrong') =>
    request<Attempt>('/exams', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  quick: () => request<Attempt>('/exams/quick', { method: 'POST' }),
  attempts: (page = 1, mode: Attempt['mode'] | 'all' = 'all') =>
    request<Page<AttemptSummary>>(`/exams?page=${page}${mode === 'all' ? '' : `&mode=${mode}`}`),
  attempt: (id: string) => request<Attempt>(`/exams/${id}`),
  answer: (id: string, questionId: string, answer: Answer) =>
    request<{ answered: number; question: Question }>(`/exams/${id}/answers`, {
      method: 'PATCH',
      body: JSON.stringify({ questionId, answer }),
    }),
  submit: (id: string) => request<Attempt>(`/exams/${id}/submit`, { method: 'POST' }),
  wrongQuestions: (page = 1, type: Question['type'] | 'all' = 'all') =>
    request<Page<Question>>(`/wrong-questions?page=${page}${type === 'all' ? '' : `&type=${type}`}`),
  exportMigration: () => request<MigrationData>('/migration/export'),
  importMigration: (data: unknown) => request<MigrationResult>('/migration/import', {
    method: 'POST', body: JSON.stringify(data),
  }),
  importCode: (sourceId: string) => request<MigrationResult>('/migration/code', {
    method: 'POST', body: JSON.stringify({ sourceId }),
  }),
}
