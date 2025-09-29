import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs-extra'
import path from 'path'
import * as tar from 'tar'
import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'

export class WorldS3Backup {
  constructor() {
    this.enabled = process.env.WORLD_BACKUP_S3 === 'true'
    if (!this.enabled) {
      console.log('[world-backup] S3 backup disabled')
      return
    }

    // Parse S3 URI (reuse same URI as assets but different prefix)
    const uri = process.env.ASSETS_S3_URI
    if (!uri) {
      console.error('[world-backup] ASSETS_S3_URI not configured')
      this.enabled = false
      return
    }

    const config = this.parseS3Uri(uri)
    this.bucketName = config.bucket
    this.prefix = 'world-backups/' // Different prefix for world backups
    
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

    this.worldName = process.env.WORLD || 'world'
    this.backupInterval = parseInt(process.env.WORLD_BACKUP_INTERVAL || '300') * 1000 // Default 5 minutes
    this.backupRetention = parseInt(process.env.WORLD_BACKUP_RETENTION || '10') // Number of backups to keep
    this.backupTimer = null
  }

  parseS3Uri(uri) {
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
      const parts = rest.split('/')
      const host = parts[0]

      let config = {
        accessKeyId,
        secretAccessKey,
        forcePathStyle: false,
      }

      // Detect if this is AWS S3 or a custom endpoint
      if (host.includes('.amazonaws.com')) {
        const hostParts = host.split('.')
        const s3Index = hostParts.indexOf('s3')
        config.bucket = hostParts.slice(0, s3Index).join('.')
        config.region = hostParts[s3Index + 1] || 'us-east-1'
      } else if (host.includes('.')) {
        // Custom endpoint (like DigitalOcean Spaces)
        config.endpoint = `https://${host}`
        config.bucket = parts[1]
        config.region = 'us-east-1' // DigitalOcean Spaces compatibility
        config.forcePathStyle = true
      } else {
        // Simple format
        config.bucket = host
        config.region = 'us-east-1'
      }

      return config
    } catch (error) {
      throw new Error(`Failed to parse S3 URI: ${error.message}`)
    }
  }

  async init(worldDir) {
    if (!this.enabled) return

    this.worldDir = worldDir
    console.log('[world-backup] Initializing S3 world backup')
    console.log('[world-backup] Bucket:', this.bucketName)
    console.log('[world-backup] Prefix:', this.prefix)
    console.log('[world-backup] World:', this.worldName)
    console.log('[world-backup] Backup interval:', this.backupInterval / 1000, 'seconds')
    console.log('[world-backup] Retention count:', this.backupRetention, 'backups')

    // Try to restore on startup
    await this.restore()

    // Start periodic backups
    this.startPeriodicBackup()
  }

  async backup() {
    if (!this.enabled) return

    try {
      console.log('[world-backup] Starting backup...')
      
      // Check if world directory exists
      if (!await fs.pathExists(this.worldDir)) {
        console.log('[world-backup] No world directory to backup')
        return
      }

      // Create a tar archive of the world directory
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const archiveName = `${this.worldName}-${timestamp}.tar.gz`
      const tempArchivePath = path.join('/tmp', archiveName)

      // Create tar archive
      await tar.create(
        {
          gzip: true,
          file: tempArchivePath,
          cwd: path.dirname(this.worldDir),
        },
        [path.basename(this.worldDir)]
      )

      // Upload to S3
      const fileStream = createReadStream(tempArchivePath)
      const fileStats = await fs.stat(tempArchivePath)
      
      const uploadParams = {
        Bucket: this.bucketName,
        Key: `${this.prefix}${archiveName}`,
        Body: fileStream,
        ContentType: 'application/gzip',
        Metadata: {
          'world-name': this.worldName,
          'backup-time': timestamp,
          'size': fileStats.size.toString()
        }
      }

      await this.client.send(new PutObjectCommand(uploadParams))
      console.log(`[world-backup] Backup uploaded: ${archiveName} (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`)

      // Also save a "latest" pointer
      const latestKey = `${this.prefix}${this.worldName}-latest.tar.gz`
      const latestStream = createReadStream(tempArchivePath)
      
      await this.client.send(new PutObjectCommand({
        ...uploadParams,
        Key: latestKey,
        Body: latestStream,
        Metadata: {
          ...uploadParams.Metadata,
          'original-backup': archiveName
        }
      }))
      console.log('[world-backup] Latest backup pointer updated')

      // Clean up temp file
      await fs.remove(tempArchivePath)

      // Clean up old backups (keep last 10)
      await this.cleanupOldBackups()

    } catch (error) {
      console.error('[world-backup] Backup failed:', error.message)
    }
  }

  async restore() {
    if (!this.enabled) return

    try {
      console.log('[world-backup] Checking for existing backup...')
      
      // Check if latest backup exists
      const latestKey = `${this.prefix}${this.worldName}-latest.tar.gz`
      
      try {
        await this.client.send(new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: latestKey
        }))
      } catch (error) {
        console.log('[world-backup] No backup found to restore')
        return
      }

      console.log('[world-backup] Found backup, restoring...')

      // Download the backup
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: latestKey
      }))

      const tempArchivePath = path.join('/tmp', `${this.worldName}-restore.tar.gz`)
      const writeStream = createWriteStream(tempArchivePath)
      await pipeline(response.Body, writeStream)

      // Extract the archive
      const parentDir = path.dirname(this.worldDir)
      await tar.extract({
        file: tempArchivePath,
        cwd: parentDir,
      })

      console.log('[world-backup] World restored successfully')

      // Clean up temp file
      await fs.remove(tempArchivePath)

    } catch (error) {
      console.error('[world-backup] Restore failed:', error.message)
    }
  }

  async cleanupOldBackups() {
    try {
      // List all backups with pagination
      let allBackups = []
      let continuationToken = null
      
      do {
        const response = await this.client.send(new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: `${this.prefix}${this.worldName}-`,
          ContinuationToken: continuationToken
        }))
        
        if (response.Contents) {
          allBackups = allBackups.concat(response.Contents)
        }
        
        continuationToken = response.NextContinuationToken
      } while (continuationToken)

      if (!allBackups.length || allBackups.length <= 11) {
        return // Keep at least 10 backups + latest
      }

      // Sort by last modified date
      const backups = allBackups
        .filter(obj => !obj.Key.includes('-latest.tar.gz'))
        .sort((a, b) => b.LastModified - a.LastModified)

      // Delete old backups (keep configured retention count)
      const toDelete = backups.slice(this.backupRetention)
      
      for (const backup of toDelete) {
        console.log(`[world-backup] Deleting old backup: ${backup.Key}`)
        try {
          await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: backup.Key
          }))
          console.log(`[world-backup] Successfully deleted: ${backup.Key}`)
        } catch (deleteError) {
          console.error(`[world-backup] Failed to delete ${backup.Key}:`, deleteError.message)
        }
      }
    } catch (error) {
      console.error('[world-backup] Cleanup failed:', error.message)
    }
  }

  startPeriodicBackup() {
    if (!this.enabled) return

    // Clear existing timer
    if (this.backupTimer) {
      clearInterval(this.backupTimer)
    }

    // Start periodic backups
    this.backupTimer = setInterval(() => {
      this.backup()
    }, this.backupInterval)

    console.log('[world-backup] Periodic backup started')
  }

  stopPeriodicBackup() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer)
      this.backupTimer = null
      console.log('[world-backup] Periodic backup stopped')
    }
  }

  async shutdown() {
    if (!this.enabled) return

    console.log('[world-backup] Performing final backup before shutdown...')
    this.stopPeriodicBackup()
    await this.backup()
  }

  // Manual cleanup method for existing backups
  async manualCleanup(keepCount = null) {
    if (!this.enabled) return

    const retentionCount = keepCount || this.backupRetention
    
    try {
      console.log(`[world-backup] Starting manual cleanup (keeping ${retentionCount} most recent backups)...`)
      
      // List all backups with pagination
      let allBackups = []
      let continuationToken = null
      
      do {
        const response = await this.client.send(new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: this.prefix,
          ContinuationToken: continuationToken
        }))
        
        if (response.Contents) {
          allBackups = allBackups.concat(response.Contents)
        }
        
        continuationToken = response.NextContinuationToken
      } while (continuationToken)

      if (allBackups.length === 0) {
        console.log('[world-backup] No backups found')
        return { deleted: 0, remaining: 0 }
      }

      // Sort by last modified date (newest first)
      const backups = allBackups
        .filter(obj => !obj.Key.includes('-latest.tar.gz'))
        .sort((a, b) => b.LastModified - a.LastModified)

      console.log(`[world-backup] Found ${backups.length} timestamped backups`)

      // Delete old backups
      const toDelete = backups.slice(retentionCount)
      let deletedCount = 0
      let failedCount = 0
      let totalSize = 0
      
      for (const backup of toDelete) {
        try {
          totalSize += backup.Size || 0
          await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: backup.Key
          }))
          console.log(`[world-backup] Deleted: ${backup.Key} (${this.formatBytes(backup.Size)})`)
          deletedCount++
        } catch (deleteError) {
          console.error(`[world-backup] Failed to delete ${backup.Key}:`, deleteError.message)
          failedCount++
        }
      }

      const summary = {
        deleted: deletedCount,
        failed: failedCount,
        remaining: backups.length - deletedCount,
        freedSpace: totalSize,
        freedSpaceFormatted: this.formatBytes(totalSize)
      }

      console.log('[world-backup] Cleanup complete:')
      console.log(`  - Deleted: ${summary.deleted} backups`)
      console.log(`  - Failed: ${summary.failed}`)
      console.log(`  - Remaining: ${summary.remaining} backups`)
      console.log(`  - Freed space: ${summary.freedSpaceFormatted}`)

      return summary
    } catch (error) {
      console.error('[world-backup] Manual cleanup failed:', error.message)
      throw error
    }
  }

  // List all backups with details
  async listBackups() {
    if (!this.enabled) return []

    try {
      // List all backups with pagination
      let allBackups = []
      let continuationToken = null
      
      do {
        const response = await this.client.send(new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: this.prefix,
          ContinuationToken: continuationToken
        }))
        
        if (response.Contents) {
          allBackups = allBackups.concat(response.Contents)
        }
        
        continuationToken = response.NextContinuationToken
      } while (continuationToken)

      if (allBackups.length === 0) {
        return { backups: [], totalCount: 0, totalSize: 0, totalSizeFormatted: '0 Bytes' }
      }

      const backups = allBackups.map(obj => ({
        key: obj.Key,
        size: obj.Size,
        sizeFormatted: this.formatBytes(obj.Size),
        lastModified: obj.LastModified,
        isLatest: obj.Key.includes('-latest.tar.gz')
      })).sort((a, b) => b.lastModified - a.lastModified)

      const totalSize = backups.reduce((sum, b) => sum + b.size, 0)
      
      console.log(`[world-backup] Total backups: ${backups.length}`)
      console.log(`[world-backup] Total size: ${this.formatBytes(totalSize)}`)
      
      return {
        backups,
        totalCount: backups.length,
        totalSize,
        totalSizeFormatted: this.formatBytes(totalSize)
      }
    } catch (error) {
      console.error('[world-backup] Failed to list backups:', error.message)
      throw error
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

export default new WorldS3Backup()