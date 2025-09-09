import { PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { exportApp } from '../core/extras/appTools'
import moment from 'moment'
import { assets } from './assets'

/**
 * BlueprintS3Backup
 * 
 * Manages blueprint backups to S3 to enable database recovery
 * - Backs up blueprint JSON to S3 on every save
 * - Stores .hyp files for complete app recovery
 * - Enables database reconstruction from S3
 * - Manages versioning for rollback capability
 */
export class BlueprintS3Backup {
  constructor(s3Client, bucketName, prefix = 'blueprints/') {
    this.client = s3Client
    this.bucketName = bucketName
    this.prefix = prefix
    this.db = null
  }

  init(db) {
    this.db = db
    console.log('[blueprint-backup] Initialized S3 backup system')
  }

  /**
   * Backup a blueprint to S3
   * Stores both JSON and .hyp file for complete recovery
   */
  async backupBlueprint(blueprint, saveHyp = true) {
    try {
      const timestamp = moment().toISOString()
      
      // 1. Backup blueprint JSON
      const jsonKey = `${this.prefix}json/${blueprint.id}.json`
      const jsonData = {
        ...blueprint,
        _backup: {
          timestamp,
          version: blueprint.version || 0,
        }
      }
      
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: jsonKey,
        Body: JSON.stringify(jsonData, null, 2),
        ContentType: 'application/json',
        Metadata: {
          'blueprint-id': blueprint.id,
          'blueprint-name': blueprint.name || 'unnamed',
          'blueprint-version': String(blueprint.version || 0),
          'backup-timestamp': timestamp,
          'has-script': blueprint.script ? 'true' : 'false',
          'has-model': blueprint.model ? 'true' : 'false',
        }
      }))
      
      console.log(`[blueprint-backup] Backed up JSON for ${blueprint.id}`)
      
      // 2. Export and backup .hyp file if requested
      if (saveHyp && (blueprint.script || blueprint.model)) {
        const hypKey = `${this.prefix}hyp/${blueprint.id}.hyp`
        
        try {
          // Create a resolver for asset files
          const resolveFile = async (url) => {
            if (url.startsWith('asset://')) {
              const filename = url.replace('asset://', '')
              const assetUrl = `${process.env.ASSETS_BASE_URL}/${filename}`
              
              // Fetch the asset from S3 or local storage
              try {
                const response = await fetch(assetUrl)
                const buffer = await response.arrayBuffer()
                return new File([buffer], filename, {
                  type: response.headers.get('content-type') || 'application/octet-stream'
                })
              } catch (err) {
                console.warn(`[blueprint-backup] Could not fetch asset ${url}:`, err.message)
                // Return empty file as fallback
                return new File([], filename, { type: 'application/octet-stream' })
              }
            }
            return new File([], 'unknown', { type: 'application/octet-stream' })
          }
          
          // Export to .hyp format
          const hypFile = await exportApp(blueprint, resolveFile)
          const hypBuffer = await hypFile.arrayBuffer()
          
          await this.client.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: hypKey,
            Body: Buffer.from(hypBuffer),
            ContentType: 'application/octet-stream',
            Metadata: {
              'blueprint-id': blueprint.id,
              'blueprint-name': blueprint.name || 'unnamed',
              'export-timestamp': timestamp,
            }
          }))
          
          console.log(`[blueprint-backup] Backed up .hyp file for ${blueprint.id}`)
        } catch (err) {
          console.error(`[blueprint-backup] Failed to export .hyp for ${blueprint.id}:`, err.message)
        }
      }
      
      // 3. Store versioned backup if versioning enabled
      if (blueprint.version !== undefined) {
        const versionKey = `${this.prefix}versions/${blueprint.id}/v${blueprint.version}.json`
        await this.client.send(new PutObjectCommand({
          Bucket: this.bucketName,
          Key: versionKey,
          Body: JSON.stringify(jsonData, null, 2),
          ContentType: 'application/json',
          Metadata: {
            'blueprint-id': blueprint.id,
            'version': String(blueprint.version),
            'timestamp': timestamp,
          }
        }))
      }
      
      return { success: true, timestamp }
    } catch (error) {
      console.error(`[blueprint-backup] Failed to backup blueprint ${blueprint.id}:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Backup all blueprints from database to S3
   */
  async backupAllBlueprints() {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    
    console.log('[blueprint-backup] Starting full blueprint backup...')
    const results = {
      success: [],
      failed: [],
      total: 0
    }
    
    try {
      const blueprints = await this.db('blueprints')
      results.total = blueprints.length
      
      for (const row of blueprints) {
        const blueprint = JSON.parse(row.data)
        const result = await this.backupBlueprint(blueprint, true)
        
        if (result.success) {
          results.success.push(blueprint.id)
        } else {
          results.failed.push({ id: blueprint.id, error: result.error })
        }
      }
      
      console.log(`[blueprint-backup] Backup complete: ${results.success.length}/${results.total} succeeded`)
      return results
    } catch (error) {
      console.error('[blueprint-backup] Backup all failed:', error)
      throw error
    }
  }

  /**
   * List all backed up blueprints in S3
   */
  async listBackups() {
    const backups = {
      json: [],
      hyp: [],
      versions: {}
    }
    
    try {
      // List JSON backups
      const jsonResponse = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${this.prefix}json/`,
        MaxKeys: 1000
      }))
      
      if (jsonResponse.Contents) {
        backups.json = jsonResponse.Contents.map(obj => ({
          key: obj.Key,
          id: obj.Key.split('/').pop().replace('.json', ''),
          size: obj.Size,
          lastModified: obj.LastModified
        }))
      }
      
      // List .hyp backups
      const hypResponse = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${this.prefix}hyp/`,
        MaxKeys: 1000
      }))
      
      if (hypResponse.Contents) {
        backups.hyp = hypResponse.Contents.map(obj => ({
          key: obj.Key,
          id: obj.Key.split('/').pop().replace('.hyp', ''),
          size: obj.Size,
          lastModified: obj.LastModified
        }))
      }
      
      // List versioned backups
      const versionsResponse = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${this.prefix}versions/`,
        MaxKeys: 1000
      }))
      
      if (versionsResponse.Contents) {
        versionsResponse.Contents.forEach(obj => {
          const parts = obj.Key.split('/')
          if (parts.length >= 4) {
            const blueprintId = parts[2]
            const version = parts[3].replace('.json', '')
            
            if (!backups.versions[blueprintId]) {
              backups.versions[blueprintId] = []
            }
            
            backups.versions[blueprintId].push({
              key: obj.Key,
              version,
              size: obj.Size,
              lastModified: obj.LastModified
            })
          }
        })
      }
      
      return backups
    } catch (error) {
      console.error('[blueprint-backup] Failed to list backups:', error)
      throw error
    }
  }

  /**
   * Restore a blueprint from S3 backup
   */
  async restoreBlueprint(blueprintId, version = null) {
    try {
      let key
      if (version) {
        key = `${this.prefix}versions/${blueprintId}/${version}.json`
      } else {
        key = `${this.prefix}json/${blueprintId}.json`
      }
      
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }))
      
      const jsonStr = await response.Body.transformToString()
      const blueprint = JSON.parse(jsonStr)
      
      // Remove backup metadata
      delete blueprint._backup
      
      return blueprint
    } catch (error) {
      console.error(`[blueprint-backup] Failed to restore blueprint ${blueprintId}:`, error)
      throw error
    }
  }

  /**
   * Restore all blueprints from S3 to database
   * This is the main recovery function when database is lost
   */
  async restoreAllToDatabase() {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    
    console.log('[blueprint-backup] Starting database restoration from S3...')
    const results = {
      restored: [],
      failed: [],
      total: 0
    }
    
    try {
      // List all JSON backups
      const backups = await this.listBackups()
      results.total = backups.json.length
      
      const now = moment().toISOString()
      
      for (const backup of backups.json) {
        try {
          const blueprint = await this.restoreBlueprint(backup.id)
          
          // Insert into database
          await this.db('blueprints')
            .insert({
              id: blueprint.id,
              data: JSON.stringify(blueprint),
              createdAt: now,
              updatedAt: now
            })
            .onConflict('id')
            .merge({
              data: JSON.stringify(blueprint),
              updatedAt: now
            })
          
          results.restored.push(blueprint.id)
          console.log(`[blueprint-backup] Restored blueprint: ${blueprint.id}`)
        } catch (err) {
          console.error(`[blueprint-backup] Failed to restore ${backup.id}:`, err.message)
          results.failed.push({ id: backup.id, error: err.message })
        }
      }
      
      console.log(`[blueprint-backup] Restoration complete: ${results.restored.length}/${results.total} restored`)
      return results
    } catch (error) {
      console.error('[blueprint-backup] Restoration failed:', error)
      throw error
    }
  }

  /**
   * Delete a blueprint backup from S3
   */
  async deleteBackup(blueprintId) {
    const keysToDelete = [
      `${this.prefix}json/${blueprintId}.json`,
      `${this.prefix}hyp/${blueprintId}.hyp`
    ]
    
    try {
      for (const key of keysToDelete) {
        await this.client.send(new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key
        }))
      }
      
      console.log(`[blueprint-backup] Deleted backups for blueprint ${blueprintId}`)
      return { success: true }
    } catch (error) {
      console.error(`[blueprint-backup] Failed to delete backup for ${blueprintId}:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Sync database blueprints with S3 backups
   * Identifies missing backups and orphaned backups
   */
  async syncWithDatabase() {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    
    console.log('[blueprint-backup] Syncing database with S3 backups...')
    
    try {
      // Get all blueprints from database
      const dbBlueprints = await this.db('blueprints')
      const dbIds = new Set(dbBlueprints.map(b => b.id))
      
      // Get all backups from S3
      const backups = await this.listBackups()
      const s3Ids = new Set(backups.json.map(b => b.id))
      
      // Find missing backups (in DB but not in S3)
      const missingBackups = []
      for (const id of dbIds) {
        if (!s3Ids.has(id)) {
          missingBackups.push(id)
        }
      }
      
      // Find orphaned backups (in S3 but not in DB)
      const orphanedBackups = []
      for (const id of s3Ids) {
        if (!dbIds.has(id)) {
          orphanedBackups.push(id)
        }
      }
      
      // Backup missing blueprints
      for (const id of missingBackups) {
        const row = dbBlueprints.find(b => b.id === id)
        if (row) {
          const blueprint = JSON.parse(row.data)
          await this.backupBlueprint(blueprint, true)
        }
      }
      
      const report = {
        dbCount: dbIds.size,
        s3Count: s3Ids.size,
        missingBackups: missingBackups.length,
        orphanedBackups: orphanedBackups.length,
        backedUp: missingBackups,
        orphaned: orphanedBackups
      }
      
      console.log('[blueprint-backup] Sync complete:', report)
      return report
    } catch (error) {
      console.error('[blueprint-backup] Sync failed:', error)
      throw error
    }
  }
}