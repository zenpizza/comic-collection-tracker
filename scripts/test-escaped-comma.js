/**
 * Quick test for escaped comma parsing logic
 */

function parseComicLine(line) {
  // Try comma-separated format first
  if (line.includes(',')) {
    // Handle escaped commas: replace \, with a placeholder before splitting
    const COMMA_PLACEHOLDER = '___COMMA___'
    const processedLine = line.replace(/\\,/g, COMMA_PLACEHOLDER)
    
    const parts = processedLine.split(',').map(p => {
      // Restore escaped commas and trim
      return p.replace(new RegExp(COMMA_PLACEHOLDER, 'g'), ',').trim()
    })
    
    if (parts.length >= 2) {
      return {
        series: parts[0],
        issueNumber: parts[1],
        publisher: parts[2] || '',
        year: parts[3] || ''
      }
    }
  }
  return null
}

// Test cases
const testCases = [
  'Firestorm\\, the Nuclear Man, 90, DC, 1990',
  'Amazing Spider-Man, 1, Marvel, 2023',
  'X-Men\\, Vol. 2, 1, Marvel, 1991',
  'Batman\\, Superman\\, Wonder Woman, 1, DC, 2020'
]

console.log('Testing escaped comma parsing:\n')

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: "${testCase}"`)
  const result = parseComicLine(testCase)
  console.log('Result:', result)
  console.log()
})
