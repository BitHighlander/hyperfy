import * as THREE from '../extras/three'
import { System } from './System'
import { generateHexGrid, getHexAtPosition, getHexVertices, HEX_SIZE } from './hexGrid'

/**
 * HexGridRenderer System
 *
 * - Renders hex grid boundaries with neon glow effects
 * - Shows visual indicator for current hex zone
 * - Adds animated background and effects to the hex map
 */
export class HexGridRenderer extends System {
  constructor(world) {
    super(world)

    this.hexGrid = null
    this.hexMeshes = new Map()
    this.currentHexId = -1
    this.hexGroup = new THREE.Group()
    this.indicatorGroup = new THREE.Group()
    this.backgroundMesh = null
    this.lastPlayerPosition = { x: 0, z: 0 }
    this.animationTime = 0

    // Visual configuration
    this.config = {
      borderColor: 0xff00ff, // Neon pink/magenta
      borderEmissive: 0xff00ff,
      borderThickness: 2,
      glowIntensity: 0.8,
      activeHexColor: 0x00ffff, // Cyan for active hex
      activeGlowIntensity: 1.5,
      backgroundColor: 0x0a0015, // Dark purple background
      gridOpacity: 0.3,
      activeGridOpacity: 0.8,
      borderHeight: 0.5, // Height of hex borders above ground
      pulseSpeed: 2, // Speed of pulsing animation
    }
  }

  init() {
    // Generate hex grid with 5 rings (91 hexes)
    this.hexGrid = generateHexGrid(5)

    // Add groups to the scene
    this.world.stage.scene.add(this.hexGroup)
    this.world.stage.scene.add(this.indicatorGroup)

    // Create hex borders
    this.createHexBorders()

    // Create background plane
    this.createBackground()

    // Create current hex indicator
    this.createHexIndicator()
  }

  createHexBorders() {
    // Create material for hex borders
    const borderMaterial = new THREE.LineBasicMaterial({
      color: this.config.borderColor,
      linewidth: this.config.borderThickness,
      transparent: true,
      opacity: this.config.gridOpacity,
      fog: false
    })

    // Create glow material for special effect
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: this.config.borderColor,
      emissive: this.config.borderEmissive,
      emissiveIntensity: this.config.glowIntensity,
      transparent: true,
      opacity: this.config.gridOpacity * 0.5,
      side: THREE.DoubleSide,
      fog: false
    })

    // Create borders for each hex
    this.hexGrid.forEach(hex => {
      const vertices = getHexVertices(hex.q, hex.r)

      // Create line geometry for hex border
      const points = []
      vertices.forEach(v => {
        points.push(new THREE.Vector3(v.x, this.config.borderHeight, v.z))
      })
      // Close the hexagon
      points.push(new THREE.Vector3(vertices[0].x, this.config.borderHeight, vertices[0].z))

      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const borderLine = new THREE.Line(geometry, borderMaterial)

      // Create a thin ribbon for glow effect
      const ribbonGeometry = new THREE.BufferGeometry()
      const ribbonVertices = []
      const ribbonIndices = []

      for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i]
        const v2 = vertices[(i + 1) % vertices.length]

        // Bottom vertices
        ribbonVertices.push(v1.x, 0, v1.z)
        ribbonVertices.push(v2.x, 0, v2.z)
        // Top vertices
        ribbonVertices.push(v1.x, this.config.borderHeight * 2, v1.z)
        ribbonVertices.push(v2.x, this.config.borderHeight * 2, v2.z)

        // Create faces
        const baseIndex = i * 4
        ribbonIndices.push(
          baseIndex, baseIndex + 1, baseIndex + 2,
          baseIndex + 1, baseIndex + 3, baseIndex + 2
        )
      }

      ribbonGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ribbonVertices, 3))
      ribbonGeometry.setIndex(ribbonIndices)
      ribbonGeometry.computeVertexNormals()

      const ribbonMesh = new THREE.Mesh(ribbonGeometry, glowMaterial)

      // Store meshes for later updates
      this.hexMeshes.set(hex.id, {
        line: borderLine,
        ribbon: ribbonMesh,
        hex: hex
      })

      this.hexGroup.add(borderLine)
      this.hexGroup.add(ribbonMesh)
    })
  }

  createBackground() {
    // Create a large ground plane with gradient texture
    const size = HEX_SIZE * 40 // Increased size for full world coverage
    const geometry = new THREE.PlaneGeometry(size, size, 100, 100) // Add subdivisions for better lighting

    // Create gradient texture with cyberpunk aesthetics
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')

    // Create multi-layer gradient for depth
    const gradient = ctx.createRadialGradient(512, 512, 0, 512, 512, 512)
    gradient.addColorStop(0, '#1a0033')
    gradient.addColorStop(0.3, '#0f001f')
    gradient.addColorStop(0.6, '#0a0015')
    gradient.addColorStop(0.9, '#050010')
    gradient.addColorStop(1, '#000000')

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 1024, 1024)

    // Add grid pattern overlay
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.02)'
    ctx.lineWidth = 1
    for (let i = 0; i < 1024; i += 32) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, 1024)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(1024, i)
      ctx.stroke()
    }

    // Add some noise/stars for atmosphere
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 1024
      const y = Math.random() * 1024
      const size = Math.random() * 3
      const opacity = Math.random() * 0.6
      ctx.fillStyle = `rgba(255, 100, 255, ${opacity})`
      ctx.fillRect(x, y, size, size)
    }

    // Add glowing particles
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * 1024
      const y = Math.random() * 1024
      const radius = Math.random() * 5 + 2
      const grd = ctx.createRadialGradient(x, y, 0, x, y, radius)
      grd.addColorStop(0, 'rgba(255, 0, 255, 0.8)')
      grd.addColorStop(1, 'rgba(255, 0, 255, 0)')
      ctx.fillStyle = grd
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(20, 20)

    // Use standard material for better lighting interaction
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0.1,
      emissive: new THREE.Color(0x0a0015),
      emissiveIntensity: 0.2,
      fog: true
    })

    this.backgroundMesh = new THREE.Mesh(geometry, material)
    this.backgroundMesh.rotation.x = -Math.PI / 2
    this.backgroundMesh.position.y = 0 // Ground level
    this.backgroundMesh.receiveShadow = true

    this.world.stage.scene.add(this.backgroundMesh)

    // Only set fog if not already set by environment system
    if (!this.world.stage.scene.fog) {
      this.world.stage.scene.fog = new THREE.FogExp2(0x0a0015, 0.0008)
    }

    // Add subtle ambient light for hex glow
    const ambientLight = new THREE.AmbientLight(0x4a0080, 0.3)
    this.world.stage.scene.add(ambientLight)
    this.ambientLight = ambientLight

    // Add rim lighting for cyberpunk effect
    const rimLight = new THREE.DirectionalLight(0xff00ff, 0.2)
    rimLight.position.set(-100, 100, -100)
    this.world.stage.scene.add(rimLight)
    this.rimLight = rimLight
  }

  createHexIndicator() {
    // Create a glowing ring indicator for current hex
    const geometry = new THREE.TorusGeometry(HEX_SIZE * 0.8, 3, 8, 6)

    const material = new THREE.MeshStandardMaterial({
      color: this.config.activeHexColor,
      emissive: this.config.activeHexColor,
      emissiveIntensity: this.config.activeGlowIntensity,
      transparent: true,
      opacity: 0.6,
      fog: false
    })

    const indicator = new THREE.Mesh(geometry, material)
    indicator.rotation.x = -Math.PI / 2
    indicator.position.y = this.config.borderHeight
    indicator.visible = false

    this.indicatorGroup.add(indicator)
    this.currentIndicator = indicator

    // Create vertical pillar of light
    const pillarGeometry = new THREE.CylinderGeometry(HEX_SIZE * 0.5, HEX_SIZE * 0.7, 50, 6, 1, true)
    const pillarMaterial = new THREE.MeshBasicMaterial({
      color: this.config.activeHexColor,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      fog: false
    })

    const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial)
    pillar.position.y = 25
    pillar.visible = false

    this.indicatorGroup.add(pillar)
    this.currentPillar = pillar
  }

  update(delta) {
    if (!this.world.isClient) return

    this.animationTime += delta

    // Get player position
    const player = this.world.entities.player
    if (!player) return

    let pos = null

    // Try different ways to get player position
    if (player.base && player.base.position) {
      pos = player.base.position
    } else if (player.capsule) {
      try {
        const pose = player.capsule.getGlobalPose()
        if (pose && pose.p) {
          pos = { x: pose.p.x, y: pose.p.y, z: pose.p.z }
        }
      } catch (e) {
        // Capsule might not be available yet
      }
    } else if (player.transform && player.transform.position) {
      pos = player.transform.position
    } else if (player.data && player.data.position) {
      pos = player.data.position
    } else if (player.mesh && player.mesh.position) {
      pos = player.mesh.position
    }

    if (!pos) return

    // Check if player has moved significantly
    const distMoved = Math.sqrt(
      Math.pow(pos.x - this.lastPlayerPosition.x, 2) +
      Math.pow(pos.z - this.lastPlayerPosition.z, 2)
    )

    if (distMoved > 5) {
      this.lastPlayerPosition = { x: pos.x, z: pos.z }

      // Get current hex
      const hexData = getHexAtPosition(pos.x, pos.z, this.hexGrid)
      const hexId = hexData ? hexData.id : -1

      // Update current hex highlighting
      if (hexId !== this.currentHexId) {
        this.updateCurrentHex(hexId, hexData)
      }
    }

    // Animate current hex indicator
    this.animateIndicator()

    // Pulse hex borders
    this.pulseHexBorders()
  }

  updateCurrentHex(hexId, hexData) {
    // Reset previous hex
    if (this.currentHexId >= 0) {
      const prevHex = this.hexMeshes.get(this.currentHexId)
      if (prevHex) {
        prevHex.line.material.opacity = this.config.gridOpacity
        prevHex.ribbon.material.opacity = this.config.gridOpacity * 0.5
        prevHex.line.material.color.setHex(this.config.borderColor)
        prevHex.ribbon.material.color.setHex(this.config.borderColor)
      }
    }

    this.currentHexId = hexId

    // Highlight new hex
    if (hexId >= 0 && hexData) {
      const currentHex = this.hexMeshes.get(hexId)
      if (currentHex) {
        currentHex.line.material.opacity = this.config.activeGridOpacity
        currentHex.ribbon.material.opacity = this.config.activeGridOpacity * 0.5
        currentHex.line.material.color.setHex(this.config.activeHexColor)
        currentHex.ribbon.material.color.setHex(this.config.activeHexColor)
      }

      // Update indicator position
      const center = hexData.center
      this.currentIndicator.position.x = center.x
      this.currentIndicator.position.z = center.z
      this.currentIndicator.visible = true

      this.currentPillar.position.x = center.x
      this.currentPillar.position.z = center.z
      this.currentPillar.visible = true
    } else {
      this.currentIndicator.visible = false
      this.currentPillar.visible = false
    }
  }

  animateIndicator() {
    if (this.currentIndicator && this.currentIndicator.visible) {
      // Pulse the scale
      const scale = 1 + Math.sin(this.animationTime * this.config.pulseSpeed) * 0.1
      this.currentIndicator.scale.set(scale, scale, scale)

      // Rotate the indicator
      this.currentIndicator.rotation.z = this.animationTime * 0.5

      // Animate opacity
      this.currentIndicator.material.opacity = 0.4 + Math.sin(this.animationTime * this.config.pulseSpeed * 2) * 0.2
    }

    if (this.currentPillar && this.currentPillar.visible) {
      // Rotate the pillar
      this.currentPillar.rotation.y = this.animationTime * 0.2

      // Pulse opacity
      this.currentPillar.material.opacity = 0.05 + Math.sin(this.animationTime * this.config.pulseSpeed) * 0.05
    }
  }

  pulseHexBorders() {
    // Subtle pulsing of all hex borders
    const pulse = Math.sin(this.animationTime * 0.5) * 0.1 + 1

    this.hexMeshes.forEach((meshData, id) => {
      if (id !== this.currentHexId) {
        const opacity = this.config.gridOpacity * pulse
        meshData.line.material.opacity = Math.min(opacity, 0.5)
        meshData.ribbon.material.opacity = Math.min(opacity * 0.5, 0.25)
      }
    })
  }

  destroy() {
    // Clean up resources
    this.hexGroup.clear()
    this.indicatorGroup.clear()

    if (this.backgroundMesh) {
      this.world.stage.scene.remove(this.backgroundMesh)
      this.backgroundMesh.geometry.dispose()
      this.backgroundMesh.material.map.dispose()
      this.backgroundMesh.material.dispose()
    }

    if (this.ambientLight) {
      this.world.stage.scene.remove(this.ambientLight)
    }

    if (this.rimLight) {
      this.world.stage.scene.remove(this.rimLight)
    }

    this.hexMeshes.forEach(meshData => {
      meshData.line.geometry.dispose()
      meshData.line.material.dispose()
      meshData.ribbon.geometry.dispose()
      meshData.ribbon.material.dispose()
    })

    this.world.stage.scene.remove(this.hexGroup)
    this.world.stage.scene.remove(this.indicatorGroup)

    if (this.currentIndicator) {
      this.currentIndicator.geometry.dispose()
      this.currentIndicator.material.dispose()
    }

    if (this.currentPillar) {
      this.currentPillar.geometry.dispose()
      this.currentPillar.material.dispose()
    }
  }
}