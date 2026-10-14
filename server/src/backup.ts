import Database from 'better-sqlite3'
import { chmodSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const destination = process.argv[2] === '--' ? process.argv[3] : process.argv[2]
if (!destination) throw new Error('请提供备份文件路径：pnpm backup:prod -- /备份目录/question-bank.sqlite')
if (existsSync(destination)) throw new Error(`备份文件已存在：${destination}`)

const directory = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = process.env.QUESTION_BANK_DATA_DIR ?? path.resolve(directory, '../data')
const source = path.join(dataDirectory, 'question-bank.sqlite')
const db = new Database(source, { readonly: true, fileMustExist: true })
try {
  await db.backup(destination)
  chmodSync(destination, 0o600)
  console.log(`数据库备份完成：${destination}`)
} finally {
  db.close()
}
