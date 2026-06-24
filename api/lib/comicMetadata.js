/**
 * Shared, ComicVine-sourced comic metadata — cached once and reused across
 * every account, so two accounts owning the same issue never trigger a
 * second external cover-search lookup.
 */
export function buildDedupeKey({ series, issueNumber, publisher, variant }) {
  const part = (value) => String(value || '').toLowerCase().trim()
  return `${part(series)}|${part(issueNumber)}|${part(publisher)}|${part(variant)}`
}

export async function findOrCreateComicMetadata(db, comic) {
  const collection = db.collection('comicMetadata')
  const dedupeKey = buildDedupeKey(comic)

  const result = await collection.findOneAndUpdate(
    { dedupeKey },
    {
      $setOnInsert: {
        dedupeKey,
        series: comic.series,
        issueNumber: String(comic.issueNumber),
        publisher: comic.publisher || null,
        year: comic.year && !isNaN(comic.year) ? Number(comic.year) : comic.year || null,
        variant: comic.variant || null,
        volumeId: comic.volumeId || null,
        volumeName: comic.volumeName || null,
        hasCover: false,
        coverLastUpdated: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true, returnDocument: 'after' }
  )

  return result.value ?? result
}
