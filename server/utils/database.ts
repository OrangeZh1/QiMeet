import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'

let pool: Pool | undefined
export function database() {
  if (pool) return pool
  if (!process.env.QI_DATABASE_URL) throw new Error('QI_DATABASE_URL is required')
  const url = new URL(process.env.QI_DATABASE_URL)
  pool = mysql.createPool({
    host: url.hostname, port: Number(url.port || 3306),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    timezone: 'Z', dateStrings: true, connectionLimit: 8, charset: 'utf8mb4',
  })
  return pool
}
export async function rows<T>(sql: string, params: unknown[] = [], db: Pool | PoolConnection = database()) {
  const [result] = await db.execute<RowDataPacket[]>(sql, params as never[])
  return result as T[]
}
export async function first<T>(sql: string, params: unknown[] = [], db?: PoolConnection) {
  return (await rows<T>(sql, params, db))[0]
}
export async function mutate(sql: string, params: unknown[], db: Pool | PoolConnection = database()) {
  const [result] = await db.execute<ResultSetHeader>(sql, params as never[])
  return result
}
export async function transaction<T>(fn: (db: PoolConnection) => Promise<T>) {
  const db = await database().getConnection()
  try {
    await db.beginTransaction()
    const result = await fn(db)
    await db.commit()
    return result
  } catch (error) {
    await db.rollback()
    throw error
  } finally {
    db.release()
  }
}
export const iso = (value: string) => new Date(value.replace(' ', 'T') + 'Z').toISOString()
export const utc = (value = new Date()) => value.toISOString().slice(0, 23).replace('T', ' ')
export const isDuplicate = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY'
