import { searchComicVineIssues } from './comicVineSearch.js'
import { findAssetByIdentityKey } from './coverAssets.js'

/**
 * One-time backfill: for comics that don't yet have a comicVineId (e.g.
 * migrated from the legacy schema, which never had one), look up the
 * actual ComicVine issue id and upgrade identityKey from the manual
 * composite to comicvine|<id> — the stronger identity used for
 * cross-account cover sharing.
 *
 * Only touches comics owned by the given userId. Conflicts (this account
 * already owns another comic with the resulting identity) are reported
 * and skipped, never silently merged.
 */
export async function backfillComicVineIds(db, { userId, confirm, apiKey, delayMs = 1500 }) {
  const candidates = await db.collection('comics').find({ userId, comicVineId: null }).toArray()

  let matched = 0
  let updated = 0
  let skippedConflict = 0
  let noMatch = 0
  const details = []

  for (const comic of candidates) {
    const base = { id: comic._id.toString(), series: comic.series, issueNumber: comic.issueNumber }

    try {
      const results = await searchComicVineIssues({
        series: comic.series,
        issue: comic.issueNumber,
        publisher: comic.publisher,
        year: comic.year,
        apiKey,
      })

      if (results.length === 0) {
        noMatch++
        details.push({ ...base, result: 'no-match' })
      } else {
        const comicVineId = results[0].id
        const newIdentityKey = `comicvine|${comicVineId}`
        matched++

        const conflict = await db.collection('comics').findOne({
          userId, identityKey: newIdentityKey, _id: { $ne: comic._id }
        })

        if (conflict) {
          skippedConflict++
          details.push({ ...base, result: 'conflict', comicVineId, conflictWith: conflict._id.toString() })
        } else {
          details.push({ ...base, result: 'matched', comicVineId, oldIdentityKey: comic.identityKey, newIdentityKey })

          if (confirm) {
            await db.collection('comics').updateOne(
              { _id: comic._id },
              { $set: { comicVineId, identityKey: newIdentityKey, updatedAt: new Date().toISOString() } }
            )

            // Claim the new identity on this comic's own cover asset, but
            // only if nothing else already has it (a newer account may
            // already have created a comicvine-keyed asset for this issue
            // since the migration ran) — never force a collision.
            if (comic.coverAssetId) {
              const existingClaim = await findAssetByIdentityKey(db, newIdentityKey)
              if (!existingClaim) {
                await db.collection('coverAssets').updateOne(
                  { _id: comic.coverAssetId },
                  { $set: { identityKey: newIdentityKey, updatedAt: new Date().toISOString() } }
                )
              }
            }
            updated++
          }
        }
      }
    } catch (error) {
      details.push({ ...base, result: 'error', error: error.message })
    }

    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return {
    confirm,
    candidatesFound: candidates.length,
    matched,
    updated,
    skippedConflict,
    noMatch,
    details,
  }
}
