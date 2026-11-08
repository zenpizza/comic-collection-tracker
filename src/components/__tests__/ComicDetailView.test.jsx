// @vitest-environment jsdom
import React, { useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ComicDetailView from '../ComicDetailView'
import coverAPIService from '../../utils/coverAPIService'

// Stub out image loading and the cover pipeline; this test is about what the
// detail view saves, not how covers are fetched or stored.
vi.mock('../CoverImage', () => ({ default: () => null }))
vi.mock('../CoverUploader', () => ({ default: () => null }))
vi.mock('../../utils/ImageURLService', () => ({ default: { clearCache: vi.fn() } }))
vi.mock('../../utils/coverAPIService', () => ({
  default: {
    searchCovers: vi.fn(async () => [{ id: '1', imageUrl: 'cover.jpg' }]),
    fetchIssueCredits: vi.fn(),
  }
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
        metadata: { publisher: 'Marvel', year: 1988, month: 7, volumeId: '4045', volumeName: 'Black Panther' }
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

describe('ComicDetailView cover auto-fill (COM-50, COM-51)', () => {
  it('keeps publisher, year and month filled by a cover pick when details are edited afterwards', async () => {
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
    expect(onSave.mock.calls[0][0]).toMatchObject({ publisher: 'Marvel', year: 1988, month: 7 })
    expect(await screen.findByText('July')).toBeTruthy()

    fireEvent.click(screen.getByText('Edit Details'))
    fireEvent.change(screen.getByPlaceholderText(/Add any notes/), { target: { value: 'Signed copy' } })
    fireEvent.click(screen.getByText('Save Changes'))

    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[1][0]).toMatchObject({ notes: 'Signed copy', publisher: 'Marvel', year: 1988, month: '7' })
  })
})

describe('ComicDetailView creator credits (COM-55)', () => {
  const credits = [
    { name: 'Al Milgrom', roles: ['writer'] },
    { name: 'Herb Trimpe', roles: ['artist', 'penciler'] },
    { name: 'Jim Mooney', roles: ['inker'] },
    { name: 'George Roussos', roles: ['colorist'] },
  ]
  const base = { id: 'c9', series: 'Black Panther', issueNumber: 98, publisher: 'Marvel', year: 1985, notes: '' }

  afterEach(() => coverAPIService.fetchIssueCredits.mockReset())

  it('fetches and saves credits the first time a ComicVine comic is opened', async () => {
    coverAPIService.fetchIssueCredits.mockResolvedValue(credits)
    const onSave = vi.fn()
    render(<Harness onSave={onSave} initialComic={{ ...base, comicVineId: '25171', credits: null }} />)

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(coverAPIService.fetchIssueCredits).toHaveBeenCalledWith('25171')
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: 'c9', credits })
    expect(await screen.findByText('Al Milgrom')).toBeTruthy()
    expect(screen.getByText('Herb Trimpe (pencils), Jim Mooney (inks)')).toBeTruthy()
    expect(screen.getByText('Also: Colors George Roussos')).toBeTruthy()
    expect(coverAPIService.fetchIssueCredits).toHaveBeenCalledTimes(1)
  })

  it('does not fetch when credits were already looked up, or without a ComicVine id', () => {
    render(<Harness onSave={vi.fn()} initialComic={{ ...base, comicVineId: '25171', credits: [] }} />)
    cleanup()
    render(<Harness onSave={vi.fn()} initialComic={{ ...base, credits: null }} />)
    expect(coverAPIService.fetchIssueCredits).not.toHaveBeenCalled()
  })

  it('editing writers keeps the other credits', async () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} initialComic={{ ...base, comicVineId: '25171', credits }} />)

    fireEvent.click(screen.getByText('Edit Details'))
    fireEvent.change(screen.getByDisplayValue('Al Milgrom'), { target: { value: 'Christopher Priest' } })
    fireEvent.click(screen.getByText('Save Changes'))

    const saved = onSave.mock.calls[0][0].credits
    expect(saved.find((c) => c.name === 'Christopher Priest').roles).toEqual(['writer'])
    expect(saved.find((c) => c.name === 'Al Milgrom')).toBeUndefined()
    expect(saved.find((c) => c.name === 'Herb Trimpe').roles).toEqual(['artist', 'penciler'])
    expect(saved.find((c) => c.name === 'George Roussos').roles).toEqual(['colorist'])
  })

  it('fills only the creator inputs not typed in when credits arrive mid-edit', async () => {
    let resolve
    coverAPIService.fetchIssueCredits.mockReturnValue(new Promise((r) => { resolve = r }))
    const onSave = vi.fn()
    render(<Harness onSave={onSave} initialComic={{ ...base, comicVineId: '25171', credits: null }} />)

    fireEvent.click(screen.getByText('Edit Details'))
    const [writersInput, artistsInput] = screen.getAllByPlaceholderText('Separate names with commas')
    fireEvent.change(writersInput, { target: { value: 'Christopher Priest' } })
    resolve(credits)
    await waitFor(() => expect(artistsInput.value).toBe('Herb Trimpe, Jim Mooney'))
    expect(writersInput.value).toBe('Christopher Priest')
    fireEvent.click(screen.getByText('Save Changes'))

    const saved = onSave.mock.calls.at(-1)[0].credits
    expect(saved.find((c) => c.name === 'Christopher Priest').roles).toEqual(['writer'])
    expect(saved.find((c) => c.name === 'Herb Trimpe').roles).toEqual(['artist', 'penciler'])
    expect(saved.find((c) => c.name === 'Jim Mooney').roles).toEqual(['inker'])
  })

  it('does not overwrite creators saved by hand before the lookup finishes', async () => {
    let resolve
    coverAPIService.fetchIssueCredits.mockReturnValue(new Promise((r) => { resolve = r }))
    const onSave = vi.fn()
    render(<Harness onSave={onSave} initialComic={{ ...base, comicVineId: '25171', credits: null }} />)

    fireEvent.click(screen.getByText('Edit Details'))
    fireEvent.change(screen.getAllByPlaceholderText('Separate names with commas')[0], { target: { value: 'Christopher Priest' } })
    fireEvent.click(screen.getByText('Save Changes'))
    resolve(credits)
    await new Promise((r) => setTimeout(r, 0))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].credits).toEqual([{ name: 'Christopher Priest', roles: ['writer'] }])
  })

  it('saves fetched credits under React StrictMode (double effect run on mount)', async () => {
    coverAPIService.fetchIssueCredits.mockResolvedValue(credits)
    const onSave = vi.fn()
    render(
      <React.StrictMode>
        <Harness onSave={onSave} initialComic={{ ...base, comicVineId: '25171', credits: null }} />
      </React.StrictMode>
    )

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].credits).toEqual(credits)
    await waitFor(() => expect(screen.queryByText('Looking up creators…')).toBeNull())
  })

  it('credits arriving while the edit form is open are kept when it is saved', async () => {
    let resolve
    coverAPIService.fetchIssueCredits.mockReturnValue(new Promise((r) => { resolve = r }))
    const onSave = vi.fn()
    render(<Harness onSave={onSave} initialComic={{ ...base, comicVineId: '25171', credits: null }} />)

    fireEvent.click(screen.getByText('Edit Details'))
    resolve(credits)
    expect(await screen.findByDisplayValue('Al Milgrom')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/Add any notes/), { target: { value: 'Signed' } })
    fireEvent.click(screen.getByText('Save Changes'))

    const last = onSave.mock.calls.at(-1)[0]
    expect(last).toMatchObject({ notes: 'Signed', credits })
  })
})
