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
    if (await fs.exists(builtInAssetsDir)) {
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
        // Upload file with its original path structure
        const buffer = await fs.readFile(filePath)
        const relativePath = subPath ? path.join(subPath, file) : file

        // Always upload built-in assets (overwrite existing)
        await this.uploadBuffer(buffer, relativePath)
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
      
      // Filter out directories (keys ending with /)
      const files = objects.filter(obj => !obj.Key.endsWith('/'))
      
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

  async uploadBuffer(buffer, filename) {
    const key = this.getKey(filename)

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          // Optional: Set content type based on file extension
          ContentType: this.getContentType(filename),
          // Optional: Make objects publicly readable if needed
          // ACL: 'public-read',
        })
      )
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
    return `${this.prefix}${filename}`
  }

  getContentType(filename) {
    const ext = filename.split('.').pop().toLowerCase()
    return contentTypes[ext] || 'application/octet-stream'
  }
}
