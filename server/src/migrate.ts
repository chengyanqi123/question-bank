import { chmodSync, existsSync, readFileSync, readdirSync, renameSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSchema, openDatabase, type Device, type Question } from './db.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = process.env.QUESTION_BANK_DATA_DIR ?? path.resolve(directory, '../data')
const databasePath = path.join(dataDirectory, 'question-bank.sqlite')
const temporaryPath = `${databasePath}.migrating`
const legacyIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const visitorIdPattern = /^[0-9a-f]{16,64}$/i

if (existsSync(databasePath) || existsSync(temporaryPath)) {
  throw new Error(`数据库或迁移临时文件已存在：${databasePath}；为避免覆盖数据，已停止导入`)
}

const questions = JSON.parse(readFileSync(path.join(dataDirectory, 'questions.json'), 'utf8')) as Question[]
const users = new Map<string, Device>()
const legacyPath = path.join(dataDirectory, 'progress.json')
if (existsSync(legacyPath)) {
  const legacy = JSON.parse(readFileSync(legacyPath, 'utf8')) as Record<string, Device>
  for (const [id, user] of Object.entries(legacy)) {
    if (!legacyIdPattern.test(id)) throw new Error('旧进度文件包含无效的用户 ID，已停止导入')
    users.set(id, user)
  }
}

const usersDirectory = path.join(dataDirectory, 'users')
if (existsSync(usersDirectory)) {
  for (const filename of readdirSync(usersDirectory).filter((name) => name.endsWith('.json'))) {
    const id = filename.slice(0, -5)
    if (!visitorIdPattern.test(id) && !legacyIdPattern.test(id)) {
      throw new Error(`用户文件名包含无效的 ID：${filename}`)
    }
    const newer = JSON.parse(readFileSync(path.join(usersDirectory, filename), 'utf8')) as Device
    const older = users.get(id)
    users.set(id, older ? {
      attempts: [...new Map([...older.attempts, ...newer.attempts].map((item) => [item.id, item])).values()],
      wrongIds: [...new Set([...older.wrongIds, ...newer.wrongIds])],
    } : newer)
  }
}

const db = openDatabase(temporaryPath, true)
try {
  chmodSync(temporaryPath, 0o600)
  createSchema(db)
  db.transaction(() => {
    const insertQuestion = db.prepare(`
      INSERT INTO questions (id, position, type, category, source, prompt, options, answer, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    questions.forEach((question, index) => insertQuestion.run(
      question.id, index, question.type, question.category, question.source,
      question.prompt, JSON.stringify(question.options), question.answer, question.note ?? null,
    ))

    const insertUser = db.prepare('INSERT INTO users (id) VALUES (?)')
    const insertAttempt = db.prepare(`
      INSERT INTO attempts (id, user_id, position, mode, started_at, submitted_at, correct_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const insertAttemptQuestion = db.prepare(`
      INSERT INTO attempt_questions (attempt_id, question_id, position) VALUES (?, ?, ?)
    `)
    const insertAnswer = db.prepare(`
      INSERT INTO attempt_answers (attempt_id, question_id, answer) VALUES (?, ?, ?)
    `)
    const insertWrong = db.prepare('INSERT OR IGNORE INTO wrong_questions (user_id, question_id) VALUES (?, ?)')

    for (const [id, user] of users) {
      insertUser.run(id)
      user.attempts.forEach((attempt, position) => {
        insertAttempt.run(
          attempt.id, id, position, attempt.mode, attempt.startedAt,
          attempt.submittedAt ?? null, attempt.correctCount ?? null,
        )
        attempt.questionIds.forEach((questionId, index) => insertAttemptQuestion.run(attempt.id, questionId, index))
        for (const [questionId, answer] of Object.entries(attempt.answers)) {
          insertAnswer.run(attempt.id, questionId, answer)
        }
      })
      user.wrongIds.forEach((questionId) => insertWrong.run(id, questionId))
    }
  })()

  const counts = Object.fromEntries(['questions', 'users', 'attempts', 'attempt_questions', 'attempt_answers', 'wrong_questions']
    .map((table) => [table, (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count]))
  db.close()
  renameSync(temporaryPath, databasePath)
  console.log(`导入完成：${databasePath}`)
  console.log(counts)
  console.log('原 JSON 文件未删除，请在核对和备份后再自行归档。')
} catch (error) {
  if (db.open) db.close()
  if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
  throw error
}
