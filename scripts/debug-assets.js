#!/usr/bin/env node

import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const s3Client = new S3Client({
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
  },
})

const BUCKET_NAME = 'degencity'

async function debugAssets() {
  console.log('🔍 Debugging asset paths in DigitalOcean Spaces...\n')
  
  try {
    // List all objects in the bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 100,
    })
    
    const response = await s3Client.send(listCommand)
    
    if (!response.Contents || response.Contents.length === 0) {
      console.log('No assets found in bucket')
      return
    }
    
    console.log(`Found ${response.Contents.length} objects:\n`)
    
    // Group by path structure
    const normalPaths = []
    const doubleSlashPaths = []
    const otherPaths = []
    
    for (const obj of response.Contents) {
      const key = obj.Key
      if (key.startsWith('assets//')) {
        doubleSlashPaths.push(key)
      } else if (key.startsWith('assets/')) {
        normalPaths.push(key)
      } else {
        otherPaths.push(key)
      }
    }
    
    if (doubleSlashPaths.length > 0) {
      console.log(`⚠️  Found ${doubleSlashPaths.length} assets with double slash (assets//)`)
      console.log('   These are likely the cause of the issue:')
      doubleSlashPaths.slice(0, 5).forEach(p => console.log(`   - ${p}`))
      if (doubleSlashPaths.length > 5) {
        console.log(`   ... and ${doubleSlashPaths.length - 5} more`)
      }
      console.log()
    }
    
    if (normalPaths.length > 0) {
      console.log(`✅ Found ${normalPaths.length} assets with normal path (assets/)`)
      normalPaths.slice(0, 3).forEach(p => console.log(`   - ${p}`))
      if (normalPaths.length > 3) {
        console.log(`   ... and ${normalPaths.length - 3} more`)
      }
      console.log()
    }
    
    if (otherPaths.length > 0) {
      console.log(`❓ Found ${otherPaths.length} objects with other paths:`)
      otherPaths.slice(0, 3).forEach(p => console.log(`   - ${p}`))
      console.log()
    }
    
    // Test URLs
    console.log('📝 URL Structure Analysis:')
    console.log('   Environment ASSETS_BASE_URL:', process.env.ASSETS_BASE_URL)
    console.log('   S3 URI prefix from env:', process.env.ASSETS_S3_URI?.split('/').pop())
    console.log()
    
    if (doubleSlashPaths.length > 0) {
      const testAsset = doubleSlashPaths[0].split('/').pop()
      console.log('   Test asset:', testAsset)
      console.log('   Current URL (working):', `https://${BUCKET_NAME}.nyc3.digitaloceanspaces.com/${doubleSlashPaths[0]}`)
      console.log('   Expected URL (not working):', `https://${BUCKET_NAME}.nyc3.digitaloceanspaces.com/assets/${testAsset}`)
      console.log()
      
      console.log('🔧 To fix this issue, you have two options:\n')
      console.log('   Option 1: Fix the assets to use single slash')
      console.log('   Run: node scripts/debug-assets.js --fix\n')
      console.log('   Option 2: Update ASSETS_BASE_URL in .env')
      console.log('   Change: ASSETS_BASE_URL=https://degencity.nyc3.digitaloceanspaces.com/assets')
      console.log('   To:     ASSETS_BASE_URL=https://degencity.nyc3.digitaloceanspaces.com/assets/')
    }
    
    // Check if --fix flag is provided
    if (process.argv.includes('--fix') && doubleSlashPaths.length > 0) {
      console.log('\n🔧 Fixing double slash paths...\n')
      
      const confirm = process.argv.includes('--yes')
      if (!confirm) {
        console.log('⚠️  This will move all assets from assets// to assets/')
        console.log('   Add --yes flag to confirm')
        return
      }
      
      for (const oldKey of doubleSlashPaths) {
        const newKey = oldKey.replace('assets//', 'assets/')
        
        try {
          // Copy to new location
          await s3Client.send(new CopyObjectCommand({
            Bucket: BUCKET_NAME,
            CopySource: `${BUCKET_NAME}/${oldKey}`,
            Key: newKey,
            ACL: 'public-read',
          }))
          
          // Delete old location
          await s3Client.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: oldKey,
          }))
          
          console.log(`✅ Moved: ${oldKey} → ${newKey}`)
        } catch (error) {
          console.error(`❌ Failed to move ${oldKey}:`, error.message)
        }
      }
      
      console.log('\n✨ Asset paths fixed!')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugAssets().catch(console.error)