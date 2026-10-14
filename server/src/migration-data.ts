import { createHash } from 'node:crypto'
import {
  ensureUser, getAttempt, wrongIds,
  type Answer, type Attempt, type Sqlite,
} from './db.js'

export type MigrationData = {
  version: 1
  sourceId: string
  exportedAt: string
  attempts: Attempt[]
  wrongIds: string[]
}

export type MigrationResult = { attempts: number; wrongQuestions: number }

const visitorIdPattern = /^[0-9a-f]{16,64}$/i
const answers = new Set<Answer>(['A', 'B', 'C', 'D', '正确', '错误'])

export class MigrationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

function importedAttemptId(targetId: string, originalId: string): string {
  return createHash('sha256').update(`migration:v1:${targetId}:${originalId}`).digest('hex')
}

export function exportMigrationData(db: Sqlite, sourceId: string): MigrationData {
  const ids = db.prepare<[string], { id: string }>(
    'SELECT id FROM attempts WHERE user_id = ? ORDER BY position'
  ).all(sourceId)
  return {
    version: 1,
    sourceId,
    exportedAt: new Date().toISOString(),
    attempts: ids.map(({ id }) => getAttempt(db, sourceId, id)!),
    wrongIds: wrongIds(db, sourceId),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validAttempt(value: unknown, knownQuestions: Map<string, string>): value is Attempt {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id ||
      (value.mode !== 'exam' && value.mode !== 'wrong') ||
      typeof value.startedAt !== 'string' || !value.startedAt ||
      !Array.isArray(value.questionIds) || !isRecord(value.answers)) return false
  if (!value.questionIds.every((id) => typeof id === 'string' && knownQuestions.has(id)) ||
      new Set(value.questionIds).size !== value.questionIds.length) return false
  const questionIds = new Set(value.questionIds)
  if (!Object.entries(value.answers).every(([id, answer]) =>
    questionIds.has(id) && answers.has(answer as Answer) &&
    (knownQuestions.get(id) === 'choice' ? ['A', 'B', 'C', 'D'].includes(answer as string)
      : ['正确', '错误'].includes(answer as string)))) return false
  if (value.submittedAt !== undefined && (typeof value.submittedAt !== 'string' || !value.submittedAt)) return false
  if (value.correctCount !== undefined &&
      (!Number.isInteger(value.correctCount) || (value.correctCount as number) < 0 ||
        (value.correctCount as number) > value.questionIds.length)) return false
  return (value.submittedAt === undefined) === (value.correctCount === undefined)
}

export function importMigrationData(db: Sqlite, targetId: string, value: unknown): MigrationResult {
  if (!isRecord(value) || value.version !== 1 ||
      typeof value.sourceId !== 'string' || !visitorIdPattern.test(value.sourceId) ||
      typeof value.exportedAt !== 'string' || !value.exportedAt ||
      !Array.isArray(value.attempts) || !Array.isArray(value.wrongIds)) {
    throw new MigrationError('无效的迁移文件或不支持的数据版本')
  }
  if (value.sourceId === targetId) throw new MigrationError('迁移数据与本设备 ID 相同，无需迁移', 409)

  const knownQuestions = new Map(db.prepare<[], { id: string; type: string }>(
    'SELECT id, type FROM questions'
  ).all().map(({ id, type }) => [id, type]))
  if (!value.attempts.every((attempt) => validAttempt(attempt, knownQuestions)) ||
      new Set(value.attempts.map((attempt: Attempt) => attempt.id)).size !== value.attempts.length ||
      !value.wrongIds.every((id) => typeof id === 'string' && knownQuestions.has(id))) {
    throw new MigrationError('迁移数据无效，或包含当前题库中不存在的题目')
  }

  return db.transaction(() => {
    ensureUser(db, targetId)
    let position = db.prepare<[string], { next: number }>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM attempts WHERE user_id = ?'
    ).get(targetId)!.next
    const existsForTarget = db.prepare<[string, string], { id: string }>(
      'SELECT id FROM attempts WHERE id = ? AND user_id = ?'
    )
    const exists = db.prepare<[string], { id: string }>('SELECT id FROM attempts WHERE id = ?')
    const insertAttempt = db.prepare(`
      INSERT INTO attempts (id, user_id, position, mode, started_at, submitted_at, correct_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const insertQuestion = db.prepare(`
      INSERT INTO attempt_questions (attempt_id, question_id, position) VALUES (?, ?, ?)
    `)
    const insertAnswer = db.prepare(`
      INSERT INTO attempt_answers (attempt_id, question_id, answer) VALUES (?, ?, ?)
    `)
    let addedAttempts = 0
    for (const attempt of value.attempts as Attempt[]) {
      const id = importedAttemptId(targetId, attempt.id)
      if (existsForTarget.get(attempt.id, targetId) || exists.get(id)) continue
      insertAttempt.run(id, targetId, position++, attempt.mode, attempt.startedAt,
        attempt.submittedAt ?? null, attempt.correctCount ?? null)
      attempt.questionIds.forEach((questionId, index) => insertQuestion.run(id, questionId, index))
      Object.entries(attempt.answers).forEach(([questionId, answer]) => insertAnswer.run(id, questionId, answer))
      addedAttempts++
    }
    const insertWrong = db.prepare('INSERT OR IGNORE INTO wrong_questions (user_id, question_id) VALUES (?, ?)')
    let addedWrong = 0
    for (const id of value.wrongIds as string[]) addedWrong += insertWrong.run(targetId, id).changes
    return { attempts: addedAttempts, wrongQuestions: addedWrong }
  })()
}
