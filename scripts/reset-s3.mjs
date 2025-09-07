#!/usr/bin/env node

/**
 * Reset S3 bucket - cleans all assets and re-uploads seed assets
 * Usage: node scripts/reset-s3.mjs
 * 
 * WARNING: This will DELETE all assets in S3 and re-upload only the seed assets
 */

import fetch from 'node-fetch'
import readline from 'readline'

const SERVER_URL = process.env.PUBLIC_API_URL || 'http://localhost:4000'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer)
    })
  })
}

async function resetS3Assets() {
  console.log('⚠️  WARNING: This will DELETE all assets in S3 and re-upload only seed assets!')
  console.log('📡 Server:', SERVER_URL)
  
  const confirm = await askQuestion('\n❓ Are you sure you want to reset S3? (yes/no): ')
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('❌ Reset cancelled')
    rl.close()
    return
  }
  
  const password = await askQuestion('\n🔐 Enter admin password: ')
  
  console.log('\n🔄 Starting S3 reset...')
  
  try {
    const response = await fetch(`${SERVER_URL}/api/reset-s3-assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    })
    
    const data = await response.json()
    
    if (response.ok) {
      console.log('\n✅ S3 reset completed successfully!')
      
      // Show cleanup results
      console.log('\n🗑️  Cleanup Results:')
      console.log(`   - Deleted: ${data.results.clean.deleted.length} files`)
      console.log(`   - Failed: ${data.results.clean.failed.length} files`)
      
      // Show sync results
      console.log('\n📤 Upload Results:')
      console.log(`   - Uploaded: ${data.results.sync.uploaded.length} files`)
      console.log(`   - Failed: ${data.results.sync.failed.length} files`)
      console.log(`   - Skipped: ${data.results.sync.skipped.length} files`)
      console.log(`   - Seed hashes recorded: ${data.results.seedHashesRecorded}`)
      
      if (data.results.sync.uploaded.length > 0) {
        console.log('\n📋 Uploaded seed assets:')
        data.results.sync.uploaded.forEach(item => {
          const sizeMB = (item.size / (1024 * 1024)).toFixed(2)
          console.log(`   ✓ ${item.filename} (${sizeMB}MB) - Hash: ${item.hash}`)
        })
      }
      
      if (data.results.sync.failed.length > 0) {
        console.log('\n❌ Failed uploads:')
        data.results.sync.failed.forEach(({ file, error }) => {
          console.log(`   ✗ ${file}: ${error}`)
        })
      }
      
      console.log('\n✨ S3 has been reset with seed assets only')
      console.log('   The /assets page will now only show user-uploaded content')
    } else {
      console.error('❌ Reset failed:', data.error)
      if (data.details) {
        console.error('   Details:', data.details)
      }
      if (response.status === 403) {
        console.error('   Invalid admin password')
      }
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Error calling reset API:', error.message)
    console.error('   Make sure the server is running and accessible')
    process.exit(1)
  } finally {
    rl.close()
  }
}

// Run the reset
resetS3Assets().catch(error => {
  console.error('❌ Unexpected error:', error)
  rl.close()
  process.exit(1)
})