#!/usr/bin/env node

/**
 * Sync world assets to S3
 * Usage: node scripts/sync-s3.mjs
 */

import fetch from 'node-fetch'

const SERVER_URL = process.env.PUBLIC_API_URL || 'http://localhost:4000'

async function syncS3Assets() {
  console.log('🔄 Starting S3 assets sync...')
  console.log(`📡 Server: ${SERVER_URL}`)
  
  try {
    const response = await fetch(`${SERVER_URL}/api/sync-s3-assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add auth header if needed
        // 'Authorization': `Bearer ${process.env.AUTH_TOKEN}`
      },
      body: JSON.stringify({}) // Send empty JSON body
    })
    
    const data = await response.json()
    
    if (response.ok) {
      console.log('✅ S3 sync completed successfully!')
      console.log('📊 Results:')
      console.log(`   - Uploaded: ${data.results.uploaded.length} files`)
      console.log(`   - Failed: ${data.results.failed.length} files`)
      
      if (data.results.uploaded.length > 0) {
        console.log('\n📤 Uploaded files:')
        data.results.uploaded.forEach(file => {
          console.log(`   ✓ ${file}`)
        })
      }
      
      if (data.results.failed.length > 0) {
        console.log('\n❌ Failed files:')
        data.results.failed.forEach(({ file, error }) => {
          console.log(`   ✗ ${file}: ${error}`)
        })
      }
    } else {
      console.error('❌ Sync failed:', data.error)
      if (data.details) {
        console.error('   Details:', data.details)
      }
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Error calling sync API:', error.message)
    console.error('   Make sure the server is running and accessible')
    process.exit(1)
  }
}

// Run the sync
syncS3Assets().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})