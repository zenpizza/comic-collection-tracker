import dataStore from '../dataStore.js'

describe('ComicDataStore checkForDuplicate', () => {
  test('returns null when new comic is missing series or issue number', () => {
    const existingComics = [{ series: 'Amazing Spider-Man', issueNumber: 1 }]

    expect(dataStore.checkForDuplicate({ series: null, issueNumber: 1 }, existingComics)).toBeNull()
    expect(dataStore.checkForDuplicate({ series: 'Amazing Spider-Man', issueNumber: undefined }, existingComics)).toBeNull()
    expect(dataStore.checkForDuplicate({ series: '', issueNumber: '' }, existingComics)).toBeNull()
  })
})
