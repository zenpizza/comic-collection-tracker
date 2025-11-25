#!/usr/bin/env node

/**
 * Verify Variable Name Typo Fix
 * 
 * Simple verification that the variable name typo has been corrected
 * from 'keytoClear' to 'keyToClear' (proper camelCase).
 */

console.log('🔍 Verifying Variable Name Typo Fix...\n')

import fs from 'fs'
import path from 'path'

const serviceFile = path.join(process.cwd(), 'src/utils/ImageURLService.js')
const serviceCode = fs.readFileSync(serviceFile, 'utf8')

console.log('📋 Variable Name Check:')

// Check for the incorrect variable name (typo)
const hasTypo = serviceCode.includes('keytoClear')
console.log(`✓ Contains typo 'keytoClear': ${hasTypo ? '❌ FOUND' : '✅ NOT FOUND'}`)

// Check for the correct variable name
const hasCorrectName = serviceCode.includes('keyToClear')
console.log(`✓ Contains correct 'keyToClear': ${hasCorrectName ? '✅ FOUND' : '❌ NOT FOUND'}`)

// Check the specific context where it should appear
const hasCorrectUsage = serviceCode.includes('const keyToClear = this.generateCacheKey(comicId, sizeToDelete)') &&
                       serviceCode.includes('this.memoryCache.delete(keyToClear)')

console.log(`✓ Correct usage in force-refresh: ${hasCorrectUsage ? '✅ FOUND' : '❌ NOT FOUND'}`)

// Extract the relevant code section
const forceRefreshMatch = serviceCode.match(/sizes\.forEach\(sizeToDelete => \{([\s\S]*?)\}\)/);
if (forceRefreshMatch) {
  console.log('\n📖 Force-refresh cache clearing code:')
  console.log('```javascript')
  console.log('sizes.forEach(sizeToDelete => {' + forceRefreshMatch[1] + '})')
  console.log('```')
}

console.log('\n🎯 Verification Results:')

if (!hasTypo && hasCorrectName && hasCorrectUsage) {
  console.log('🎉 Typo fix verified successfully!')
  console.log('')
  console.log('✅ No instances of incorrect "keytoClear" found')
  console.log('✅ Correct "keyToClear" (camelCase) is used')
  console.log('✅ Variable is used properly in force-refresh logic')
  console.log('')
  console.log('📝 The variable name now follows proper JavaScript camelCase convention.')
} else {
  console.log('❌ Typo fix verification failed!')
  console.log('')
  console.log(`• Has typo: ${hasTypo}`)
  console.log(`• Has correct name: ${hasCorrectName}`)
  console.log(`• Correct usage: ${hasCorrectUsage}`)
}

console.log('\n✨ Code quality improvement: Consistent variable naming convention maintained.')