/**
 * Test script to check what Comic Vine returns for a specific search
 * Usage: node scripts/test-comicvine-search.js "Series Name" "Issue Number"
 */

const series = process.argv[2] || 'The Uncanny X-Men Annual'
const issue = process.argv[3] || '9'

const baseUrl = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

async function testSearch() {
  console.log(`Testing Comic Vine search for: ${series} #${issue}`)
  console.log(`Using base URL: ${baseUrl}`)
  
  const url = new URL('/api/cover-search', baseUrl)
  url.searchParams.set('series', series)
  url.searchParams.set('issue', issue)
  url.searchParams.set('publisher', 'Marvel')
  
  console.log(`\nFull URL: ${url.toString()}\n`)
  
  try {
    const response = await fetch(url.toString())
    const data = await response.json()
    
    console.log('Response:', JSON.stringify(data, null, 2))
    
    if (data.results && data.results.length > 0) {
      console.log(`\n✅ Found ${data.results.length} results`)
      data.results.forEach((result, i) => {
        console.log(`\n${i + 1}. ${result.metadata.title} #${result.metadata.issueNumber}`)
        console.log(`   Image: ${result.imageUrl}`)
        console.log(`   Provider: ${result.providerName}`)
      })
    } else {
      console.log('\n❌ No results found')
    }
  } catch (error) {
    console.error('Error:', error.message)
  }
}

testSearch()
