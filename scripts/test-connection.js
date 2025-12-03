import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

console.log('🔍 Testing MongoDB Connection...\n');
console.log('Environment check:');
console.log('  MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('  URI prefix:', process.env.MONGODB_URI?.substring(0, 25) + '...');
console.log('');

const client = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
});

async function testConnection() {
  try {
    console.log('⏳ Attempting to connect...');
    await client.connect();
    console.log('✅ Connected successfully!\n');
    
    const db = client.db('comic-collection');
    console.log('📊 Testing database access...');
    
    const collections = await db.listCollections().toArray();
    console.log(`✅ Found ${collections.length} collections:`, collections.map(c => c.name).join(', '));
    
    const comicsCount = await db.collection('comics').countDocuments();
    console.log(`✅ Comics count: ${comicsCount}`);
    
    const imagesCount = await db.collection('cover_images').countDocuments();
    console.log(`✅ Cover images count: ${imagesCount}`);
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Connection failed!');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('\nFull error:', error);
  } finally {
    await client.close();
  }
}

testConnection();
