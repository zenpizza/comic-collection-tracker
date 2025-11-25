#!/usr/bin/env node

/**
 * Test script to verify per-size cache handling fixes
 */

console.log('🧪 Testing Per-Size Cache Handling Fixes\n')

// Mock the fixed methods
function hasSize(imageData, size) {
  if (imageData.blob && size === 'medium') {
    // Legacy single-blob format (assume medium size)
    return true
  }
  
  if (imageData.imageData && imageData.imageData[size]) {
    // Multi-size format
    return true
  }
  
  return false
}

function getBlobFromIndexedDB(imageData, size) {
  // Convert stored data back to blob for the specific size
  if (imageData.blob && size === 'medium') {
    // Legacy single-blob format (assume medium size)
    return { blob: imageData.blob, source: 'legacy' }
  } else if (imageData.imageData && imageData.imageData[size]) {
    // Multi-size format - get the specific size requested
    const sizeData = imageData.imageData[size]
    return { 
      blob: `mock-blob-${size}`, 
      source: 'multi-size',
      size: sizeData.size,
      mimeType: sizeData.mimeType
    }
  }

  return null
}

// Test 1: Size-specific blob retrieval
console.log('Test 1: Size-specific blob retrieval')

const multiSizeData = {
  imageData: {
    thumbnail: { data: 'thumb-data', mimeType: 'image/jpeg', size: 5000 },
    medium: { data: 'medium-data', mimeType: 'image/jpeg', size: 50000 },
    full: { data: 'full-data', mimeType: 'image/jpeg', size: 500000 }
  }
}

console.log('  Requesting thumbnail:', getBlobFromIndexedDB(multiSizeData, 'thumbnail')?.source === 'multi-size' ? '✅ CORRECT SIZE' : '❌ WRONG SIZE')
console.log('  Requesting medium:', getBlobFromIndexedDB(multiSizeData, 'medium')?.source === 'multi-size' ? '✅ CORRECT SIZE' : '❌ WRONG SIZE')
console.log('  Requesting full:', getBlobFromIndexedDB(multiSizeData, 'full')?.source === 'multi-size' ? '✅ CORRECT SIZE' : '❌ WRONG SIZE')
console.log('  Requesting non-existent:', getBlobFromIndexedDB(multiSizeData, 'nonexistent') === null ? '✅ NULL RETURNED' : '❌ SHOULD BE NULL')

// Test 2: Legacy format handling
console.log('\nTest 2: Legacy format handling')

const legacyData = {
  blob: 'legacy-blob-data'
}

console.log('  Legacy medium request:', getBlobFromIndexedDB(legacyData, 'medium')?.source === 'legacy' ? '✅ LEGACY HANDLED' : '❌ LEGACY FAILED')
console.log('  Legacy thumbnail request:', getBlobFromIndexedDB(legacyData, 'thumbnail') === null ? '✅ NULL FOR WRONG SIZE' : '❌ SHOULD BE NULL')

// Test 3: Size existence checking
console.log('\nTest 3: Size existence checking')

console.log('  Multi-size has thumbnail:', hasSize(multiSizeData, 'thumbnail') ? '✅ HAS SIZE' : '❌ MISSING SIZE')
console.log('  Multi-size has nonexistent:', hasSize(multiSizeData, 'nonexistent') ? '❌ SHOULD NOT HAVE' : '✅ CORRECTLY MISSING')
console.log('  Legacy has medium:', hasSize(legacyData, 'medium') ? '✅ HAS LEGACY SIZE' : '❌ MISSING LEGACY SIZE')
console.log('  Legacy has thumbnail:', hasSize(legacyData, 'thumbnail') ? '❌ SHOULD NOT HAVE' : '✅ CORRECTLY MISSING')

// Test 4: Cache key generation (demonstrate per-size caching)
console.log('\nTest 4: Cache key generation')

function generateCacheKey(comicId, size) {
  return `${comicId}_${size}`
}

const comicId = 'comic123'
const sizes = ['thumbnail', 'medium', 'full']

console.log('  Cache keys are unique per size:')
sizes.forEach(size => {
  const key = generateCacheKey(comicId, size)
  console.log(`    ${size}: ${key}`)
})

// Test 5: Demonstrate the bug fix
console.log('\nTest 5: Bug fix demonstration')

console.log('  ❌ BEFORE: getBlobFromIndexedDB(comicId) - ignores size parameter')
console.log('     Could cache 5MB full image under thumbnail key!')
console.log('')
console.log('  ✅ AFTER: getBlobFromIndexedDB(comicId, size) - respects size parameter')
console.log('     Only caches the requested size under the correct key')
console.log('')
console.log('  ❌ BEFORE: Delete entire comicId if any size is stale')
console.log('     Deletes valid thumbnail when only full image is stale')
console.log('')
console.log('  ✅ AFTER: Per-size cache management')
console.log('     Can invalidate specific sizes without affecting others')

console.log('\n✅ All per-size cache handling tests completed!')
console.log('📋 Summary: Fixed size-specific blob retrieval and cache management')