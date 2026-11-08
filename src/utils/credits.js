/**
 * Creator credits: [{ name, roles[] }] as stored on a comic (COM-55).
 * Roles come from ComicVine: writer, artist, penciler, inker, colorist,
 * letterer, editor, cover, and occasionally others.
 */

// Roles shown together as "Artists", with the detail shown next to the name
const ARTIST_ROLE_DETAIL = { artist: null, penciler: 'pencils', inker: 'inks' }
const ARTIST_ROLES = Object.keys(ARTIST_ROLE_DETAIL)

// Everything else, in display order; unknown roles follow, alphabetically
const OTHER_ROLE_LABELS = { cover: 'Cover', colorist: 'Colors', letterer: 'Letters', editor: 'Editor' }

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const splitNames = (text) =>
  String(text || '').split(',').map((name) => name.trim()).filter(Boolean)

/**
 * Credits grouped for display:
 * { writers: [name], artists: [{ name, detail }], other: [{ label, names }] }
 */
export function groupCredits(credits) {
  const writers = []
  const artists = []
  const other = new Map()

  for (const { name, roles } of credits || []) {
    if (roles.includes('writer')) writers.push(name)

    const artistRoles = roles.filter((role) => ARTIST_ROLES.includes(role))
    if (artistRoles.length > 0) {
      const details = artistRoles.map((role) => ARTIST_ROLE_DETAIL[role]).filter(Boolean)
      artists.push({ name, detail: details.length ? details.join(' & ') : null })
    }

    for (const role of roles) {
      if (role === 'writer' || ARTIST_ROLES.includes(role)) continue
      const label = OTHER_ROLE_LABELS[role] || capitalize(role)
      if (!other.has(label)) other.set(label, [])
      other.get(label).push(name)
    }
  }

  const knownOrder = Object.values(OTHER_ROLE_LABELS)
  const rank = (label) => (knownOrder.includes(label) ? knownOrder.indexOf(label) : knownOrder.length)
  const otherList = [...other.entries()]
    .map(([label, names]) => ({ label, names }))
    .sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label))

  return { writers, artists, other: otherList }
}

/** Text for the Writer(s) and Artist(s) inputs: { writers: 'A, B', artists: 'C' } */
export function creditsToFields(credits) {
  const { writers, artists } = groupCredits(credits)
  return { writers: writers.join(', '), artists: artists.map((a) => a.name).join(', ') }
}

/**
 * Credits updated from the Writer(s) / Artist(s) inputs. A field whose text
 * is unchanged leaves its credits alone, so editing writers keeps the artists'
 * pencils/inks detail. A changed field replaces those roles: typed writers get
 * 'writer'; typed artists replace artist/penciler/inker and new names get
 * 'artist'. Other roles (colors, letters…) are always kept.
 * Returns the original value (including null) when nothing changed.
 */
export function applyCreditFields(credits, fields) {
  const current = creditsToFields(credits)
  const writersChanged = fields.writers !== undefined && splitNames(fields.writers).join(', ') !== current.writers
  const artistsChanged = fields.artists !== undefined && splitNames(fields.artists).join(', ') !== current.artists
  if (!writersChanged && !artistsChanged) return credits

  const byName = new Map((credits || []).map((c) => [c.name, { name: c.name, roles: [...c.roles] }]))
  // Remove `removeRoles` from everyone, then give each typed name its roles
  const replaceRoles = (removeRoles, names, rolesFor) => {
    for (const credit of byName.values()) credit.roles = credit.roles.filter((r) => !removeRoles.includes(r))
    for (const name of names) {
      const credit = byName.get(name) || { name, roles: [] }
      rolesFor(name).forEach((role) => { if (!credit.roles.includes(role)) credit.roles.push(role) })
      byName.set(name, credit)
    }
  }
  // An artist who's still listed keeps their pencils/inks roles
  const originalArtistRoles = (name) =>
    (credits || []).find((c) => c.name === name)?.roles.filter((r) => ARTIST_ROLES.includes(r)) || []

  if (writersChanged) replaceRoles(['writer'], splitNames(fields.writers), () => ['writer'])
  if (artistsChanged) {
    replaceRoles(ARTIST_ROLES, splitNames(fields.artists), (name) => {
      const kept = originalArtistRoles(name)
      return kept.length ? kept : ['artist']
    })
  }

  return [...byName.values()].filter((credit) => credit.roles.length > 0)
}
