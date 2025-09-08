#!/usr/bin/env node

import { S3Client, ListObjectsV2Command, PutObjectAclCommand } from '@aws-sdk/client-s3'
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

async function makeAssetsPublic() {
  try {
    // Parse the S3 URI
    const s3Config = parseS3Uri(process.env.ASSETS_S3_URI)
    
    console.log('Connecting to S3-compatible storage...')
    console.log('Endpoint:', s3Config.endpoint)
    console.log('Bucket:', s3Config.bucket)
    console.log('Prefix:', s3Config.prefix)
    
    // Create S3 client
    const s3Client = new S3Client({
      endpoint: s3Config.endpoint,
      region: 'us-east-1', // DigitalOcean Spaces uses us-east-1 compatibility
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey
      },
      forcePathStyle: false // DigitalOcean Spaces uses virtual-hosted-style
    })
    
    // List all objects in the assets folder
    console.log('\nListing objects...')
    const listCommand = new ListObjectsV2Command({
      Bucket: s3Config.bucket,
      Prefix: s3Config.prefix
    })
    
    const listResponse = await s3Client.send(listCommand)
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log('No objects found in the assets folder')
      return
    }
    
    console.log(`Found ${listResponse.Contents.length} objects`)
    
    // Make each object public
    console.log('\nMaking objects public...')
    let successCount = 0
    let errorCount = 0
    
    for (const object of listResponse.Contents) {
      try {
        const aclCommand = new PutObjectAclCommand({
          Bucket: s3Config.bucket,
          Key: object.Key,
          ACL: 'public-read'
        })
        
        await s3Client.send(aclCommand)
        successCount++
        console.log(`✓ ${object.Key}`)
      } catch (error) {
        errorCount++
        console.error(`✗ ${object.Key}: ${error.message}`)
      }
    }
    
    console.log(`\nCompleted: ${successCount} successful, ${errorCount} errors`)
    
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

// Run the script
makeAssetsPublic()