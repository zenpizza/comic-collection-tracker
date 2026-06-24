import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ObjectId } from 'mongodb'
import { startTestDb } from './testDb.js'
import { findOrCreateComicMetadata } from '../comicMetadata.js'
import {
  addToCollection,
  listCollection,
  removeFromCollection,
  getCollectionItem,
  updatePersonalFields,
  relinkComicMetadata,
  countCollectionsReferencing,
  upsertItem,
  userOwnsMetadata,
} from '../userComics.js'

describe('userComics', () => {
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

  it('saves a comic to an account collection and retrieves it with merged metadata fields', async () => {
    const metadata = await findOrCreateComicMetadata(db, {
      series: 'Saga', issueNumber: '1', publisher: 'Image', year: 2012,
    })

    await addToCollection(db, {
      userId: 'user_a',
      comicMetadataId: metadata._id,
      notes: 'first printing',
      dateAdded: '2024-01-01T00:00:00.000Z',
    })

    const collection = await listCollection(db, 'user_a')

    expect(collection).toHaveLength(1)
    expect(collection[0]).toMatchObject({
      series: 'Saga',
      issueNumber: '1',
      publisher: 'Image',
      year: 2012,
      notes: 'first printing',
      dateAdded: '2024-01-01T00:00:00.000Z',
    })
    expect(collection[0].id).toBeTruthy()
  })

  it('keeps each account collection isolated from other accounts', async () => {
    const metadataA = await findOrCreateComicMetadata(db, {
      series: 'Invincible', issueNumber: '1', publisher: 'Image', year: 2003,
    })
    const metadataB = await findOrCreateComicMetadata(db, {
      series: 'Bone', issueNumber: '1', publisher: 'Cartoon Books', year: 1991,
    })

    await addToCollection(db, { userId: 'user_b', comicMetadataId: metadataA._id, notes: '', dateAdded: '2024-02-01' })
    await addToCollection(db, { userId: 'user_c', comicMetadataId: metadataB._id, notes: '', dateAdded: '2024-02-02' })

    const collectionB = await listCollection(db, 'user_b')
    const collectionC = await listCollection(db, 'user_c')

    expect(collectionB.map((c) => c.series)).toEqual(['Invincible'])
    expect(collectionC.map((c) => c.series)).toEqual(['Bone'])
  })

  it('two accounts can each own the same issue, referencing the same shared metadata', async () => {
    const metadata = await findOrCreateComicMetadata(db, {
      series: 'Watchmen', issueNumber: '1', publisher: 'DC', year: 1986,
    })

    await addToCollection(db, { userId: 'user_d', comicMetadataId: metadata._id, notes: '', dateAdded: '2024-03-01' })
    await addToCollection(db, { userId: 'user_e', comicMetadataId: metadata._id, notes: '', dateAdded: '2024-03-02' })

    const collectionD = await listCollection(db, 'user_d')
    const collectionE = await listCollection(db, 'user_e')

    expect(collectionD).toHaveLength(1)
    expect(collectionE).toHaveLength(1)
    expect(collectionD[0].id).not.toBe(collectionE[0].id)
    expect(collectionD[0].series).toBe('Watchmen')
    expect(collectionE[0].series).toBe('Watchmen')
  })

  it('does not allow one account to remove another account\'s collection item', async () => {
    const metadata = await findOrCreateComicMetadata(db, {
      series: 'Sandman', issueNumber: '1', publisher: 'DC', year: 1989,
    })
    const item = await addToCollection(db, { userId: 'user_f', comicMetadataId: metadata._id, notes: '', dateAdded: '2024-04-01' })

    const deletedByWrongUser = await removeFromCollection(db, { userId: 'user_g', userComicId: item._id })
    expect(deletedByWrongUser).toBe(false)

    const stillThere = await listCollection(db, 'user_f')
    expect(stillThere).toHaveLength(1)

    const deletedByOwner = await removeFromCollection(db, { userId: 'user_f', userComicId: item._id })
    expect(deletedByOwner).toBe(true)

    const goneNow = await listCollection(db, 'user_f')
    expect(goneNow).toHaveLength(0)
  })

  it('getCollectionItem only returns the item when it belongs to the requesting account', async () => {
    const metadata = await findOrCreateComicMetadata(db, { series: 'Hellboy', issueNumber: '1', publisher: 'Dark Horse', year: 1994 })
    const item = await addToCollection(db, { userId: 'user_h', comicMetadataId: metadata._id, notes: '', dateAdded: '2024-05-01' })

    expect(await getCollectionItem(db, { userId: 'user_h', userComicId: item._id })).not.toBeNull()
    expect(await getCollectionItem(db, { userId: 'user_i', userComicId: item._id })).toBeNull()
  })

  it('updatePersonalFields updates notes without touching the shared metadata', async () => {
    const metadata = await findOrCreateComicMetadata(db, { series: 'Locke & Key', issueNumber: '1', publisher: 'IDW', year: 2008 })
    const item = await addToCollection(db, { userId: 'user_j', comicMetadataId: metadata._id, notes: 'old note', dateAdded: '2024-06-01' })

    await updatePersonalFields(db, { userId: 'user_j', userComicId: item._id, notes: 'new note' })

    const [updated] = await listCollection(db, 'user_j')
    expect(updated.notes).toBe('new note')
    expect(updated.series).toBe('Locke & Key')
  })

  it('relinkComicMetadata points the collection item at a new metadata record without mutating the old one', async () => {
    const original = await findOrCreateComicMetadata(db, { series: 'Paper Girls', issueNumber: '1', publisher: 'Image', year: 2015 })
    const item = await addToCollection(db, { userId: 'user_k', comicMetadataId: original._id, notes: '', dateAdded: '2024-07-01' })

    const corrected = await findOrCreateComicMetadata(db, { series: 'Paper Girls', issueNumber: '2', publisher: 'Image', year: 2015 })
    await relinkComicMetadata(db, { userId: 'user_k', userComicId: item._id, comicMetadataId: corrected._id })

    const [relinked] = await listCollection(db, 'user_k')
    expect(relinked.issueNumber).toBe('2')

    const untouchedOriginal = await db.collection('comicMetadata').findOne({ _id: original._id })
    expect(untouchedOriginal.issueNumber).toBe('1')
  })

  it('countCollectionsReferencing reflects how many accounts currently reference a metadata record', async () => {
    const metadata = await findOrCreateComicMetadata(db, { series: 'Y: The Last Man', issueNumber: '1', publisher: 'Vertigo', year: 2002 })
    await addToCollection(db, { userId: 'user_l', comicMetadataId: metadata._id, notes: '', dateAdded: '2024-08-01' })
    const itemM = await addToCollection(db, { userId: 'user_m', comicMetadataId: metadata._id, notes: '', dateAdded: '2024-08-02' })

    expect(await countCollectionsReferencing(db, metadata._id)).toBe(2)

    await removeFromCollection(db, { userId: 'user_m', userComicId: itemM._id })

    expect(await countCollectionsReferencing(db, metadata._id)).toBe(1)
  })

  describe('upsertItem', () => {
    it('creates a new collection item with metadata when no userComicId is given', async () => {
      const created = await upsertItem(db, {
        userId: 'user_n',
        userComicId: null,
        comic: { series: 'Monstress', issueNumber: '1', publisher: 'Image', year: 2015, notes: 'mint' },
      })

      expect(created.series).toBe('Monstress')
      expect(created.notes).toBe('mint')

      const [stored] = await listCollection(db, 'user_n')
      expect(stored.id).toBe(created.id)
    })

    it('updates personal fields in place when only personal fields change', async () => {
      const created = await upsertItem(db, {
        userId: 'user_o',
        userComicId: null,
        comic: { series: 'Pretty Deadly', issueNumber: '1', publisher: 'Image', year: 2013, notes: 'old' },
      })

      const updated = await upsertItem(db, {
        userId: 'user_o',
        userComicId: created.id,
        comic: { series: 'Pretty Deadly', issueNumber: '1', publisher: 'Image', year: 2013, notes: 'new' },
      })

      expect(updated.notes).toBe('new')
      expect(updated.comicMetadataId).toBe(created.comicMetadataId)
    })

    it('relinks to new shared metadata when a canonical field changes, without mutating the old metadata', async () => {
      const created = await upsertItem(db, {
        userId: 'user_p',
        userComicId: null,
        comic: { series: 'Bitch Planet', issueNumber: '1', publisher: 'Image', year: 2014 },
      })

      const updated = await upsertItem(db, {
        userId: 'user_p',
        userComicId: created.id,
        comic: { series: 'Bitch Planet', issueNumber: '2', publisher: 'Image', year: 2014 },
      })

      expect(updated.issueNumber).toBe('2')
      expect(updated.comicMetadataId).not.toBe(created.comicMetadataId)

      const untouchedOriginal = await db.collection('comicMetadata').findOne({ _id: new ObjectId(created.comicMetadataId) })
      expect(untouchedOriginal.issueNumber).toBe('1')
    })

    it('rejects updating a userComicId that belongs to a different account', async () => {
      const created = await upsertItem(db, {
        userId: 'user_q',
        userComicId: null,
        comic: { series: 'Rat Queens', issueNumber: '1', publisher: 'Image', year: 2013 },
      })

      await expect(
        upsertItem(db, { userId: 'user_r', userComicId: created.id, comic: { notes: 'hijacked' } })
      ).rejects.toThrow()
    })
  })

  describe('userOwnsMetadata', () => {
    it('returns true only for an account that has added the issue, false for others', async () => {
      const metadata = await findOrCreateComicMetadata(db, { series: 'East of West', issueNumber: '1', publisher: 'Image', year: 2013 })
      await addToCollection(db, { userId: 'user_s', comicMetadataId: metadata._id, notes: '', dateAdded: '2024-09-01' })

      expect(await userOwnsMetadata(db, { userId: 'user_s', comicMetadataId: metadata._id })).toBe(true)
      expect(await userOwnsMetadata(db, { userId: 'user_t', comicMetadataId: metadata._id })).toBe(false)
    })
  })
})
