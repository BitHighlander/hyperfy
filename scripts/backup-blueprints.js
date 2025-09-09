#!/usr/bin/env node

/**
 * Blueprint Backup Script
 * 
 * Backs up all blueprints from the database to S3.
 * Creates both JSON and .hyp file backups for complete recovery.
 * 
 * Usage: npm run backup:blueprints
 */

import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { S3Client } from '@aws-sdk/client-s3'
import { BlueprintS3Backup } from '../src/server/BlueprintS3Backup.js'
import { getDB } from '../src/server/db.js'
import { AssetsS3 } from '../src/server/AssetsS3.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '../')
const worldDir = path.join(rootDir, process.env.WORLD || 'world')

async function backupBlueprints() {
  console.log('================================')
  console.log('Blueprint Backup to S3')
  console.log('================================')
  console.log('')
  
  try {
    // Initialize database
    console.log('1. Initializing database...')
    const db = await getDB({ worldDir })
    
    // Initialize S3 assets
    console.log('2. Connecting to S3...')
    const assets = new AssetsS3()
    await assets.init({ rootDir, worldDir, db })
    
    // Initialize blueprint backup system
    console.log('3. Initializing blueprint backup system...')
    const blueprintBackup = new BlueprintS3Backup(
      assets.client,
      assets.bucketName,
      'blueprints/'
    )
    blueprintBackup.init(db)
    
    // Check current state
    console.log('4. Checking current state...')
    const blueprintCount = await db('blueprints').count('* as count')
    console.log(`   - Blueprints in database: ${blueprintCount[0].count}`)
    
    const existingBackups = await blueprintBackup.listBackups()
    console.log(`   - Existing JSON backups: ${existingBackups.json.length}`)
    console.log(`   - Existing .hyp backups: ${existingBackups.hyp.length}`)
    
    // Perform backup
    console.log('')
    console.log('5. Starting backup...')
    const results = await blueprintBackup.backupAllBlueprints()
    
    console.log('')
    console.log('Backup Results:')
    console.log(`  - Total blueprints: ${results.total}`)
    console.log(`  - Successfully backed up: ${results.success.length}`)
    console.log(`  - Failed: ${results.failed.length}`)
    
    if (results.failed.length > 0) {
      console.log('')
      console.log('Failed backups:')
      for (const failure of results.failed) {
        console.log(`  - ${failure.id}: ${failure.error}`)
      }
    }
    
    if (results.success.length > 0) {
      console.log('')
      console.log('Successfully backed up:')
      for (const id of results.success) {
        console.log(`  ✓ ${id}`)
      }
    }
    
    // Sync report
    console.log('')
    console.log('6. Performing sync analysis...')
    const syncReport = await blueprintBackup.syncWithDatabase()
    
    console.log('')
    console.log('Sync Report:')
    console.log(`  - Blueprints in database: ${syncReport.dbCount}`)
    console.log(`  - Blueprints in S3: ${syncReport.s3Count}`)
    console.log(`  - Missing backups created: ${syncReport.missingBackups}`)
    console.log(`  - Orphaned backups found: ${syncReport.orphanedBackups}`)
    
    if (syncReport.orphaned.length > 0) {
      console.log('')
      console.log('⚠️  Orphaned backups (in S3 but not in DB):')
      for (const id of syncReport.orphaned) {
        console.log(`    - ${id}`)
      }
      console.log('    These may be from deleted blueprints.')
    }
    
    console.log('')
    console.log('================================')
    console.log('✅ Backup Complete!')
    console.log('================================')
    console.log('')
    console.log('Backups are stored in S3 at:')
    console.log(`  - JSON: ${assets.bucketName}/blueprints/json/`)
    console.log(`  - .hyp: ${assets.bucketName}/blueprints/hyp/`)
    console.log(`  - Versions: ${assets.bucketName}/blueprints/versions/`)
    console.log('')
    
    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('❌ Backup failed:', error.message)
    console.error(error)
    process.exit(1)
  }
}

// Run the backup
backupBlueprints()