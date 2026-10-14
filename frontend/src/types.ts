export type Answer = 'A' | 'B' | 'C' | 'D' | '正确' | '错误'
export type Question = {
  id: string
  type: 'choice' | 'boolean'
  category: string
  source: string
  prompt: string
  options: { key: 'A' | 'B' | 'C' | 'D'; text: string }[]
  answer?: Answer
  note?: string
  userAnswer?: Answer | null
  correct?: boolean
}
export type Attempt = {
  id: string
  mode: 'exam' | 'wrong'
  questionIds: string[]
  questions: Question[]
  answers: Record<string, Answer>
  startedAt: string
  submittedAt?: string
  correctCount?: number
  total: number
}
export type AttemptSummary = {
  id: string
  mode: 'exam' | 'wrong'
  total: number
  answered: number
  startedAt: string
  submittedAt: string | null
  correctCount: number | null
}
export type Page<T> = { items: T[]; total: number }
export type Overview = {
  bank: { choice: number; boolean: number }
  examCount: number
  wrongCount: number
  lastScore: number | null
  activeAttemptId: string | null
}
export type MigrationData = {
  version: 1
  sourceId: string
  exportedAt: string
  attempts: Omit<Attempt, 'questions' | 'total'>[]
  wrongIds: string[]
}
export type MigrationResult = { attempts: number; wrongQuestions: number }
