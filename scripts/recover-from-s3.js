#!/usr/bin/env node

/**
 * Database Recovery Script
 * 
 * Recovers database from S3 backups when the database is lost or corrupted.
 * This script will:
 * 1. Restore all blueprints from S3 JSON backups
 * 2. Recreate entities for scene apps
 * 3. Restore asset metadata if available
 * 
 * Usage: npm run recover:database
 */

import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { S3Client } from '@aws-sdk/client-s3'
import { BlueprintS3Backup } from '../src/server/BlueprintS3Backup.js'
import { getDB } from '../src/server/db.js'
import { AssetsS3 } from '../src/server/AssetsS3.js'
import moment from 'moment'
import { uuid } from '../src/core/utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '../')
const worldDir = path.join(rootDir, process.env.WORLD || 'world')

async function recoverDatabase() {
  console.log('=================================')
  console.log('Database Recovery from S3 Backups')
  console.log('=================================')
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
    
    // Check current database state
    console.log('4. Checking current database state...')
    const existingBlueprints = await db('blueprints').count('* as count')
    const existingEntities = await db('entities').count('* as count')
    console.log(`   - Existing blueprints: ${existingBlueprints[0].count}`)
    console.log(`   - Existing entities: ${existingEntities[0].count}`)
    
    // List available backups
    console.log('5. Listing available S3 backups...')
    const backups = await blueprintBackup.listBackups()
    console.log(`   - Blueprint JSON backups: ${backups.json.length}`)
    console.log(`   - Blueprint .hyp backups: ${backups.hyp.length}`)
    console.log(`   - Versioned backups: ${Object.keys(backups.versions).length} blueprints`)
    
    if (backups.json.length === 0) {
      console.log('')
      console.log('⚠️  No blueprint backups found in S3!')
      console.log('    Run "npm run backup:blueprints" to create backups first.')
      process.exit(0)
    }
    
    // Ask for confirmation
    console.log('')
    console.log('⚠️  WARNING: This will restore blueprints from S3 backups.')
    console.log('    Existing blueprints will be updated if they exist.')
    console.log('')
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Restore blueprints
    console.log('')
    console.log('6. Restoring blueprints from S3...')
    const restoreResults = await blueprintBackup.restoreAllToDatabase()
    console.log(`   - Restored: ${restoreResults.restored.length} blueprints`)
    console.log(`   - Failed: ${restoreResults.failed.length} blueprints`)
    
    if (restoreResults.failed.length > 0) {
      console.log('   Failed blueprints:')
      for (const failure of restoreResults.failed) {
        console.log(`     - ${failure.id}: ${failure.error}`)
      }
    }
    
    // Recreate entities for scene apps
    console.log('')
    console.log('7. Recreating entities for scene apps...')
    const sceneBlueprint = await db('blueprints').where('id', '$scene').first()
    if (sceneBlueprint) {
      // Check if scene entity exists
      const sceneEntity = await db('entities')
        .where('blueprint', '$scene')
        .first()
      
      if (!sceneEntity) {
        const now = moment().toISOString()
        const entityId = uuid()
        const entity = {
          id: entityId,
          data: JSON.stringify({
            id: entityId,
            type: 'app',
            blueprint: '$scene',
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1],
            scale: [1, 1, 1],
            mover: null,
            uploader: null,
            pinned: false,
            state: {},
          }),
          createdAt: now,
          updatedAt: now,
        }
        await db('entities').insert(entity)
        console.log('   - Created scene entity')
      } else {
        console.log('   - Scene entity already exists')
      }
    }
    
    // Sync and identify orphaned assets
    console.log('')
    console.log('8. Analyzing asset usage...')
    const blueprintRows = await db('blueprints')
    const usedAssets = new Set()
    
    for (const row of blueprintRows) {
      const blueprint = JSON.parse(row.data)
      
      // Collect model assets
      if (blueprint.model?.startsWith('asset://')) {
        usedAssets.add(blueprint.model.replace('asset://', ''))
      }
      
      // Collect script assets
      if (blueprint.script?.startsWith('asset://')) {
        usedAssets.add(blueprint.script.replace('asset://', ''))
      }
      
      // Collect image assets
      if (blueprint.image?.url?.startsWith('asset://')) {
        usedAssets.add(blueprint.image.url.replace('asset://', ''))
      }
      
      // Collect prop assets
      if (blueprint.props) {
        for (const prop of Object.values(blueprint.props)) {
          if (prop?.url?.startsWith('asset://')) {
            usedAssets.add(prop.url.replace('asset://', ''))
          }
        }
      }
    }
    
    console.log(`   - Found ${usedAssets.size} assets referenced by blueprints`)
    
    // List all S3 assets
    const s3Assets = await assets.list()
    console.log(`   - Found ${s3Assets.size} total assets in S3`)
    
    // Find orphaned assets (in S3 but not referenced)
    const orphanedAssets = []
    for (const asset of s3Assets) {
      if (!usedAssets.has(asset)) {
        orphanedAssets.push(asset)
      }
    }
    
    console.log(`   - Found ${orphanedAssets.length} orphaned assets`)
    
    // Summary
    console.log('')
    console.log('=================================')
    console.log('Recovery Complete!')
    console.log('=================================')
    console.log('')
    console.log('Summary:')
    console.log(`  - Blueprints restored: ${restoreResults.restored.length}`)
    console.log(`  - Blueprints failed: ${restoreResults.failed.length}`)
    console.log(`  - Assets in use: ${usedAssets.size}`)
    console.log(`  - Orphaned assets: ${orphanedAssets.length}`)
    console.log('')
    console.log('Next steps:')
    console.log('  1. Start the server: npm run dev')
    console.log('  2. Verify all apps are working correctly')
    console.log('  3. Run "npm run cleanup:assets" to remove orphaned assets')
    console.log('')
    
    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('❌ Recovery failed:', error.message)
    console.error(error)
    process.exit(1)
  }
}

// Run the recovery
recoverDatabase()