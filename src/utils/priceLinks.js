/**
 * Price lookups via eBay sold listings (COM-61, COM-60 Phase 1). These are
 * plain links opened in the user's own browser or eBay app — the app never
 * fetches eBay (that would be scraping, against eBay's terms), and eBay
 * handles any sign-in itself. See docs/research/comic-pricing.md.
 */

const tidy = (value) => String(value ?? '').trim().replace(/\s+/g, ' ')

/**
 * Search text for an issue: "<volume or series> <issue> <year> comic".
 * ComicVine's volume name is preferred when known. "comic" stands in for a
 * category filter (eBay's comics category id couldn't be confirmed).
 */
export function buildPriceQuery({ series, volumeName, issueNumber, year } = {}) {
  const name = tidy(volumeName) || tidy(series)
  let issue = tidy(issueNumber)
  // "Annual 9" in volume "X-Men Annual" → "X-Men Annual 9", not "…Annual Annual 9"
  const [, keyword, rest] = issue.match(/^(annual|special|giant-size|king-size)\s+(.+)$/i) || []
  if (keyword && name.toLowerCase().endsWith(keyword.toLowerCase())) issue = rest
  return [name, issue, tidy(year), 'comic']
    .filter(Boolean)
    .join(' ')
}

/** eBay search for sold, completed listings matching the issue. */
export function ebaySoldUrl(fields) {
  const params = new URLSearchParams({ _nkw: buildPriceQuery(fields), LH_Sold: '1', LH_Complete: '1' })
  return `https://www.ebay.com/sch/i.html?${params}`
}

const normalize = (value) => tidy(value).toLowerCase()

/**
 * Owned copies of an issue. By ComicVine id when known — so owning #1 of the
 * 1998 Black Panther doesn't count as owning the 1988 #1 — falling back to
 * series + issue number only for owned comics that have no ComicVine id.
 */
export function findOwnedCopies(comics, { comicVineId, series, issueNumber } = {}) {
  const id = comicVineId ? String(comicVineId) : null
  const wantedSeries = normalize(series)
  const wantedIssue = normalize(issueNumber)

  return (comics || []).filter((comic) => {
    if (id && comic.comicVineId) return String(comic.comicVineId) === id
    return Boolean(wantedSeries && wantedIssue) &&
      normalize(comic.series) === wantedSeries &&
      normalize(comic.issueNumber) === wantedIssue
  })
}
