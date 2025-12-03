#!/usr/bin/env node
/**
 * Setup Development Database
 * 
 * This script helps initialize a development database with optional sample data
 * from your production database.
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load development environment
dotenv.config({ path: join(__dirname, '..', '.env.development') });

const PROD_URI = process.env.MONGODB_URI?.replace('-dev', '');
const DEV_URI = process.env.MONGODB_URI;

async function setupDevDatabase() {
  console.log('🚀 Setting up development database...\n');
  
  const devClient = new MongoClient(DEV_URI);
  
  try {
    await devClient.connect();
    console.log('✅ Connected to development database\n');
    
    const devDb = devClient.db();
    
    // Create collections if they don't exist
    const collections = await devDb.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes('comics')) {
      await devDb.createCollection('comics');
      console.log('✅ Created comics collection');
    }
    
    if (!collectionNames.includes('cover_images')) {
      await devDb.createCollection('cover_images');
      console.log('✅ Created cover_images collection');
    }
    
    // Create indexes
    await devDb.collection('comics').createIndex({ series: 1, issueNumber: 1 });
    await devDb.collection('cover_images').createIndex({ comicId: 1 });
    console.log('✅ Created indexes\n');
    
    const comicsCount = await devDb.collection('comics').countDocuments();
    const imagesCount = await devDb.collection('cover_images').countDocuments();
    
    console.log('📊 Development Database Status:');
    console.log(`   Comics: ${comicsCount}`);
    console.log(`   Cover Images: ${imagesCount}\n`);
    
    if (comicsCount === 0) {
      console.log('💡 Your development database is empty.');
      console.log('   You can:');
      console.log('   1. Start fresh and add comics manually');
      console.log('   2. Copy sample data from production (run with --copy-sample flag)');
      console.log('   3. Copy all data from production (run with --copy-all flag)\n');
    }
    
    console.log('✅ Development database is ready!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await devClient.close();
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--copy-sample') || args.includes('--copy-all')) {
  console.log('⚠️  Data copying not implemented yet.');
  console.log('   For now, use the app to add comics to your dev database.\n');
}

setupDevDatabase();
