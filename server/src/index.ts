import express, { type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  countAttempts, countWrongQuestions, createAttempt as insertAttempt, ensureUser, getActiveAttempt,
  getAttempt, listAttempts, listAttemptsPage, listQuestions, listWrongIdsPage, mergeUserIds,
  openDatabase, recordAnswer, submitAttempt, userExists, wrongIds,
  type Answer, type Attempt, type Question,
} from './db.js'
import { exportMigrationData, importMigrationData, MigrationError } from './migration-data.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = process.env.QUESTION_BANK_DATA_DIR ?? path.resolve(directory, '../data')
const databasePath = path.join(dataDirectory, 'question-bank.sqlite')
if (!existsSync(databasePath)) {
  throw new Error(`未找到数据库 ${databasePath}，请先运行 pnpm migrate`)
}
const db = openDatabase(databasePath)
db.pragma('journal_mode = WAL')
const questions = listQuestions(db)
const byId = new Map(questions.map((question) => [question.id, question]))
const legacyIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const visitorIdPattern = /^[0-9a-f]{16,64}$/i
const pageSize = 20

function pageNumber(req: Request, res: Response): number | undefined {
  const page = Number(req.query.page ?? 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > Math.floor(Number.MAX_SAFE_INTEGER / pageSize)) {
    res.status(400).json({ error: '无效的页码' })
    return
  }
  return page
}

function device(req: Request, res: Response): string | undefined {
  const id = req.header('x-visitor-id')
  if (!id || !visitorIdPattern.test(id)) {
    res.status(400).json({ error: '无效的设备标识' })
    return
  }
  const legacyId = req.header('x-legacy-device-id')
  if (legacyId && legacyIdPattern.test(legacyId) && userExists(db, legacyId)) {
    mergeUserIds(db, legacyId, id)
  }
  ensureUser(db, id)
  return id
}

function findAttempt(owner: string, id: string, res: Response): Attempt | undefined {
  const attempt = getAttempt(db, owner, id)
  if (!attempt) res.status(404).json({ error: '未找到考试记录' })
  return attempt
}

function publicQuestion(question: Question) {
  const { answer: _answer, note: _note, ...safe } = question
  return safe
}

function reviewedQuestion(question: Question, userAnswer: Answer | null) {
  return { ...question, userAnswer, correct: userAnswer === question.answer }
}

function detail(attempt: Attempt) {
  return {
    ...attempt,
    total: attempt.questionIds.length,
    questions: attempt.questionIds.map((id) => {
      const question = byId.get(id)!
      const userAnswer = attempt.answers[id] ?? null
      return attempt.submittedAt || userAnswer !== null
        ? reviewedQuestion(question, userAnswer)
        : publicQuestion(question)
    }),
  }
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function uniqueQuestions(type: Question['type']) {
  const seen = new Set<string>()
  return questions.filter((question) => {
    if (question.type !== type) return false
    const key = JSON.stringify([question.prompt, question.options])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function createAttempt(owner: string, mode: Attempt['mode'], selected: Question[]): Attempt {
  const attempt: Attempt = {
    id: randomUUID(), mode, questionIds: selected.map((item) => item.id),
    answers: {}, startedAt: new Date().toISOString(),
  }
  insertAttempt(db, owner, attempt)
  return attempt
}

const choicePool = uniqueQuestions('choice')
const booleanPool = uniqueQuestions('boolean')
if (choicePool.length < 50 || booleanPool.length < 50) {
  throw new Error('题库中选择题或判断题不足 50 道')
}

const app = express()
app.use('/api/migration/import', express.json({ limit: '100mb' }))
app.use(express.json({ limit: '16kb' }))

app.get('/api/migration/export', (req, res) => {
  const owner = device(req, res)
  if (owner) res.json(exportMigrationData(db, owner))
})

app.post('/api/migration/import', (req, res) => {
  const owner = device(req, res)
  if (!owner) return
  try {
    res.json(importMigrationData(db, owner, req.body))
  } catch (error) {
    if (error instanceof MigrationError) {
      res.status(error.status).json({ error: error.message })
      return
    }
    throw error
  }
})

app.post('/api/migration/code', (req, res) => {
  const owner = device(req, res)
  if (!owner) return
  const sourceId = req.body?.sourceId
  if (typeof sourceId !== 'string' || !visitorIdPattern.test(sourceId)) {
    res.status(400).json({ error: '无效的迁移口令' })
    return
  }
  if (sourceId === owner) {
    res.status(409).json({ error: '迁移口令与本设备 ID 相同，无需迁移' })
    return
  }
  if (!userExists(db, sourceId)) {
    res.status(404).json({ error: '未找到此口令对应的历史数据' })
    return
  }
  res.json(importMigrationData(db, owner, exportMigrationData(db, sourceId)))
})

app.get('/api/overview', (req, res) => {
  const owner = device(req, res)
  if (!owner) return
  const finished = listAttempts(db, owner).filter((attempt) => attempt.submittedAt)
  const active = getActiveAttempt(db, owner)
  res.json({
    bank: { choice: choicePool.length, boolean: booleanPool.length },
    examCount: finished.filter((attempt) => attempt.mode === 'exam').length,
    wrongCount: countWrongQuestions(db, owner),
    lastScore: finished.find((attempt) => attempt.mode === 'exam')?.correctCount ?? null,
    activeAttemptId: active?.id ?? null,
  })
})

app.post('/api/exams/quick', (req, res) => {
  const owner = device(req, res)
  if (!owner) return
  const active = getActiveAttempt(db, owner)
  if (active) {
    res.json(detail(active))
    return
  }
  const selected = [...shuffle(choicePool).slice(0, 50), ...shuffle(booleanPool).slice(0, 50)]
  res.status(201).json(detail(createAttempt(owner, 'exam', selected)))
})

app.post('/api/exams', (req, res) => {
  const owner = device(req, res)
  if (!owner) return
  const mode = req.body?.mode
  if (mode !== 'exam' && mode !== 'wrong') {
    res.status(400).json({ error: '无效的练习模式' })
    return
  }
  const selected = mode === 'exam'
    ? [...shuffle(choicePool).slice(0, 50), ...shuffle(booleanPool).slice(0, 50)]
    : shuffle(wrongIds(db, owner).map((id) => byId.get(id)).filter((item): item is Question => !!item))
  if (!selected.length) {
    res.status(400).json({ error: '暂无错题可重刷' })
    return
  }
  res.status(201).json(detail(createAttempt(owner, mode, selected)))
})

app.get('/api/exams', (req, res) => {
  const owner = device(req, res)
  if (!owner) return
  const page = pageNumber(req, res)
  if (!page) return
  const mode = req.query.mode
  if (mode !== undefined && mode !== 'exam' && mode !== 'wrong') {
    res.status(400).json({ error: '无效的记录类型' })
    return
  }
  res.json({
    items: listAttemptsPage(db, owner, pageSize, (page - 1) * pageSize, mode),
    total: countAttempts(db, owner, mode),
  })
})

app.get('/api/exams/:id', (req, res) => {
  const owner = device(req, res)
  if (!owner) return
  const attempt = findAttempt(owner, req.params.id as string, res)
  if (attempt) res.json(detail(attempt))
})

app.patch('/api/exams/:id/answers', (req, res) => {
  const owner = device(req, res)
  if (!owner) return
  const attempt = findAttempt(owner, req.params.id as string, res)
  if (!attempt) return
  if (attempt.submittedAt) {
    res.status(409).json({ error: '已交卷，无法修改答案' })
    return
  }
  const { questionId, answer } = req.body ?? {}
  const question = byId.get(questionId)
  if (!question || !attempt.questionIds.includes(questionId) ||
      !(question.type === 'choice'
        ? ['A', 'B', 'C', 'D'].includes(answer)
        : ['正确', '错误'].includes(answer))) {
    res.status(400).json({ error: '无效的答案' })
    return
  }
  if (Object.hasOwn(attempt.answers, questionId)) {
    res.status(409).json({ error: '本题已作答，不能修改答案' })
    return
  }
  const answered = recordAnswer(db, owner, attempt.id, questionId, answer)
  if (answered === undefined) {
    res.status(409).json({ error: '本题已作答，不能修改答案' })
    return
  }
  res.json({ answered, question: reviewedQuestion(question, answer) })
})

app.post('/api/exams/:id/submit', (req, res) => {
  const owner = device(req, res)
  if (!owner) return
  const attempt = findAttempt(owner, req.params.id as string, res)
  if (!attempt) return
  res.json(detail(submitAttempt(db, owner, attempt, byId)))
})

app.get('/api/wrong-questions', (req, res) => {
  const owner = device(req, res)
  if (!owner) return
  const page = pageNumber(req, res)
  if (!page) return
  const type = req.query.type
  if (type !== undefined && type !== 'choice' && type !== 'boolean') {
    res.status(400).json({ error: '无效的题目类型' })
    return
  }
  const items = listWrongIdsPage(db, owner, pageSize, (page - 1) * pageSize, type)
    .map((id) => byId.get(id)).filter((item): item is Question => !!item).map(publicQuestion)
  res.json({ items, total: countWrongQuestions(db, owner, type) })
})

const frontendDist = path.resolve(directory, '../../frontend/dist')
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')))
}

const port = Number(process.env.PORT) || 3001
app.listen(port, () => console.log(`题库服务运行在 http://localhost:${port}`))
