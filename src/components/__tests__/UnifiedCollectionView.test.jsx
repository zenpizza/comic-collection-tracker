// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import UnifiedCollectionView from '../UnifiedCollectionView'

// Covers aren't part of the behaviour under test. The detail modal is a stub
// that shows which comic is open and exposes the creator-link callback.
vi.mock('../CoverImage', () => ({ default: () => null }))
vi.mock('../ComicDetailView', () => ({
  default: ({ comic, onSelectCreator }) => (
    <div data-testid="comic-detail">
      Detail: {comic.series} #{comic.issueNumber}
      {onSelectCreator && <button type="button" onClick={() => onSelectCreator('walt simonson')}>Creator link</button>}
    </div>
  ),
}))

afterEach(cleanup)

const comics = [
  { id: 'a1', series: 'Avengers', issueNumber: '1' },
  { id: 'a2', series: 'Avengers', issueNumber: '2' },
  { id: 'x1', series: 'X-Factor', issueNumber: '12' },
]

const renderView = () => render(<UnifiedCollectionView comics={comics} onRemove={() => {}} onEdit={() => {}} />)

// jsdom doesn't lay anything out, so give an element a working scrollTop
const trackScrollTop = (el, initial = 0) => {
  let value = initial
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => value, set: (v) => { value = v } })
}

describe('UnifiedCollectionView panes (COM-53)', () => {
  it('sizes the two-panel area to fill the window', () => {
    const { container } = renderView()
    const body = container.querySelector('.ucv__body')
    // jsdom: element top 0, window 768 tall, 30px gap
    expect(body.style.getPropertyValue('--ucv-body-height')).toBe('738px')
  })

  it('opens a newly picked title at the top of the issues panel', () => {
    const { container } = renderView()
    const panel = container.querySelector('.ucv__panel-right')
    trackScrollTop(panel, 240)

    fireEvent.click(screen.getByText('X-Factor'))

    expect(panel.scrollTop).toBe(0)
    expect(screen.getByRole('heading', { name: 'X-Factor' })).toBeTruthy()
  })

  it('scrolls the list (not the page) to the selected title when a search is cleared', () => {
    const { container } = renderView()
    const list = container.querySelector('.ucv__series-list')
    trackScrollTop(list, 0)

    fireEvent.click(screen.getByText('X-Factor'))
    const search = screen.getByLabelText('Search titles or creators')
    fireEvent.change(search, { target: { value: 'x' } })

    // X-Factor matches "x", so its row stays mounted while filtered. Place it
    // 150px below the list's visible bottom for when the full list returns.
    const row = container.querySelector('.ucv__series-row.is-active')
    row.getBoundingClientRect = () => ({ top: 510, bottom: 550 })
    list.getBoundingClientRect = () => ({ top: 100, bottom: 400 })
    const pageScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    fireEvent.change(search, { target: { value: '' } })

    expect(list.scrollTop).toBe(150)
    expect(pageScroll).not.toHaveBeenCalled()
  })
})

describe('UnifiedCollectionView browse and search by creator (COM-59, COM-56)', () => {
  const credited = [
    { id: 't337', series: 'Thor', issueNumber: '337', credits: [{ name: 'Walt Simonson', roles: ['writer', 'artist'] }] },
    { id: 't338', series: 'Thor', issueNumber: '338', credits: [{ name: 'Walt Simonson', roles: ['writer', 'artist'] }] },
    { id: 'xf10', series: 'X-Factor', issueNumber: '10', credits: [{ name: 'Walt Simonson', roles: ['penciler'] }, { name: 'Louise Simonson', roles: ['writer'] }] },
    { id: 'xm137', series: 'The Uncanny X-Men', issueNumber: '137', credits: [{ name: 'Chris Claremont', roles: ['writer'] }, { name: 'John Byrne', roles: ['penciler'] }] },
    { id: 'xm138', series: 'The Uncanny X-Men', issueNumber: '138', credits: [{ name: 'Chris Claremont', roles: ['writer'] }] },
    { id: 'xm139', series: 'The Uncanny X-Men', issueNumber: '139', credits: [{ name: 'Chris Claremont', roles: ['writer'] }] },
    { id: 'none', series: 'Hamsters', issueNumber: '7', credits: null },
  ]
  const renderCredited = () => render(<UnifiedCollectionView comics={credited} onRemove={() => {}} onEdit={() => {}} />)
  const creatorRows = () => screen.getAllByRole('option').map((li) => li.querySelector('.ucv__series-name').textContent)
  const showCreators = () => fireEvent.click(screen.getByRole('button', { name: 'Creators' }))

  it('lists creators by issue count and shows the first one\'s issues grouped by series', () => {
    renderCredited()
    showCreators()

    expect(creatorRows()).toEqual(['Chris Claremont', 'Walt Simonson', 'John Byrne', 'Louise Simonson'])
    expect(screen.getByRole('heading', { name: 'Chris Claremont' })).toBeTruthy()
    expect(screen.getByText('3 issues in your collection')).toBeTruthy()

    fireEvent.click(screen.getByText('Walt Simonson'))
    expect(screen.getByRole('heading', { name: 'Walt Simonson' })).toBeTruthy()
    const groups = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(groups).toEqual(['Thor: writer, art', 'X-Factor: pencils'])
  })

  it('filters creators by role and by name', () => {
    renderCredited()
    showCreators()

    fireEvent.click(screen.getByRole('button', { name: 'Artists' }))
    expect(creatorRows()).toEqual(['Walt Simonson', 'John Byrne'])
    fireEvent.click(screen.getByRole('button', { name: 'Writers' }))
    expect(creatorRows()).toEqual(['Chris Claremont', 'Walt Simonson', 'Louise Simonson'])

    fireEvent.change(screen.getByLabelText('Search creators'), { target: { value: 'simonson' } })
    expect(creatorRows()).toEqual(['Walt Simonson', 'Louise Simonson'])
  })

  it('opens a comic from a creator\'s covers', () => {
    renderCredited()
    showCreators()
    fireEvent.click(screen.getByText('Walt Simonson'))

    fireEvent.click(screen.getByRole('button', { name: 'X-Factor #10: view details' }))
    expect(screen.getByTestId('comic-detail').textContent).toContain('Detail: X-Factor #10')
  })

  it('title search also finds series through their creators, and says who matched', () => {
    renderCredited()
    const search = screen.getByLabelText('Search titles or creators')

    fireEvent.change(search, { target: { value: 'simonson' } })
    const rows = screen.getAllByRole('option')
    expect(rows.map((li) => li.querySelector('.ucv__series-name').textContent)).toEqual(['Thor', 'X-Factor'])
    expect(rows[0].textContent).toContain('• Walt Simonson')

    fireEvent.change(search, { target: { value: 'thor' } })
    expect(screen.getAllByRole('option')[0].textContent).not.toContain('•') // matched by title
  })

  it('a creator link in the comic detail view switches to that creator', () => {
    renderCredited()
    fireEvent.click(screen.getByText('Thor'))
    fireEvent.click(screen.getByRole('button', { name: 'Thor #337 — View details' }))

    fireEvent.click(screen.getByRole('button', { name: 'Creator link' }))

    expect(screen.queryByTestId('comic-detail')).toBeNull()
    expect(screen.getByRole('button', { name: 'Creators' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Walt Simonson' })).toBeTruthy()
  })

  it('explains when there are no credits yet', () => {
    render(<UnifiedCollectionView comics={comics} onRemove={() => {}} onEdit={() => {}} />)
    showCreators()
    expect(screen.getByText(/No creator credits yet\. They're filled in as you open comics/)).toBeTruthy()
  })
})
