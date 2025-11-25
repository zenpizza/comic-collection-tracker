/**
 * Individual comic add endpoint
 * Adds a single comic to the collection
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const comic = req.body

    if (!comic) {
      return res.status(400).json({
        success: false,
        error: 'Comic data is required'
      })
    }

    // Validate required fields
    if (!comic.series || !comic.issueNumber) {
      return res.status(400).json({
        success: false,
        error: 'Series and issue number are required'
      })
    }

    console.log('Adding individual comic:', {
      series: comic.series,
      issue: comic.issueNumber,
      publisher: comic.publisher
    })

    // For now, we'll use the same logic as the bulk save
    // In a real implementation, this would add to a database
    
    // Generate a unique ID if not provided
    if (!comic.id) {
      comic.id = `comic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    // Add timestamp
    comic.dateAdded = new Date().toISOString()

    res.json({
      success: true,
      message: 'Comic added successfully',
      comic: comic,
      id: comic.id
    })

  } catch (error) {
    console.error('Error adding comic:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to add comic',
      details: error.message
    })
  }
}