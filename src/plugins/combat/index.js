/**
 * Combat Plugin for Hyperfy
 * 
 * Provides combat mechanics including:
 * - Health/Stamina/Mana tracking
 * - Damage calculation
 * - Combat states (idle/combat/death)
 * - Attack and spell casting
 * - Visual effects integration
 */

import { CombatEntities } from './entities.js'
import { DamageCalculator } from './damage.js'
import { CombatEffects } from './effects.js'

export class CombatPlugin {
  constructor(world, config = {}) {
    this.world = world
    this.config = {
      debug: config.debug ?? false,
      tickRate: config.tickRate ?? 50, // 20Hz combat ticks
      regenTickRate: config.regenTickRate ?? 1000, // 1 second regen
      combatTimeout: config.combatTimeout ?? 10000, // 10s out-of-combat timeout
      ...config
    }

    // Core systems
    this.entities = new CombatEntities(this)
    this.damage = new DamageCalculator(this)
    this.effects = new CombatEffects(this)

    // State
    this.initialized = false
    this.combatTickTimer = null
    this.regenTickTimer = null
    this.serverMode = false
  }

  async init() {
    try {
      if (this.config.debug) {
        console.log('[CombatPlugin] Initializing combat system...')
      }

      // Check if we're on server (has network.send)
      this.serverMode = typeof this.world.network?.send === 'function'

      // Initialize subsystems
      await this.entities.init()
      await this.effects.init()

      // Setup event listeners
      this.setupEventListeners()

      // Start tick systems
      this.startCombatTicks()
      this.startRegenTicks()

      this.initialized = true

      // Broadcast initialization
      if (this.serverMode) {
        this.broadcastStatus({
          connected: true,
          version: '2.0.0',
          tickMs: this.config.tickRate,
          regenTickMs: this.config.regenTickRate
        })
      }

      if (this.config.debug) {
        console.log('[CombatPlugin] Combat system initialized')
        console.log('[CombatPlugin] Server mode:', this.serverMode)
      }

    } catch (error) {
      console.error('[CombatPlugin] Failed to initialize:', error)
      throw error
    }
  }

  setupEventListeners() {
    // Entity lifecycle
    this.world.on('entity:spawn', this.handleEntitySpawn.bind(this))
    this.world.on('entity:despawn', this.handleEntityDespawn.bind(this))
    this.world.on('entity:move', this.handleEntityMove.bind(this))

    // Combat actions
    this.world.on('player:attack', this.handlePlayerAttack.bind(this))
    this.world.on('player:cast', this.handlePlayerCast.bind(this))
    this.world.on('player:equip', this.handlePlayerEquip.bind(this))

    // Resource requests
    this.world.on('combat:requestResources', this.handleResourceRequest.bind(this))

    if (this.config.debug) {
      console.log('[CombatPlugin] Event listeners setup complete')
    }
  }

  startCombatTicks() {
    if (this.combatTickTimer) {
      clearInterval(this.combatTickTimer)
    }

    this.combatTickTimer = setInterval(() => {
      if (!this.initialized) return
      
      try {
        this.entities.tick()
      } catch (error) {
        console.error('[CombatPlugin] Combat tick error:', error)
      }
    }, this.config.tickRate)
  }

  startRegenTicks() {
    if (this.regenTickTimer) {
      clearInterval(this.regenTickTimer)
    }

    this.regenTickTimer = setInterval(() => {
      if (!this.initialized) return
      
      try {
        this.entities.regenerate()
      } catch (error) {
        console.error('[CombatPlugin] Regen tick error:', error)
      }
    }, this.config.regenTickRate)
  }

  // Event Handlers

  handleEntitySpawn(entity) {
    if (!this.initialized) return

    try {
      this.entities.spawn(entity)
      
      if (this.config.debug) {
        console.log('[CombatPlugin] Entity spawned:', entity.id)
      }
    } catch (error) {
      console.error('[CombatPlugin] Entity spawn error:', error)
    }
  }

  handleEntityDespawn(entity) {
    if (!this.initialized) return

    try {
      this.entities.despawn(entity.id || entity)
      
      if (this.config.debug) {
        console.log('[CombatPlugin] Entity despawned:', entity.id || entity)
      }
    } catch (error) {
      console.error('[CombatPlugin] Entity despawn error:', error)
    }
  }

  handleEntityMove(entity) {
    if (!this.initialized || !entity.position) return

    try {
      this.entities.updatePosition(entity.id, entity.position, entity.rotation)
    } catch (error) {
      console.error('[CombatPlugin] Entity move error:', error)
    }
  }

  handlePlayerAttack(attacker, target) {
    if (!this.initialized) return

    try {
      const attackerId = this.entities.extractId(attacker)
      const targetId = target ? this.entities.extractId(target) : null
      const weapon = attacker?.equippedWeapon || 'unarmed'

      if (!attackerId) {
        console.warn('[CombatPlugin] Invalid attacker in attack event')
        return
      }

      // Calculate and apply damage
      const result = this.damage.calculateMeleeAttack(attackerId, targetId, weapon)
      
      if (result.success) {
        // Play attack animation
        this.effects.playAttackAnimation(attacker, weapon)
        
        if (this.config.debug) {
          console.log('[CombatPlugin] Attack:', result)
        }
      }

    } catch (error) {
      console.error('[CombatPlugin] Player attack error:', error)
    }
  }

  handlePlayerCast(player, spell, targetPos) {
    if (!this.initialized) return

    try {
      const playerId = this.entities.extractId(player)
      const spellType = spell || 'fireball'

      if (!playerId) {
        console.warn('[CombatPlugin] Invalid player in cast event')
        return
      }

      // Calculate and apply spell
      const result = this.damage.calculateSpellCast(playerId, spellType, targetPos)
      
      if (result.success) {
        // Play casting animation and effects
        this.effects.playCastAnimation(player, spellType)
        this.effects.createProjectile(spellType, player.position, targetPos)
        
        if (this.config.debug) {
          console.log('[CombatPlugin] Spell cast:', result)
        }
      }

    } catch (error) {
      console.error('[CombatPlugin] Player cast error:', error)
    }
  }

  handlePlayerEquip(player, weapon) {
    if (!this.initialized) return

    try {
      const playerId = this.entities.extractId(player)
      if (!playerId) return

      // Update player's equipped weapon
      const entity = this.entities.get(playerId)
      if (entity) {
        entity.equippedWeapon = weapon
        
        if (this.config.debug) {
          console.log(`[CombatPlugin] Player ${playerId} equipped ${weapon}`)
        }
      }

    } catch (error) {
      console.error('[CombatPlugin] Player equip error:', error)
    }
  }

  handleResourceRequest({ playerId }) {
    if (!this.initialized || !playerId) return

    try {
      const entity = this.entities.get(playerId)
      if (entity && this.serverMode) {
        this.broadcastResourceUpdate(entity)
      }
    } catch (error) {
      console.error('[CombatPlugin] Resource request error:', error)
    }
  }

  // Network Broadcasting

  broadcastResourceUpdate(entity) {
    if (!this.serverMode || !this.world.network?.send) return

    this.world.network.send('combat:resources', {
      entityId: entity.id,
      health: entity.health,
      maxHealth: entity.maxHealth,
      stamina: entity.stamina,
      maxStamina: entity.maxStamina,
      mana: entity.mana,
      maxMana: entity.maxMana
    })
  }

  broadcastDamage(damage) {
    if (!this.serverMode || !this.world.network?.send) return

    this.world.network.send('combat:damage', damage)
  }

  broadcastStateChange(entityId, previousState, newState) {
    if (!this.serverMode || !this.world.network?.send) return

    this.world.network.send('combat:stateChange', {
      entityId,
      previousState,
      newState
    })
  }

  broadcastStatus(status) {
    if (!this.serverMode || !this.world.network?.send) return

    this.world.network.send('combat:connected', status)
  }

  // Public API

  getEntity(entityId) {
    return this.entities.get(entityId)
  }

  getAllEntities() {
    return this.entities.getAll()
  }

  triggerAttack(attackerId, targetId, weapon = 'unarmed') {
    if (!this.initialized) return false
    return this.damage.calculateMeleeAttack(attackerId, targetId, weapon)
  }

  triggerSpell(playerId, spell, targetPos) {
    if (!this.initialized) return false
    return this.damage.calculateSpellCast(playerId, spell, targetPos)
  }

  // Cleanup

  async destroy() {
    this.initialized = false

    if (this.combatTickTimer) {
      clearInterval(this.combatTickTimer)
      this.combatTickTimer = null
    }

    if (this.regenTickTimer) {
      clearInterval(this.regenTickTimer)
      this.regenTickTimer = null
    }

    this.entities.destroy()
    this.effects.destroy()

    if (this.config.debug) {
      console.log('[CombatPlugin] Combat system destroyed')
    }
  }
}

export default CombatPlugin