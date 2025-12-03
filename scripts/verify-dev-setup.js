#!/usr/bin/env node
/**
 * Verify local development setup
 * Checks Docker, MongoDB, and configuration
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { MongoClient } from 'mongodb';

const execAsync = promisify(exec);

console.log('🔍 Verifying Local Development Setup\n');
console.log('═'.repeat(60));

let allGood = true;

// Check 1: Docker
console.log('\n1️⃣ Checking Docker...');
try {
  await execAsync('docker --version');
  console.log('   ✅ Docker is installed');
  
  const { stdout } = await execAsync('docker ps --filter name=comic-tracker-mongodb --format "{{.Status}}"');
  if (stdout.trim()) {
    console.log('   ✅ MongoDB container is running');
  } else {
    console.log('   ⚠️  MongoDB container is not running');
    console.log('   💡 Run: npm run dev:db');
    allGood = false;
  }
} catch (error) {
  console.log('   ❌ Docker is not installed or not running');
  console.log('   💡 Install Docker Desktop: https://www.docker.com/products/docker-desktop');
  allGood = false;
}

// Check 2: Environment files
console.log('\n2️⃣ Checking Environment Files...');
try {
  const fs = await import('fs');
  
  if (fs.existsSync('.env.development')) {
    console.log('   ✅ .env.development exists');
  } else {
    console.log('   ❌ .env.development missing');
    allGood = false;
  }
  
  if (fs.existsSync('.env.local')) {
    console.log('   ✅ .env.local exists');
  } else {
    console.log('   ⚠️  .env.local missing (needed for production)');
  }
} catch (error) {
  console.log('   ❌ Error checking files:', error.message);
  allGood = false;
}

// Check 3: MongoDB Connection
console.log('\n3️⃣ Checking MongoDB Connection...');
try {
  // Set development environment
  process.env.NODE_ENV = 'development';
  
  const { getMongoDBUri, getDatabaseName } = await import('../api/config.js');
  const uri = getMongoDBUri();
  const dbName = getDatabaseName();
  
  console.log('   📋 Database:', dbName);
  console.log('   📋 URI:', uri.substring(0, 30) + '...');
  
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
  });
  
  await client.connect();
  console.log('   ✅ Connected to MongoDB');
  
  const db = client.db(dbName);
  const collections = await db.listCollections().toArray();
  console.log('   ✅ Collections:', collections.map(c => c.name).join(', ') || 'none (empty database)');
  
  await client.close();
} catch (error) {
  console.log('   ❌ MongoDB connection failed:', error.message);
  console.log('   💡 Make sure MongoDB container is running: npm run dev:db');
  allGood = false;
}

// Check 4: Node modules
console.log('\n4️⃣ Checking Dependencies...');
try {
  const fs = await import('fs');
  if (fs.existsSync('node_modules')) {
    console.log('   ✅ node_modules exists');
  } else {
    console.log('   ❌ node_modules missing');
    console.log('   💡 Run: npm install');
    allGood = false;
  }
} catch (error) {
  console.log('   ❌ Error checking dependencies');
  allGood = false;
}

// Summary
console.log('\n' + '═'.repeat(60));
if (allGood) {
  console.log('\n✅ All checks passed! You\'re ready to develop.\n');
  console.log('Start development with:');
  console.log('  npm run dev:full\n');
} else {
  console.log('\n⚠️  Some checks failed. Please fix the issues above.\n');
  process.exit(1);
}
