import { useEffect, useState } from 'react'
import { css } from '@firebolt-dev/css'
import { UserIcon, CalendarIcon, HashIcon, BoxIcon, MapPinIcon, XIcon } from 'lucide-react'

export function ObjectStatsDialog({ entity, onClose, world }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!entity) return

    const data = entity.data
    const blueprint = entity.blueprint

    // Format creation date
    const createdAt = data.createdAt ? new Date(data.createdAt).toLocaleString() : 'Unknown'
    
    // Get position as string
    const position = data.position 
      ? `${data.position[0].toFixed(2)}, ${data.position[1].toFixed(2)}, ${data.position[2].toFixed(2)}`
      : 'Unknown'

    setStats({
      id: data.id,
      name: blueprint?.name || 'Unknown Object',
      creatorName: data.creatorName || 'Unknown',
      creatorId: data.creatorId || 'Unknown',
      createdAt: createdAt,
      position: position,
      blueprint: data.blueprint,
      pinned: data.pinned || false,
      type: data.type || 'object',
    })
  }, [entity])

  // Handle ESC key to close dialog
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  if (!entity || !stats) return null

  const handleOverlayClick = (e) => {
    e.stopPropagation()
    onClose()
  }

  const handleDialogClick = (e) => {
    e.stopPropagation()
  }

  const handleCloseClick = (e) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="object-stats-overlay"
        onClick={handleOverlayClick}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        css={css`
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 99999;
          backdrop-filter: blur(2px);
        `}
      />
      
      {/* Dialog */}
      <div
        className="object-stats-dialog"
        onClick={handleDialogClick}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        css={css`
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: linear-gradient(135deg, rgba(10, 10, 10, 0.95), rgba(26, 26, 26, 0.95));
          border: 2px solid rgba(0, 255, 255, 0.5);
          border-radius: 12px;
          padding: 1.5rem;
          min-width: 350px;
          max-width: 500px;
          color: #e0e0e0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 0 30px rgba(0, 255, 255, 0.3);
          z-index: 100000;
          backdrop-filter: blur(10px);

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(0, 255, 255, 0.3);
        }

        .title {
          font-size: 1.5rem;
          font-weight: 700;
          background: linear-gradient(135deg, #00ffff, #ff00ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .close-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;

          &:hover {
            color: #00ffff;
            transform: scale(1.1);
          }
        }

        .stats-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .stat-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          border: 1px solid rgba(0, 255, 255, 0.2);
          transition: all 0.2s ease;

          &:hover {
            background: rgba(0, 255, 255, 0.05);
            border-color: rgba(0, 255, 255, 0.4);
          }
        }

        .stat-icon {
          color: #00ffff;
          flex-shrink: 0;
        }

        .stat-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .stat-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 0.05em;
        }

        .stat-value {
          color: #00ffff;
          font-family: 'Courier New', monospace;
          word-break: break-all;
        }

        .pinned-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          background: linear-gradient(135deg, rgba(255, 0, 255, 0.2), rgba(0, 255, 255, 0.1));
          border: 1px solid #ff00ff;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #ff00ff;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

      `}
      >
        <div className="header">
          <h2 className="title">{stats.name}</h2>
          <button 
            className="close-btn" 
            onClick={handleCloseClick}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <XIcon size={20} />
          </button>
        </div>

        <div className="stats-container">
          <div className="stat-row">
            <UserIcon size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-label">Created By</span>
              <span className="stat-value">{stats.creatorName}</span>
            </div>
          </div>

          <div className="stat-row">
            <CalendarIcon size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-label">Created At</span>
              <span className="stat-value">{stats.createdAt}</span>
            </div>
          </div>

          <div className="stat-row">
            <MapPinIcon size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-label">Position</span>
              <span className="stat-value">{stats.position}</span>
            </div>
          </div>

          <div className="stat-row">
            <HashIcon size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-label">Object ID</span>
              <span className="stat-value">{stats.id.substring(0, 8)}...</span>
            </div>
          </div>

          <div className="stat-row">
            <BoxIcon size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-label">Type</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="stat-value">{stats.type}</span>
                {stats.pinned && <span className="pinned-badge">📌 Pinned</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}