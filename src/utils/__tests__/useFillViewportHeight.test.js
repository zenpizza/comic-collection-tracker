// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFillViewportHeight, measureFillHeight } from '../useFillViewportHeight'

// An element whose top sits `documentTop` px down the page, wherever the
// page is scrolled to — like the real .ucv__body.
const elementAt = (documentTop) => {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ top: documentTop - window.scrollY })
  return el
}

const setWindow = ({ innerHeight, scrollY }) => {
  if (innerHeight !== undefined) Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
  if (scrollY !== undefined) Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true })
}

afterEach(() => setWindow({ innerHeight: 768, scrollY: 0 }))

describe('useFillViewportHeight (COM-53)', () => {
  it('fills from the element to the bottom of the window, less the gap', () => {
    setWindow({ innerHeight: 900, scrollY: 0 })
    const ref = { current: elementAt(250) }

    const { result } = renderHook(() => useFillViewportHeight(ref, { bottomGap: 30 }))

    expect(result.current).toBe(900 - 250 - 30)
  })

  it('does not change when the page is scrolled', () => {
    setWindow({ innerHeight: 900, scrollY: 0 })
    const el = elementAt(250)
    expect(measureFillHeight(el, 30)).toBe(620)

    setWindow({ scrollY: 180 })
    expect(measureFillHeight(el, 30)).toBe(620)
  })

  it('re-measures when the window is resized', () => {
    setWindow({ innerHeight: 900, scrollY: 0 })
    const ref = { current: elementAt(250) }
    const { result } = renderHook(() => useFillViewportHeight(ref, { bottomGap: 30 }))

    act(() => {
      setWindow({ innerHeight: 700 })
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current).toBe(700 - 250 - 30)
  })

  it('returns null when there is no element to measure', () => {
    const { result } = renderHook(() => useFillViewportHeight({ current: null }))
    expect(result.current).toBeNull()
  })
})
