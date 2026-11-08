import { describe, it, expect } from 'vitest'
import { groupCredits, creditsToFields, applyCreditFields } from '../credits.js'

// Black Panther #98 as stored after fetchIssueCredits
const credits = [
  { name: 'Al Milgrom', roles: ['writer'] },
  { name: 'Danny Fingeroth', roles: ['editor'] },
  { name: 'Diana Albers', roles: ['letterer'] },
  { name: 'George Roussos', roles: ['colorist'] },
  { name: 'Herb Trimpe', roles: ['artist', 'penciler', 'cover'] },
  { name: 'Jim Mooney', roles: ['inker'] },
]

describe('credits helpers (COM-55)', () => {
  it('groups writers, artists with detail, and the rest in a fixed order', () => {
    expect(groupCredits(credits)).toEqual({
      writers: ['Al Milgrom'],
      artists: [{ name: 'Herb Trimpe', detail: 'pencils' }, { name: 'Jim Mooney', detail: 'inks' }],
      other: [
        { label: 'Cover', names: ['Herb Trimpe'] },
        { label: 'Colors', names: ['George Roussos'] },
        { label: 'Letters', names: ['Diana Albers'] },
        { label: 'Editor', names: ['Danny Fingeroth'] },
      ],
    })
  })

  it('handles missing credits and unknown roles', () => {
    expect(groupCredits(null)).toEqual({ writers: [], artists: [], other: [] })
    expect(groupCredits([{ name: 'X', roles: ['penciler', 'inker', 'translator'] }])).toEqual({
      writers: [],
      artists: [{ name: 'X', detail: 'pencils & inks' }],
      other: [{ label: 'Translator', names: ['X'] }],
    })
  })

  it('turns credits into edit field text', () => {
    expect(creditsToFields(credits)).toEqual({ writers: 'Al Milgrom', artists: 'Herb Trimpe, Jim Mooney' })
    expect(creditsToFields(null)).toEqual({ writers: '', artists: '' })
  })

  it('returns the original credits when the fields are unchanged, null included', () => {
    expect(applyCreditFields(credits, { writers: 'Al Milgrom', artists: 'Herb Trimpe,  Jim Mooney ' })).toBe(credits)
    expect(applyCreditFields(null, { writers: '', artists: '' })).toBeNull()
  })

  it('replaces writers without touching the artists\' pencils/inks detail', () => {
    const next = applyCreditFields(credits, { writers: 'Christopher Priest, Al Milgrom', artists: 'Herb Trimpe, Jim Mooney' })

    expect(groupCredits(next).writers).toEqual(['Al Milgrom', 'Christopher Priest'])
    expect(groupCredits(next).artists).toEqual([{ name: 'Herb Trimpe', detail: 'pencils' }, { name: 'Jim Mooney', detail: 'inks' }])
    expect(next.find((c) => c.name === 'George Roussos').roles).toEqual(['colorist'])
  })

  it('replaces artists: kept names keep their detail, new names become artists, removed ones lose the role', () => {
    const next = applyCreditFields(credits, { writers: 'Al Milgrom', artists: 'Herb Trimpe, Denys Cowan' })

    expect(groupCredits(next).artists).toEqual([{ name: 'Herb Trimpe', detail: 'pencils' }, { name: 'Denys Cowan', detail: null }])
    expect(next.find((c) => c.name === 'Jim Mooney')).toBeUndefined() // had only the inker role
    expect(next.find((c) => c.name === 'Herb Trimpe').roles).toContain('cover') // other roles kept
  })

  it('builds credits from scratch for a hand-entered comic', () => {
    expect(applyCreditFields(null, { writers: 'Walt Simonson', artists: 'Walt Simonson' })).toEqual([
      { name: 'Walt Simonson', roles: ['writer', 'artist'] },
    ])
  })
})
