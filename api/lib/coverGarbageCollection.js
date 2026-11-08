import { ObjectId } from 'mongodb'

/**
 * Garbage collection for orphaned cover storage (COM-45). Run manually via
 * scripts/gc-cover-assets.js — dry run unless confirmed.
 *
 * A cover is stored as a coverAssets record, a cover_images record keyed by
 * the asset id (its `comicId` field holds the asset id), and S3 files under
 * <prefix>/covers/<assetId>/. Comics point at an asset via coverAssetId.
 * Three kinds of orphan:
 *   - asset:  coverAssets record no comic points to (left by deletes and
 *             cover replacements, which never delete synchronously).
 *   - stray:  cover_images record with no coverAssets record (pre-migration
 *             leftovers).
 *   - s3:     S3 file no cover_images record mentions (e.g. failed uploads).
 *
 * Everything must be older than the grace period. The upload path writes S3
 * files, then cover_images, then coverAssets, so a young file or record may
 * belong to an upload that's still in progress.
 *
 * Race with comic creation: adding a comic reuses an existing asset found by
 * identityKey. Deleting the asset record first means nothing new can find
 * it; re-checking references afterwards catches a comic that grabbed it in
 * between, and the record is put back. Images are only deleted after that.
 */

const DAY_MS = 24 * 60 * 60 * 1000

const s3KeysOf = (imagesDoc) =>
  Object.values(imagesDoc?.images || {}).map((ref) => ref?.key).filter(Boolean)

const ageDays = (date, now) => (date ? Math.floor((now - new Date(date).getTime()) / DAY_MS) : null)

/**
 * Find orphans. Read-only. With `storage` and `s3Prefix`, also lists S3 under
 * <s3Prefix>/covers/ for files no cover_images record mentions.
 */
export async function findOrphans(db, { graceDays = 30, now = Date.now(), storage = null, s3Prefix = null } = {}) {
  const referenced = new Set(
    (await db.collection('comics').distinct('coverAssetId', { coverAssetId: { $ne: null } })).map(String)
  )
  const assets = await db.collection('coverAssets').find().toArray()
  const assetIds = new Set(assets.map((a) => String(a._id)))
  const images = await db.collection('cover_images').find().toArray()
  const imagesByKey = new Map(images.map((doc) => [String(doc.comicId), doc]))
  const eligible = (date) => ageDays(date, now) !== null && ageDays(date, now) >= graceDays

  const orphanAssets = assets
    .filter((asset) => !referenced.has(String(asset._id)))
    .map((asset) => {
      const imagesDoc = imagesByKey.get(String(asset._id)) || null
      return {
        kind: 'asset',
        id: String(asset._id),
        identityKey: asset.identityKey || null,
        createdAt: asset.createdAt || null,
        ageDays: ageDays(asset.createdAt, now),
        eligible: eligible(asset.createdAt),
        asset,
        imagesDoc,
        s3Keys: s3KeysOf(imagesDoc),
      }
    })

  const strays = images
    .filter((doc) => !assetIds.has(String(doc.comicId)))
    .map((doc) => ({
      kind: 'stray',
      id: String(doc._id),
      imagesKey: doc.comicId,
      createdAt: doc.createdAt || null,
      ageDays: ageDays(doc.createdAt, now),
      eligible: eligible(doc.createdAt),
      imagesDoc: doc,
      s3Keys: s3KeysOf(doc),
    }))

  let s3Orphans = null
  if (storage) {
    if (!s3Prefix) throw new Error('An S3 key prefix (e.g. "production") is required to scan S3')
    const mentioned = new Set(images.flatMap(s3KeysOf))
    const listed = await storage.listKeys(`${s3Prefix}/covers/`)
    s3Orphans = listed
      .filter(({ key }) => !mentioned.has(key))
      .map(({ key, lastModified, size }) => ({
        kind: 's3',
        id: key,
        s3Keys: [key],
        size: size ?? null,
        createdAt: lastModified ? new Date(lastModified).toISOString() : null,
        ageDays: ageDays(lastModified, now),
        eligible: eligible(lastModified),
      }))
  }

  return { orphanAssets, strays, s3Orphans, graceDays }
}

/**
 * Delete eligible orphans. Without `confirm`, returns what would be deleted
 * and changes nothing. S3-only orphans are deleted only with
 * `includeS3Orphans` — another database (e.g. preview) might reference them.
 * `backup(orphan)` is awaited before anything of that orphan is deleted, so
 * the caller can save records and download S3 files first.
 */
export async function deleteOrphans(db, {
  orphans,
  storage = null,
  confirm = false,
  includeS3Orphans = false,
  backup = async () => {},
}) {
  const result = { deleted: [], skipped: [], wouldDelete: [] }
  const candidates = [
    ...orphans.orphanAssets,
    ...orphans.strays,
    ...(includeS3Orphans ? orphans.s3Orphans || [] : []),
  ].filter((orphan) => orphan.eligible)

  for (const orphan of candidates) {
    if ((orphan.s3Keys.length > 0) && !storage) {
      result.skipped.push({ ...orphan, reason: 'has S3 files but no S3 access configured' })
      continue
    }
    if (!confirm) {
      result.wouldDelete.push(orphan)
      continue
    }

    if (orphan.kind === 'asset') {
      const outcome = await deleteOrphanAsset(db, orphan, storage, backup)
      ;(outcome.deleted ? result.deleted : result.skipped).push({ ...orphan, reason: outcome.reason })
    } else if (orphan.kind === 'stray') {
      // A coverAssets record may have appeared since (upload finishing)
      const nowHasAsset = ObjectId.isValid(String(orphan.imagesKey)) &&
        await db.collection('coverAssets').findOne({ _id: new ObjectId(String(orphan.imagesKey)) })
      if (nowHasAsset) {
        result.skipped.push({ ...orphan, reason: 'now has a coverAssets record' })
        continue
      }
      await backup(orphan)
      await db.collection('cover_images').deleteOne({ _id: orphan.imagesDoc._id })
      if (orphan.s3Keys.length) await storage.deleteKeys(orphan.s3Keys)
      result.deleted.push(orphan)
    } else {
      // S3-only: make sure no record mentions it now
      const mentioned = await db.collection('cover_images').findOne({
        $or: ['thumbnail', 'medium', 'full', 'original'].map((size) => ({ [`images.${size}.key`]: orphan.id })),
      })
      if (mentioned) {
        result.skipped.push({ ...orphan, reason: 'now referenced by a cover_images record' })
        continue
      }
      await backup(orphan)
      await storage.deleteKeys(orphan.s3Keys)
      result.deleted.push(orphan)
    }
  }

  return result
}

async function deleteOrphanAsset(db, orphan, storage, backup) {
  const assetId = orphan.asset._id
  const comics = db.collection('comics')

  if (await comics.findOne({ coverAssetId: assetId })) {
    return { deleted: false, reason: 'a comic points to it now' }
  }

  await backup(orphan)

  // Remove the record first so no new comic can find it by identityKey...
  await db.collection('coverAssets').deleteOne({ _id: assetId })
  // ...then catch any comic that attached it in the meantime.
  if (await comics.findOne({ coverAssetId: assetId })) {
    await db.collection('coverAssets').insertOne(orphan.asset)
    return { deleted: false, reason: 'a comic attached it during cleanup; record restored' }
  }

  await db.collection('cover_images').deleteOne({ comicId: String(assetId) })
  if (orphan.s3Keys.length) await storage.deleteKeys(orphan.s3Keys)
  return { deleted: true }
}

/**
 * Storage adapter over the AWS SDK for the GC script: list, download and
 * delete objects by key.
 */
export async function createS3Storage({ region, bucket, accessKeyId, secretAccessKey }) {
  const { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } })

  return {
    async listKeys(prefix) {
      const keys = []
      let ContinuationToken
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }))
        for (const obj of page.Contents || []) keys.push({ key: obj.Key, lastModified: obj.LastModified, size: obj.Size })
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (ContinuationToken)
      return keys
    },
    async getObject(key) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      return Buffer.from(await response.Body.transformToByteArray())
    },
    async deleteKeys(keys) {
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000)
        const response = await client.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }))
        if (response.Errors?.length) {
          throw new Error(`S3 delete failed for ${response.Errors.length} key(s): ${response.Errors[0].Key} — ${response.Errors[0].Message}`)
        }
      }
    },
  }
}
