/**
 * Configuration module for environment-aware settings
 * Handles differences between local development, preview, and production
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Detect environment
// Vercel sets VERCEL_ENV to 'production', 'preview', or 'development'
const vercelEnv = process.env.VERCEL_ENV;
const nodeEnv = process.env.NODE_ENV;

// Determine which environment file to load (only for local development)
let envFile = '.env.local';
if (nodeEnv === 'development' && !vercelEnv) {
  // Local development
  envFile = '.env.development';
}

// Load environment file (Vercel deployments use dashboard env vars, not files)
if (!vercelEnv) {
  dotenv.config({ path: join(__dirname, '..', envFile) });
}

/**
 * Get MongoDB connection URI
 */
export function getMongoDBUri() {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }
  
  return uri;
}

/**
 * Get database name from URI or use default
 * Supports environment-specific database names
 */
export function getDatabaseName() {
  const uri = getMongoDBUri();
  
  // Extract database name from URI
  const match = uri.match(/\/([^/?]+)(\?|$)/);
  if (match && match[1]) {
    return match[1];
  }
  
  // Fallback: use environment-specific database name
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'preview') {
    return 'comic-collection-preview';
  } else if (vercelEnv === 'development' || process.env.NODE_ENV === 'development') {
    return 'comic-collection-dev';
  }
  
  // Default production database name
  return 'comic-collection';
}

/**
 * Get environment info
 */
export function getEnvironment() {
  const vercelEnv = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV || 'production';
  
  return {
    // Environment detection
    vercelEnv,
    nodeEnv,
    isLocal: !vercelEnv,
    isVercel: !!vercelEnv,
    
    // Specific environment checks
    isDevelopment: nodeEnv === 'development' || vercelEnv === 'development',
    isPreview: vercelEnv === 'preview',
    isProduction: vercelEnv === 'production' || (!vercelEnv && nodeEnv === 'production'),
    
    // Database info
    mongoUri: getMongoDBUri(),
    databaseName: getDatabaseName(),
  };
}

/**
 * Get API configuration
 */
export function getApiConfig() {
  return {
    comicVineApiKey: process.env.COMICVINE_API_KEY || process.env.VITE_COMICVINE_API_KEY,
  };
}

export default {
  getMongoDBUri,
  getDatabaseName,
  getEnvironment,
  getApiConfig,
};
