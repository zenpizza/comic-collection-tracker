import { ARTIST_ROLES } from './credits'
import { compareSeriesNames, parseIssueNumber } from './sortUtils'

/**
 * Creator index for browsing and searching the collection by writer or
 * artist (COM-59, COM-56), built in the browser from each comic's credits.
 */

// Short role names for summaries ("writer · pencils"), in display order
const ROLE_LABELS = {
  writer: 'writer',
  artist: 'art',
  penciler: 'pencils',
  inker: 'inks',
  cover: 'cover',
  colorist: 'colors',
  letterer: 'letters',
  editor: 'editor',
}
const ROLE_ORDER = Object.keys(ROLE_LABELS)

// Creator matching in Titles-mode search starts at this many characters, so
// a single letter doesn't match every series through some creator
export const MIN_CREATOR_SEARCH_LENGTH = 3

export const roleLabel = (role) => ROLE_LABELS[role] || role

const orderRoles = (roles) => {
  const rank = (role) => (ROLE_ORDER.includes(role) ? ROLE_ORDER.indexOf(role) : ROLE_ORDER.length)
  return [...roles].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

const tidyName = (name) => String(name || '').trim().replace(/\s+/g, ' ')

/** Grouping key for a creator: case, extra spaces and padding ignored. */
export const normalizeCreatorKey = (name) => tidyName(name).toLowerCase()

/**
 * One entry per creator:
 * { key, name, comicCount, writerCount, artistCount, roleSummary, entries: [{ comic, roles }] }
 * Counts are of distinct comics. The display name is the most common spelling.
 */
export function buildCreatorIndex(comics) {
  const byKey = new Map()

  for (const comic of comics || []) {
    // Merge repeat credits for the same person on one comic
    const onThisComic = new Map()
    for (const credit of comic.credits || []) {
      const key = normalizeCreatorKey(credit.name)
      if (!key) continue
      const entry = onThisComic.get(key) || { name: tidyName(credit.name), roles: new Set() }
      ;(credit.roles || []).forEach((role) => entry.roles.add(role))
      onThisComic.set(key, entry)
    }

    for (const [key, { name, roles }] of onThisComic) {
      const creator = byKey.get(key) || { key, spellings: new Map(), entries: [], roles: new Set() }
      creator.spellings.set(name, (creator.spellings.get(name) || 0) + 1)
      const ordered = orderRoles(roles)
      creator.entries.push({ comic, roles: ordered })
      ordered.forEach((role) => creator.roles.add(role))
      byKey.set(key, creator)
    }
  }

  return [...byKey.values()].map((creator) => {
    const [name] = [...creator.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    return {
      key: creator.key,
      name,
      comicCount: creator.entries.length,
      writerCount: creator.entries.filter((e) => e.roles.includes('writer')).length,
      artistCount: creator.entries.filter((e) => e.roles.some((r) => ARTIST_ROLES.includes(r))).length,
      roleSummary: orderRoles(creator.roles).map(roleLabel),
      entries: creator.entries,
    }
  })
}

const countFor = (creator, role) =>
  role === 'writers' ? creator.writerCount : role === 'artists' ? creator.artistCount : creator.comicCount

/**
 * Creators for the list: role 'all' | 'writers' | 'artists' (artist, pencils,
 * inks), optional name search; most issues first (in that role), then A–Z.
 */
export function filterCreators(index, { role = 'all', search = '' } = {}) {
  const query = normalizeCreatorKey(search)
  return index
    .filter((creator) => countFor(creator, role) > 0)
    .filter((creator) => !query || creator.key.includes(query))
    .sort((a, b) => countFor(b, role) - countFor(a, role) || a.name.localeCompare(b.name))
}

/**
 * A creator's comics grouped by series, in library order:
 * [{ seriesName, roles: ['writer', 'pencils'], comics: [comic] }]
 */
export function creatorSeriesGroups(creator) {
  const bySeries = new Map()
  for (const { comic, roles } of creator?.entries || []) {
    const seriesName = comic.series || 'Untitled Series'
    const group = bySeries.get(seriesName) || { seriesName, roles: new Set(), comics: [] }
    roles.forEach((role) => group.roles.add(role))
    group.comics.push(comic)
    bySeries.set(seriesName, group)
  }

  const issueOrder = (a, b) => {
    const av = parseIssueNumber(a.issueNumber) ?? Number.MAX_SAFE_INTEGER
    const bv = parseIssueNumber(b.issueNumber) ?? Number.MAX_SAFE_INTEGER
    return av - bv || String(a.issueNumber).localeCompare(String(b.issueNumber))
  }

  return [...bySeries.values()]
    .map((group) => ({ seriesName: group.seriesName, roles: orderRoles(group.roles).map(roleLabel), comics: group.comics.sort(issueOrder) }))
    .sort((a, b) => compareSeriesNames(a.seriesName, b.seriesName))
}

/**
 * For Titles-mode search: series name → the first matching creator's name,
 * for series with a comic credited to someone matching the search.
 */
export function seriesMatchingCreator(comics, search) {
  const query = normalizeCreatorKey(search)
  const matches = new Map()
  if (query.length < MIN_CREATOR_SEARCH_LENGTH) return matches

  for (const comic of comics || []) {
    const seriesName = comic.series || 'Untitled Series'
    if (matches.has(seriesName)) continue
    const credit = (comic.credits || []).find((c) => normalizeCreatorKey(c.name).includes(query))
    if (credit) matches.set(seriesName, tidyName(credit.name))
  }
  return matches
}
