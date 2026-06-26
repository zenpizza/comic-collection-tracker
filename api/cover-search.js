/**
 * Simplified cover search API endpoint
 * Updated: 2025-11-12 - Using /issues/ endpoint for better reliability
 */

import { requireAuth } from './auth.js'
import { searchComicVineIssues } from './lib/comicVineSearch.js'

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (!await requireAuth(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Cover search API called with:', req.query)
    const { series, issue, publisher, year } = req.query

    if (!series || !issue) {
      console.log('Missing parameters:', { series, issue })
      return res.status(400).json({
        error: 'Missing required parameters: series and issue'
      })
    }

    const apiKey = process.env.COMICVINE_API_KEY
    console.log('API key configured:', !!apiKey)

    if (!apiKey) {
      console.log('No API key found in environment')
      return res.status(500).json({
        error: 'Comic Vine API key not configured on server',
        details: 'Set COMICVINE_API_KEY environment variable'
      })
    }

    const processedResults = await searchComicVineIssues({ series, issue, publisher, year, apiKey })

    console.log(`Found ${processedResults.length} covers for ${series} #${issue}`)
    if (processedResults.length > 0) {
      console.log('Results after sorting (publisher/language/year):')
      processedResults.slice(0, 5).forEach((r, i) => {
        console.log(`  ${i + 1}. "${r.metadata?.title}" - Publisher: ${r.metadata?.publisher || 'unknown'}, Year: ${r.metadata?.year || 'unknown'}`)
      })
    }

    res.json({
      success: true,
      results: processedResults,
      total: processedResults.length,
      query: { series, issue, publisher, year }
    })

  } catch (error) {
    console.error('Cover search error:', error)
    res.status(500).json({
      error: 'Failed to search for covers',
      details: error.message
    })
  }
}
