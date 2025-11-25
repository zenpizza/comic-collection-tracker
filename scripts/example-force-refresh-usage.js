#!/usr/bin/env node

/**
 * Force-Refresh Usage Examples
 * 
 * Demonstrates how to use the forceRefresh option to purge stale cache
 * and fetch fresh images from the server.
 */

console.log('📖 Force-Refresh Usage Examples\n')

// Example usage patterns (pseudo-code for documentation)
const examples = `
// Example 1: Force refresh with safe auto-revoke API
const freshImageUrl = await ImageURLService.getImageUrl(comicId, 'medium', {
  forceRefresh: true,
  autoRevokeDelay: 60000 // Auto-revoke after 1 minute
})

// Example 2: Force refresh with manual revoke control
const result = await ImageURLService.getImageUrlWithRevoke(comicId, 'thumbnail', {
  forceRefresh: true
})
if (result) {
  const { url, revoke } = result
  // Use the URL...
  setTimeout(revoke, 30000) // Manual cleanup after 30 seconds
}

// Example 3: Force refresh with unsafe API (manual management)
const unsafeUrl = await ImageURLService.getImageUrlUnsafe(comicId, 'full', {
  forceRefresh: true
})
if (unsafeUrl) {
  // ⚠️ WARNING: Must manually revoke to prevent memory leaks!
  // Use the URL...
  ImageURLService.revokeUrl(unsafeUrl)
}

// Example 4: Force refresh specific size only
await ImageURLService.clearCache(comicId, 'thumbnail') // Clear specific size
const newThumbnail = await ImageURLService.getImageUrl(comicId, 'thumbnail')

// Example 5: Force refresh all sizes for a comic
await ImageURLService.clearCache(comicId) // Clear all sizes
const newMedium = await ImageURLService.getImageUrl(comicId, 'medium')
`

console.log('JavaScript Usage Examples:')
console.log(examples)

console.log('\n' + '='.repeat(60))
console.log('🔧 What Force-Refresh Does:')
console.log('')
console.log('1. 🗑️  Purges memory cache for all sizes (thumbnail, medium, full)')
console.log('2. 🗑️  Deletes IndexedDB cache entry for the comic')
console.log('3. 🌐 Fetches fresh image from MongoDB API')
console.log('4. 💾 Caches the fresh image in both memory and IndexedDB')
console.log('5. 🔗 Returns new blob URL for immediate use')
console.log('')
console.log('✅ Handles cleanup errors gracefully')
console.log('✅ Continues with fetch even if cache purge fails')
console.log('✅ Maintains all existing safety features (auto-revoke, etc.)')

console.log('\n' + '='.repeat(60))
console.log('🎯 When to Use Force-Refresh:')
console.log('')
console.log('• User reports seeing outdated/corrupted images')
console.log('• After uploading a new cover for existing comic')
console.log('• When server-side image has been updated')
console.log('• Debugging cache-related display issues')
console.log('• Manual "refresh image" button in UI')

console.log('\n' + '='.repeat(60))
console.log('⚠️  Important Notes:')
console.log('')
console.log('• Force-refresh bypasses ALL cache layers')
console.log('• Always fetches from server (slower but guaranteed fresh)')
console.log('• Purges cache for ALL sizes, not just requested size')
console.log('• Use sparingly to avoid unnecessary server load')
console.log('• Still respects all safety features (auto-revoke, etc.)')

console.log('\n✅ Force-refresh implementation is ready for production use!')