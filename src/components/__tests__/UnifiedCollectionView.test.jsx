// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import UnifiedCollectionView from '../UnifiedCollectionView'

// Covers and the detail modal aren't part of the layout behaviour under test
vi.mock('../CoverImage', () => ({ default: () => null }))
vi.mock('../ComicDetailView', () => ({ default: () => null }))

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
    const search = screen.getByLabelText('Search titles')
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
