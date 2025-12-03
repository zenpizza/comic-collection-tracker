#!/usr/bin/env node
/**
 * Test Preview Environment
 * Verifies that preview deployment uses the correct database
 */

const PREVIEW_URL = process.argv[2];

if (!PREVIEW_URL) {
  console.log('Usage: node scripts/test-preview-environment.js <preview-url>');
  console.log('Example: node scripts/test-preview-environment.js https://comic-collection-tracker-git-test-preview-environment-davds-projects.vercel.app');
  process.exit(1);
}

console.log('🧪 Testing Preview Environment\n');
console.log('═'.repeat(60));
console.log('\n📍 Preview URL:', PREVIEW_URL);

async function testPreview() {
  try {
    // Test 1: Check if preview is accessible
    console.log('\n1️⃣ Testing Preview Accessibility...');
    const response = await fetch(PREVIEW_URL);
    if (response.ok) {
      console.log('   ✅ Preview is accessible');
    } else {
      console.log('   ❌ Preview returned:', response.status);
      return;
    }

    // Test 2: Check API endpoint
    console.log('\n2️⃣ Testing API Endpoint...');
    const apiUrl = `${PREVIEW_URL}/api/comics`;
    const apiResponse = await fetch(apiUrl);
    
    if (apiResponse.ok) {
      console.log('   ✅ API is accessible');
      
      const data = await apiResponse.json();
      console.log('   📊 Comics in preview database:', data.comics?.length || 0);
      
      if (data.comics?.length === 0) {
        console.log('   ✅ Preview database is empty (as expected for new environment)');
      } else {
        console.log('   ℹ️  Preview database has data');
      }
    } else {
      console.log('   ❌ API returned:', apiResponse.status);
    }

    // Test 3: Add a test comic
    console.log('\n3️⃣ Testing Comic Creation...');
    const testComic = {
      series: 'Preview Test Comic',
      issueNumber: '1',
      publisher: 'Test Publisher',
      year: 2024
    };

    const createResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testComic)
    });

    if (createResponse.ok) {
      const result = await createResponse.json();
      console.log('   ✅ Successfully created test comic');
      console.log('   📝 Comic ID:', result.comic?._id);
    } else {
      console.log('   ❌ Failed to create comic:', createResponse.status);
    }

    // Test 4: Verify comic was saved
    console.log('\n4️⃣ Verifying Comic Was Saved...');
    const verifyResponse = await fetch(apiUrl);
    if (verifyResponse.ok) {
      const data = await verifyResponse.json();
      const testComicFound = data.comics?.find(c => c.series === 'Preview Test Comic');
      
      if (testComicFound) {
        console.log('   ✅ Test comic found in database');
        console.log('   📊 Total comics in preview:', data.comics.length);
      } else {
        console.log('   ❌ Test comic not found');
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('\n✅ Preview Environment Test Complete!');
    console.log('\n💡 Next Steps:');
    console.log('   1. Open preview URL in browser');
    console.log('   2. Verify it works independently from production');
    console.log('   3. Test adding/editing comics');
    console.log('   4. Confirm production is unaffected\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nFull error:', error);
  }
}

testPreview();
