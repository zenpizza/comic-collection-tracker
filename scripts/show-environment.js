#!/usr/bin/env node
/**
 * Display current environment configuration
 * Useful for debugging deployment issues
 */

import { getEnvironment, getApiConfig } from '../api/config.js';

const env = getEnvironment();
const api = getApiConfig();

console.log('\n🌍 Current Environment\n');

// Visual indicator
let indicator = '🔵';
let envName = 'Unknown';

if (env.isProduction && env.isLocal) {
  indicator = '🟢';
  envName = 'Local Production Mode';
} else if (env.isDevelopment && env.isLocal) {
  indicator = '🟡';
  envName = 'Local Development Mode';
} else if (env.isProduction && env.isVercel) {
  indicator = '🔴';
  envName = 'Vercel Production';
} else if (env.isPreview) {
  indicator = '🟣';
  envName = 'Vercel Preview';
}

console.log(`${indicator} ${envName}\n`);
console.log('━'.repeat(60));

console.log('\n📊 Environment Variables:');
console.log(`   NODE_ENV:    ${env.nodeEnv}`);
console.log(`   VERCEL_ENV:  ${env.vercelEnv || '(not set)'}`);

console.log('\n🎯 Environment Flags:');
console.log(`   Is Local:       ${env.isLocal ? '✅' : '❌'}`);
console.log(`   Is Vercel:      ${env.isVercel ? '✅' : '❌'}`);
console.log(`   Is Development: ${env.isDevelopment ? '✅' : '❌'}`);
console.log(`   Is Preview:     ${env.isPreview ? '✅' : '❌'}`);
console.log(`   Is Production:  ${env.isProduction ? '✅' : '❌'}`);

console.log('\n💾 Database Configuration:');
console.log(`   Database Name: ${env.databaseName}`);
console.log(`   MongoDB URI:   ${env.mongoUri.substring(0, 40)}...`);

const isAtlas = env.mongoUri.includes('mongodb+srv');
const isLocal = env.mongoUri.includes('localhost');
console.log(`   Type:          ${isAtlas ? 'MongoDB Atlas (Cloud)' : isLocal ? 'Local Docker' : 'Unknown'}`);

console.log('\n🔑 API Keys:');
console.log(`   ComicVine:     ${api.comicVineApiKey ? '✅ Configured' : '❌ Missing'}`);

console.log('\n━'.repeat(60));

// Warnings
if (env.isPreview && env.databaseName === 'comic-collection') {
  console.log('\n⚠️  WARNING: Preview deployment using production database!');
  console.log('   Check MONGODB_URI in Vercel environment variables.');
}

if (env.isLocal && !env.isDevelopment && isLocal) {
  console.log('\n⚠️  WARNING: Local mode using Docker but NODE_ENV is not "development"');
  console.log('   Set NODE_ENV=development for local development.');
}

if (!api.comicVineApiKey) {
  console.log('\n⚠️  WARNING: ComicVine API key not configured');
  console.log('   Cover search will not work.');
}

console.log('');
