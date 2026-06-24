import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startTestDb } from './testDb.js'
import { ensureIndexes, createAsset, findAssetByIdentityKey, getAsset } from '../coverAssets.js'

describe('coverAssets', () => {
  let db
  let stop

  beforeAll(async () => {
    const testDb = await startTestDb()
    db = testDb.db
    stop = testDb.stop
    await ensureIndexes(db)
  })

  afterAll(async () => {
    await stop()
  })

  it('creates a new asset when none exists for the identity key', async () => {
    const asset = await createAsset(db, {
      identityKey: 'comicvine|12345',
      images: { medium: { data: 'abc' } },
      metadata: { source: 'comicvine' },
    })

    expect(asset._id).toBeTruthy()
    expect(asset.identityKey).toBe('comicvine|12345')

    const found = await findAssetByIdentityKey(db, 'comicvine|12345')
    expect(found._id.toString()).toBe(asset._id.toString())
  })

  it('reuses the existing asset on a duplicate-key race instead of throwing', async () => {
    const key = 'comicvine|99999'
    const [first, second] = await Promise.all([
      createAsset(db, { identityKey: key, images: { medium: { data: 'a' } } }),
      createAsset(db, { identityKey: key, images: { medium: { data: 'b' } } }),
    ])

    expect(first._id.toString()).toBe(second._id.toString())

    const count = await db.collection('coverAssets').countDocuments({ identityKey: key })
    expect(count).toBe(1)
  })

  it('getAsset returns the asset by id', async () => {
    const asset = await createAsset(db, { identityKey: 'comicvine|55555', images: {} })
    const fetched = await getAsset(db, asset._id)
    expect(fetched.identityKey).toBe('comicvine|55555')
  })

  it('findAssetByIdentityKey returns null when nothing matches', async () => {
    const result = await findAssetByIdentityKey(db, 'comicvine|does-not-exist')
    expect(result).toBeNull()
  })

  it('allows multiple private assets with no identityKey (no unique-index collision)', async () => {
    const a = await createAsset(db, { identityKey: null, images: { medium: { data: 'p1' } } })
    const b = await createAsset(db, { identityKey: null, images: { medium: { data: 'p2' } } })

    expect(a._id.toString()).not.toBe(b._id.toString())
  })

  it('accepts a pre-generated _id so the asset id can be used as a storage key before insertion', async () => {
    const { ObjectId } = await import('mongodb')
    const preGeneratedId = new ObjectId()

    const asset = await createAsset(db, { _id: preGeneratedId, identityKey: null, images: {} })

    expect(asset._id.toString()).toBe(preGeneratedId.toString())
  })
})
