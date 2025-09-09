#!/usr/bin/env node

import Database from 'better-sqlite3'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const WORLD = process.env.WORLD || 'degen'

// Open database
function openDb() {
  return new Database(path.join(WORLD, 'db.sqlite'))
}

async function main() {
  const db = openDb()
  
  console.log('Finding blueprints with broken scripts...')
  
  // List of known broken script hashes
  const brokenScriptHashes = [
    'd93d573aa3b2a61122596995553410053fb548614455236240044f87470546de',
    '8bcc5e4e73ebcbd5669a93d2325cb4a87daa3b223c98952ec57257280567fc16',
    '346fc048d8b3f00632d6c62c2d286c63c46c27e05da1a03fecc770e0eb383fa6',
    'd3da3fd55c2edf43a7b130146e9c1f1e0d3549a1dc8419b3bb19d2a403ed44ce'
  ]
  
  // Get all blueprints with these broken scripts
  const placeholders = brokenScriptHashes.map(() => '?').join(',')
  const stmt = db.prepare(`
    SELECT id, data 
    FROM blueprints 
    WHERE json_extract(data, '$.script') IN (${brokenScriptHashes.map(h => `'asset://${h}.js'`).join(',')})
       OR json_extract(data, '$.script') IN (${brokenScriptHashes.map(h => `'asset://${h}'`).join(',')})
  `)
  const blueprints = stmt.all()
  
  console.log(`Found ${blueprints.length} blueprints with broken scripts`)
  
  let cleanedCount = 0
  
  for (const blueprint of blueprints) {
    const data = JSON.parse(blueprint.data)
    
    console.log(`\nProcessing blueprint ${blueprint.id} (${data.name})`)
    console.log(`  Old script: ${data.script}`)
    
    // Remove the broken script reference
    delete data.script
    
    // Update the blueprint
    const updateStmt = db.prepare('UPDATE blueprints SET data = ? WHERE id = ?')
    updateStmt.run(JSON.stringify(data), blueprint.id)
    
    console.log(`  ✅ Removed broken script reference`)
    cleanedCount++
  }
  
  // Also find and clean up any app entities using these blueprints
  console.log('\nLooking for app entities with broken blueprints...')
  
  const entityStmt = db.prepare(`
    SELECT id, data 
    FROM entities 
    WHERE json_extract(data, '$.type') = 'app'
  `)
  const entities = entityStmt.all()
  
  let entityCleanedCount = 0
  
  for (const entity of entities) {
    const data = JSON.parse(entity.data)
    
    // Check if this entity uses one of the cleaned blueprints
    if (blueprints.some(b => b.id === data.blueprint)) {
      console.log(`\nFound app entity ${entity.id} using cleaned blueprint ${data.blueprint}`)
      
      // Mark entity as needing refresh
      data.needsRefresh = true
      
      const updateStmt = db.prepare('UPDATE entities SET data = ? WHERE id = ?')
      updateStmt.run(JSON.stringify(data), entity.id)
      
      console.log(`  ✅ Marked entity for refresh`)
      entityCleanedCount++
    }
  }
  
  console.log('\n=== Summary ===')
  console.log(`Cleaned ${cleanedCount} blueprints`)
  console.log(`Updated ${entityCleanedCount} entities`)
  console.log('\nBroken script references have been removed.')
  console.log('The apps will no longer crash, but they also won\'t have any interactive behavior.')
  console.log('You may want to recreate these objects with working scripts.')
  
  db.close()
}

main().catch(console.error)