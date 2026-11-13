// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import PriceCheck from '../PriceCheck'
import coverAPIService from '../../utils/coverAPIService'

vi.mock('../../utils/coverAPIService', () => ({ default: { searchCovers: vi.fn() } }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const result = (id, volumeName, year, issueNumber = '1') => ({
  id, thumbnailUrl: `${id}.jpg`, imageUrl: `${id}-full.jpg`,
  metadata: { volumeName, year, issueNumber, publisher: 'Marvel' },
})

const owned = [
  { id: 'mine', series: 'Black Panther', issueNumber: '1', comicVineId: '2002' },
  { id: 'legacy', series: 'Hamsters', issueNumber: '7', comicVineId: null },
]

const search = (series, issueNumber) => {
  fireEvent.change(screen.getByLabelText('Series'), { target: { value: series } })
  fireEvent.change(screen.getByLabelText('Issue Number'), { target: { value: issueNumber } })
  fireEvent.click(screen.getByRole('button', { name: 'Find on ComicVine' }))
}
const ebayLink = () => screen.getByRole('link', { name: /Check eBay sold prices/ })
const ebayQuery = (link) => new URL(link.getAttribute('href')).searchParams.get('_nkw')

describe('PriceCheck (COM-61)', () => {
  it('auto-selects a single match and links to eBay sold listings for that volume and year', async () => {
    coverAPIService.searchCovers.mockResolvedValue([result('2001', 'Black Panther', 1988)])
    render(<PriceCheck comics={owned} />)

    search('Black Panther', '1')

    const link = await screen.findByRole('link', { name: /Check eBay sold prices/ })
    expect(ebayQuery(link)).toBe('Black Panther 1 1988 comic')
    expect(new URL(link.getAttribute('href')).searchParams.get('LH_Sold')).toBe('1')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    // You own the 1998 #1, not this 1988 one
    expect(screen.getByText('Not in your collection')).toBeTruthy()
  })

  it('lists several matches, and picking one shows it with its ownership', async () => {
    coverAPIService.searchCovers.mockResolvedValue([result('2001', 'Black Panther', 1988), result('2002', 'Black Panther', 1998)])
    render(<PriceCheck comics={owned} />)

    search('Black Panther', '1')
    fireEvent.click(await screen.findByRole('button', { name: /Black Panther #1\s*1998/ }))

    expect(screen.getByText('✓ In your collection')).toBeTruthy()
    expect(ebayQuery(ebayLink())).toBe('Black Panther 1 1998 comic')

    fireEvent.click(screen.getByRole('button', { name: 'Change match' }))
    expect(screen.getByText('2 matches. Pick yours:')).toBeTruthy()
  })

  it('falls back to series and issue for owned comics without a ComicVine id', async () => {
    coverAPIService.searchCovers.mockResolvedValue([result('777', 'Advanced Radioactive Black Belt Hamsters', 1990, '7')])
    render(<PriceCheck comics={owned} />)

    search('Hamsters', '7')

    expect(await screen.findByText('✓ In your collection')).toBeTruthy()
  })

  it('offers an eBay search for the typed text when ComicVine has no match', async () => {
    coverAPIService.searchCovers.mockResolvedValue([])
    render(<PriceCheck comics={owned} />)

    search('Obscure Indie', '3')

    const link = await screen.findByRole('link', { name: /Search eBay sold listings for what you typed/ })
    expect(screen.getByText('ComicVine has no match for this issue.')).toBeTruthy()
    expect(ebayQuery(link)).toBe('Obscure Indie 3 comic')
  })

  it('still offers the eBay fallback when the ComicVine search fails', async () => {
    coverAPIService.searchCovers.mockRejectedValue(new Error('down'))
    render(<PriceCheck comics={owned} />)

    search('Thor', '337')

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Search eBay sold listings for what you typed/ })).toBeTruthy()
  })

  it('hands the issue to Add Comic, and New search starts over', async () => {
    coverAPIService.searchCovers.mockResolvedValue([result('2001', 'Black Panther', 1988)])
    const onAddToCollection = vi.fn()
    render(<PriceCheck comics={owned} onAddToCollection={onAddToCollection} />)

    search('Black Panther', '1')
    fireEvent.click(await screen.findByRole('button', { name: 'Add to collection' }))
    expect(onAddToCollection).toHaveBeenCalledWith({ series: 'Black Panther', issueNumber: '1', year: '1988', publisher: 'Marvel' })

    fireEvent.click(screen.getByRole('button', { name: 'New search' }))
    expect(screen.getByLabelText('Series').value).toBe('')
    expect(screen.queryByRole('link', { name: /Check eBay sold prices/ })).toBeNull()
  })

  it('asks for series and issue before searching', () => {
    render(<PriceCheck comics={owned} />)
    fireEvent.click(screen.getByRole('button', { name: 'Find on ComicVine' }))
    expect(screen.getByRole('alert').textContent).toContain('Enter the series and issue number first')
    expect(coverAPIService.searchCovers).not.toHaveBeenCalled()
  })
})
