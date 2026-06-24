# Multi-Account Schema Design: Two-Table vs. One-Table

**Date**: 2026-06-24
**Status**: Implemented (single `comics` collection + `coverAssets`, copy-on-write cover mutation, unique `{userId, identityKey}`, GC deferred per COM-45)
**Context**: The Clerk auth rollout (COM-43) needed each account to have its own
comic collection, while avoiding redundant ComicVine API calls and duplicate
cover image storage when multiple accounts own the same issue.

## The actual requirements

1. Each account's collection is isolated — one account can't see, edit, or
   delete another account's comics.
2. If two accounts both own "Saga #1", we should not call the ComicVine API
   twice or store the cover image bytes twice.
3. Editing a comic should only affect the editing account's own view of it.

Requirement 2 is the only one that needs any cross-account awareness at all.
Requirements 1 and 3 are satisfied by ordinary per-account row ownership.

## Approach A: Two tables (`comicMetadata` + `userComics`) — current implementation

**Shape:**

```
comicMetadata {
  _id, dedupeKey, series, issueNumber, publisher, year, variant,
  volumeId, volumeName, hasCover, coverLastUpdated, createdAt, updatedAt
}

userComics {
  _id, userId, comicMetadataId (ref), notes, dateAdded, createdAt, updatedAt
}
```

`listCollection(userId)` does a `$lookup` join from `userComics` to
`comicMetadata` to produce the flat shape the frontend expects.

**On add:** find-or-create a `comicMetadata` row by `dedupeKey`, then create a
`userComics` row pointing at it.

**On edit of a canonical field** (series/issue/publisher/year/variant): since
the `comicMetadata` row may be referenced by other accounts, we can't mutate
it in place. Instead we find-or-create a *new* `comicMetadata` row matching
the edited values and re-point the `userComics` row's `comicMetadataId` at it
("relink").

**Pros:**
- `comicMetadata` is a true live, single source of truth — correcting
  series/publisher/year/volume info once updates it for every account that
  references it.
- Cover images are unambiguously owned by one canonical record.

**Cons (the ones we actually hit):**
- Relinking on canonical-field edit means an edited row's `comicMetadataId`
  changes, which silently orphans the *old* `comicMetadata` row (including
  its cover) if no other account was still pointing at it. The cover doesn't
  follow the relink, so it can appear to "disappear" even though the edit
  succeeded correctly.
- Every list/read needs a join (`$lookup`) instead of a flat query.
- Two collections to keep mentally in sync; maintenance endpoints
  (dedupe/normalize/stats) need to reason about both.
- Debugging requires knowing which `_id` a `userComics` row *currently*
  points to, since it can change underneath you.

## Approach B: One table (`comics`), per-account rows + shared cover reference

**Shape:**

```
comics {
  _id, userId, series, issueNumber, publisher, year, variant, notes,
  dateAdded, dedupeKey, coverRef, hasCover, volumeId, volumeName,
  createdAt, updatedAt
}
```

Every row is owned by exactly one account (`userId`), and carries its own
copy of the canonical fields directly — same as the pre-Clerk schema, plus
`userId` and `dedupeKey`/`coverRef`.

**On add:** look up `comics.findOne({ dedupeKey })` across *all* accounts
(read-only). If found and it has a cover, copy its `coverRef`/`volumeId`/
`volumeName` into the new row and skip ComicVine entirely. If not found,
search ComicVine as today, store the cover once, and set `coverRef` on the
new row — the next account to add that issue then reuses it.

**On edit:** an ordinary update to your own row. No relinking, no shared
document, no other account is ever touched or affected.

**Pros:**
- One collection, flat queries, no joins.
- Editing is always a local, single-row operation — eliminates the exact bug
  class we just hit (orphaned cover on relink).
- Maintenance endpoints operate on one collection again.
- Conceptually simpler to reason about and debug — "my row" is always "my row".

**Cons:**
- Canonical fields (series/publisher/year) are duplicated once per account
  that owns the issue. This is cheap (a few dozen bytes of text) and was
  never the expensive thing we were trying to avoid duplicating.
- If ComicVine's data for an issue is corrected later, already-existing rows
  don't automatically pick up the correction — each account's copy is frozen
  at add-time. (No evidence so far that this matters in practice; comic
  metadata rarely changes after the fact.)
- The cross-account `dedupeKey` lookup on add is still a "look at everyone's
  data" query, same as Approach A's find-or-create — this isn't avoided,
  just simplified to a copy instead of a live reference.

## Recommendation

Approach B, with one important refinement: shared covers should be treated as
independent, immutable assets rather than being owned by either a mutable
metadata row or one account's comic row.

In other words, use flat per-account `comics` rows for collection data and a
small shared `coverAssets` collection for the resource that is actually
expensive to duplicate:

```
comics {
  _id, userId,
  series, issueNumber, publisher, year, variant,
  notes, dateAdded,
  identityKey,
  coverAssetId (nullable ref),
  volumeId, volumeName,
  createdAt, updatedAt
}

coverAssets {
  _id,
  identityKey,
  images / S3 references,
  source,
  createdAt, updatedAt
}
```

The existing `cover_images` collection can evolve into `coverAssets`; this
does not require introducing another major subsystem. It makes the existing
shared storage boundary explicit and gives cover data a stable identity that
does not change when an account edits its comic metadata.

This version satisfies the same two real requirements (no duplicate ComicVine
calls and no duplicate cover storage) with substantially less machinery than
Approach A. It also removes the failure mode encountered during manual testing
(a cover becoming unreachable after a metadata relink).

The live-correction benefit of Approach A's shared metadata document is real
but marginal for this app's usage pattern and does not justify the join and
relink complexity it requires everywhere else.

### Cover mutation must use copy-on-write

The current two-table implementation has an additional cross-account behavior:
any account that references a shared `comicMetadata` record is authorized to
replace or remove the cover stored under that shared ID. That replacement is
then visible to every account using the same metadata record.

Under the recommended model, cover operations should behave as follows:

- **Reuse on add:** a new comic may point at an existing `coverAssetId` when
  its `identityKey` matches.
- **Remove cover:** set only that account's comic `coverAssetId` to `null`.
  Do not immediately delete the shared asset.
- **Replace cover:** create a new cover asset and point only the editing
  account's comic at it. Other accounts continue referencing the old asset.
- **Read cover:** resolve the comic's current `coverAssetId` and serve that
  asset.

This copy-on-write behavior preserves storage sharing without allowing one
account's cover choice to modify another account's collection.

Image mutation endpoints should accept a user-owned comic ID, verify ownership
with a query such as `{ _id, userId }`, and then update that comic's
`coverAssetId`. A naked shared cover asset ID should not be sufficient
authorization to mutate or delete an asset.

### Shared identity

Prefer ComicVine's issue ID as `identityKey` whenever it is available. It is a
stronger identity than the current composite of series, issue number,
publisher, and variant, which can collide across different volumes, reboots,
or similarly named series.

For manual entries without a ComicVine issue ID, use a normalized composite
fallback that includes enough information to distinguish runs:

```
manual|series|issueNumber|publisher|variant|volumeId-or-year
```

The identity should indicate its namespace (`comicvine|...` versus
`manual|...`) so external IDs cannot collide with generated keys.

`dedupeKey` may remain separately as an account-level duplicate-detection aid,
but shared cover reuse should prefer the stronger `identityKey`.

### Indexes and concurrency

The database should enforce the assumptions made by application code:

```
comics:       { userId: 1 }
comics:       { userId: 1, identityKey: 1 }
coverAssets:  { identityKey: 1 } unique
```

**Decision:** `{ userId, identityKey }` is unique. An account cannot own more
than one row for the same issue — owning duplicate physical copies of an
issue is not supported for now. A second "add" of the same issue by the same
account should be treated as a duplicate (surface the existing row / a
duplicate warning) rather than creating a second one.

An atomic application-level upsert is not enough to prevent duplicate shared
assets during concurrent requests unless `coverAssets.identityKey` also has a
unique database index. Code creating an asset should handle duplicate-key
races by reading and reusing the winning document.

### Cover lifecycle and garbage collection

Avoid the synchronous sequence “count references, then delete asset” when a
comic is removed. Another request can attach the asset between the count and
the deletion.

Deleting a comic should delete only the user-owned comic row. Unreferenced
cover assets can be removed later by a garbage-collection task that:

1. identifies assets with no current comic references;
2. applies a grace period so in-flight operations and recent edits are safe;
3. deletes the S3 objects and the corresponding MongoDB asset record.

It is acceptable for an unreferenced cover to remain temporarily. It is not
acceptable to delete a cover that another account still references.

**Decision:** GC is deferred (COM-45). Orphaned cover assets are left in
place for now; no automated or manual cleanup is implemented as part of this
refactor.

### Derived cover state

`hasCover` should normally be derived from `coverAssetId != null`. Storing both
fields creates another opportunity for them to drift out of sync. If
`hasCover` is retained for query performance, all cover attach/detach
operations must update both values atomically.

## What changes if we switch

- `api/comics.js`, `api/comics/[id].js`, `api/comics/bulk.js`: replace
  `comicMetadata`/`userComics` find-or-create + relink logic with a single
  `comics` collection, scoped by `userId`, with a `dedupeKey`-based
  cross-account lookup only on create.
- `api/images/*`: mutation endpoints receive a user comic ID, verify that the
  authenticated user owns it, and attach/detach an immutable `coverAssetId`.
  Read endpoints resolve the asset reference rather than treating a shared
  asset ID as proof of ownership.
- `api/comics/dedupe.js`, `normalize.js`, `stats.js`, `cleanup-ids.js`:
  operate on one collection again.
- `scripts/migrate-to-account-schema.js`: migrates the legacy `comics`
  collection into the new `comics` shape directly (adds `userId`,
  `identityKey`, and `coverAssetId` to each row) instead of splitting comic
  metadata into two collections.
- `api/lib/comicMetadata.js`, `api/lib/userComics.js` and their tests:
  replaced by a single `api/lib/comics.js` with `addComic`,
  `listComics(userId)`, `updateComic`, `removeComic`, and
  `findExistingCoverAsset(identityKey)`.
- `cover_images`: migrate toward an explicit `coverAssets` shape keyed by a
  unique `identityKey`, while preserving the existing S3 references during
  migration.
- Cover deletion: move orphan cleanup out of comic deletion and into a
  grace-period garbage-collection process.
