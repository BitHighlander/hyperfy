#!/usr/bin/env node

/**
 * Orphaned Asset Cleanup Script
 * 
 * Identifies and optionally removes S3 assets that are no longer referenced
 * by any blueprints in the database.
 * 
 * Usage: 
 *   npm run cleanup:assets        # Dry run - shows what would be deleted
 *   npm run cleanup:assets -- --delete  # Actually delete orphaned assets
 */

import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { AssetsS3 } from '../src/server/AssetsS3.js'
import { getDB } from '../src/server/db.js'
import { DeleteObjectsCommand } from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '../')
const worldDir = path.join(rootDir, process.env.WORLD || 'world')

const args = process.argv.slice(2)
const shouldDelete = args.includes('--delete') || args.includes('-d')

async function cleanupOrphanedAssets() {
  console.log('=====================================')
  console.log('Orphaned Asset Cleanup')
  console.log('=====================================')
  console.log('')
  console.log(`Mode: ${shouldDelete ? '🗑️  DELETE' : '👁️  DRY RUN (use --delete to remove)'}`)
  console.log('')
  
  try {
    // Initialize database
    console.log('1. Initializing database...')
    const db = await getDB({ worldDir })
    
    // Initialize S3 assets
    console.log('2. Connecting to S3...')
    const assets = new AssetsS3()
    await assets.init({ rootDir, worldDir, db })
    
    // Collect all assets referenced by blueprints
    console.log('3. Analyzing blueprint asset references...')
    const blueprintRows = await db('blueprints')
    const referencedAssets = new Set()
    const assetUsage = new Map() // Track which blueprints use each asset
    
    for (const row of blueprintRows) {
      const blueprint = JSON.parse(row.data)
      
      // Helper to track asset usage
      const trackAsset = (assetUrl) => {
        if (assetUrl?.startsWith('asset://')) {
          const filename = assetUrl.replace('asset://', '')
          referencedAssets.add(filename)
          
          if (!assetUsage.has(filename)) {
            assetUsage.set(filename, [])
          }
          assetUsage.get(filename).push({
            blueprintId: blueprint.id,
            blueprintName: blueprint.name || 'unnamed'
          })
        }
      }
      
      // Collect model assets
      trackAsset(blueprint.model)
      
      // Collect script assets
      trackAsset(blueprint.script)
      
      // Collect image assets
      trackAsset(blueprint.image?.url)
      
      // Collect prop assets
      if (blueprint.props) {
        for (const prop of Object.values(blueprint.props)) {
          trackAsset(prop?.url)
        }
      }
    }
    
    console.log(`   - Found ${blueprintRows.length} blueprints`)
    console.log(`   - Found ${referencedAssets.size} referenced assets`)
    
    // Get all assets from S3
    console.log('')
    console.log('4. Listing all S3 assets...')
    const s3Assets = await assets.list()
    console.log(`   - Found ${s3Assets.size} total assets in S3`)
    
    // Identify orphaned assets
    console.log('')
    console.log('5. Identifying orphaned assets...')
    const orphanedAssets = []
    const assetSizes = new Map()
    
    for (const asset of s3Assets) {
      if (!referencedAssets.has(asset)) {
        orphanedAssets.push(asset)
        // Note: We could fetch size info from S3 if needed
        assetSizes.set(asset, 0)
      }
    }
    
    console.log(`   - Found ${orphanedAssets.length} orphaned assets`)
    
    // Show asset usage report
    if (referencedAssets.size > 0) {
      console.log('')
      console.log('6. Asset Usage Report:')
      console.log(`   Top 10 most used assets:`)
      
      const sortedUsage = Array.from(assetUsage.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 10)
      
      for (const [asset, usage] of sortedUsage) {
        const extension = asset.split('.').pop()
        console.log(`   - ${asset.substring(0, 20)}...${extension} (used by ${usage.length} blueprints)`)
      }
    }
    
    // Process orphaned assets
    if (orphanedAssets.length === 0) {
      console.log('')
      console.log('✅ No orphaned assets found! Your S3 bucket is clean.')
      process.exit(0)
    }
    
    console.log('')
    console.log('7. Orphaned Assets List:')
    console.log('   (First 20 shown)')
    for (const asset of orphanedAssets.slice(0, 20)) {
      const extension = asset.split('.').pop()
      console.log(`   - ${asset.substring(0, 40)}...${extension}`)
    }
    
    if (orphanedAssets.length > 20) {
      console.log(`   ... and ${orphanedAssets.length - 20} more`)
    }
    
    // Calculate potential savings
    const totalSize = Array.from(assetSizes.values()).reduce((sum, size) => sum + size, 0)
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(2)
    
    console.log('')
    console.log('Summary:')
    console.log(`  - Orphaned assets: ${orphanedAssets.length}`)
    console.log(`  - Referenced assets: ${referencedAssets.size}`)
    console.log(`  - Total S3 assets: ${s3Assets.size}`)
    
    // Delete if requested
    if (shouldDelete) {
      console.log('')
      console.log('8. Deleting orphaned assets...')
      console.log('   ⚠️  This action cannot be undone!')
      console.log('   Press Ctrl+C within 5 seconds to cancel...')
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Delete in batches (S3 allows max 1000 per request)
      const batchSize = 1000
      let deleted = 0
      
      for (let i = 0; i < orphanedAssets.length; i += batchSize) {
        const batch = orphanedAssets.slice(i, i + batchSize)
        const objects = batch.map(asset => ({
          Key: assets.getKey(asset)
        }))
        
        try {
          await assets.client.send(new DeleteObjectsCommand({
            Bucket: assets.bucketName,
            Delete: {
              Objects: objects,
              Quiet: true
            }
          }))
          
          deleted += batch.length
          console.log(`   - Deleted ${deleted}/${orphanedAssets.length} assets...`)
        } catch (error) {
          console.error(`   ❌ Failed to delete batch: ${error.message}`)
        }
      }
      
      console.log('')
      console.log('=====================================')
      console.log(`✅ Cleanup Complete! Deleted ${deleted} orphaned assets.`)
      console.log('=====================================')
    } else {
      console.log('')
      console.log('=====================================')
      console.log('✅ Dry run complete!')
      console.log('=====================================')
      console.log('')
      console.log('To actually delete these orphaned assets, run:')
      console.log('  npm run cleanup:assets -- --delete')
    }
    
    console.log('')
    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('❌ Cleanup failed:', error.message)
    console.error(error)
    process.exit(1)
  }
}

// Run the cleanup
cleanupOrphanedAssets()