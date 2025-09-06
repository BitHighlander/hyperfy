/**
 * Combat Entity Management System
 * 
 * Handles entity lifecycle, combat states, and resource management
 */

export class CombatEntities {
  constructor(plugin) {
    this.plugin = plugin
    this.entities = new Map()
    this.combatGroups = new Map() // Track entities in combat with each other
  }

  async init() {
    // Initialize entity management system
    if (this.plugin.config.debug) {
      console.log('[CombatEntities] Entity management initialized')
    }
  }

  spawn(entity) {
    const normalizedEntity = this.normalizeEntity(entity)
    
    if (!normalizedEntity.id) {
      console.warn('[CombatEntities] Cannot spawn entity without ID')
      return
    }

    this.entities.set(normalizedEntity.id, normalizedEntity)

    // Broadcast resource state for new entity
    if (this.plugin.serverMode) {
      this.plugin.broadcastResourceUpdate(normalizedEntity)
    }

    if (this.plugin.config.debug) {
      console.log('[CombatEntities] Entity spawned:', normalizedEntity.id, normalizedEntity.type)
    }

    return normalizedEntity
  }

  despawn(entityId) {
    if (typeof entityId !== 'string') {
      entityId = this.extractId(entityId)
    }

    if (!entityId) return

    // Remove from combat groups
    this.removeCombatParticipant(entityId)

    // Remove entity
    const removed = this.entities.delete(entityId)

    if (this.plugin.config.debug && removed) {
      console.log('[CombatEntities] Entity despawned:', entityId)
    }

    return removed
  }

  get(entityId) {
    return this.entities.get(entityId)
  }

  getAll() {
    return Array.from(this.entities.values())
  }

  updatePosition(entityId, position, rotation) {
    const entity = this.entities.get(entityId)
    if (!entity) return

    entity.position = this.toVec3(position)
    if (rotation) {
      entity.rotation = this.toVec3(rotation)
    }
  }

  // Combat state management
  
  enterCombat(entityId, targetId) {
    const entity = this.entities.get(entityId)
    if (!entity) return

    const previousState = entity.combatState
    entity.combatState = 'combat'
    entity.lastCombatTime = Date.now()

    // Track combat participants
    if (targetId) {
      this.addCombatParticipants(entityId, targetId)
    }

    // Broadcast state change
    if (previousState !== 'combat') {
      this.plugin.broadcastStateChange(entityId, previousState, 'combat')
      
      if (this.plugin.config.debug) {
        console.log(`[CombatEntities] ${entityId} entered combat`)
      }
    }
  }

  exitCombat(entityId) {
    const entity = this.entities.get(entityId)
    if (!entity) return

    const previousState = entity.combatState
    entity.combatState = 'idle'

    // Remove from combat tracking
    this.removeCombatParticipant(entityId)

    // Broadcast state change
    if (previousState !== 'idle') {
      this.plugin.broadcastStateChange(entityId, previousState, 'idle')
      
      if (this.plugin.config.debug) {
        console.log(`[CombatEntities] ${entityId} exited combat`)
      }
    }
  }

  setDead(entityId) {
    const entity = this.entities.get(entityId)
    if (!entity) return

    const previousState = entity.combatState
    entity.combatState = 'death'
    entity.isDead = true
    entity.health = 0

    // Remove from combat
    this.removeCombatParticipant(entityId)

    // Broadcast state change
    this.plugin.broadcastStateChange(entityId, previousState, 'death')

    // Trigger death event
    this.plugin.world.emit('entity:death', entity)

    if (this.plugin.config.debug) {
      console.log(`[CombatEntities] ${entityId} died`)
    }
  }

  // Resource management

  takeDamage(entityId, amount, source = null) {
    const entity = this.entities.get(entityId)
    if (!entity || entity.isDead) return 0

    const actualDamage = Math.min(amount, entity.health)
    entity.health = Math.max(0, entity.health - actualDamage)
    entity.totalDamageReceived = (entity.totalDamageReceived || 0) + actualDamage

    // Update damage dealer stats
    if (source) {
      const sourceEntity = this.entities.get(source)
      if (sourceEntity) {
        sourceEntity.totalDamageDealt = (sourceEntity.totalDamageDealt || 0) + actualDamage
      }
    }

    // Enter combat state
    this.enterCombat(entityId, source)
    if (source) {
      this.enterCombat(source, entityId)
    }

    // Check for death
    if (entity.health <= 0) {
      this.setDead(entityId)
    }

    // Broadcast updates
    this.plugin.broadcastResourceUpdate(entity)
    if (source) {
      const sourceEntity = this.entities.get(source)
      if (sourceEntity) {
        this.plugin.broadcastResourceUpdate(sourceEntity)
      }
    }

    // Broadcast damage event
    this.plugin.broadcastDamage({
      targetId: entityId,
      sourceId: source,
      damage: actualDamage,
      targetHealth: entity.health
    })

    return actualDamage
  }

  consumeStamina(entityId, amount) {
    const entity = this.entities.get(entityId)
    if (!entity) return false

    if (entity.stamina < amount) return false

    entity.stamina = Math.max(0, entity.stamina - amount)
    this.plugin.broadcastResourceUpdate(entity)
    return true
  }

  consumeMana(entityId, amount) {
    const entity = this.entities.get(entityId)
    if (!entity) return false

    if (entity.mana < amount) return false

    entity.mana = Math.max(0, entity.mana - amount)
    this.plugin.broadcastResourceUpdate(entity)
    return true
  }

  // Tick system

  tick() {
    const now = Date.now()
    
    for (const entity of this.entities.values()) {
      // Handle combat timeout
      if (entity.combatState === 'combat' && 
          entity.lastCombatTime && 
          now - entity.lastCombatTime > this.plugin.config.combatTimeout) {
        this.exitCombat(entity.id)
      }
    }
  }

  regenerate() {
    for (const entity of this.entities.values()) {
      if (entity.isDead) continue

      let updated = false

      // Health regeneration
      if (entity.health < entity.maxHealth) {
        const regenAmount = this.calculateHealthRegen(entity)
        if (regenAmount > 0) {
          entity.health = Math.min(entity.maxHealth, entity.health + regenAmount)
          updated = true
        }
      }

      // Stamina regeneration
      if (entity.stamina < entity.maxStamina) {
        const regenAmount = this.calculateStaminaRegen(entity)
        if (regenAmount > 0) {
          entity.stamina = Math.min(entity.maxStamina, entity.stamina + regenAmount)
          updated = true
        }
      }

      // Mana regeneration
      if (entity.mana < entity.maxMana) {
        const regenAmount = this.calculateManaRegen(entity)
        if (regenAmount > 0) {
          entity.mana = Math.min(entity.maxMana, entity.mana + regenAmount)
          updated = true
        }
      }

      // Broadcast updates
      if (updated) {
        this.plugin.broadcastResourceUpdate(entity)
      }
    }
  }

  // Regeneration calculations

  calculateHealthRegen(entity) {
    const baseRegen = entity.maxHealth * 0.02 // 2% per second
    const combatPenalty = entity.combatState === 'combat' ? 0.5 : 1.0
    return baseRegen * combatPenalty
  }

  calculateStaminaRegen(entity) {
    const baseRegen = entity.maxStamina * 0.1 // 10% per second
    const combatPenalty = entity.combatState === 'combat' ? 0.7 : 1.0
    return baseRegen * combatPenalty
  }

  calculateManaRegen(entity) {
    const baseRegen = entity.maxMana * 0.05 // 5% per second
    return baseRegen
  }

  // Combat group management

  addCombatParticipants(entityId1, entityId2) {
    if (!this.combatGroups.has(entityId1)) {
      this.combatGroups.set(entityId1, new Set())
    }
    if (!this.combatGroups.has(entityId2)) {
      this.combatGroups.set(entityId2, new Set())
    }

    this.combatGroups.get(entityId1).add(entityId2)
    this.combatGroups.get(entityId2).add(entityId1)
  }

  removeCombatParticipant(entityId) {
    const group = this.combatGroups.get(entityId)
    if (group) {
      // Remove this entity from all its combat partners
      for (const partnerId of group) {
        const partnerGroup = this.combatGroups.get(partnerId)
        if (partnerGroup) {
          partnerGroup.delete(entityId)
        }
      }
    }
    this.combatGroups.delete(entityId)
  }

  // Utility methods

  normalizeEntity(entity) {
    const id = this.extractId(entity)
    const type = entity?.isPlayer || entity?.type === 'player' ? 'player' : 'npc'
    const blueprint = entity?.blueprint || entity?.data?.blueprint || entity?.name || 'unknown'
    
    return {
      id,
      type,
      blueprint,
      position: this.toVec3(entity?.position) || { x: 0, y: 0, z: 0 },
      health: entity?.health ?? entity?.data?.health ?? 100,
      maxHealth: entity?.maxHealth ?? entity?.data?.maxHealth ?? 100,
      stamina: entity?.stamina ?? entity?.data?.stamina ?? 100,
      maxStamina: entity?.maxStamina ?? entity?.data?.maxStamina ?? 100,
      mana: entity?.mana ?? entity?.data?.mana ?? 50,
      maxMana: entity?.maxMana ?? entity?.data?.maxMana ?? 50,
      combatState: 'idle',
      isDead: false,
      totalDamageDealt: 0,
      totalDamageReceived: 0,
      lastCombatTime: null,
      lastAttackTime: null,
      equippedWeapon: 'unarmed'
    }
  }

  extractId(entity) {
    if (!entity) return null
    if (typeof entity === 'string') return entity
    return entity.id || entity.data?.id || entity.playerId || entity.data?.playerId || null
  }

  toVec3(value) {
    if (!value) return undefined
    if (Array.isArray(value)) {
      return { x: value[0] || 0, y: value[1] || 0, z: value[2] || 0 }
    }
    if (typeof value.x === 'number') return { x: value.x, y: value.y || 0, z: value.z || 0 }
    return undefined
  }

  destroy() {
    this.entities.clear()
    this.combatGroups.clear()
  }
}