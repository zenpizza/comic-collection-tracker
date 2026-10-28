/**
 * Fill Add Comic form fields from a selected ComicVine cover's metadata.
 *
 * Volume fields always follow the selected cover. Publisher and year are only
 * filled when the user hasn't entered one — a selected cover also sets comicVineId,
 * which outranks the publisher text in buildIdentityKey, so overwriting a
 * typed value would gain nothing and could surprise the user.
 *
 * @param {Object} form - Current form data
 * @param {Object} metadata - Cover result metadata ({ publisher, year, volumeId, volumeName })
 * @returns {Object} Updated form data
 */
export function applyCoverMetadataToForm(form, metadata) {
  if (!metadata) return form

  const next = { ...form }

  if (metadata.volumeName) {
    next.volumeId = metadata.volumeId || ''
    next.volumeName = metadata.volumeName
  }

  if (metadata.publisher && !form.publisher?.trim()) {
    next.publisher = metadata.publisher
  }

  if (metadata.year && !String(form.year ?? '').trim()) {
    next.year = String(metadata.year)
  }

  return next
}
