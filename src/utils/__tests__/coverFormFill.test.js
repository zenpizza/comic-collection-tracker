import { describe, it, expect } from 'vitest'
import { applyCoverMetadataToForm } from '../coverFormFill.js'

const emptyForm = {
  series: 'Saga',
  issueNumber: '1',
  publisher: '',
  year: '',
  volumeId: '',
  volumeName: ''
}

describe('applyCoverMetadataToForm (COM-46)', () => {
  it('fills an empty publisher from the cover metadata', () => {
    const next = applyCoverMetadataToForm(emptyForm, { publisher: 'Image' })
    expect(next.publisher).toBe('Image')
  })

  it('treats a whitespace-only publisher as empty', () => {
    const next = applyCoverMetadataToForm({ ...emptyForm, publisher: '  ' }, { publisher: 'Image' })
    expect(next.publisher).toBe('Image')
  })

  it('keeps a publisher the user already entered', () => {
    const next = applyCoverMetadataToForm({ ...emptyForm, publisher: 'Image Comics' }, { publisher: 'Image' })
    expect(next.publisher).toBe('Image Comics')
  })

  it('fills an empty year from the cover metadata as a string (COM-50)', () => {
    const next = applyCoverMetadataToForm(emptyForm, { year: 2012 })
    expect(next.year).toBe('2012')
  })

  it('keeps a year the user already entered (COM-50)', () => {
    const next = applyCoverMetadataToForm({ ...emptyForm, year: '2013' }, { year: 2012 })
    expect(next.year).toBe('2013')
  })

  it('fills volume fields from the cover metadata', () => {
    const next = applyCoverMetadataToForm(emptyForm, { volumeId: '43460', volumeName: 'Saga' })
    expect(next).toMatchObject({ volumeId: '43460', volumeName: 'Saga' })
  })

  it('leaves the form unchanged for missing or empty metadata', () => {
    expect(applyCoverMetadataToForm(emptyForm, null)).toBe(emptyForm)
    expect(applyCoverMetadataToForm(emptyForm, { publisher: '' })).toEqual(emptyForm)
  })

  it('does not mutate the original form', () => {
    applyCoverMetadataToForm(emptyForm, { publisher: 'Image', volumeName: 'Saga' })
    expect(emptyForm.publisher).toBe('')
    expect(emptyForm.volumeName).toBe('')
  })
})
