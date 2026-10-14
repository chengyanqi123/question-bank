import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  createAttempt, createSchema, ensureUser, getAttempt, listAttempts, openDatabase,
  recordAnswer, wrongIds,
} from '../dist/db.js'
import { exportMigrationData, importMigrationData, MigrationError } from '../dist/migration-data.js'

test('migration appends records and wrong questions without changing existing data', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'question-bank-migration-'))
  const db = openDatabase(path.join(directory, 'test.sqlite'), true)
  const source = 'aaaaaaaaaaaaaaaa'
  const target = 'bbbbbbbbbbbbbbbb'
  try {
    createSchema(db)
    db.prepare(`
      INSERT INTO questions (id, position, type, category, source, prompt, options, answer)
      VALUES (?, ?, 'choice', '', '', '', '[]', 'A')
    `).run('q1', 0)
    db.prepare(`
      INSERT INTO questions (id, position, type, category, source, prompt, options, answer)
      VALUES (?, ?, 'boolean', '', '', '', '[]', '正确')
    `).run('q2', 1)
    ensureUser(db, source)
    ensureUser(db, target)
    createAttempt(db, source, {
      id: 'source-attempt', mode: 'exam', questionIds: ['q1', 'q2'],
      answers: {}, startedAt: '2026-01-01',
    })
    recordAnswer(db, source, 'source-attempt', 'q1', 'A')
    db.prepare('UPDATE attempts SET submitted_at = ?, correct_count = ? WHERE id = ?')
      .run('2026-01-02', 1, 'source-attempt')
    createAttempt(db, target, {
      id: 'target-attempt', mode: 'wrong', questionIds: ['q2'],
      answers: {}, startedAt: '2026-01-03',
    })
    db.prepare('INSERT INTO wrong_questions (user_id, question_id) VALUES (?, ?)').run(source, 'q1')
    db.prepare('INSERT INTO wrong_questions (user_id, question_id) VALUES (?, ?)').run(target, 'q2')

    const data = exportMigrationData(db, source)
    assert.equal(data.sourceId, source)
    assert.deepEqual(data.attempts[0].answers, { q1: 'A' })
    assert.deepEqual(importMigrationData(db, target, data), { attempts: 1, wrongQuestions: 1 })
    const importedId = listAttempts(db, target)[0].id
    assert.notEqual(importedId, 'source-attempt')
    assert.deepEqual(listAttempts(db, target).map(({ id }) => id), [importedId, 'target-attempt'])
    assert.deepEqual(getAttempt(db, target, importedId), { ...data.attempts[0], id: importedId })
    assert.deepEqual(getAttempt(db, target, 'target-attempt')?.questionIds, ['q2'])
    assert.deepEqual(getAttempt(db, source, 'source-attempt'), data.attempts[0])
    assert.deepEqual(wrongIds(db, target), ['q2', 'q1'])
    assert.deepEqual(importMigrationData(db, target, data), { attempts: 0, wrongQuestions: 0 })
    assert.deepEqual(listAttempts(db, target).map(({ id }) => id), [importedId, 'target-attempt'])

    assert.throws(() => importMigrationData(db, source, data), MigrationError)
    assert.deepEqual(listAttempts(db, source).map(({ id }) => id), ['source-attempt'])
    assert.throws(() => importMigrationData(db, target, {
      ...data, attempts: [...data.attempts, { ...data.attempts[0], id: 'missing-question', questionIds: ['missing'] }],
    }), MigrationError)
    assert.deepEqual(listAttempts(db, target).map(({ id }) => id), [importedId, 'target-attempt'])

    db.prepare('DELETE FROM users WHERE id = ?').run(source)
    const offlineTarget = 'cccccccccccccccc'
    assert.deepEqual(importMigrationData(db, offlineTarget, data), { attempts: 1, wrongQuestions: 1 })
    assert.equal(getAttempt(db, offlineTarget, listAttempts(db, offlineTarget)[0].id)?.answers.q1, 'A')
    assert.deepEqual(importMigrationData(db, target, {
      ...data, attempts: [{ ...data.attempts[0], id: 'target-attempt' }], wrongIds: [],
    }), { attempts: 0, wrongQuestions: 0 })
  } finally {
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
