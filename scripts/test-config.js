#!/usr/bin/env node
/**
 * Test configuration module
 */

import { getEnvironment, getApiConfig } from '../api/config.js';

console.log('🔧 Configuration Test\n');
console.log('═'.repeat(50));

const env = getEnvironment();
const api = getApiConfig();

console.log('\n📋 Environment:');
console.log('  NODE_ENV:', env.nodeEnv);
console.log('  VERCEL_ENV:', env.vercelEnv || 'not set (local)');
console.log('  Is Local:', env.isLocal);
console.log('  Is Vercel:', env.isVercel);
console.log('  Is Development:', env.isDevelopment);
console.log('  Is Preview:', env.isPreview);
console.log('  Is Production:', env.isProduction);
console.log('  Database Name:', env.databaseName);
console.log('  MongoDB URI:', env.mongoUri.substring(0, 30) + '...');

console.log('\n🔑 API Configuration:');
console.log('  ComicVine API Key:', api.comicVineApiKey ? '✅ Set' : '❌ Not set');

console.log('\n' + '═'.repeat(50));
