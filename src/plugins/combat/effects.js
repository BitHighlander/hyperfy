/**
 * Combat Visual Effects System
 * 
 * Handles visual effects for combat including damage text, particles, and animations
 */

export class CombatEffects {
  constructor(plugin) {
    this.plugin = plugin
    this.activeEffects = new Set()
  }

  async init() {
    // Initialize effects system
    this.setupHelperMethods()
    
    if (this.plugin.config.debug) {
      console.log('[CombatEffects] Visual effects system initialized')
    }
  }

  setupHelperMethods() {
    // Add helper methods to world if they don't exist
    if (!this.plugin.world.createDamageText) {
      this.plugin.world.createDamageText = this.createDamageText.bind(this)
    }

    if (!this.plugin.world.createProjectile) {
      this.plugin.world.createProjectile = this.createProjectile.bind(this)
    }

    if (!this.plugin.world.createEffect) {
      this.plugin.world.createEffect = this.createEffect.bind(this)
    }
  }

  // Animation effects

  playAttackAnimation(entity, weapon = 'unarmed') {
    try {
      if (!entity || typeof entity.playAnimation !== 'function') return

      const animationName = this.getAttackAnimation(weapon)
      entity.playAnimation(animationName)

      // Broadcast animation to other clients
      this.broadcastEntityAnimation(entity.id, animationName)

      if (this.plugin.config.debug) {
        console.log(`[CombatEffects] Playing attack animation: ${animationName} for ${entity.id}`)
      }

    } catch (error) {
      console.error('[CombatEffects] Attack animation error:', error)
    }
  }

  playCastAnimation(entity, spell) {
    try {
      if (!entity || typeof entity.playAnimation !== 'function') return

      const animationName = this.getCastAnimation(spell)
      entity.playAnimation(animationName)

      // Broadcast animation to other clients
      this.broadcastEntityAnimation(entity.id, animationName)

      if (this.plugin.config.debug) {
        console.log(`[CombatEffects] Playing cast animation: ${animationName} for ${entity.id}`)
      }

    } catch (error) {
      console.error('[CombatEffects] Cast animation error:', error)
    }
  }

  playDeathAnimation(entity) {
    try {
      if (!entity || typeof entity.playAnimation !== 'function') return

      entity.playAnimation('death')
      this.broadcastEntityAnimation(entity.id, 'death')

      if (this.plugin.config.debug) {
        console.log(`[CombatEffects] Playing death animation for ${entity.id}`)
      }

    } catch (error) {
      console.error('[CombatEffects] Death animation error:', error)
    }
  }

  // Damage text effects

  createDamageText({ position, amount, type, color }) {
    try {
      if (!this.plugin.world.create) return null

      const textNode = this.plugin.world.create('uitext')
      if (!textNode) return null

      // Configure text
      textNode.value = amount.toString()
      textNode.fontSize = type === 'heal' ? 28 : 24
      textNode.color = color || '#ff0000'
      textNode.position.set(position.x, position.y + 1, position.z)

      // Add outline for better visibility
      if (textNode.strokeColor) {
        textNode.strokeColor = '#000000'
        textNode.strokeWidth = 2
      }

      // Add to world
      this.plugin.world.add(textNode)
      this.activeEffects.add(textNode)

      // Animate
      this.animateDamageText(textNode, position, type)

      return textNode

    } catch (error) {
      console.warn('[CombatEffects] Failed to create damage text:', error)
      return null
    }
  }

  animateDamageText(textNode, originalPosition, type) {
    let elapsed = 0
    const duration = 2000 // 2 seconds
    const height = type === 'heal' ? 3 : 2.5

    const animate = (delta) => {
      elapsed += delta * 1000 // Convert to milliseconds
      const progress = Math.min(elapsed / duration, 1)

      // Move upward with easing
      const easedProgress = 1 - Math.pow(1 - progress, 3) // Ease out cubic
      textNode.position.y = originalPosition.y + 1 + (easedProgress * height)

      // Fade out
      if (textNode.opacity !== undefined) {
        textNode.opacity = 1 - progress
      } else if (textNode.material?.opacity !== undefined) {
        textNode.material.opacity = 1 - progress
      }

      // Scale effect for healing
      if (type === 'heal') {
        const scale = 1 + Math.sin(progress * Math.PI) * 0.5
        textNode.scale?.setScalar(scale)
      }

      if (progress >= 1) {
        this.removeEffect(textNode)
        this.plugin.world.off('update', animate)
      }
    }

    this.plugin.world.on('update', animate)
  }

  // Projectile effects

  createProjectile(type, origin, target, options = {}) {
    try {
      if (!this.plugin.world.create || !origin || !target) return null

      const particles = this.plugin.world.create('particles', {
        shape: ['point'],
        rate: options.rate || 50,
        life: options.life || '0.5',
        speed: options.speed || '5',
        size: options.size || '0.1',
        color: this.getProjectileColor(type),
        alpha: '0.8',
        emissive: '1',
        blending: 'additive',
        loop: false
      })

      if (!particles) return null

      particles.position.copy(origin)
      this.plugin.world.add(particles)
      this.activeEffects.add(particles)

      // Animate projectile movement
      this.animateProjectile(particles, origin, target, type, options)

      return particles

    } catch (error) {
      console.warn('[CombatEffects] Failed to create projectile:', error)
      return null
    }
  }

  animateProjectile(particles, origin, target, type, options) {
    const direction = {
      x: target.x - origin.x,
      y: target.y - origin.y,
      z: target.z - origin.z
    }
    
    const distance = Math.sqrt(direction.x**2 + direction.y**2 + direction.z**2)
    const speed = options.speed || 10
    const duration = (distance / speed) * 1000 // Convert to milliseconds

    let elapsed = 0

    const animate = (delta) => {
      elapsed += delta * 1000
      const progress = Math.min(elapsed / duration, 1)

      particles.position.set(
        origin.x + direction.x * progress,
        origin.y + direction.y * progress,
        origin.z + direction.z * progress
      )

      if (progress >= 1) {
        this.removeEffect(particles)
        this.plugin.world.off('update', animate)

        // Create impact effect
        this.createEffect({
          type: type,
          position: target,
          scale: options.impactScale || 1.0
        })
      }
    }

    this.plugin.world.on('update', animate)
  }

  // Area effects

  createEffect({ type, position, scale = 1.0, duration = 1000 }) {
    try {
      if (!this.plugin.world.create || !position) return null

      const particles = this.plugin.world.create('particles', {
        shape: ['sphere', 0.5, 0],
        rate: this.getEffectRate(type),
        life: '1',
        speed: '3~8',
        size: `${0.2 * scale}~${0.5 * scale}`,
        color: this.getEffectColor(type),
        alpha: '1',
        emissive: '2',
        blending: 'additive',
        loop: false,
        duration: duration / 1000
      })

      if (!particles) return null

      particles.position.copy(position)
      particles.scale?.setScalar(scale)
      this.plugin.world.add(particles)
      this.activeEffects.add(particles)

      // Auto-remove after duration
      setTimeout(() => {
        this.removeEffect(particles)
      }, duration + 500)

      return particles

    } catch (error) {
      console.warn('[CombatEffects] Failed to create effect:', error)
      return null
    }
  }

  createLightning(origin, target) {
    // Create instant lightning bolt visual
    const lightningData = {
      type: 'lightning',
      origin: origin,
      target: target,
      duration: 200
    }

    // Broadcast lightning effect to all clients
    if (this.plugin.serverMode) {
      this.plugin.world.network?.send('combat:lightning', lightningData)
    }

    // Create local flash effect
    this.createEffect({
      type: 'lightning',
      position: target,
      scale: 0.5,
      duration: 200
    })

    return lightningData
  }

  createShieldEffect(position) {
    try {
      const shield = this.plugin.world.create('particles', {
        shape: ['sphere', 2, 0],
        rate: 20,
        life: '2',
        speed: '0.5',
        size: '0.3~0.6',
        color: '#4488ff',
        alpha: '0.3',
        emissive: '0.5',
        blending: 'additive',
        duration: 2
      })

      if (shield) {
        shield.position.copy(position)
        this.plugin.world.add(shield)
        this.activeEffects.add(shield)

        setTimeout(() => {
          this.removeEffect(shield)
        }, 2500)
      }

      return shield

    } catch (error) {
      console.warn('[CombatEffects] Failed to create shield effect:', error)
      return null
    }
  }

  // Animation name helpers

  getAttackAnimation(weapon) {
    const animations = {
      unarmed: 'attack',
      sword: 'attack',
      axe: 'attack',
      dagger: 'attack',
      bow: 'shoot',
      staff: 'cast'
    }
    return animations[weapon] || 'attack'
  }

  getCastAnimation(spell) {
    const animations = {
      fireball: 'cast',
      heal: 'cast',
      lightning: 'cast',
      shield: 'cast'
    }
    return animations[spell] || 'cast'
  }

  // Color helpers

  getProjectileColor(type) {
    const colors = {
      fireball: '#ff6600',
      lightning: '#4466ff',
      arrow: '#8B4513',
      magic: '#9944ff'
    }
    return colors[type] || colors.magic
  }

  getEffectColor(type) {
    const colors = {
      fireball: '#ff3300',
      lightning: '#aaccff',
      explosion: '#ff6600',
      impact: '#ffffff'
    }
    return colors[type] || colors.impact
  }

  getEffectRate(type) {
    const rates = {
      fireball: 100,
      lightning: 50,
      explosion: 150,
      impact: 80
    }
    return rates[type] || 100
  }

  // Network broadcasting

  broadcastEntityAnimation(entityId, animation) {
    if (!this.plugin.serverMode || !this.plugin.world.network?.send) return

    this.plugin.world.network.send('combat:entityAnimation', {
      entityId,
      animation
    })
  }

  // Cleanup

  removeEffect(effect) {
    if (!effect) return

    try {
      if (effect.parent || this.plugin.world.children?.includes(effect)) {
        this.plugin.world.remove(effect)
      }
      
      this.activeEffects.delete(effect)
    } catch (error) {
      console.warn('[CombatEffects] Error removing effect:', error)
    }
  }

  destroy() {
    // Clean up all active effects
    for (const effect of this.activeEffects) {
      try {
        if (effect.parent || this.plugin.world.children?.includes(effect)) {
          this.plugin.world.remove(effect)
        }
      } catch (error) {
        console.warn('[CombatEffects] Error cleaning up effect:', error)
      }
    }
    
    this.activeEffects.clear()

    if (this.plugin.config.debug) {
      console.log('[CombatEffects] Effects system destroyed')
    }
  }
}