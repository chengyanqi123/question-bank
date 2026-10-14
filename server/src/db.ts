import Database from 'better-sqlite3'

export type Choice = 'A' | 'B' | 'C' | 'D'
export type Answer = Choice | '正确' | '错误'
export type Question = {
  id: string
  type: 'choice' | 'boolean'
  category: string
  source: string
  prompt: string
  options: { key: Choice; text: string }[]
  answer: Answer
  note?: string
}
export type Attempt = {
  id: string
  mode: 'exam' | 'wrong'
  questionIds: string[]
  answers: Record<string, Answer>
  startedAt: string
  submittedAt?: string
  correctCount?: number
}
export type Device = { attempts: Attempt[]; wrongIds: string[] }
export type Sqlite = Database.Database

type QuestionRow = Omit<Question, 'options' | 'note'> & { options: string; note: string | null }
type AttemptRow = {
  id: string; mode: Attempt['mode']; startedAt: string
  submittedAt: string | null; correctCount: number | null
}

export function openDatabase(filename: string, create = false): Sqlite {
  const db = new Database(filename, { fileMustExist: !create })
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

export function createSchema(db: Sqlite) {
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE questions (
      id TEXT PRIMARY KEY, position INTEGER NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('choice', 'boolean')),
      category TEXT NOT NULL, source TEXT NOT NULL, prompt TEXT NOT NULL,
      options TEXT NOT NULL, answer TEXT NOT NULL, note TEXT
    );
    CREATE TABLE attempts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('exam', 'wrong')),
      started_at TEXT NOT NULL, submitted_at TEXT, correct_count INTEGER,
      UNIQUE (user_id, position)
    );
    CREATE TABLE attempt_questions (
      attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES questions(id), position INTEGER NOT NULL,
      PRIMARY KEY (attempt_id, question_id), UNIQUE (attempt_id, position)
    );
    CREATE TABLE attempt_answers (
      attempt_id TEXT NOT NULL, question_id TEXT NOT NULL, answer TEXT NOT NULL,
      PRIMARY KEY (attempt_id, question_id),
      FOREIGN KEY (attempt_id, question_id)
        REFERENCES attempt_questions(attempt_id, question_id) ON DELETE CASCADE
    );
    CREATE TABLE wrong_questions (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES questions(id),
      PRIMARY KEY (user_id, question_id)
    );
    CREATE INDEX attempts_by_user ON attempts(user_id, position);
  `)
}

export function listQuestions(db: Sqlite): Question[] {
  const rows = db.prepare<[], QuestionRow>(`
    SELECT id, type, category, source, prompt, options, answer, note
    FROM questions ORDER BY position
  `).all()
  return rows.map(({ options, note, ...row }) => ({
    ...row, options: JSON.parse(options) as Question['options'], ...(note === null ? {} : { note }),
  }))
}

export function userExists(db: Sqlite, id: string): boolean {
  return !!db.prepare<[string], { id: string }>('SELECT id FROM users WHERE id = ?').get(id)
}

export function ensureUser(db: Sqlite, id: string) {
  db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)').run(id)
}

export function mergeUserIds(db: Sqlite, oldId: string, newId: string) {
  if (oldId === newId || !userExists(db, oldId)) return
  db.transaction(() => {
    ensureUser(db, newId)
    const mergedWrong = [...new Set([...wrongIds(db, oldId), ...wrongIds(db, newId)])]
    db.prepare('UPDATE attempts SET position = -position - 1 WHERE user_id = ?').run(newId)
    const oldAttempts = db.prepare<[string], { id: string }>(
      'SELECT id FROM attempts WHERE user_id = ? ORDER BY position'
    ).all(oldId)
    const move = db.prepare('UPDATE attempts SET user_id = ?, position = ? WHERE id = ?')
    oldAttempts.forEach(({ id }, index) => move.run(newId, index, id))
    db.prepare('UPDATE attempts SET position = -position - 1 + ? WHERE user_id = ? AND position < 0')
      .run(oldAttempts.length, newId)
    db.prepare('DELETE FROM wrong_questions WHERE user_id = ?').run(newId)
    const insertWrong = db.prepare('INSERT INTO wrong_questions (user_id, question_id) VALUES (?, ?)')
    mergedWrong.forEach((id) => insertWrong.run(newId, id))
    db.prepare('DELETE FROM users WHERE id = ?').run(oldId)
  })()
}

export function wrongIds(db: Sqlite, userId: string): string[] {
  return db.prepare<[string], { question_id: string }>(
    'SELECT question_id FROM wrong_questions WHERE user_id = ? ORDER BY rowid'
  ).all(userId).map((row) => row.question_id)
}

export function countWrongQuestions(db: Sqlite, userId: string, type?: Question['type']): number {
  if (type) return db.prepare<[string, Question['type']], { count: number }>(`
    SELECT COUNT(*) AS count FROM wrong_questions w
    JOIN questions q ON q.id = w.question_id
    WHERE w.user_id = ? AND q.type = ?
  `).get(userId, type)!.count
  return db.prepare<[string], { count: number }>(
    'SELECT COUNT(*) AS count FROM wrong_questions WHERE user_id = ?'
  ).get(userId)!.count
}

export function listWrongIdsPage(db: Sqlite, userId: string, limit: number, offset: number, type?: Question['type']): string[] {
  if (type) return db.prepare<[string, Question['type'], number, number], { question_id: string }>(`
    SELECT w.question_id FROM wrong_questions w
    JOIN questions q ON q.id = w.question_id
    WHERE w.user_id = ? AND q.type = ? ORDER BY w.rowid LIMIT ? OFFSET ?
  `).all(userId, type, limit, offset).map((row) => row.question_id)
  return db.prepare<[string, number, number], { question_id: string }>(
    'SELECT question_id FROM wrong_questions WHERE user_id = ? ORDER BY rowid LIMIT ? OFFSET ?'
  ).all(userId, limit, offset).map((row) => row.question_id)
}

function hydrateAttempt(db: Sqlite, row: AttemptRow): Attempt {
  const questionIds = db.prepare<[string], { question_id: string }>(
    'SELECT question_id FROM attempt_questions WHERE attempt_id = ? ORDER BY position'
  ).all(row.id).map((item) => item.question_id)
  const answerRows = db.prepare<[string], { question_id: string; answer: Answer }>(
    'SELECT question_id, answer FROM attempt_answers WHERE attempt_id = ?'
  ).all(row.id)
  return {
    id: row.id, mode: row.mode, questionIds,
    answers: Object.fromEntries(answerRows.map((item) => [item.question_id, item.answer])),
    startedAt: row.startedAt,
    ...(row.submittedAt === null ? {} : { submittedAt: row.submittedAt }),
    ...(row.correctCount === null ? {} : { correctCount: row.correctCount }),
  }
}

const attemptColumns = `
  id, mode, started_at AS startedAt, submitted_at AS submittedAt,
  correct_count AS correctCount
`

export function getAttempt(db: Sqlite, userId: string, id: string): Attempt | undefined {
  const row = db.prepare<[string, string], AttemptRow>(
    `SELECT ${attemptColumns} FROM attempts WHERE user_id = ? AND id = ?`
  ).get(userId, id)
  return row && hydrateAttempt(db, row)
}

export function getActiveAttempt(db: Sqlite, userId: string): Attempt | undefined {
  const row = db.prepare<[string], AttemptRow>(`
    SELECT ${attemptColumns} FROM attempts
    WHERE user_id = ? AND submitted_at IS NULL ORDER BY position DESC LIMIT 1
  `).get(userId)
  return row && hydrateAttempt(db, row)
}

type AttemptSummaryRow = {
  id: string; mode: Attempt['mode']; total: number; answered: number
  startedAt: string; submittedAt: string | null; correctCount: number | null
}

const attemptSummaryQuery = `
    SELECT a.id, a.mode, a.started_at AS startedAt, a.submitted_at AS submittedAt,
      a.correct_count AS correctCount,
      (SELECT COUNT(*) FROM attempt_questions WHERE attempt_id = a.id) AS total,
      (SELECT COUNT(*) FROM attempt_answers WHERE attempt_id = a.id) AS answered
    FROM attempts a WHERE a.user_id = ?
  `

export function listAttempts(db: Sqlite, userId: string): AttemptSummaryRow[] {
  return db.prepare<[string], AttemptSummaryRow>(`${attemptSummaryQuery} ORDER BY a.position DESC`).all(userId)
}

export function countAttempts(db: Sqlite, userId: string, mode?: Attempt['mode']): number {
  if (mode) return db.prepare<[string, Attempt['mode']], { count: number }>(
    'SELECT COUNT(*) AS count FROM attempts WHERE user_id = ? AND mode = ?'
  ).get(userId, mode)!.count
  return db.prepare<[string], { count: number }>(
    'SELECT COUNT(*) AS count FROM attempts WHERE user_id = ?'
  ).get(userId)!.count
}

export function listAttemptsPage(db: Sqlite, userId: string, limit: number, offset: number, mode?: Attempt['mode']): AttemptSummaryRow[] {
  if (mode) return db.prepare<[string, Attempt['mode'], number, number], AttemptSummaryRow>(
    `${attemptSummaryQuery} AND a.mode = ? ORDER BY a.position DESC LIMIT ? OFFSET ?`
  ).all(userId, mode, limit, offset)
  return db.prepare<[string, number, number], AttemptSummaryRow>(
    `${attemptSummaryQuery} ORDER BY a.position DESC LIMIT ? OFFSET ?`
  ).all(userId, limit, offset)
}

export function createAttempt(db: Sqlite, userId: string, attempt: Attempt) {
  db.transaction(() => {
    const position = db.prepare<[string], { position: number }>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM attempts WHERE user_id = ?'
    ).get(userId)!.position
    db.prepare(`
      INSERT INTO attempts (id, user_id, position, mode, started_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(attempt.id, userId, position, attempt.mode, attempt.startedAt)
    const insertQuestion = db.prepare(`
      INSERT INTO attempt_questions (attempt_id, question_id, position) VALUES (?, ?, ?)
    `)
    attempt.questionIds.forEach((id, index) => insertQuestion.run(attempt.id, id, index))
  })()
}

export function recordAnswer(db: Sqlite, userId: string, attemptId: string, questionId: string, answer: Answer): number | undefined {
  return db.transaction(() => {
    const attempt = db.prepare<[string, string], { submitted_at: string | null }>(
      'SELECT submitted_at FROM attempts WHERE id = ? AND user_id = ?'
    ).get(attemptId, userId)
    if (!attempt || attempt.submitted_at) return
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO attempt_answers (attempt_id, question_id, answer)
      VALUES (?, ?, ?)
    `).run(attemptId, questionId, answer)
    if (!inserted.changes) return
    return db.prepare<[string], { count: number }>(
      'SELECT COUNT(*) AS count FROM attempt_answers WHERE attempt_id = ?'
    ).get(attemptId)!.count
  })()
}

export function submitAttempt(db: Sqlite, userId: string, attempt: Attempt, byId: Map<string, Question>): Attempt {
  if (attempt.submittedAt) return attempt
  db.transaction(() => {
    const current = getAttempt(db, userId, attempt.id)!
    if (current.submittedAt) return
    let correctCount = 0
    const addWrong = db.prepare('INSERT OR IGNORE INTO wrong_questions (user_id, question_id) VALUES (?, ?)')
    const removeWrong = db.prepare('DELETE FROM wrong_questions WHERE user_id = ? AND question_id = ?')
    for (const id of current.questionIds) {
      if (current.answers[id] === byId.get(id)!.answer) {
        correctCount++
        removeWrong.run(userId, id)
      } else {
        addWrong.run(userId, id)
      }
    }
    db.prepare(`
      UPDATE attempts SET submitted_at = ?, correct_count = ? WHERE id = ?
    `).run(new Date().toISOString(), correctCount, attempt.id)
  })()
  return getAttempt(db, userId, attempt.id)!
}
