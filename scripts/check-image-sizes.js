/**
 * Check image sizes in the database
 * Reports on the largest images and storage statistics
 */

import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

async function checkImageSizes() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db('comic-collection')
    const coverImagesCollection = db.collection('cover_images')
    const comicsCollection = db.collection('comics')

    // Get all cover images
    const coverImages = await coverImagesCollection.find({}).toArray()

    console.log(`\nTotal cover images: ${coverImages.length}`)

    if (coverImages.length === 0) {
      console.log('No cover images found')
      return
    }

    // Calculate sizes for each image
    const imageSizes = coverImages.map(img => {
      const sizes = {
        comicId: img.comicId,
        thumbnail: img.images?.thumbnail?.size || 0,
        medium: img.images?.medium?.size || 0,
        full: img.images?.full?.size || 0,
        original: img.images?.original?.size || 0
      }
      sizes.total = sizes.thumbnail + sizes.medium + sizes.full + sizes.original
      sizes.metadata = img.metadata
      return sizes
    })

    // Sort by total size
    imageSizes.sort((a, b) => b.total - a.total)

    // Get comic details for top 10
    console.log('\n📊 Top 10 Largest Images:')
    console.log('=' .repeat(80))
    
    for (let i = 0; i < Math.min(10, imageSizes.length); i++) {
      const img = imageSizes[i]
      
      // Get comic details
      const comic = await comicsCollection.findOne({ _id: img.comicId })
      const comicName = comic ? `${comic.series} #${comic.issueNumber}` : img.comicId
      
      console.log(`\n${i + 1}. ${comicName}`)
      console.log(`   Total: ${formatBytes(img.total)}`)
      console.log(`   - Thumbnail: ${formatBytes(img.thumbnail)}`)
      console.log(`   - Medium: ${formatBytes(img.medium)}`)
      console.log(`   - Full: ${formatBytes(img.full)}`)
      console.log(`   - Original: ${formatBytes(img.original)}`)
      if (img.metadata?.compressed) {
        console.log(`   - Compressed: Yes (original: ${formatBytes(img.metadata.originalSize || 0)})`)
      }
    }

    // Calculate statistics
    const stats = {
      totalSize: imageSizes.reduce((sum, img) => sum + img.total, 0),
      avgSize: imageSizes.reduce((sum, img) => sum + img.total, 0) / imageSizes.length,
      maxSize: imageSizes[0].total,
      minSize: imageSizes[imageSizes.length - 1].total,
      thumbnailTotal: imageSizes.reduce((sum, img) => sum + img.thumbnail, 0),
      mediumTotal: imageSizes.reduce((sum, img) => sum + img.medium, 0),
      fullTotal: imageSizes.reduce((sum, img) => sum + img.full, 0),
      originalTotal: imageSizes.reduce((sum, img) => sum + img.original, 0)
    }

    console.log('\n\n📈 Storage Statistics:')
    console.log('=' .repeat(80))
    console.log(`Total images: ${imageSizes.length}`)
    console.log(`Total storage: ${formatBytes(stats.totalSize)}`)
    console.log(`Average per image: ${formatBytes(stats.avgSize)}`)
    console.log(`Largest image: ${formatBytes(stats.maxSize)}`)
    console.log(`Smallest image: ${formatBytes(stats.minSize)}`)
    console.log('\nBreakdown by size:')
    console.log(`  Thumbnails: ${formatBytes(stats.thumbnailTotal)} (${Math.round(stats.thumbnailTotal / stats.totalSize * 100)}%)`)
    console.log(`  Medium: ${formatBytes(stats.mediumTotal)} (${Math.round(stats.mediumTotal / stats.totalSize * 100)}%)`)
    console.log(`  Full: ${formatBytes(stats.fullTotal)} (${Math.round(stats.fullTotal / stats.totalSize * 100)}%)`)
    console.log(`  Original: ${formatBytes(stats.originalTotal)} (${Math.round(stats.originalTotal / stats.totalSize * 100)}%)`)

    // Check for images over certain thresholds
    const over1MB = imageSizes.filter(img => img.total > 1024 * 1024)
    const over5MB = imageSizes.filter(img => img.total > 5 * 1024 * 1024)
    const over10MB = imageSizes.filter(img => img.total > 10 * 1024 * 1024)

    console.log('\n\n⚠️  Size Distribution:')
    console.log('=' .repeat(80))
    console.log(`Images over 1 MB: ${over1MB.length}`)
    console.log(`Images over 5 MB: ${over5MB.length}`)
    console.log(`Images over 10 MB: ${over10MB.length}`)

    // Check compression status
    const compressed = imageSizes.filter(img => img.metadata?.compressed)
    const uncompressed = imageSizes.filter(img => !img.metadata?.compressed)

    console.log('\n\n🗜️  Compression Status:')
    console.log('=' .repeat(80))
    console.log(`Compressed: ${compressed.length}`)
    console.log(`Uncompressed: ${uncompressed.length}`)

  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await client.close()
    console.log('\n✅ Database connection closed')
  }
}

// Run the script
checkImageSizes()
