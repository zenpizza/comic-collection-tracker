import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const client = new MongoClient(process.env.MONGODB_URI);

async function checkStorage() {
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas\n');
    
    const db = client.db('comic-collection');
    
    const stats = await db.stats();
    const comicsCount = await db.collection('comics').countDocuments();
    const imagesCount = await db.collection('cover_images').countDocuments();
    
    console.log('📊 Database Statistics:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Data Size:    ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Storage Size:       ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Index Size:         ${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Total Size:         ${((stats.storageSize + stats.indexSize) / 1024 / 1024).toFixed(2)} MB`);
    console.log('');
    console.log(`📚 Comics:          ${comicsCount}`);
    console.log(`🖼️  Cover Images:    ${imagesCount}`);
    console.log('');
    
    if (comicsCount > 0) {
      console.log(`📈 Average per comic: ${((stats.dataSize / comicsCount) / 1024).toFixed(2)} KB`);
    }
    
    // Check what tier might be needed
    const totalMB = (stats.storageSize + stats.indexSize) / 1024 / 1024;
    console.log('\n💡 MongoDB Atlas Tier Info:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (totalMB < 512) {
      console.log(`✅ M0 (Free): 512 MB - You're using ${(totalMB / 512 * 100).toFixed(1)}%`);
    } else if (totalMB < 2048) {
      console.log(`⚠️  M2 (Shared): 2 GB - You're using ${(totalMB / 2048 * 100).toFixed(1)}%`);
    } else {
      console.log(`⚠️  M10+ (Dedicated) needed`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

checkStorage();
