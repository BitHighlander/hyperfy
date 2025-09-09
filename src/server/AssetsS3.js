import {
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import fs from 'fs-extra'
import path from 'path'
import moment from 'moment'
import { hashFile } from '../core/utils-server'

const contentTypes = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  // 3D models
  gltf: 'model/gltf+json',
  glb: 'model/gltf-binary',
  obj: 'model/obj',
  // Other
  json: 'application/json',
  pdf: 'application/pdf',
  zip: 'application/zip',
}

// Default assets to hide from gallery (will be populated with hashes)
const DEFAULT_ASSET_NAMES = [
  'ai.glb',
  'ai.js',
  'avatar.vrm',
  'crash-block.glb',
  'emote-fall.glb',
  'emote-flip.glb',
  'emote-float.glb',
  'emote-jump.glb',
  'emote-talk.glb',
  'mp-idle.glb',
  'mp-jog-back.glb',
  'mp-jog-left.glb',
  'mp-jog-right.glb',
  'mp-jog.glb',
  'mp-walk-back.glb',
  'mp-walk-left.glb',
  'mp-walk-right.glb',
  'mp-walk.glb'
]

// This will store the hashes of seed assets
let SEED_ASSET_HASHES = new Set()

export class AssetsS3 {
  constructor() {
    this.url = process.env.ASSETS_BASE_URL
    this.db = null

    // Parse S3 URI: s3://access_key:secret_key@endpoint/bucket/prefix
    // or for AWS: s3://access_key:secret_key@bucket.s3.region.amazonaws.com/prefix
    // or simple AWS: s3://access_key:secret_key@bucket/prefix (defaults to us-east-1)
    const uri = process.env.ASSETS_S3_URI
    if (!uri) {
      throw new Error('ASSETS_S3_URI environment variable is required')
    }

    const config = this.parseURI(uri)
    this.bucketName = config.bucket
    this.prefix = config.prefix || 'assets/'

    // Initialize S3 client
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    })
  }

  parseURI(uri) {
    try {
      // Remove s3:// prefix
      if (!uri.startsWith('s3://')) {
        throw new Error('S3 URI must start with s3://')
      }

      const withoutProtocol = uri.slice(5)

      // Extract credentials
      const credentialsMatch = withoutProtocol.match(/^([^:]+):([^@]+)@(.+)$/)
      if (!credentialsMatch) {
        throw new Error('Invalid S3 URI format')
      }

      const [, accessKeyId, secretAccessKey, rest] = credentialsMatch

      // Parse the rest of the URI
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
        // Example: play.hyperfy.xyz.s3.eu-west-1.amazonaws.com
        const hostParts = host.split('.')

        const s3Index = hostParts.indexOf('s3')
        if (s3Index === -1) {
          throw new Error('Invalid S3 host: missing "s3" in hostname')
        }

        // Bucket is everything before 's3'
        config.bucket = hostParts.slice(0, s3Index).join('.')

        // Region is the part right after 's3', if present
        config.region = hostParts[s3Index + 1] || 'us-east-1'

        // Build prefix and ensure it ends with a single slash
        config.prefix = pathParts.join('/')
        if (config.prefix && !config.prefix.endsWith('/')) {
          config.prefix += '/'
        }
      } else if (host.includes('.')) {
        // Custom endpoint (like R2): endpoint/bucket/prefix
        config.endpoint = `https://${host}`
        config.bucket = pathParts[0]
        config.prefix = pathParts.slice(1).join('/') + (pathParts.length > 1 ? '/' : '')
        config.region = 'auto' // For R2 and similar services
        config.forcePathStyle = true
      } else {
        // Simple format: bucket/prefix (defaults to AWS us-east-1)
        config.bucket = host
        config.prefix = pathParts.join('/') + (pathParts.length > 0 ? '/' : '')
        config.region = 'us-east-1'
      }

      return config
    } catch (error) {
      throw new Error(`Failed to parse S3 URI: ${error.message}`)
    }
  }

  async init({ rootDir, worldDir, db }) {
    console.log('[assets] initializing')
    this.db = db
    console.log('[assets] S3 Configuration:', {
      bucket: this.bucketName,
      prefix: this.prefix,
      url: this.url,
      endpoint: this.client.config.endpoint,
      region: this.client.config.region
    })
    
    // Verify bucket access
    try {
      await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          MaxKeys: 1,
          Prefix: this.prefix,
        })
      )
      console.log('[assets] Successfully connected to S3 bucket')
    } catch (error) {
      console.error('[assets] S3 Error Details:', {
        name: error.name,
        message: error.message,
        code: error.Code,
        statusCode: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId
      })
      throw new Error(`Failed to access S3 bucket: ${error.message || error.name}`)
    }

    // Upload built-in assets from local directory to S3
    const builtInAssetsDir = path.join(rootDir, 'src/world/assets')
    if (await fs.pathExists(builtInAssetsDir)) {
      await this.uploadDirectory(builtInAssetsDir, builtInAssetsDir)
    }
  }

  async uploadDirectory(localDir, baseDir, subPath = '') {
    const files = await fs.readdir(localDir)

    for (const file of files) {
      const filePath = path.join(localDir, file)
      const stat = await fs.stat(filePath)

      if (stat.isDirectory()) {
        // Recursively upload subdirectories
        const newSubPath = subPath ? path.join(subPath, file) : file
        await this.uploadDirectory(filePath, baseDir, newSubPath)
      } else {
        // Upload file with both original and hashed filename
        const buffer = await fs.readFile(filePath)
        const hash = await hashFile(buffer)
        const ext = file.split('.').pop().toLowerCase()
        const hashedFilename = `${hash}.${ext}`
        
        // Upload with original filename for direct access (e.g., ai.js)
        const originalExists = await this.exists(file)
        if (!originalExists) {
          await this.uploadBuffer(buffer, file, {
            'original-name': file,
            'asset-source': 'seed',
            'asset-category': 'built-in',
            'content-hash': hash
          })
          console.log(`[assets] Uploaded seed asset: ${file}`)
        } else {
          console.log(`[assets] Seed asset already exists: ${file}`)
        }
        
        // Also upload with hashed filename for deduplication
        const hashExists = await this.exists(hashedFilename)
        if (!hashExists) {
          await this.uploadBuffer(buffer, hashedFilename, {
            'original-name': file,
            'asset-source': 'seed',
            'asset-category': 'built-in'
          })
          console.log(`[assets] Uploaded hashed asset: ${file} -> ${hashedFilename}`)
        }
        
        // Track seed asset hash for filtering
        SEED_ASSET_HASHES.add(hash)
      }
    }
  }

  async listAssets(options = {}) {
    const { sortBy = 'newest', page = 1, limit = 50 } = options
    const params = {
      Bucket: this.bucketName,
      Prefix: this.prefix,
      MaxKeys: 1000, // Get more items to sort properly
    }

    try {
      const response = await this.client.send(new ListObjectsV2Command(params))
      const objects = response.Contents || []
      
      // Filter out directories (keys ending with /) and seed assets
      const files = objects.filter(obj => {
        if (obj.Key.endsWith('/')) return false
        const filename = obj.Key.replace(this.prefix, '')
        // Filter by filename for default assets
        if (DEFAULT_ASSET_NAMES.includes(filename)) return false
        // Filter by hash (ETag) for seed assets
        const hash = obj.ETag ? obj.ETag.replace(/"/g, '') : ''
        if (SEED_ASSET_HASHES.has(hash)) return false
        return true
      })
      
      // Sort based on sortBy parameter
      let sortedFiles = [...files]
      if (sortBy === 'newest') {
        sortedFiles.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified))
      } else if (sortBy === 'oldest') {
        sortedFiles.sort((a, b) => new Date(a.LastModified) - new Date(b.LastModified))
      } else if (sortBy === 'rank' || sortBy === 'votes') {
        // For rank/votes, we'll sort by size as a proxy (larger files might be more important)
        // In a real system, you'd want to store vote data in the database
        sortedFiles.sort((a, b) => b.Size - a.Size)
      }
      
      // Paginate
      const startIndex = (page - 1) * limit
      const endIndex = startIndex + limit
      const paginatedFiles = sortedFiles.slice(startIndex, endIndex)
      
      // Format assets for response
      const assets = paginatedFiles.map((obj, index) => {
        const filename = obj.Key.replace(this.prefix, '')
        const extension = filename.split('.').pop().toLowerCase()
        
        return {
          hash: obj.ETag ? obj.ETag.replace(/"/g, '') : obj.Key,
          filename: filename,
          url: `${this.url}/${filename}`,
          uploaderId: 'system',
          uploaderName: 'System',
          fileSize: obj.Size || 0,
          mimeType: contentTypes[extension] || 'application/octet-stream',
          totalDegenVotes: Math.floor(Math.random() * 1000), // Placeholder - would come from DB
          rank: startIndex + index + 1,
          createdAt: obj.LastModified || new Date().toISOString(),
          updatedAt: obj.LastModified || new Date().toISOString()
        }
      })
      
      return {
        assets,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: sortedFiles.length,
          totalPages: Math.ceil(sortedFiles.length / limit)
        }
      }
    } catch (error) {
      console.error('[assets] Error listing S3 assets:', error)
      throw error
    }
  }

  async cleanS3Bucket() {
    console.log('[assets] Cleaning S3 bucket...')
    const results = {
      deleted: [],
      failed: []
    }
    
    try {
      // List all objects in the bucket
      let continuationToken = undefined
      let hasMore = true
      
      while (hasMore) {
        const listParams = {
          Bucket: this.bucketName,
          Prefix: this.prefix,
          MaxKeys: 1000,
          ContinuationToken: continuationToken
        }
        
        const response = await this.client.send(new ListObjectsV2Command(listParams))
        const objects = response.Contents || []
        
        if (objects.length > 0) {
          // Delete objects in batches
          const deleteParams = {
            Bucket: this.bucketName,
            Delete: {
              Objects: objects.map(obj => ({ Key: obj.Key }))
            }
          }
          
          try {
            await this.client.send(new DeleteObjectsCommand(deleteParams))
            objects.forEach(obj => {
              const filename = obj.Key.replace(this.prefix, '')
              console.log(`[assets] Deleted: ${filename}`)
              results.deleted.push(filename)
            })
          } catch (error) {
            console.error('[assets] Failed to delete batch:', error.message)
            objects.forEach(obj => {
              results.failed.push({ file: obj.Key, error: error.message })
            })
          }
        }
        
        hasMore = response.IsTruncated
        continuationToken = response.NextContinuationToken
      }
      
      console.log('[assets] S3 cleanup completed:', {
        deleted: results.deleted.length,
        failed: results.failed.length
      })
      
      return results
    } catch (error) {
      console.error('[assets] S3 cleanup error:', error)
      throw error
    }
  }

  async syncWorldAssets(rootDir, recordHashes = false) {
    console.log('[assets] Starting S3 sync...')
    console.log('[assets] Root dir:', rootDir)
    const results = {
      uploaded: [],
      failed: [],
      skipped: [],
      hashes: {}
    }
    
    try {
      // Clear seed hashes if we're recording new ones
      if (recordHashes) {
        SEED_ASSET_HASHES.clear()
        console.log('[assets] Recording seed asset hashes...')
      }
      
      // Upload built-in assets from local directory to S3
      const builtInAssetsDir = path.join(rootDir, 'src/world/assets')
      console.log('[assets] Checking for assets in:', builtInAssetsDir)
      const exists = await fs.pathExists(builtInAssetsDir)
      console.log('[assets] Directory exists:', exists)
      if (exists) {
        const files = await fs.readdir(builtInAssetsDir)
        
        for (const file of files) {
          const filePath = path.join(builtInAssetsDir, file)
          const stat = await fs.stat(filePath)
          
          if (!stat.isDirectory()) {
            try {
              // Skip very large files to avoid timeout
              const fileSizeMB = stat.size / (1024 * 1024)
              if (fileSizeMB > 50) {
                console.log(`[assets] Skipping large file (${fileSizeMB.toFixed(2)}MB): ${file}`)
                results.skipped.push({ file, reason: 'File too large (>50MB)' })
                continue
              }
              
              const buffer = await fs.readFile(filePath)
              const hash = await hashFile(buffer)
              const ext = file.split('.').pop().toLowerCase()
              const filename = file // Keep original filename for default assets
              
              // Record hash if requested
              if (recordHashes) {
                SEED_ASSET_HASHES.add(hash)
                results.hashes[filename] = hash
              }
              
              // Upload to S3 (overwrite existing)
              const key = this.prefix + filename
              const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: buffer,
                ContentType: contentTypes[ext] || 'application/octet-stream',
                ACL: 'public-read',
              })
              
              const uploadResult = await this.client.send(command)
              const etag = uploadResult.ETag ? uploadResult.ETag.replace(/"/g, '') : hash
              
              console.log(`[assets] Uploaded: ${filename} (${(stat.size / 1024).toFixed(2)}KB) Hash: ${etag}`)
              results.uploaded.push({ filename, hash: etag, size: stat.size })
              
              // Also record the ETag that S3 returns
              if (recordHashes && etag) {
                SEED_ASSET_HASHES.add(etag)
              }
            } catch (error) {
              console.error(`[assets] Failed to upload ${file}:`, error.message)
              results.failed.push({ file, error: error.message })
            }
          }
        }
      } else {
        console.log('[assets] World assets directory not found:', builtInAssetsDir)
      }
      
      console.log('[assets] S3 sync completed:', {
        uploaded: results.uploaded.length,
        failed: results.failed.length,
        skipped: results.skipped.length,
        seedHashes: recordHashes ? SEED_ASSET_HASHES.size : 0
      })
      
      return results
    } catch (error) {
      console.error('[assets] S3 sync error:', error)
      throw error
    }
  }

  async resetAndSync(rootDir) {
    console.log('[assets] Starting full S3 reset and sync...')
    
    // Step 1: Clean the bucket
    console.log('[assets] Step 1: Cleaning S3 bucket...')
    const cleanResults = await this.cleanS3Bucket()
    
    // Step 2: Sync world assets and record their hashes
    console.log('[assets] Step 2: Syncing world assets and recording hashes...')
    const syncResults = await this.syncWorldAssets(rootDir, true)
    
    return {
      clean: cleanResults,
      sync: syncResults,
      seedHashesRecorded: SEED_ASSET_HASHES.size
    }
  }

  async upload(file, uploaderData = null) {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const hash = await hashFile(buffer)
    const ext = file.name.split('.').pop().toLowerCase()
    const filename = `${hash}.${ext}`

    // Track asset metadata in database
    if (this.db && uploaderData) {
      const now = moment().toISOString()
      const fileStats = {
        hash,
        filename,
        uploaderId: uploaderData.id || null,
        uploaderName: uploaderData.name || 'Anonymous',
        fileSize: buffer.length,
        mimeType: file.type || 'application/octet-stream',
        totalDegenVotes: 0,
        rank: 0,
        createdAt: now,
        updatedAt: now
      }
      
      // Check if metadata exists
      const existing = await this.db('assets_metadata').where('hash', hash).first()
      if (!existing) {
        await this.db('assets_metadata').insert(fileStats)
      }
    }

    // Check if file already exists
    const exists = await this.exists(filename)
    if (exists) return filename

    await this.uploadBuffer(buffer, filename)
    return filename
  }

  async uploadBuffer(buffer, filename, metadata = {}) {
    const key = this.getKey(filename)

    try {
      // Extract file info for metadata
      const extension = filename.split('.').pop().toLowerCase()
      const isHashedAsset = filename.split('.')[0].length === 64
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: this.getContentType(filename),
        ACL: 'public-read', // Make the asset publicly readable
        // Add metadata tags for asset tracking
        Metadata: {
          'asset-type': extension,
          'is-hashed': isHashedAsset ? 'true' : 'false',
          'upload-timestamp': new Date().toISOString(),
          ...metadata
        }
      })
      
      await this.client.send(command)
    } catch (error) {
      throw new Error(`Failed to upload to S3: ${error.message}`)
    }
  }

  async exists(filename) {
    const key = this.getKey(filename)

    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      )
      return true
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false
      }
      throw error
    }
  }

  async list() {
    const assets = new Set()
    let continuationToken = undefined

    do {
      try {
        const response = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: this.prefix,
            ContinuationToken: continuationToken,
          })
        )

        if (response.Contents) {
          for (const object of response.Contents) {
            // Remove prefix from key to get filename
            const filename = object.Key.replace(this.prefix, '')

            // HACK: we only want to include uploaded assets (not core/assets/*) so we do a check
            // if its filename is a 64 character hash
            const isAsset = filename.split('.')[0].length === 64
            if (isAsset) {
              assets.add(filename)
            }
          }
        }

        continuationToken = response.NextContinuationToken
      } catch (error) {
        throw new Error(`Failed to list S3 objects: ${error.message}`)
      }
    } while (continuationToken)

    return assets
  }

  async delete(assets) {
    if (assets.length === 0) return

    // S3 delete can handle up to 1000 objects at once
    const chunks = []
    for (let i = 0; i < assets.length; i += 1000) {
      chunks.push(assets.slice(i, i + 1000))
    }

    for (const chunk of chunks) {
      const objects = chunk.map(asset => ({
        Key: this.getKey(asset),
      }))

      try {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucketName,
            Delete: {
              Objects: objects,
            },
          })
        )
      } catch (error) {
        throw new Error(`Failed to delete from S3: ${error.message}`)
      }
    }
  }

  // Helper methods
  getKey(filename) {
    // Handle empty prefix case
    if (!this.prefix || this.prefix === '/') {
      return filename
    }
    // Ensure single slash between prefix and filename
    const cleanPrefix = this.prefix.endsWith('/') ? this.prefix.slice(0, -1) : this.prefix
    return `${cleanPrefix}/${filename}`
  }

  getContentType(filename) {
    const ext = filename.split('.').pop().toLowerCase()
    return contentTypes[ext] || 'application/octet-stream'
  }
}
