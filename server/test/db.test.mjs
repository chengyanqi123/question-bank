import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  countAttempts, countWrongQuestions, createAttempt, createSchema, ensureUser,
  getActiveAttempt, getAttempt, listAttempts, listAttemptsPage, listWrongIdsPage,
  mergeUserIds, openDatabase, recordAnswer, submitAttempt, wrongIds,
} from '../dist/db.js'

test('answers, submission and legacy user merge remain consistent', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'question-bank-db-'))
  const db = openDatabase(path.join(directory, 'test.sqlite'), true)
  try {
    createSchema(db)
    for (const [position, id, answer] of [[0, 'q1', 'A'], [1, 'q2', '正确']]) {
      db.prepare(`
        INSERT INTO questions (id, position, type, category, source, prompt, options, answer)
        VALUES (?, ?, ?, '', '', '', '[]', ?)
      `).run(id, position, id === 'q1' ? 'choice' : 'boolean', answer)
    }
    const oldId = '00000000-0000-0000-0000-000000000001'
    const newId = '1234567890abcdef'
    ensureUser(db, oldId)
    ensureUser(db, newId)
    createAttempt(db, oldId, {
      id: 'old', mode: 'exam', questionIds: ['q1', 'q2'], answers: {}, startedAt: '2026-01-01',
    })
    createAttempt(db, newId, {
      id: 'new', mode: 'exam', questionIds: ['q1'], answers: {}, startedAt: '2026-01-02',
    })
    db.prepare('INSERT INTO wrong_questions (user_id, question_id) VALUES (?, ?)').run(oldId, 'q1')
    db.prepare('INSERT INTO wrong_questions (user_id, question_id) VALUES (?, ?)').run(newId, 'q2')
    mergeUserIds(db, oldId, newId)
    assert.deepEqual(listAttempts(db, newId).map((item) => item.id), ['new', 'old'])
    assert.deepEqual(wrongIds(db, newId), ['q1', 'q2'])
    assert.equal(getAttempt(db, oldId, 'old'), undefined)
    assert.equal(getActiveAttempt(db, newId)?.id, 'new')

    assert.equal(recordAnswer(db, newId, 'old', 'q1', 'A'), 1)
    assert.equal(recordAnswer(db, newId, 'old', 'q1', 'B'), undefined)
    const submitted = submitAttempt(db, newId, getAttempt(db, newId, 'old'), new Map([
      ['q1', { answer: 'A' }], ['q2', { answer: '正确' }],
    ]))
    assert.equal(submitted.correctCount, 1)
    assert.deepEqual(wrongIds(db, newId), ['q2'])
    assert.equal(recordAnswer(db, newId, 'old', 'q2', '正确'), undefined)
    assert.equal(submitAttempt(db, newId, submitted, new Map()).correctCount, 1)
  } finally {
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('record and wrong-question pages contain 20 items and preserve order', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'question-bank-pages-'))
  const db = openDatabase(path.join(directory, 'test.sqlite'), true)
  try {
    createSchema(db)
    const userId = '1234567890abcdef'
    ensureUser(db, userId)
    const insertQuestion = db.prepare(`
      INSERT INTO questions (id, position, type, category, source, prompt, options, answer)
      VALUES (?, ?, ?, '', '', '', '[]', ?)
    `)
    const insertWrong = db.prepare('INSERT INTO wrong_questions (user_id, question_id) VALUES (?, ?)')
    const insertAttempt = db.prepare(`
      INSERT INTO attempts (id, user_id, position, mode, started_at)
      VALUES (?, ?, ?, ?, '2026-01-01')
    `)
    for (let index = 0; index < 43; index++) {
      insertQuestion.run(`q${index}`, index, index % 2 ? 'boolean' : 'choice', index % 2 ? '正确' : 'A')
      insertWrong.run(userId, `q${index}`)
      insertAttempt.run(`a${index}`, userId, index, index % 2 ? 'wrong' : 'exam')
    }

    assert.equal(countAttempts(db, userId), 43)
    assert.equal(countWrongQuestions(db, userId), 43)
    assert.deepEqual([0, 20, 40].map((offset) => listAttemptsPage(db, userId, 20, offset).length), [20, 20, 3])
    assert.deepEqual([0, 20, 40].map((offset) => listWrongIdsPage(db, userId, 20, offset).length), [20, 20, 3])
    assert.equal(listAttemptsPage(db, userId, 20, 20)[0].id, 'a22')
    assert.equal(listWrongIdsPage(db, userId, 20, 20)[0], 'q20')
    assert.equal(countAttempts(db, userId, 'exam'), 22)
    assert.equal(countAttempts(db, userId, 'wrong'), 21)
    assert.deepEqual([0, 20].map((offset) => listAttemptsPage(db, userId, 20, offset, 'exam').length), [20, 2])
    assert.deepEqual([0, 20].map((offset) => listAttemptsPage(db, userId, 20, offset, 'wrong').length), [20, 1])
    assert.equal(listAttemptsPage(db, userId, 20, 20, 'exam')[0].id, 'a2')
    assert.equal(countWrongQuestions(db, userId, 'choice'), 22)
    assert.equal(countWrongQuestions(db, userId, 'boolean'), 21)
    assert.deepEqual([0, 20].map((offset) => listWrongIdsPage(db, userId, 20, offset, 'choice').length), [20, 2])
    assert.deepEqual([0, 20].map((offset) => listWrongIdsPage(db, userId, 20, offset, 'boolean').length), [20, 1])
    assert.equal(listWrongIdsPage(db, userId, 20, 20, 'choice')[0], 'q40')
  } finally {
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
