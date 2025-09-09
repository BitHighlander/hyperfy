#!/usr/bin/env node

import Database from 'better-sqlite3'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config()

const ASSETS_BASE_URL = process.env.ASSETS_BASE_URL || 'https://degencity.nyc3.digitaloceanspaces.com/assets'
const WORLD = process.env.WORLD || 'degen'
const LOCAL_ASSETS_DIR = path.join(WORLD, 'assets')

// Open database
function openDb() {
  return new Database(path.join(WORLD, 'db.sqlite'))
}

// Function to fix optional chaining in JavaScript code
function fixOptionalChaining(code) {
  // Replace ?. with conditional checks
  // This is a simple replacement - more complex cases might need babel
  let fixed = code
  
  // Replace obj?.prop with (obj && obj.prop)
  fixed = fixed.replace(/(\w+)\?\./g, '($1 && $1.')
  
  // Replace obj?.method() with (obj && obj.method && obj.method())
  fixed = fixed.replace(/(\w+)\?\.(\w+)\(\)/g, '($1 && $1.$2 && $1.$2())')
  
  // Replace arr?.[index] with (arr && arr[index])
  fixed = fixed.replace(/(\w+)\?\.\[/g, '($1 && $1[')
  
  // Log if changes were made
  if (fixed !== code) {
    console.log('Fixed optional chaining in script')
  }
  
  return fixed
}

// Function to compute hash for content
function computeHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

// Function to save asset locally
async function saveAssetLocally(content) {
  const hash = computeHash(content)
  const filename = `${hash}.js`
  const filepath = path.join(LOCAL_ASSETS_DIR, filename)
  
  // Ensure assets directory exists
  await fs.mkdir(LOCAL_ASSETS_DIR, { recursive: true })
  
  // Write file
  await fs.writeFile(filepath, content, 'utf8')
  
  return { hash, filename, filepath }
}

async function main() {
  const db = openDb()
  
  console.log('Finding all blueprints with scripts...')
  
  // Get all blueprints with scripts
  const stmt = db.prepare(`
    SELECT id, data 
    FROM blueprints 
    WHERE json_extract(data, '$.script') IS NOT NULL
      AND json_extract(data, '$.script') != ''
  `)
  const blueprints = stmt.all()
  
  console.log(`Found ${blueprints.length} blueprints with scripts`)
  
  let fixedCount = 0
  let errorCount = 0
  
  for (const blueprint of blueprints) {
    const data = JSON.parse(blueprint.data)
    const scriptUrl = data.script
    
    if (!scriptUrl || !scriptUrl.startsWith('asset://')) {
      continue
    }
    
    // Extract hash from asset URL
    const assetHash = scriptUrl.replace('asset://', '').replace('.js', '')
    const fullUrl = `${ASSETS_BASE_URL}/${assetHash}.js`
    
    console.log(`\nProcessing blueprint ${blueprint.id} (${data.name})`)
    console.log(`  Script URL: ${fullUrl}`)
    
    try {
      // Try to download the script
      const response = await fetch(fullUrl)
      
      if (!response.ok) {
        console.log(`  ❌ Failed to download script: ${response.status} ${response.statusText}`)
        errorCount++
        continue
      }
      
      const scriptContent = await response.text()
      
      // Check if it contains optional chaining
      if (scriptContent.includes('?.')) {
        console.log('  Found optional chaining, fixing...')
        
        // Fix the script
        const fixedScript = fixOptionalChaining(scriptContent)
        
        // Save the fixed script locally
        const { hash, filename } = await saveAssetLocally(fixedScript)
        
        // Update the blueprint with new script hash
        const newScriptUrl = `asset://${hash}`
        data.script = newScriptUrl
        
        const updateStmt = db.prepare('UPDATE blueprints SET data = ? WHERE id = ?')
        updateStmt.run(JSON.stringify(data), blueprint.id)
        
        console.log(`  ✅ Fixed and saved as ${filename}`)
        console.log(`  ✅ Updated blueprint with new script URL`)
        fixedCount++
      } else {
        console.log('  No optional chaining found')
      }
    } catch (error) {
      console.error(`  ❌ Error processing script: ${error.message}`)
      errorCount++
    }
  }
  
  console.log('\n=== Summary ===')
  console.log(`Fixed ${fixedCount} scripts`)
  console.log(`Errors: ${errorCount}`)
  
  if (fixedCount > 0) {
    console.log('\nNote: Fixed scripts have been saved locally in the assets folder.')
    console.log('If using S3, you\'ll need to upload these fixed assets to S3.')
  }
  
  db.close()
}

main().catch(console.error)