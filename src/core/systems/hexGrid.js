/**
 * Hexagonal Grid System
 *
 * This system creates a hex grid with flat-top hexagons.
 * Hex 0 is centered at world origin (0, 0, 0)
 * Each hex has a side length of 200 units
 *
 * Using axial coordinates (q, r) for hex addressing
 * where q is column and r is row
 */

const HEX_SIZE = 200 // Side length of each hexagon

// Convert size to useful measurements for flat-top hexagons
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE // Distance between centers horizontally
const HEX_HEIGHT = 2 * HEX_SIZE // Full height of hexagon
const HEX_VERT_SPACING = HEX_HEIGHT * 3/4 // Vertical distance between row centers

/**
 * Generate hex grid coordinates
 * @param {number} rings - Number of rings around center hex (0 = just center)
 * @returns {Array} Array of hex data with axial coords and world position
 */
function generateHexGrid(rings = 3) {
  const hexes = []

  // Add center hex
  hexes.push({
    q: 0,
    r: 0,
    s: 0, // s = -q - r (for cube coordinates)
    center: { x: 0, y: 0, z: 0 },
    id: 0
  })

  let id = 1

  // Generate rings around center
  for (let ring = 1; ring <= rings; ring++) {
    // Start at the "top" of the ring and work clockwise
    let q = 0
    let r = -ring

    // There are 6 * ring hexes in each ring
    for (let side = 0; side < 6; side++) {
      // Direction vectors for each side of the hexagon
      const directions = [
        { q: 1, r: 0 },   // Right
        { q: 1, r: -1 },  // Top-right
        { q: 0, r: -1 },  // Top-left
        { q: -1, r: 0 },  // Left
        { q: -1, r: 1 },  // Bottom-left
        { q: 0, r: 1 }    // Bottom-right
      ]

      const dir = directions[side]

      // Walk along this side of the ring
      for (let step = 0; step < ring; step++) {
        // Calculate world position from axial coordinates
        const worldPos = axialToWorld(q, r)

        hexes.push({
          q: q,
          r: r,
          s: -q - r,
          center: worldPos,
          id: id++
        })

        // Move to next hex along this side
        q += dir.q
        r += dir.r
      }
    }
  }

  return hexes
}

/**
 * Convert axial hex coordinates to world position
 * @param {number} q - Column coordinate
 * @param {number} r - Row coordinate
 * @returns {Object} World position {x, y, z}
 */
function axialToWorld(q, r) {
  // For flat-top hexagons
  const x = HEX_SIZE * Math.sqrt(3) * (q + r/2)
  const z = HEX_SIZE * 3/2 * r

  return {
    x: x,
    y: 0, // Assuming flat ground plane
    z: z
  }
}

/**
 * Convert world position to axial hex coordinates
 * @param {number} x - World X position
 * @param {number} z - World Z position
 * @returns {Object} Axial coordinates {q, r}
 */
function worldToAxial(x, z) {
  // For flat-top hexagons
  const q = (x * Math.sqrt(3)/3 - z/3) / HEX_SIZE
  const r = z * 2/3 / HEX_SIZE

  return axialRound(q, r)
}

/**
 * Round fractional axial coordinates to nearest hex
 * @param {number} q - Fractional q coordinate
 * @param {number} r - Fractional r coordinate
 * @returns {Object} Rounded axial coordinates {q, r}
 */
function axialRound(q, r) {
  const s = -q - r

  let rq = Math.round(q)
  let rr = Math.round(r)
  let rs = Math.round(s)

  const q_diff = Math.abs(rq - q)
  const r_diff = Math.abs(rr - r)
  const s_diff = Math.abs(rs - s)

  // Reset the coordinate with largest rounding error
  if (q_diff > r_diff && q_diff > s_diff) {
    rq = -rr - rs
  } else if (r_diff > s_diff) {
    rr = -rq - rs
  } else {
    rs = -rq - rr
  }

  return { q: rq, r: rr }
}

/**
 * Get which hex a world position is in
 * @param {number} x - World X position
 * @param {number} z - World Z position
 * @param {Array} hexGrid - Array of hex data from generateHexGrid
 * @returns {Object|null} Hex data if found, null otherwise
 */
function getHexAtPosition(x, z, hexGrid) {
  const axial = worldToAxial(x, z)

  // Find hex with matching axial coordinates
  return hexGrid.find(hex => hex.q === axial.q && hex.r === axial.r) || null
}

/**
 * Get hex ID at world position
 * @param {number} x - World X position
 * @param {number} z - World Z position
 * @param {Array} hexGrid - Array of hex data
 * @returns {number} Hex ID, or -1 if not in grid
 */
function getHexIdAtPosition(x, z, hexGrid) {
  const hex = getHexAtPosition(x, z, hexGrid)
  return hex ? hex.id : -1
}

/**
 * Get vertices of a hex in world space
 * @param {number} q - Axial q coordinate
 * @param {number} r - Axial r coordinate
 * @returns {Array} Array of 6 vertices {x, z}
 */
function getHexVertices(q, r) {
  const center = axialToWorld(q, r)
  const vertices = []

  // For flat-top hexagon, start at 30 degrees
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + (Math.PI / 6)
    vertices.push({
      x: center.x + HEX_SIZE * Math.cos(angle),
      z: center.z + HEX_SIZE * Math.sin(angle)
    })
  }

  return vertices
}

/**
 * Calculate distance between two hexes
 * @param {Object} hex1 - First hex {q, r}
 * @param {Object} hex2 - Second hex {q, r}
 * @returns {number} Distance in hex steps
 */
function hexDistance(hex1, hex2) {
  return (Math.abs(hex1.q - hex2.q) +
          Math.abs(hex1.q + hex1.r - hex2.q - hex2.r) +
          Math.abs(hex1.r - hex2.r)) / 2
}

/**
 * Get all neighbor hexes
 * @param {number} q - Axial q coordinate
 * @param {number} r - Axial r coordinate
 * @returns {Array} Array of neighbor coordinates
 */
function getHexNeighbors(q, r) {
  return [
    { q: q + 1, r: r },     // Right
    { q: q + 1, r: r - 1 },  // Top-right
    { q: q, r: r - 1 },      // Top-left
    { q: q - 1, r: r },      // Left
    { q: q - 1, r: r + 1 },  // Bottom-left
    { q: q, r: r + 1 }       // Bottom-right
  ]
}

// ES Module exports
export {
  generateHexGrid,
  axialToWorld,
  worldToAxial,
  getHexAtPosition,
  getHexIdAtPosition,
  getHexVertices,
  hexDistance,
  getHexNeighbors,
  HEX_SIZE,
  HEX_WIDTH,
  HEX_HEIGHT
}