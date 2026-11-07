import { useLayoutEffect, useState } from 'react'

/**
 * Height that makes `el` reach the bottom of the window, less `bottomGap`.
 * Uses the element's position in the document (not the viewport), so the
 * result doesn't change as the page scrolls.
 */
export function measureFillHeight(el, bottomGap = 0) {
  const documentTop = el.getBoundingClientRect().top + window.scrollY
  return Math.round(window.innerHeight - documentTop - bottomGap)
}

/**
 * Returns the height (px) that lets the element in `ref` fill the window from
 * where it starts down to `bottomGap` above the bottom, or null until measured.
 *
 * Re-measures on window resize and whenever the page's layout changes size —
 * the content above the element (top bar, tabs) can re-wrap without a resize,
 * e.g. when the save-status chip changes text.
 */
export function useFillViewportHeight(ref, { bottomGap = 0 } = {}) {
  const [height, setHeight] = useState(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const update = () => {
      const next = measureFillHeight(el, bottomGap)
      setHeight((prev) => (prev === next ? prev : next))
    }

    update()
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    observer?.observe(document.body)

    return () => {
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [ref, bottomGap])

  return height
}
