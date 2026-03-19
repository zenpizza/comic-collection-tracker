/**
 * Debug endpoint to check environment configuration
 * GET /api/debug-env
 */

import { getEnvironment } from './config.js'

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const env = getEnvironment()

    return res.status(200).json({
      success: true,
      environment: {
        vercelEnv: env.vercelEnv || 'not set',
        nodeEnv: env.nodeEnv || 'not set',
        isLocal: env.isLocal,
        isVercel: env.isVercel,
        isDevelopment: env.isDevelopment,
        isPreview: env.isPreview,
        isProduction: env.isProduction,
        databaseName: env.databaseName,
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
}
