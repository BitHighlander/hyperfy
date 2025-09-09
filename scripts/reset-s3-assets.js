#!/usr/bin/env node

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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

// Hash file content
const hashFile = async (buffer) => {
  const hash = crypto.createHash('sha256')
  hash.update(buffer)
  return hash.digest('hex')
}

async function cleanBucket(s3Client, bucket, prefix) {
  console.log('\n🧹 Cleaning S3 bucket...')
  let deleted = 0
  let continuationToken = undefined
  
  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken
    })
    
    const listResponse = await s3Client.send(listCommand)
    
    if (listResponse.Contents && listResponse.Contents.length > 0) {
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: listResponse.Contents.map(obj => ({ Key: obj.Key }))
        }
      })
      
      await s3Client.send(deleteCommand)
      deleted += listResponse.Contents.length
      console.log(`  Deleted ${listResponse.Contents.length} objects`)
    }
    
    continuationToken = listResponse.NextContinuationToken
  } while (continuationToken)
  
  console.log(`✅ Cleaned ${deleted} objects from bucket`)
  return deleted
}

async function uploadAssets(s3Client, bucket, prefix) {
  console.log('\n📤 Uploading seed assets...')
  
  const assetsDir = path.join(__dirname, '..', 'src', 'world', 'assets')
  if (!await fs.pathExists(assetsDir)) {
    console.error('❌ Assets directory not found:', assetsDir)
    return 0
  }
  
  const files = await fs.readdir(assetsDir)
  let uploaded = 0
  
  const contentTypes = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    mp4: 'video/mp4',
    webm: 'video/webm',
    gltf: 'model/gltf+json',
    glb: 'model/gltf-binary',
    vrm: 'model/gltf-binary',
    obj: 'model/obj',
    json: 'application/json',
    js: 'application/javascript',
    pdf: 'application/pdf',
    zip: 'application/zip',
  }
  
  for (const file of files) {
    const filePath = path.join(assetsDir, file)
    const stat = await fs.stat(filePath)
    
    if (stat.isDirectory()) continue
    
    try {
      const buffer = await fs.readFile(filePath)
      const hash = await hashFile(buffer)
      const ext = file.split('.').pop().toLowerCase()
      
      // Upload with original filename (e.g., ai.js)
      // Ensure no double slashes
      const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
      const originalKey = cleanPrefix ? `${cleanPrefix}/${file}` : file
      console.log(`  Uploading ${file} to ${originalKey}`)
      
      const uploadOriginal = new PutObjectCommand({
        Bucket: bucket,
        Key: originalKey,
        Body: buffer,
        ContentType: contentTypes[ext] || 'application/octet-stream',
        ACL: 'public-read',
        Metadata: {
          'original-name': file,
          'asset-source': 'seed',
          'content-hash': hash
        }
      })
      
      await s3Client.send(uploadOriginal)
      uploaded++
      console.log(`    ✅ Uploaded: ${file}`)
      
      // Also upload with hashed filename for deduplication
      const hashedFilename = `${hash}.${ext}`
      const hashedKey = cleanPrefix ? `${cleanPrefix}/${hashedFilename}` : hashedFilename
      
      const uploadHashed = new PutObjectCommand({
        Bucket: bucket,
        Key: hashedKey,
        Body: buffer,
        ContentType: contentTypes[ext] || 'application/octet-stream',
        ACL: 'public-read',
        Metadata: {
          'original-name': file,
          'asset-source': 'seed'
        }
      })
      
      await s3Client.send(uploadHashed)
      console.log(`    ✅ Hashed copy: ${hashedFilename}`)
      
    } catch (error) {
      console.error(`    ❌ Failed to upload ${file}:`, error.message)
    }
  }
  
  console.log(`✅ Uploaded ${uploaded} assets`)
  return uploaded
}

async function verifyAssets(s3Client, bucket, prefix) {
  console.log('\n🔍 Verifying critical assets...')
  
  const criticalAssets = [
    'ai.js',
    'ai.glb',
    'avatar.vrm',
    'mp-idle.glb',
    'mp-walk.glb'
  ]
  
  for (const asset of criticalAssets) {
    const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
    const key = cleanPrefix ? `${cleanPrefix}/${asset}` : asset
    const url = `https://${bucket}.nyc3.digitaloceanspaces.com/${key}`
    
    try {
      const response = await fetch(url, { method: 'HEAD' })
      if (response.ok) {
        console.log(`  ✅ ${asset} is accessible at ${url}`)
      } else {
        console.log(`  ❌ ${asset} returned ${response.status} at ${url}`)
      }
    } catch (error) {
      console.log(`  ❌ Failed to verify ${asset}: ${error.message}`)
    }
  }
}

async function main() {
  try {
    // Parse the S3 URI
    const s3Config = parseS3Uri(process.env.ASSETS_S3_URI)
    
    console.log('🚀 S3 Assets Reset Tool')
    console.log('========================')
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
    
    // Clean bucket
    await cleanBucket(s3Client, s3Config.bucket, s3Config.prefix)
    
    // Upload assets
    await uploadAssets(s3Client, s3Config.bucket, s3Config.prefix)
    
    // Verify assets
    await verifyAssets(s3Client, s3Config.bucket, s3Config.prefix)
    
    console.log('\n✅ S3 assets reset complete!')
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

// Run the script
main()