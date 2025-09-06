/**
 * Combat Damage Calculation System
 * 
 * Handles damage calculation for melee attacks and spells
 */

export class DamageCalculator {
  constructor(plugin) {
    this.plugin = plugin
    this.weaponStats = new Map()
    this.spellStats = new Map()
    
    this.initializeWeaponStats()
    this.initializeSpellStats()
  }

  initializeWeaponStats() {
    // Base weapon configurations
    this.weaponStats.set('unarmed', {
      damage: [5, 10],
      staminaCost: 10,
      cooldown: 1000,
      range: 2.5
    })

    this.weaponStats.set('sword', {
      damage: [15, 25],
      staminaCost: 15,
      cooldown: 1200,
      range: 3.0
    })

    this.weaponStats.set('axe', {
      damage: [20, 30],
      staminaCost: 20,
      cooldown: 1500,
      range: 2.8
    })

    this.weaponStats.set('bow', {
      damage: [12, 20],
      staminaCost: 8,
      cooldown: 800,
      range: 15.0
    })

    this.weaponStats.set('dagger', {
      damage: [8, 15],
      staminaCost: 8,
      cooldown: 600,
      range: 2.0
    })

    this.weaponStats.set('staff', {
      damage: [10, 18],
      staminaCost: 5,
      manaCost: 10,
      cooldown: 1000,
      range: 4.0
    })
  }

  initializeSpellStats() {
    // Base spell configurations
    this.spellStats.set('fireball', {
      damage: [25, 40],
      manaCost: 30,
      cooldown: 2000,
      range: 20.0,
      areaOfEffect: 3.0,
      castTime: 1500
    })

    this.spellStats.set('heal', {
      healing: [20, 35],
      manaCost: 25,
      cooldown: 3000,
      range: 10.0,
      castTime: 2000
    })

    this.spellStats.set('lightning', {
      damage: [30, 50],
      manaCost: 35,
      cooldown: 2500,
      range: 25.0,
      castTime: 1000
    })

    this.spellStats.set('shield', {
      absorption: [50, 100],
      manaCost: 20,
      cooldown: 15000,
      duration: 30000,
      castTime: 1000
    })
  }

  calculateMeleeAttack(attackerId, targetId, weapon = 'unarmed') {
    try {
      const attacker = this.plugin.entities.get(attackerId)
      if (!attacker || attacker.isDead) {
        return { success: false, reason: 'Invalid attacker' }
      }

      const weaponStats = this.weaponStats.get(weapon) || this.weaponStats.get('unarmed')

      // Check cooldown
      const now = Date.now()
      if (attacker.lastAttackTime && now - attacker.lastAttackTime < weaponStats.cooldown) {
        return { success: false, reason: 'Attack on cooldown' }
      }

      // Check stamina
      if (!this.plugin.entities.consumeStamina(attackerId, weaponStats.staminaCost)) {
        return { success: false, reason: 'Insufficient stamina' }
      }

      // Check mana for magical weapons
      if (weaponStats.manaCost && !this.plugin.entities.consumeMana(attackerId, weaponStats.manaCost)) {
        return { success: false, reason: 'Insufficient mana' }
      }

      attacker.lastAttackTime = now

      // Handle targetless attacks (swinging at air)
      if (!targetId) {
        return {
          success: true,
          type: 'swing',
          weapon,
          damage: 0
        }
      }

      const target = this.plugin.entities.get(targetId)
      if (!target || target.isDead) {
        return { success: false, reason: 'Invalid target' }
      }

      // Check range
      const distance = this.calculateDistance(attacker.position, target.position)
      if (distance > weaponStats.range) {
        return { success: false, reason: 'Target out of range' }
      }

      // Calculate damage
      const baseDamage = this.randomBetween(weaponStats.damage[0], weaponStats.damage[1])
      const finalDamage = this.applyDamageModifiers(baseDamage, attacker, target, weapon)

      // Apply damage
      const actualDamage = this.plugin.entities.takeDamage(targetId, finalDamage, attackerId)

      // Create damage effect
      this.plugin.effects.createDamageText({
        position: target.position,
        amount: actualDamage,
        type: 'melee',
        color: this.getDamageColor('melee')
      })

      if (this.plugin.config.debug) {
        console.log(`[DamageCalculator] ${attackerId} hit ${targetId} with ${weapon} for ${actualDamage} damage`)
      }

      return {
        success: true,
        type: 'melee',
        weapon,
        damage: actualDamage,
        attacker: attackerId,
        target: targetId
      }

    } catch (error) {
      console.error('[DamageCalculator] Melee attack error:', error)
      return { success: false, reason: 'Calculation error' }
    }
  }

  calculateSpellCast(playerId, spell, targetPos) {
    try {
      const player = this.plugin.entities.get(playerId)
      if (!player || player.isDead) {
        return { success: false, reason: 'Invalid caster' }
      }

      const spellStats = this.spellStats.get(spell)
      if (!spellStats) {
        return { success: false, reason: 'Unknown spell' }
      }

      // Check cooldown
      const cooldownKey = `${spell}Cooldown`
      const now = Date.now()
      if (player[cooldownKey] && now - player[cooldownKey] < spellStats.cooldown) {
        return { success: false, reason: 'Spell on cooldown' }
      }

      // Check mana
      if (!this.plugin.entities.consumeMana(playerId, spellStats.manaCost)) {
        return { success: false, reason: 'Insufficient mana' }
      }

      player[cooldownKey] = now

      // Handle different spell types
      switch (spell) {
        case 'fireball':
          return this.castFireball(player, targetPos, spellStats)
        
        case 'heal':
          return this.castHeal(player, spellStats)
        
        case 'lightning':
          return this.castLightning(player, targetPos, spellStats)
        
        case 'shield':
          return this.castShield(player, spellStats)
        
        default:
          return this.castFireball(player, targetPos, spellStats) // Default to fireball
      }

    } catch (error) {
      console.error('[DamageCalculator] Spell cast error:', error)
      return { success: false, reason: 'Calculation error' }
    }
  }

  castFireball(caster, targetPos, stats) {
    if (!targetPos) {
      return { success: false, reason: 'No target position' }
    }

    // Check range
    const distance = this.calculateDistance(caster.position, targetPos)
    if (distance > stats.range) {
      return { success: false, reason: 'Target out of range' }
    }

    // Find targets in area of effect
    const targets = this.findTargetsInRadius(targetPos, stats.areaOfEffect, caster.id)
    
    let totalDamage = 0
    const hitTargets = []

    for (const target of targets) {
      const baseDamage = this.randomBetween(stats.damage[0], stats.damage[1])
      const finalDamage = this.applyDamageModifiers(baseDamage, caster, target, 'fireball')
      const actualDamage = this.plugin.entities.takeDamage(target.id, finalDamage, caster.id)

      totalDamage += actualDamage
      hitTargets.push({ id: target.id, damage: actualDamage })

      // Create damage effect
      this.plugin.effects.createDamageText({
        position: target.position,
        amount: actualDamage,
        type: 'spell',
        color: this.getDamageColor('fire')
      })
    }

    // Create explosion effect
    this.plugin.effects.createEffect({
      type: 'fireball',
      position: targetPos,
      scale: stats.areaOfEffect / 3.0
    })

    if (this.plugin.config.debug) {
      console.log(`[DamageCalculator] ${caster.id} cast fireball, hit ${hitTargets.length} targets for ${totalDamage} total damage`)
    }

    return {
      success: true,
      type: 'spell',
      spell: 'fireball',
      damage: totalDamage,
      targets: hitTargets,
      caster: caster.id
    }
  }

  castHeal(caster, stats) {
    const healAmount = this.randomBetween(stats.healing[0], stats.healing[1])
    const maxHealth = caster.maxHealth
    const currentHealth = caster.health
    const actualHeal = Math.min(healAmount, maxHealth - currentHealth)

    caster.health = Math.min(maxHealth, currentHealth + actualHeal)

    // Create heal effect
    this.plugin.effects.createDamageText({
      position: caster.position,
      amount: actualHeal,
      type: 'heal',
      color: this.getDamageColor('heal')
    })

    // Broadcast resource update
    this.plugin.broadcastResourceUpdate(caster)

    if (this.plugin.config.debug) {
      console.log(`[DamageCalculator] ${caster.id} healed for ${actualHeal}`)
    }

    return {
      success: true,
      type: 'spell',
      spell: 'heal',
      healing: actualHeal,
      caster: caster.id
    }
  }

  castLightning(caster, targetPos, stats) {
    // Find closest target to the target position
    const target = this.findClosestTarget(targetPos, caster.id, stats.range)
    
    if (!target) {
      return { success: false, reason: 'No valid target found' }
    }

    const baseDamage = this.randomBetween(stats.damage[0], stats.damage[1])
    const finalDamage = this.applyDamageModifiers(baseDamage, caster, target, 'lightning')
    const actualDamage = this.plugin.entities.takeDamage(target.id, finalDamage, caster.id)

    // Create lightning effect
    this.plugin.effects.createLightning(caster.position, target.position)
    this.plugin.effects.createDamageText({
      position: target.position,
      amount: actualDamage,
      type: 'spell',
      color: this.getDamageColor('lightning')
    })

    return {
      success: true,
      type: 'spell',
      spell: 'lightning',
      damage: actualDamage,
      target: target.id,
      caster: caster.id
    }
  }

  castShield(caster, stats) {
    const shieldAmount = this.randomBetween(stats.absorption[0], stats.absorption[1])
    
    // Apply shield effect (would need to be handled in damage calculation)
    caster.shieldAmount = shieldAmount
    caster.shieldExpiry = Date.now() + stats.duration

    // Create shield effect
    this.plugin.effects.createShieldEffect(caster.position)

    return {
      success: true,
      type: 'spell',
      spell: 'shield',
      absorption: shieldAmount,
      duration: stats.duration,
      caster: caster.id
    }
  }

  // Damage modifiers and calculations

  applyDamageModifiers(baseDamage, attacker, target, weapon) {
    let finalDamage = baseDamage

    // Critical hit chance (10%)
    if (Math.random() < 0.1) {
      finalDamage *= 2.0
      if (this.plugin.config.debug) {
        console.log(`[DamageCalculator] Critical hit! ${baseDamage} -> ${finalDamage}`)
      }
    }

    // Shield absorption
    if (target.shieldAmount && target.shieldExpiry && Date.now() < target.shieldExpiry) {
      const absorbed = Math.min(finalDamage, target.shieldAmount)
      finalDamage -= absorbed
      target.shieldAmount -= absorbed
      
      if (target.shieldAmount <= 0) {
        target.shieldAmount = 0
        target.shieldExpiry = 0
      }
    }

    return Math.round(Math.max(1, finalDamage)) // Minimum 1 damage
  }

  // Utility methods

  findTargetsInRadius(position, radius, excludeId) {
    const targets = []
    
    for (const entity of this.plugin.entities.getAll()) {
      if (entity.id === excludeId || entity.isDead) continue
      
      const distance = this.calculateDistance(position, entity.position)
      if (distance <= radius) {
        targets.push(entity)
      }
    }
    
    return targets
  }

  findClosestTarget(position, excludeId, maxRange) {
    let closest = null
    let closestDistance = maxRange
    
    for (const entity of this.plugin.entities.getAll()) {
      if (entity.id === excludeId || entity.isDead) continue
      
      const distance = this.calculateDistance(position, entity.position)
      if (distance < closestDistance) {
        closest = entity
        closestDistance = distance
      }
    }
    
    return closest
  }

  calculateDistance(pos1, pos2) {
    if (!pos1 || !pos2) return Infinity
    
    const dx = pos1.x - pos2.x
    const dy = pos1.y - pos2.y
    const dz = pos1.z - pos2.z
    
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  getDamageColor(type) {
    const colors = {
      melee: '#ff4444',
      fire: '#ff6600',
      lightning: '#4466ff',
      heal: '#44ff44',
      spell: '#9944ff'
    }
    return colors[type] || colors.melee
  }
}