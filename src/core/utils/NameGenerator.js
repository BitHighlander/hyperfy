/**
 * Name Generator for DegenQuest
 * 
 * Generates unique sequential names for players and NPCs:
 * - Players: player-01, player-02, player-03, etc.
 * - NPCs: skeleton_01, skeleton_02, zombie_01, etc.
 */

// Name counters - these persist during server runtime
const nameCounters = {
  player: 0,
  skeleton: 0,
  zombie: 0,
  goblin: 0,
  npc: 0
}

// Track active names to prevent duplicates
const activeNames = new Set()

/**
 * Generate a unique name for players
 * @returns {string} Generated player name like "player-01"
 */
export function generatePlayerName() {
  let attempts = 0
  let name
  
  do {
    nameCounters.player++
    name = `player-${String(nameCounters.player).padStart(2, '0')}`
    attempts++
    
    // Prevent infinite loops
    if (attempts > 1000) {
      name = `player-${Date.now().toString().slice(-4)}`
      break
    }
  } while (activeNames.has(name))
  
  activeNames.add(name)
  console.log(`[NameGenerator] Generated player name: ${name}`)
  return name
}

/**
 * Generate a unique name for NPCs based on their type
 * @param {string} npcType - The type of NPC (skeleton, zombie, goblin, etc.)
 * @returns {string} Generated NPC name like "skeleton_01"
 */
export function generateNpcName(npcType = 'npc') {
  // Normalize the NPC type
  const type = npcType.toLowerCase().replace(/[^a-z0-9]/g, '')
  
  // Initialize counter if it doesn't exist
  if (!nameCounters.hasOwnProperty(type)) {
    nameCounters[type] = 0
  }
  
  let attempts = 0
  let name
  
  do {
    nameCounters[type]++
    name = `${type}_${String(nameCounters[type]).padStart(2, '0')}`
    attempts++
    
    // Prevent infinite loops
    if (attempts > 1000) {
      name = `${type}_${Date.now().toString().slice(-4)}`
      break
    }
  } while (activeNames.has(name))
  
  activeNames.add(name)
  console.log(`[NameGenerator] Generated NPC name: ${name} (type: ${npcType})`)
  return name
}

/**
 * Release a name back to the available pool when entity is removed
 * @param {string} name - The name to release
 */
export function releaseName(name) {
  if (activeNames.has(name)) {
    activeNames.delete(name)
    console.log(`[NameGenerator] Released name: ${name}`)
  }
}

/**
 * Auto-detect entity type from various sources
 * @param {object} entityData - The entity data object
 * @returns {string} Detected entity type
 */
export function detectEntityType(entityData) {
  if (!entityData) return 'npc'
  
  // Check if it's a player
  if (entityData.type === 'player' || entityData.isPlayer) return 'player'
  
  // Check blueprint or id for NPC type
  if (entityData.blueprint) {
    if (entityData.blueprint.includes('skeleton')) return 'skeleton'
    if (entityData.blueprint.includes('zombie')) return 'zombie'
    if (entityData.blueprint.includes('goblin')) return 'goblin'
  }
  
  if (entityData.id) {
    if (entityData.id.includes('skeleton')) return 'skeleton'
    if (entityData.id.includes('zombie')) return 'zombie'
    if (entityData.id.includes('goblin')) return 'goblin'
  }
  
  // Default to generic NPC
  return 'npc'
}

/**
 * Generate appropriate name for any entity
 * @param {object} entityData - The entity data to generate a name for
 * @returns {string} Generated name
 */
export function generateEntityName(entityData) {
  const entityType = detectEntityType(entityData)
  
  if (entityType === 'player') {
    return generatePlayerName()
  } else {
    return generateNpcName(entityType)
  }
}

/**
 * Get current name statistics (useful for debugging)
 * @returns {object} Statistics about names generated
 */
export function getNameStats() {
  return {
    counters: { ...nameCounters },
    activeNamesCount: activeNames.size,
    activeNames: Array.from(activeNames)
  }
}

/**
 * Reset the name system (useful for testing)
 */
export function resetNameSystem() {
  Object.keys(nameCounters).forEach(key => {
    nameCounters[key] = 0
  })
  activeNames.clear()
  console.log('[NameGenerator] Name system reset')
}