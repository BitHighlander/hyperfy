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

async function deleteAssets(assetFilenames) {
  try {
    // Parse the S3 URI
    const s3Config = parseS3Uri(process.env.ASSETS_S3_URI)
    
    console.log('🗑️  S3 Asset Deletion Tool')
    console.log('========================')
    console.log('Endpoint:', s3Config.endpoint)
    console.log('Bucket:', s3Config.bucket)
    console.log('Prefix:', s3Config.prefix)
    console.log('Assets to delete:', assetFilenames.length)
    
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
    
    // List all objects to find matching ones (including double-slash versions)
    console.log('\n🔍 Searching for matching assets...')
    const listCommand = new ListObjectsV2Command({
      Bucket: s3Config.bucket,
      Prefix: s3Config.prefix
    })
    
    const listResponse = await s3Client.send(listCommand)
    const allObjects = listResponse.Contents || []
    
    // Find all keys that match our assets (with or without double slash)
    const keysToDelete = []
    for (const filename of assetFilenames) {
      // Check for exact matches and double-slash versions
      const possibleKeys = [
        `${s3Config.prefix}/${filename}`,
        `${s3Config.prefix}//${filename}`,
        `${s3Config.prefix}${filename}`,
        `assets/${filename}`,
        `assets//${filename}`
      ]
      
      for (const obj of allObjects) {
        for (const key of possibleKeys) {
          if (obj.Key === key) {
            keysToDelete.push(obj.Key)
            console.log(`  Found: ${obj.Key}`)
          }
        }
      }
    }
    
    if (keysToDelete.length === 0) {
      console.log('❌ No matching assets found to delete')
      return
    }
    
    // Delete the assets
    console.log(`\n🗑️  Deleting ${keysToDelete.length} objects...`)
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: s3Config.bucket,
      Delete: {
        Objects: keysToDelete.map(key => ({ Key: key }))
      }
    })
    
    const deleteResponse = await s3Client.send(deleteCommand)
    
    // Report results
    if (deleteResponse.Deleted && deleteResponse.Deleted.length > 0) {
      console.log(`✅ Successfully deleted ${deleteResponse.Deleted.length} objects:`)
      for (const deleted of deleteResponse.Deleted) {
        console.log(`  - ${deleted.Key}`)
      }
    }
    
    if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
      console.log(`❌ Failed to delete ${deleteResponse.Errors.length} objects:`)
      for (const error of deleteResponse.Errors) {
        console.log(`  - ${error.Key}: ${error.Message}`)
      }
    }
    
    console.log('\n✅ Deletion complete!')
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

// Get asset filenames from command line
const assets = process.argv.slice(2)
if (assets.length === 0) {
  console.error('Usage: node delete-s3-assets.js <asset1> <asset2> ...')
  console.error('Example: node delete-s3-assets.js 9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js')
  process.exit(1)
}

// Run the deletion
deleteAssets(assets)