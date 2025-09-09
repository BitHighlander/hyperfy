#!/usr/bin/env node

import { S3Client, PutObjectAclCommand } from '@aws-sdk/client-s3'
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

async function fixAssetPermissions(assetHash) {
  try {
    // Parse the S3 URI
    const s3Config = parseS3Uri(process.env.ASSETS_S3_URI)
    
    console.log('🔧 Fixing permissions for asset:', assetHash)
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
    
    // Fix the specific asset
    const cleanPrefix = s3Config.prefix.endsWith('/') ? s3Config.prefix.slice(0, -1) : s3Config.prefix
    const key = cleanPrefix ? `${cleanPrefix}/${assetHash}` : assetHash
    
    const aclCommand = new PutObjectAclCommand({
      Bucket: s3Config.bucket,
      Key: key,
      ACL: 'public-read'
    })
    
    await s3Client.send(aclCommand)
    console.log(`✅ Fixed permissions for: ${key}`)
    
    // Test if it's accessible
    const url = `https://${s3Config.bucket}.nyc3.digitaloceanspaces.com/${key}`
    const response = await fetch(url, { method: 'HEAD' })
    
    if (response.ok) {
      console.log(`✅ Asset is now accessible at: ${url}`)
    } else {
      console.log(`⚠️ Asset returned ${response.status} at: ${url}`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Get asset hash from command line
const assetHash = process.argv[2]
if (!assetHash) {
  console.error('Usage: node fix-asset-permissions.js <asset-hash>')
  console.error('Example: node fix-asset-permissions.js 9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js')
  process.exit(1)
}

// Run the fix
fixAssetPermissions(assetHash)