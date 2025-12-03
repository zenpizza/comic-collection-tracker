#!/usr/bin/env node
/**
 * MongoDB Connection Diagnostics
 * 
 * Helps diagnose connection issues with MongoDB Atlas
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

console.log('🔍 MongoDB Connection Diagnostics\n');
console.log('═'.repeat(50));

// Check environment
console.log('\n📋 Environment Check:');
console.log('  ✓ MONGODB_URI exists:', !!process.env.MONGODB_URI);
if (process.env.MONGODB_URI) {
  const uri = process.env.MONGODB_URI;
  const match = uri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)/);
  if (match) {
    console.log('  ✓ Username:', match[1]);
    console.log('  ✓ Password:', '*'.repeat(8));
    console.log('  ✓ Cluster:', match[3]);
  }
}

// Get public IP
console.log('\n🌐 Your Public IP Address:');
try {
  const response = await fetch('https://api.ipify.org?format=json');
  const data = await response.json();
  console.log('  📍', data.ip);
  console.log('\n  ⚠️  This IP must be whitelisted in MongoDB Atlas!');
  console.log('  👉 Go to: Network Access → Add IP Address');
} catch (error) {
  console.log('  ❌ Could not fetch public IP');
}

// Test connection
console.log('\n🔌 Testing MongoDB Connection...');
const client = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
});

try {
  await client.connect();
  console.log('  ✅ Connection successful!');
  
  const db = client.db('comic-collection');
  const collections = await db.listCollections().toArray();
  console.log(`  ✅ Found ${collections.length} collections`);
  
  const comicsCount = await db.collection('comics').countDocuments();
  console.log(`  ✅ Comics: ${comicsCount}`);
  
} catch (error) {
  console.log('  ❌ Connection failed!');
  console.log('\n📝 Error Details:');
  console.log('  Type:', error.name);
  console.log('  Message:', error.message);
  
  if (error.name === 'MongoServerSelectionError') {
    console.log('\n💡 Common Solutions:');
    console.log('  1. Add your IP to MongoDB Atlas Network Access');
    console.log('  2. Or allow access from anywhere (0.0.0.0/0)');
    console.log('  3. Check if your network/firewall blocks MongoDB ports');
    console.log('\n🔗 MongoDB Atlas Dashboard:');
    console.log('  https://cloud.mongodb.com/');
  }
} finally {
  await client.close();
}

console.log('\n' + '═'.repeat(50));
