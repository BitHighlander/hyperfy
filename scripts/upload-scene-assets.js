#!/usr/bin/env node

import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config()

// Parse S3 URI to get configuration
function parseS3URI(uri) {
  try {
    if (!uri.startsWith('s3://')) {
      throw new Error('S3 URI must start with s3://')
    }

    const withoutProtocol = uri.slice(5)
    const credentialsMatch = withoutProtocol.match(/^([^:]+):([^@]+)@(.+)$/)
    
    if (!credentialsMatch) {
      throw new Error('Invalid S3 URI format')
    }

    const [, accessKeyId, secretAccessKey, rest] = credentialsMatch
    const parts = rest.split('/')
    const host = parts[0]
    const pathParts = parts.slice(1)

    let config = {
      accessKeyId,
      secretAccessKey,
      forcePathStyle: false,
    }

    // Detect if this is AWS S3 or a custom endpoint
    if (host.includes('.amazonaws.com')) {
      const hostParts = host.split('.')
      const s3Index = hostParts.indexOf('s3')
      
      if (s3Index === -1) {
        throw new Error('Invalid S3 host: missing "s3" in hostname')
      }

      config.bucket = hostParts.slice(0, s3Index).join('.')
      config.region = hostParts[s3Index + 1] || 'us-east-1'
      config.prefix = pathParts.join('/') + (pathParts.length > 0 ? '/' : '')
    } else if (host.includes('.')) {
      // Custom endpoint (like DigitalOcean Spaces)
      config.endpoint = `https://${host}`
      config.bucket = pathParts[0]
      config.prefix = pathParts.slice(1).join('/') + (pathParts.length > 1 ? '/' : '')
      config.region = 'auto'
      config.forcePathStyle = true
    } else {
      config.bucket = host
      config.prefix = pathParts.join('/') + (pathParts.length > 0 ? '/' : '')
      config.region = 'us-east-1'
    }

    return config
  } catch (error) {
    throw new Error(`Failed to parse S3 URI: ${error.message}`)
  }
}

// Hash a buffer to get SHA256 hash
function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

// Import .hyp file and extract assets
async function importHyp(filePath) {
  const buffer = await fs.readFile(filePath)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  
  // Read header size (first 4 bytes)
  const headerSize = view.getUint32(0, true)
  
  // Read header
  const headerBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + 4, headerSize)
  const header = JSON.parse(new TextDecoder().decode(headerBytes))
  
  // Extract files
  let position = 4 + headerSize
  const assets = []
  
  for (const assetInfo of header.assets) {
    const data = buffer.slice(position, position + assetInfo.size)
    assets.push({
      type: assetInfo.type,
      url: assetInfo.url,
      size: assetInfo.size,
      mime: assetInfo.mime,
      data: data
    })
    position += assetInfo.size
  }
  
  return {
    blueprint: header.blueprint,
    assets
  }
}

// Upload asset to S3
async function uploadAsset(s3Client, config, buffer, filename, metadata = {}) {
  const key = config.prefix + filename
  
  try {
    // Check if already exists
    await s3Client.send(new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key
    }))
    console.log(`  Asset already exists: ${filename}`)
    return true
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      // File doesn't exist, upload it
      const ext = filename.split('.').pop().toLowerCase()
      const contentTypes = {
        glb: 'model/gltf-binary',
        js: 'application/javascript',
        jpg: 'image/jpeg',
        png: 'image/png',
        mp3: 'audio/mpeg'
      }
      
      await s3Client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentTypes[ext] || 'application/octet-stream',
        ACL: 'public-read',
        Metadata: metadata
      }))
      console.log(`  ✅ Uploaded: ${filename}`)
      return true
    }
    throw error
  }
}

async function main() {
  const uri = process.env.ASSETS_S3_URI
  if (!uri) {
    console.error('ASSETS_S3_URI environment variable is required')
    process.exit(1)
  }

  console.log('Parsing S3 configuration...')
  const config = parseS3URI(uri)
  
  console.log('S3 Configuration:')
  console.log(`  Bucket: ${config.bucket}`)
  console.log(`  Prefix: ${config.prefix}`)
  console.log(`  Region: ${config.region}`)
  if (config.endpoint) {
    console.log(`  Endpoint: ${config.endpoint}`)
  }

  // Initialize S3 client
  const s3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  })

  // Upload scene.hyp assets
  const sceneHypPath = path.join(__dirname, '../src/world/scene.hyp')
  if (await fs.pathExists(sceneHypPath)) {
    console.log('\nProcessing scene.hyp...')
    const scene = await importHyp(sceneHypPath)
    
    console.log(`Found ${scene.assets.length} assets in scene.hyp`)
    
    for (const asset of scene.assets) {
      const hash = hashBuffer(asset.data)
      const assetPath = asset.url.replace('asset://', '')
      const ext = assetPath.split('.').pop()
      const hashedFilename = `${hash}.${ext}`
      
      console.log(`\nAsset: ${asset.type}`)
      console.log(`  Original: ${assetPath}`)
      console.log(`  Hashed: ${hashedFilename}`)
      
      await uploadAsset(s3Client, config, asset.data, hashedFilename, {
        'asset-type': asset.type,
        'asset-source': 'scene',
        'original-url': asset.url
      })
    }
  }

  // Upload collection .hyp files
  const collectionsDir = path.join(__dirname, '../src/world/collections')
  if (await fs.pathExists(collectionsDir)) {
    const collections = await fs.readdir(collectionsDir)
    
    for (const collection of collections) {
      const collectionPath = path.join(collectionsDir, collection)
      const stat = await fs.stat(collectionPath)
      
      if (stat.isDirectory()) {
        const manifestPath = path.join(collectionPath, 'manifest.json')
        if (await fs.pathExists(manifestPath)) {
          const manifest = await fs.readJson(manifestPath)
          console.log(`\nProcessing collection: ${manifest.name}`)
          
          for (const appFile of manifest.apps) {
            const appPath = path.join(collectionPath, appFile)
            if (await fs.pathExists(appPath)) {
              console.log(`  Processing ${appFile}...`)
              const app = await importHyp(appPath)
              
              for (const asset of app.assets) {
                const hash = hashBuffer(asset.data)
                const assetPath = asset.url.replace('asset://', '')
                const ext = assetPath.split('.').pop()
                const hashedFilename = `${hash}.${ext}`
                
                await uploadAsset(s3Client, config, asset.data, hashedFilename, {
                  'asset-type': asset.type,
                  'asset-source': 'collection',
                  'collection': collection,
                  'app': appFile
                })
              }
            }
          }
        }
      }
    }
  }

  // Upload built-in assets
  const assetsDir = path.join(__dirname, '../src/world/assets')
  if (await fs.pathExists(assetsDir)) {
    console.log('\nUploading built-in assets...')
    const files = await fs.readdir(assetsDir)
    
    for (const file of files) {
      const filePath = path.join(assetsDir, file)
      const stat = await fs.stat(filePath)
      
      if (!stat.isDirectory()) {
        const buffer = await fs.readFile(filePath)
        const hash = hashBuffer(buffer)
        const ext = file.split('.').pop()
        const hashedFilename = `${hash}.${ext}`
        
        console.log(`\nAsset: ${file}`)
        console.log(`  Hashed: ${hashedFilename}`)
        
        await uploadAsset(s3Client, config, buffer, hashedFilename, {
          'asset-type': ext,
          'asset-source': 'built-in',
          'original-name': file
        })
      }
    }
  }

  console.log('\n✅ All assets uploaded successfully!')
}

main().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})