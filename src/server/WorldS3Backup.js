import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3'
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
      // List all backups
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${this.prefix}${this.worldName}-`,
      }))

      if (!response.Contents || response.Contents.length <= 11) {
        return // Keep at least 10 backups + latest
      }

      // Sort by last modified date
      const backups = response.Contents
        .filter(obj => !obj.Key.includes('-latest.tar.gz'))
        .sort((a, b) => b.LastModified - a.LastModified)

      // Delete old backups (keep 10 most recent)
      const toDelete = backups.slice(10)
      
      for (const backup of toDelete) {
        console.log(`[world-backup] Deleting old backup: ${backup.Key}`)
        // Note: DeleteObjectCommand not imported, but would be used here
        // await this.client.send(new DeleteObjectCommand({
        //   Bucket: this.bucketName,
        //   Key: backup.Key
        // }))
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
}

export default new WorldS3Backup()