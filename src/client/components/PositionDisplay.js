import { css } from '@firebolt-dev/css'
import { useState, useEffect, useRef } from 'react'

export function PositionDisplay({ world }) {
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 })
  const animationFrameRef = useRef()
  const lastPositionRef = useRef({ x: 0, y: 0, z: 0 })

  useEffect(() => {
    if (!world) return

    // Update position on animation frame for smooth updates
    const updatePosition = () => {
      const player = world.entities.player
      if (player) {
        // Try different ways to get position
        let pos = null
        
        // Method 1: Direct transform position
        if (player.transform && player.transform.position) {
          pos = player.transform.position
        }
        // Method 2: Data position
        else if (player.data && player.data.position) {
          pos = player.data.position
        }
        // Method 3: RigidBody position (if physics is involved)
        else if (player.rigidBody && player.rigidBody.translation) {
          const translation = player.rigidBody.translation()
          pos = { x: translation.x, y: translation.y, z: translation.z }
        }
        // Method 4: Mesh position (if using Three.js mesh)
        else if (player.mesh && player.mesh.position) {
          pos = player.mesh.position
        }

        if (pos) {
          const newX = typeof pos.x === 'number' ? pos.x : 0
          const newY = typeof pos.y === 'number' ? pos.y : 0
          const newZ = typeof pos.z === 'number' ? pos.z : 0
          
          // Only update if position actually changed
          if (newX !== lastPositionRef.current.x || 
              newY !== lastPositionRef.current.y || 
              newZ !== lastPositionRef.current.z) {
            lastPositionRef.current = { x: newX, y: newY, z: newZ }
            setPosition({ x: newX, y: newY, z: newZ })
          }
        }
      }
      animationFrameRef.current = requestAnimationFrame(updatePosition)
    }

    // Start the update loop
    updatePosition()

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [world])

  return (
    <div
      className='position-display'
      css={css`
        position: absolute;
        top: 1rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999;
        pointer-events: none;
        background: linear-gradient(135deg, rgba(10, 10, 10, 0.9) 0%, rgba(26, 26, 26, 0.9) 50%, rgba(10, 10, 10, 0.9) 100%);
        border: 1px solid rgba(0, 255, 255, 0.3);
        border-radius: 0.5rem;
        padding: 0.5rem 1rem;
        backdrop-filter: blur(10px);
        box-shadow: 
          0 0 20px rgba(0, 255, 255, 0.2),
          inset 0 0 10px rgba(0, 255, 255, 0.1);
      `}
    >
      <div
        css={css`
          display: flex;
          gap: 1.5rem;
          align-items: center;
          font-family: 'Courier New', monospace;
          font-size: 0.85rem;
          color: #00ffff;
          text-shadow: 0 0 5px rgba(0, 255, 255, 0.6);
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
              color: rgba(255, 255, 255, 0.5);
              font-size: 0.75rem;
            `}
          >
            X:
          </span>
          <span
            css={css`
              font-weight: 600;
              min-width: 60px;
              text-align: right;
            `}
          >
            {position.x.toFixed(2)}
          </span>
        </div>
        
        <div
          css={css`
            display: flex;
            align-items: center;
            gap: 0.4rem;
          `}
        >
          <span
            css={css`
              color: rgba(255, 255, 255, 0.5);
              font-size: 0.75rem;
            `}
          >
            Y:
          </span>
          <span
            css={css`
              font-weight: 600;
              min-width: 60px;
              text-align: right;
            `}
          >
            {position.y.toFixed(2)}
          </span>
        </div>
        
        <div
          css={css`
            display: flex;
            align-items: center;
            gap: 0.4rem;
          `}
        >
          <span
            css={css`
              color: rgba(255, 255, 255, 0.5);
              font-size: 0.75rem;
            `}
          >
            Z:
          </span>
          <span
            css={css`
              font-weight: 600;
              min-width: 60px;
              text-align: right;
            `}
          >
            {position.z.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}