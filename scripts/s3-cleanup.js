#!/usr/bin/env node

import { WorldS3Backup } from '../src/server/WorldS3Backup.js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'list'
  
  // Force enable S3 backup for this script
  process.env.WORLD_BACKUP_S3 = 'true'
  
  // Create a new instance of WorldS3Backup
  const backup = new WorldS3Backup()
  
  // Initialize the backup system
  await backup.init(path.join(__dirname, '..', process.env.WORLD || 'world'))
  
  console.log('\n=== S3 World Backup Cleanup Tool ===\n')
  
  switch(command) {
    case 'list':
      console.log('Listing all backups...\n')
      const listResult = await backup.listBackups()
      
      if (listResult.totalCount === 0) {
        console.log('No backups found in S3')
      } else {
        console.log(`Found ${listResult.totalCount} backups`)
        console.log(`Total size: ${listResult.totalSizeFormatted}\n`)
        
        console.log('Recent backups:')
        listResult.backups.slice(0, 20).forEach(backup => {
          const date = backup.lastModified.toISOString().split('T')[0]
          const time = backup.lastModified.toISOString().split('T')[1].split('.')[0]
          const type = backup.isLatest ? ' [LATEST]' : ''
          console.log(`  ${date} ${time} - ${backup.sizeFormatted}${type}`)
        })
        
        if (listResult.totalCount > 20) {
          console.log(`  ... and ${listResult.totalCount - 20} more`)
        }
      }
      break
      
    case 'cleanup':
      const keepCount = parseInt(args[1]) || parseInt(process.env.WORLD_BACKUP_RETENTION) || 10
      console.log(`Cleaning up old backups (keeping ${keepCount} most recent)...\n`)
      
      const cleanupResult = await backup.manualCleanup(keepCount)
      
      if (cleanupResult.deleted === 0) {
        console.log('No backups needed to be deleted')
      } else {
        console.log('\nCleanup Summary:')
        console.log(`  Deleted: ${cleanupResult.deleted} backups`)
        console.log(`  Failed: ${cleanupResult.failed}`)
        console.log(`  Remaining: ${cleanupResult.remaining} backups`)
        console.log(`  Freed space: ${cleanupResult.freedSpaceFormatted}`)
      }
      break
      
    case 'purge':
      if (args[1] !== '--confirm') {
        console.log('WARNING: This will delete ALL backups except the latest!')
        console.log('Use: npm run s3:cleanup purge --confirm')
        process.exit(1)
      }
      
      console.log('PURGING all old backups (keeping only 1 latest)...\n')
      const purgeResult = await backup.manualCleanup(1)
      
      console.log('\nPurge Complete:')
      console.log(`  Deleted: ${purgeResult.deleted} backups`)
      console.log(`  Failed: ${purgeResult.failed}`)
      console.log(`  Remaining: ${purgeResult.remaining} backup`)
      console.log(`  Freed space: ${purgeResult.freedSpaceFormatted}`)
      break
      
    default:
      console.log('Usage:')
      console.log('  npm run s3:cleanup list              - List all backups')
      console.log('  npm run s3:cleanup cleanup [count]   - Keep only [count] most recent backups')
      console.log('  npm run s3:cleanup purge --confirm   - Delete all but the latest backup')
      console.log('\nEnvironment variables:')
      console.log('  WORLD_BACKUP_RETENTION - Default number of backups to keep (currently: ' + 
                  (process.env.WORLD_BACKUP_RETENTION || '10') + ')')
  }
  
  process.exit(0)
}

main().catch(error => {
  console.error('Error:', error.message)
  process.exit(1)
})