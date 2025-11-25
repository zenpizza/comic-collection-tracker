/**
 * Test script to verify cover search prioritization
 * Tests that publisher and year are properly prioritized in search results
 */

import 'dotenv/config'

// Use production URL since we're testing deployed API
const API_BASE = 'https://comic-collection-tracker.vercel.app'

async function testCoverSearch(series, issue, publisher, year) {
  console.log('\n' + '='.repeat(80))
  console.log(`Testing: ${series} #${issue}`)
  console.log(`Publisher: ${publisher}, Year: ${year}`)
  console.log('='.repeat(80))

  try {
    const url = new URL(`${API_BASE}/api/cover-search`)
    url.searchParams.set('series', series)
    url.searchParams.set('issue', issue)
    url.searchParams.set('publisher', publisher)
    url.searchParams.set('year', year)

    console.log(`\nFetching: ${url.toString()}\n`)

    const response = await fetch(url.toString())
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    console.log(`Total results: ${data.results.length}`)
    console.log('\nTop 5 Results (should prioritize publisher match + year proximity):\n')

    data.results.slice(0, 5).forEach((result, index) => {
      const resultPublisher = result.metadata?.publisher || 'NO PUBLISHER'
      const resultYear = result.metadata?.year || 'NO YEAR'
      const resultTitle = result.metadata?.title || 'NO TITLE'
      const variant = result.variant ? ` (${result.variant})` : ''
      
      // Check if publisher matches
      const publisherMatch = resultPublisher.toLowerCase().includes(publisher.toLowerCase()) ||
                            publisher.toLowerCase().includes(resultPublisher.toLowerCase())
      
      // Calculate year difference
      const yearDiff = resultYear !== 'NO YEAR' ? Math.abs(parseInt(resultYear) - parseInt(year)) : '?'
      
      // Visual indicators
      const publisherIndicator = publisherMatch ? '✓' : '✗'
      const yearIndicator = yearDiff === 0 ? '✓' : (yearDiff <= 2 ? '~' : '✗')
      
      console.log(`${index + 1}. ${resultTitle}${variant}`)
      console.log(`   Publisher: ${resultPublisher} ${publisherIndicator}`)
      console.log(`   Year: ${resultYear} (diff: ${yearDiff}) ${yearIndicator}`)
      console.log(`   Provider: ${result.provider}`)
      console.log(`   Image: ${result.imageUrl}`)
      console.log()
    })

    // Analyze first result
    const firstResult = data.results[0]
    if (firstResult) {
      const firstPublisher = firstResult.metadata?.publisher || ''
      const firstYear = firstResult.metadata?.year || 0
      const publisherMatch = firstPublisher.toLowerCase().includes(publisher.toLowerCase()) ||
                            publisher.toLowerCase().includes(firstPublisher.toLowerCase())
      const yearDiff = Math.abs(parseInt(firstYear) - parseInt(year))

      console.log('Analysis of first result:')
      console.log(`  Publisher match: ${publisherMatch ? 'YES ✓' : 'NO ✗'}`)
      console.log(`  Year difference: ${yearDiff} years ${yearDiff <= 2 ? '✓' : '✗'}`)
      
      if (!publisherMatch) {
        console.log('\n⚠️  WARNING: First result does NOT match publisher!')
        console.log(`   Expected: ${publisher}`)
        console.log(`   Got: ${firstPublisher || 'NO PUBLISHER'}`)
      }
      
      if (yearDiff > 2) {
        console.log(`\n⚠️  WARNING: First result year is ${yearDiff} years off!`)
        console.log(`   Expected: ${year}`)
        console.log(`   Got: ${firstYear}`)
      }

      if (publisherMatch && yearDiff <= 2) {
        console.log('\n✅ PASS: First result matches publisher and is within 2 years!')
      }
    }

    return data.results

  } catch (error) {
    console.error('❌ Test failed:', error.message)
    throw error
  }
}

async function runTests() {
  console.log('Cover Search Prioritization Test Suite')
  console.log('Testing publisher and year prioritization in search results')
  
  try {
    // Test 1: The Transformers #12 (Marvel, 1986)
    await testCoverSearch('The Transformers', '12', 'Marvel', '1986')
    
    // Test 2: Amazing Spider-Man #300 (Marvel, 1988)
    await testCoverSearch('Amazing Spider-Man', '300', 'Marvel', '1988')
    
    // Test 3: X-Men #1 (Marvel, 1991) - should prioritize 1991 over 1963
    await testCoverSearch('X-Men', '1', 'Marvel', '1991')

    console.log('\n' + '='.repeat(80))
    console.log('✅ All tests completed!')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('\n❌ Test suite failed:', error)
    process.exit(1)
  }
}

// Run tests
runTests()
