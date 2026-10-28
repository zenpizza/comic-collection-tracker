// @vitest-environment jsdom
import React, { useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ComicDetailView from '../ComicDetailView'

// Stub out image loading and the cover pipeline; this test is about what the
// detail view saves, not how covers are fetched or stored.
vi.mock('../CoverImage', () => ({ default: () => null }))
vi.mock('../CoverUploader', () => ({ default: () => null }))
vi.mock('../../utils/ImageURLService', () => ({ default: { clearCache: vi.fn() } }))
vi.mock('../../utils/coverAPIService', () => ({
  default: { searchCovers: vi.fn(async () => [{ id: '1', imageUrl: 'cover.jpg' }]) }
}))
vi.mock('../../utils/coverUpdateService.js', () => ({
  default: {
    addCover: vi.fn(async (comicId, blob, metadata) => ({
      metadata: { hasCover: true, volumeId: metadata.volumeId, volumeName: metadata.volumeName }
    }))
  }
}))
// The real CoverSelector downloads the image; this one hands back a picked
// ComicVine result straight away.
vi.mock('../CoverSelector', () => ({
  default: ({ onCoverSelect }) => (
    <button
      onClick={() => onCoverSelect({
        blob: new Blob(),
        metadata: { publisher: 'Marvel', year: 1988, volumeId: '4045', volumeName: 'Black Panther' }
      })}
    >
      Pick ComicVine cover
    </button>
  )
}))

afterEach(cleanup)

// Mirrors CollectionView: onSave persists the comic and feeds it back in as
// the new `comic` prop while the detail view stays open.
function Harness({ initialComic, onSave }) {
  const [comic, setComic] = useState(initialComic)
  return (
    <ComicDetailView
      comic={comic}
      comics={[comic]}
      onClose={() => {}}
      onDelete={() => {}}
      onSave={async (updated) => {
        onSave(updated)
        setComic(updated)
      }}
    />
  )
}

describe('ComicDetailView cover auto-fill (COM-50)', () => {
  it('keeps publisher and year filled by a cover pick when details are edited afterwards', async () => {
    const onSave = vi.fn()
    render(
      <Harness
        onSave={onSave}
        initialComic={{ id: 'c1', series: 'Black Panther', issueNumber: 1, publisher: '', year: null, notes: '' }}
      />
    )

    fireEvent.click(screen.getByText('Add Cover'))
    fireEvent.click(screen.getByText(/Search Cover APIs/))
    fireEvent.click(await screen.findByText('Pick ComicVine cover'))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({ publisher: 'Marvel', year: 1988 })

    fireEvent.click(screen.getByText('Edit Details'))
    fireEvent.change(screen.getByPlaceholderText(/Add any notes/), { target: { value: 'Signed copy' } })
    fireEvent.click(screen.getByText('Save Changes'))

    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[1][0]).toMatchObject({ notes: 'Signed copy', publisher: 'Marvel', year: 1988 })
  })
})
