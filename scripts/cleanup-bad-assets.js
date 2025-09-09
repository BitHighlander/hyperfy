#!/usr/bin/env node

import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Parse S3 URI from environment
const parseS3Uri = (uri) => {
  if (!uri) throw new Error('ASSETS_S3_URI not set')
  
  // Format: s3://access_key:secret_key@endpoint/bucket/prefix
  const match = uri.match(/s3:\/\/([^:]+):([^@]+)@([^\/]+)\/([^\/]+)(?:\/(.*))?/)
  if (!match) throw new Error('Invalid S3 URI format')
  
  const [, accessKeyId, secretAccessKey, endpoint, bucket, prefix] = match
  
  return {
    accessKeyId,
    secretAccessKey,
    endpoint: `https://${endpoint}`,
    bucket,
    prefix: prefix || ''
  }
}

// Default seed assets that should NOT be deleted
const SEED_ASSETS = [
  'ai.glb', 'ai.js', 'avatar.vrm', 'crash-block.glb',
  'emote-fall.glb', 'emote-flip.glb', 'emote-float.glb',
  'emote-jump.glb', 'emote-talk.glb',
  'mp-idle.glb', 'mp-jog-back.glb', 'mp-jog-left.glb',
  'mp-jog-right.glb', 'mp-jog.glb',
  'mp-walk-back.glb', 'mp-walk-left.glb', 'mp-walk-right.glb', 'mp-walk.glb'
]

async function cleanupBadAssets() {
  try {
    // Parse the S3 URI
    const s3Config = parseS3Uri(process.env.ASSETS_S3_URI)
    
    console.log('🧹 S3 Bad Asset Cleanup Tool')
    console.log('=============================')
    console.log('Endpoint:', s3Config.endpoint)
    console.log('Bucket:', s3Config.bucket)
    console.log('Prefix:', s3Config.prefix)
    
    // Create S3 client
    const s3Client = new S3Client({
      endpoint: s3Config.endpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey
      },
      forcePathStyle: false
    })
    
    // List all objects
    console.log('\n🔍 Listing all assets...')
    let allObjects = []
    let continuationToken = undefined
    
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: s3Config.bucket,
        Prefix: s3Config.prefix,
        ContinuationToken: continuationToken
      })
      
      const response = await s3Client.send(listCommand)
      if (response.Contents) {
        allObjects = allObjects.concat(response.Contents)
      }
      continuationToken = response.NextContinuationToken
    } while (continuationToken)
    
    console.log(`Found ${allObjects.length} total objects`)
    
    // Find bad assets (wrong path patterns)
    const badAssets = []
    const goodAssets = []
    
    for (const obj of allObjects) {
      const key = obj.Key
      const filename = key.split('/').pop()
      
      // Skip seed assets
      if (SEED_ASSETS.includes(filename)) {
        goodAssets.push(key)
        continue
      }
      
      // Check for bad patterns:
      // 1. Double slash (assets//)
      // 2. Assets at wrong path (assets/filename instead of assets//filename for user uploads)
      // Actually, we want to delete ALL user-uploaded assets since they're all problematic
      
      // If it's a hash-based filename (user upload), it's problematic
      if (filename.match(/^[a-f0-9]{64}\.[a-z]+$/)) {
        badAssets.push(key)
        console.log(`  Bad asset: ${key}`)
      } else if (key.includes('//')) {
        // Double slash versions that aren't seed assets
        badAssets.push(key)
        console.log(`  Bad asset (double slash): ${key}`)
      } else {
        goodAssets.push(key)
      }
    }
    
    console.log(`\n📊 Analysis:`)
    console.log(`  Good assets: ${goodAssets.length}`)
    console.log(`  Bad assets to delete: ${badAssets.length}`)
    
    if (badAssets.length === 0) {
      console.log('✅ No bad assets found!')
      return
    }
    
    // Delete bad assets in batches
    console.log('\n🗑️  Deleting bad assets...')
    const batchSize = 1000
    let deleted = 0
    
    for (let i = 0; i < badAssets.length; i += batchSize) {
      const batch = badAssets.slice(i, i + batchSize)
      
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: s3Config.bucket,
        Delete: {
          Objects: batch.map(key => ({ Key: key }))
        }
      })
      
      const deleteResponse = await s3Client.send(deleteCommand)
      
      if (deleteResponse.Deleted) {
        deleted += deleteResponse.Deleted.length
        console.log(`  Deleted batch: ${deleteResponse.Deleted.length} objects`)
      }
      
      if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
        console.log(`  Errors in batch:`)
        for (const error of deleteResponse.Errors) {
          console.log(`    - ${error.Key}: ${error.Message}`)
        }
      }
    }
    
    console.log(`\n✅ Cleanup complete! Deleted ${deleted} bad assets`)
    console.log(`   ${goodAssets.length} good assets remain`)
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

// Run the cleanup
cleanupBadAssets()