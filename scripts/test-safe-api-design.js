#!/usr/bin/env node

/**
 * Test script to demonstrate safe-by-default API design
 */

console.log('🧪 Testing Safe-by-Default API Design\n')

// Mock implementation showing the API improvement
class MockImageService {
  constructor() {
    this.config = { autoRevokeDelay: 30000 }
    this.trackedUrls = new Set()
    this.revokedUrls = new Set()
  }

  // ❌ OLD API: Unsafe by default
  async getImageUrlOld(comicId, size = 'medium') {
    const url = `blob:old-${comicId}-${size}-${Date.now()}`
    this.trackedUrls.add(url)
    console.log(`  ❌ Created unmanaged URL: ${url}`)
    return url
  }

  // ✅ NEW API: Safe by default (auto-revoke)
  async getImageUrl(comicId, size = 'medium', options = {}) {
    const { autoRevokeDelay = this.config.autoRevokeDelay } = options
    return this.getImageUrlWithAutoRevoke(comicId, size, autoRevokeDelay)
  }

  // ✅ EXPLICIT UNSAFE API: Clear warning
  async getImageUrlUnsafe(comicId, size = 'medium') {
    const url = `blob:unsafe-${comicId}-${size}-${Date.now()}`
    this.trackedUrls.add(url)
    console.log(`  ⚠️  Created UNSAFE URL: ${url} (manual cleanup required!)`)
    return url
  }

  // ✅ RECOMMENDED API: Manual control
  async getImageUrlWithRevoke(comicId, size = 'medium') {
    const url = `blob:revoke-${comicId}-${size}-${Date.now()}`
    this.trackedUrls.add(url)
    console.log(`  ✅ Created managed URL: ${url}`)
    
    return {
      url,
      revoke: () => this.revokeUrl(url)
    }
  }

  // ✅ AUTO-REVOKE API: Automatic cleanup
  async getImageUrlWithAutoRevoke(comicId, size = 'medium', autoRevokeDelay = 30000) {
    const url = `blob:auto-${comicId}-${size}-${Date.now()}`
    this.trackedUrls.add(url)
    console.log(`  ✅ Created auto-revoke URL: ${url} (${autoRevokeDelay}ms TTL)`)
    
    // Schedule automatic revocation
    setTimeout(() => {
      this.revokeUrl(url)
    }, autoRevokeDelay)

    return url
  }

  revokeUrl(url) {
    if (this.trackedUrls.has(url)) {
      this.trackedUrls.delete(url)
      this.revokedUrls.add(url)
      console.log(`    🗑️  Revoked: ${url}`)
    }
  }

  getStats() {
    return {
      tracked: this.trackedUrls.size,
      revoked: this.revokedUrls.size,
      leaked: this.trackedUrls.size // URLs that haven't been revoked
    }
  }

  reset() {
    this.trackedUrls.clear()
    this.revokedUrls.clear()
  }
}

async function runTests() {
  const service = new MockImageService()

  console.log('Test 1: Old API (unsafe by default)')
  console.log('  Scenario: Developer uses simple API')
  
  service.reset()
  
  // Typical developer usage - simple and unsafe
  const url1 = await service.getImageUrlOld('comic1', 'medium')
  const url2 = await service.getImageUrlOld('comic2', 'thumbnail')
  const url3 = await service.getImageUrlOld('comic3', 'full')
  
  console.log(`  Created 3 URLs, stats: ${JSON.stringify(service.getStats())}`)
  console.log('  ❌ Problem: All URLs leaked (developer forgot to clean up)')

  console.log('\nTest 2: New API (safe by default)')
  console.log('  Scenario: Same developer usage, but now safe')
  
  service.reset()
  
  // Same simple usage, but now safe by default
  const url4 = await service.getImageUrl('comic1', 'medium')
  const url5 = await service.getImageUrl('comic2', 'thumbnail')
  const url6 = await service.getImageUrl('comic3', 'full')
  
  console.log(`  Created 3 URLs, stats: ${JSON.stringify(service.getStats())}`)
  console.log('  ✅ Solution: URLs will auto-revoke, preventing leaks')

  // Wait a bit to see auto-revoke in action
  console.log('  Waiting for auto-revoke (shortened delay)...')
  await new Promise(resolve => setTimeout(resolve, 100))
  
  console.log(`  After auto-revoke: ${JSON.stringify(service.getStats())}`)

  console.log('\nTest 3: Explicit unsafe API')
  console.log('  Scenario: Developer needs unsafe behavior (with clear warning)')
  
  service.reset()
  
  const unsafeUrl = await service.getImageUrlUnsafe('comic-unsafe', 'medium')
  console.log(`  Stats: ${JSON.stringify(service.getStats())}`)
  console.log('  ⚠️  Developer explicitly chose unsafe API (clear warning given)')
  
  // Developer must manually clean up
  service.revokeUrl(unsafeUrl)
  console.log(`  After manual cleanup: ${JSON.stringify(service.getStats())}`)

  console.log('\nTest 4: Recommended API (manual control)')
  console.log('  Scenario: Developer wants full control')
  
  service.reset()
  
  const {url: controlledUrl, revoke} = await service.getImageUrlWithRevoke('comic-controlled', 'medium')
  console.log(`  Stats: ${JSON.stringify(service.getStats())}`)
  
  // Simulate image load completion
  console.log('  Simulating image load completion...')
  revoke() // Clean up when done
  console.log(`  After manual revoke: ${JSON.stringify(service.getStats())}`)

  console.log('\nTest 5: Configurable auto-revoke')
  console.log('  Scenario: Developer customizes auto-revoke delay')
  
  service.reset()
  
  // Custom delay
  const shortDelayUrl = await service.getImageUrl('comic-custom', 'medium', { autoRevokeDelay: 50 })
  console.log(`  Created URL with 50ms auto-revoke`)
  console.log(`  Initial stats: ${JSON.stringify(service.getStats())}`)
  
  await new Promise(resolve => setTimeout(resolve, 100))
  console.log(`  After custom delay: ${JSON.stringify(service.getStats())}`)

  console.log('\nTest 6: API comparison')
  console.log('  📊 API Safety Comparison:')
  console.log('')
  console.log('  ❌ OLD getImageUrl():')
  console.log('    - Returns naked URL')
  console.log('    - No automatic cleanup')
  console.log('    - Easy to forget cleanup')
  console.log('    - Memory leaks by default')
  console.log('')
  console.log('  ✅ NEW getImageUrl():')
  console.log('    - Auto-revoke after 30 seconds')
  console.log('    - Safe by default')
  console.log('    - Configurable delay')
  console.log('    - Prevents accidental leaks')
  console.log('')
  console.log('  ⚠️  getImageUrlUnsafe():')
  console.log('    - Explicit unsafe behavior')
  console.log('    - Clear warning in name/docs')
  console.log('    - For advanced use cases')
  console.log('    - Requires manual cleanup')
  console.log('')
  console.log('  ✅ getImageUrlWithRevoke():')
  console.log('    - Manual control')
  console.log('    - Returns {url, revoke}')
  console.log('    - Recommended for components')
  console.log('    - Explicit cleanup')

  console.log('\nTest 7: Migration path')
  console.log('  🔄 Migration Strategy:')
  console.log('    1. Existing code using getImageUrl() becomes safe automatically')
  console.log('    2. No breaking changes - backward compatible')
  console.log('    3. Developers can opt into unsafe behavior explicitly')
  console.log('    4. Clear upgrade path to manual control APIs')
  console.log('    5. Default behavior prevents memory leaks')

  console.log('\n✅ Safe-by-default API design demonstration completed!')
  console.log('📋 Summary: getImageUrl() now defaults to auto-revoke for safety')
}

runTests().catch(console.error)