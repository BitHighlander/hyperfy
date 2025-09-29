import { css } from '@firebolt-dev/css'
import { useState, useEffect, useRef } from 'react'
import {
  generateHexGrid,
  getHexIdAtPosition,
  getHexAtPosition
} from '../../core/systems/hexGrid'

// Hex names mapping (placeholder - will be expanded later)
const hexNames = {
  0: 'Origin Plaza',
  1: 'North Market',
  2: 'Crystal Gardens',
  3: 'Tech District',
  4: 'Harbor View',
  5: 'Old Town',
  6: 'Sky Bridge',
  // Add more names as needed
}

export function HexDisplay({ world }) {
  const [currentHex, setCurrentHex] = useState({ id: -1, q: 0, r: 0, name: 'Unknown' })
  const animationFrameRef = useRef()
  const lastHexRef = useRef(-1)
  const hexGridRef = useRef(null)

  useEffect(() => {
    if (!world) return

    // Generate hex grid on mount (5 rings = 91 hexes)
    if (!hexGridRef.current) {
      hexGridRef.current = generateHexGrid(5)
      console.log('Hex grid generated with', hexGridRef.current.length, 'hexes')
    }

    // Update hex position on animation frame
    const updateHex = () => {
      const player = world.entities.player
      if (player && hexGridRef.current) {
        let pos = null

        // Get player position (same methods as PositionDisplay)
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

        if (pos) {
          // Get current hex from position
          const hexData = getHexAtPosition(pos.x, pos.z, hexGridRef.current)
          const hexId = hexData ? hexData.id : -1

          // Only update if hex changed
          if (hexId !== lastHexRef.current) {
            lastHexRef.current = hexId

            if (hexData) {
              setCurrentHex({
                id: hexData.id,
                q: hexData.q,
                r: hexData.r,
                name: hexNames[hexData.id] || `Sector ${hexData.id}`
              })
            } else {
              setCurrentHex({
                id: -1,
                q: 0,
                r: 0,
                name: 'Outer Regions'
              })
            }
          }
        }
      }
      animationFrameRef.current = requestAnimationFrame(updateHex)
    }

    // Start the update loop
    updateHex()

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [world])

  return (
    <div
      className='hex-display'
      css={css`
        position: absolute;
        top: 3.5rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 998;
        pointer-events: none;
        background: linear-gradient(135deg, rgba(20, 10, 30, 0.9) 0%, rgba(40, 20, 60, 0.9) 50%, rgba(20, 10, 30, 0.9) 100%);
        border: 1px solid rgba(255, 100, 255, 0.3);
        border-radius: 0.5rem;
        padding: 0.4rem 1rem;
        backdrop-filter: blur(10px);
        box-shadow:
          0 0 20px rgba(255, 100, 255, 0.15),
          inset 0 0 10px rgba(255, 100, 255, 0.1);
        min-width: 200px;
      `}
    >
      <div
        css={css`
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          font-family: 'Courier New', monospace;
        `}
      >
        {/* Hex ID and Coordinates */}
        <div
          css={css`
            display: flex;
            align-items: center;
            gap: 1rem;
            width: 100%;
            justify-content: center;
          `}
        >
          <div
            css={css`
              display: flex;
              align-items: center;
              gap: 0.4rem;
            `}
          >
            <span
              css={css`
                color: rgba(255, 255, 255, 0.4);
                font-size: 0.7rem;
                text-transform: uppercase;
              `}
            >
              Hex:
            </span>
            <span
              css={css`
                color: #ff66ff;
                font-weight: 700;
                font-size: 0.9rem;
                text-shadow: 0 0 8px rgba(255, 100, 255, 0.8);
              `}
            >
              {currentHex.id >= 0 ? `#${currentHex.id}` : '--'}
            </span>
          </div>

          {currentHex.id >= 0 && (
            <div
              css={css`
                display: flex;
                align-items: center;
                gap: 0.3rem;
                color: rgba(255, 150, 255, 0.6);
                font-size: 0.65rem;
              `}
            >
              <span>({currentHex.q},{currentHex.r})</span>
            </div>
          )}
        </div>

        {/* Location Name */}
        <div
          css={css`
            color: rgba(255, 255, 255, 0.9);
            font-size: 0.75rem;
            text-align: center;
            font-weight: 500;
            letter-spacing: 0.05em;
            text-shadow: 0 0 3px rgba(255, 100, 255, 0.4);
          `}
        >
          {currentHex.name}
        </div>
      </div>
    </div>
  )
}