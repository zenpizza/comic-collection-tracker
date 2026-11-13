// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ComicForm from '../ComicForm'
import coverAPIService from '../../utils/coverAPIService'

vi.mock('../../utils/coverAPIService', () => ({
  default: { searchCovers: vi.fn(), downloadCover: vi.fn(), fetchIssueCredits: vi.fn() },
}))
vi.mock('../../utils/imagePipeline', () => ({
  default: { processCoverImage: vi.fn(async () => ({ processId: 'p1', processed: {}, urls: {}, metadata: {} })) },
}))
vi.mock('../../utils/apiClient', () => ({
  // No other account has this issue: the library shortcut finds nothing
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({ success: true, metadata: null }) })),
}))
vi.mock('../../utils/dataStore', () => ({ default: { checkForDuplicate: () => null } }))
vi.mock('../CoverUploader', () => ({ default: () => <div>cover uploader</div> }))
vi.mock('../CoverAPISettings', () => ({ default: () => null }))
// The real picker downloads covers; this one offers each result as a button
vi.mock('../CoverSelector', () => ({
  default: ({ isVisible, coverResults, onCoverSelect }) => (isVisible ? (
    <div>
      {coverResults.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onCoverSelect({ blob: new Blob(), previewUrl: 'blob:preview', metadata: { source: 'api', apiId: r.id, ...r.metadata } })}
        >
          Pick {r.metadata.volumeName} ({r.metadata.year})
        </button>
      ))}
    </div>
  ) : null),
}))

const result = (id, year, month, volumeName = 'Black Panther') => ({
  id, imageUrl: `${id}.jpg`, provider: 'comicvine', providerName: 'Comic Vine',
  metadata: { publisher: 'Marvel', year, month, volumeId: `v${year}`, volumeName },
})

const credits = [
  { name: 'Peter B. Gillis', roles: ['writer'] },
  { name: 'Denys Cowan', roles: ['artist', 'penciler'] },
  { name: 'Sam de la Rosa', roles: ['inker'] },
  { name: 'Bob Sharen', roles: ['colorist'] },
]

const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const find = (series, issue) => {
  fill('Series *', series)
  fill('Issue Number *', issue)
  fireEvent.click(screen.getByRole('button', { name: 'Find on ComicVine' }))
}

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:cover')
  coverAPIService.downloadCover.mockResolvedValue(new Blob())
  coverAPIService.fetchIssueCredits.mockResolvedValue(credits)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ComicForm look-up-first flow (COM-55)', () => {
  it('starts with only series and issue number', () => {
    render(<ComicForm onAdd={vi.fn()} />)
    expect(screen.getByLabelText('Series *')).toBeTruthy()
    expect(screen.queryByLabelText('Publisher')).toBeNull()
    expect(screen.queryByLabelText('Writer(s)')).toBeNull()
  })

  it('fills everything from a single match, including creators, and submits it', async () => {
    coverAPIService.searchCovers.mockResolvedValue([result('2001', 1988, 7)])
    const onAdd = vi.fn(async () => {})
    render(<ComicForm onAdd={onAdd} />)

    find('Black Panther', '1')

    expect(await screen.findByDisplayValue('Peter B. Gillis')).toBeTruthy()
    expect(screen.getByLabelText('Publisher').value).toBe('Marvel')
    expect(screen.getByLabelText('Year').value).toBe('1988')
    expect(screen.getByLabelText('Month').value).toBe('7')
    expect(screen.getByLabelText('Artist(s)').value).toBe('Denys Cowan, Sam de la Rosa')
    expect(screen.getByText(/Also credited: Colors Bob Sharen/)).toBeTruthy()
    expect(coverAPIService.fetchIssueCredits).toHaveBeenCalledWith('2001')

    fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    const added = onAdd.mock.calls[0][0]
    expect(added).toMatchObject({ series: 'Black Panther', comicVineId: '2001', publisher: 'Marvel', year: '1988', month: '7', credits })
    expect(added.coverData).toBeTruthy()
    expect(added.writers).toBeUndefined()

    // Back to the first step for the next comic
    expect(await screen.findByRole('button', { name: 'Find on ComicVine' })).toBeTruthy()
  })

  it('lets you pick between several matches', async () => {
    coverAPIService.searchCovers.mockResolvedValue([result('2001', 1988, 7), result('2002', 1998, 11)])
    render(<ComicForm onAdd={vi.fn()} />)

    find('Black Panther', '1')
    fireEvent.click(await screen.findByRole('button', { name: 'Pick Black Panther (1998)' }))

    expect(await screen.findByDisplayValue('Peter B. Gillis')).toBeTruthy()
    expect(screen.getByLabelText('Year').value).toBe('1998')
    expect(coverAPIService.fetchIssueCredits).toHaveBeenCalledWith('2002')
  })

  it('offers hand entry when ComicVine has no match, and saves typed creators', async () => {
    coverAPIService.searchCovers.mockResolvedValue([])
    const onAdd = vi.fn(async () => {})
    render(<ComicForm onAdd={onAdd} />)

    find('Advanced Radioactive Black Belt Hamsters', '7')
    expect(await screen.findByText(/ComicVine has no match/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'No match? Enter details by hand' }))
    expect(screen.getByLabelText('Series *').value).toBe('Advanced Radioactive Black Belt Hamsters')
    expect(screen.getByText('cover uploader')).toBeTruthy()
    fill('Writer(s)', 'Kent Burles')
    fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }))

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(onAdd.mock.calls[0][0].credits).toEqual([{ name: 'Kent Burles', roles: ['writer'] }])
    expect(onAdd.mock.calls[0][0].comicVineId).toBeUndefined()
  })

  it('still reaches review and can save when the creators lookup fails', async () => {
    coverAPIService.searchCovers.mockResolvedValue([result('2001', 1988, 7)])
    coverAPIService.fetchIssueCredits.mockRejectedValue(new Error('ComicVine down'))
    const onAdd = vi.fn(async () => {})
    render(<ComicForm onAdd={onAdd} />)

    find('Black Panther', '1')

    expect(await screen.findByText(/Couldn't get creators from ComicVine/)).toBeTruthy()
    expect(screen.getByLabelText('Year').value).toBe('1988')
    fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(onAdd.mock.calls[0][0]).toMatchObject({ comicVineId: '2001', credits: null })
  })

  it('keeps creators typed in the review step while the lookup was still running', async () => {
    coverAPIService.searchCovers.mockResolvedValue([result('2001', 1988, 7)])
    let resolve
    coverAPIService.fetchIssueCredits.mockReturnValue(new Promise((r) => { resolve = r }))
    const onAdd = vi.fn(async () => {})
    render(<ComicForm onAdd={onAdd} />)

    find('Black Panther', '1')
    await screen.findByText('Looking up creators on ComicVine…')
    fill('Writer(s)', 'Christopher Priest')
    resolve(credits)

    await waitFor(() => expect(screen.getByLabelText('Artist(s)').value).toBe('Denys Cowan, Sam de la Rosa'))
    expect(screen.getByLabelText('Writer(s)').value).toBe('Christopher Priest')
    fireEvent.click(screen.getByRole('button', { name: 'Add to collection' }))

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    const saved = onAdd.mock.calls[0][0].credits
    expect(saved.find((c) => c.name === 'Christopher Priest').roles).toEqual(['writer'])
    expect(saved.find((c) => c.name === 'Peter B. Gillis')).toBeUndefined()
    expect(saved.find((c) => c.name === 'Denys Cowan').roles).toEqual(['artist', 'penciler'])
  })

  it('a search handed over from Price Check fills in and runs Find once (COM-61)', async () => {
    coverAPIService.searchCovers.mockResolvedValue([result('2001', 1988, 7)])
    render(<ComicForm onAdd={vi.fn()} initialQuery={{ series: 'Black Panther', issueNumber: '1', year: '1988', publisher: 'Marvel' }} />)

    expect(await screen.findByDisplayValue('Peter B. Gillis')).toBeTruthy()
    expect(coverAPIService.searchCovers).toHaveBeenCalledTimes(1)
    expect(coverAPIService.searchCovers).toHaveBeenCalledWith('Black Panther', '1', 'Marvel', '1988')
  })

  it('the review step links to eBay sold listings for the match (COM-61)', async () => {
    coverAPIService.searchCovers.mockResolvedValue([result('2001', 1988, 7)])
    render(<ComicForm onAdd={vi.fn()} />)

    find('Black Panther', '1')
    const link = await screen.findByRole('link', { name: /Check eBay sold prices/ })
    expect(new URL(link.getAttribute('href')).searchParams.get('_nkw')).toBe('Black Panther 1 1988 comic')
  })

  it('Change match goes back with the inputs from before the match', async () => {
    coverAPIService.searchCovers.mockResolvedValue([result('2001', 1988, 7)])
    render(<ComicForm onAdd={vi.fn()} />)

    find('Black Panther', '1')
    await screen.findByDisplayValue('Peter B. Gillis')
    fireEvent.click(screen.getByRole('button', { name: 'Change match' }))

    fireEvent.click(screen.getByRole('button', { name: /Narrow it down/ }))
    expect(screen.getByLabelText('Series *').value).toBe('Black Panther')
    expect(screen.getByLabelText('Year').value).toBe('') // the match's 1988 isn't left as a search hint
    expect(screen.getByLabelText('Publisher').value).toBe('')
  })
})
