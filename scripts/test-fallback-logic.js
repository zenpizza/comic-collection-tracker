/**
 * Test the fallback search logic
 */

function generateSearchFallbacks(series, issue) {
  const fallbacks = []
  
  // Remove subtitle after comma (e.g., "Firestorm, the Nuclear Man" -> "Firestorm")
  if (series.includes(',')) {
    const beforeComma = series.split(',')[0].trim()
    if (beforeComma.length > 0 && beforeComma !== series) {
      fallbacks.push({
        series: beforeComma,
        issue: issue,
        reason: `Removed subtitle after comma`
      })
    }
  }
  
  // Remove common adjectives that might not be in Comic Vine
  const adjectives = ['uncanny', 'amazing', 'spectacular', 'sensational', 'incredible', 'invincible', 'mighty', 'astonishing', 'extraordinary']
  
  let simplifiedSeries = series
  for (const adj of adjectives) {
    const regex = new RegExp(`\\b${adj}\\b`, 'gi')
    if (regex.test(simplifiedSeries)) {
      const withoutAdj = simplifiedSeries.replace(regex, '').replace(/\s+/g, ' ').trim()
      if (withoutAdj !== simplifiedSeries && withoutAdj.length > 0) {
        fallbacks.push({
          series: withoutAdj,
          issue: issue,
          reason: `Removed "${adj}" from series name`
        })
      }
    }
  }
  
  return fallbacks
}

// Test cases
const testCases = [
  { series: 'Firestorm, the Nuclear Man', issue: '98' },
  { series: 'The Amazing Spider-Man', issue: '1' },
  { series: 'X-Men, Vol. 2', issue: '1' },
  { series: 'Batman', issue: '1' }
]

console.log('Testing fallback search logic:\n')

testCases.forEach(({ series, issue }) => {
  console.log(`Series: "${series}", Issue: ${issue}`)
  const fallbacks = generateSearchFallbacks(series, issue)
  if (fallbacks.length > 0) {
    console.log('Fallbacks:')
    fallbacks.forEach((fb, i) => {
      console.log(`  ${i + 1}. "${fb.series}" #${fb.issue} - ${fb.reason}`)
    })
  } else {
    console.log('  No fallbacks needed')
  }
  console.log()
})
