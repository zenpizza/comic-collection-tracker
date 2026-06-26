import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startTestDb } from './testDb.js'
import { getOrCreateAccount } from '../accounts.js'

describe('accounts', () => {
  let db
  let stop

  beforeAll(async () => {
    const testDb = await startTestDb()
    db = testDb.db
    stop = testDb.stop
  })

  afterAll(async () => {
    await stop()
  })

  it('creates an account on first call for a new userId', async () => {
    const account = await getOrCreateAccount(db, { userId: 'user_1', email: 'one@example.com' })

    expect(account.userId).toBe('user_1')
    expect(account.email).toBe('one@example.com')
    expect(account.createdAt).toBeTruthy()

    const stored = await db.collection('accounts').findOne({ userId: 'user_1' })
    expect(stored).not.toBeNull()
  })

  it('is idempotent: a second call for the same userId does not create a duplicate or change createdAt', async () => {
    const first = await getOrCreateAccount(db, { userId: 'user_2', email: 'two@example.com' })
    const second = await getOrCreateAccount(db, { userId: 'user_2', email: 'two@example.com' })

    expect(second.createdAt).toBe(first.createdAt)

    const count = await db.collection('accounts').countDocuments({ userId: 'user_2' })
    expect(count).toBe(1)
  })
})
