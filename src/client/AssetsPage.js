import { useState, useEffect } from 'react'
import { css } from '@firebolt-dev/css'
import { ChevronUpIcon, ChevronDownIcon, ExternalLinkIcon, TrophyIcon, HashIcon, UserIcon, CalendarIcon } from 'lucide-react'

export function AssetsPage() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('rank')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [expandedRows, setExpandedRows] = useState(new Set())

  useEffect(() => {
    fetchAssets()
  }, [sortBy, page])

  const fetchAssets = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/assets?sortBy=${sortBy}&page=${page}&limit=50`)
      if (!response.ok) throw new Error('Failed to fetch assets')
      const data = await response.json()
      setAssets(data.assets || [])
      setTotalPages(data.pagination?.totalPages || 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleRow = (hash) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(hash)) {
      newExpanded.delete(hash)
    } else {
      newExpanded.add(hash)
    }
    setExpandedRows(newExpanded)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getRankIcon = (rank) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    if (rank <= 10) return '🏆'
    return null
  }

  return (
    <div
      className="assets-page"
      css={css`
        min-height: 100vh;
        background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%);
        color: #e0e0e0;
        padding: 2rem;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

        .container {
          max-width: 1400px;
          margin: 0 auto;
        }

        .header {
          text-align: center;
          margin-bottom: 3rem;
          padding: 2rem 0;
          border-bottom: 2px solid rgba(0, 255, 255, 0.3);
        }

        h1 {
          font-size: 3rem;
          font-weight: 700;
          margin-bottom: 1rem;
          background: linear-gradient(135deg, #00ffff, #ff00ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-shadow: 0 0 30px rgba(0, 255, 255, 0.5);
        }

        .subtitle {
          color: rgba(255, 255, 255, 0.6);
          font-size: 1.2rem;
        }

        .controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          border: 1px solid rgba(0, 255, 255, 0.2);
        }

        .sort-controls {
          display: flex;
          gap: 1rem;
          align-items: center;
        }

        .sort-label {
          color: rgba(255, 255, 255, 0.7);
          font-weight: 600;
        }

        .sort-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .sort-btn {
          padding: 0.5rem 1rem;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(0, 255, 255, 0.3);
          color: rgba(0, 255, 255, 0.8);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 0.9rem;
          font-weight: 500;

          &:hover {
            background: rgba(0, 255, 255, 0.1);
            border-color: #00ffff;
            color: #00ffff;
            transform: translateY(-1px);
          }

          &.active {
            background: linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(255, 0, 255, 0.1));
            border-color: #00ffff;
            color: #00ffff;
            box-shadow: 0 0 15px rgba(0, 255, 255, 0.3);
          }
        }

        .stats {
          display: flex;
          gap: 2rem;
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.9rem;
        }

        .stat {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .table-container {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          border: 1px solid rgba(0, 255, 255, 0.2);
          overflow: hidden;
          box-shadow: 0 0 30px rgba(0, 255, 255, 0.1);
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        thead {
          background: rgba(0, 0, 0, 0.5);
          border-bottom: 2px solid rgba(0, 255, 255, 0.3);
        }

        th {
          padding: 1rem;
          text-align: left;
          color: #00ffff;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 0.85rem;
          letter-spacing: 0.05em;
        }

        tbody tr {
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          transition: all 0.3s ease;
          cursor: pointer;

          &:hover {
            background: rgba(0, 255, 255, 0.05);
          }
        }

        td {
          padding: 1rem;
          color: rgba(255, 255, 255, 0.8);
        }

        .rank-cell {
          font-weight: 700;
          font-size: 1.1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .rank-number {
          color: #ff00ff;
          text-shadow: 0 0 10px rgba(255, 0, 255, 0.5);
        }

        .filename-cell {
          font-family: 'Courier New', monospace;
          color: #00ffff;
          word-break: break-all;
        }

        .votes-cell {
          font-weight: 600;
          color: #00ff00;
          text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
        }

        .uploader-cell {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(255, 255, 255, 0.7);
        }

        .size-cell {
          font-family: 'Courier New', monospace;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.6);
        }

        .date-cell {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .expand-icon {
          transition: transform 0.3s ease;
        }

        .expanded .expand-icon {
          transform: rotate(180deg);
        }

        .expanded-content {
          background: rgba(0, 0, 0, 0.3);
          padding: 1.5rem;
          border-top: 1px solid rgba(0, 255, 255, 0.2);
        }

        .expanded-details {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .detail-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 0.05em;
        }

        .detail-value {
          color: #00ffff;
          font-family: 'Courier New', monospace;
          word-break: break-all;
        }

        .view-asset-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(255, 0, 255, 0.1));
          border: 1px solid #00ffff;
          color: #00ffff;
          border-radius: 6px;
          text-decoration: none;
          transition: all 0.3s ease;
          margin-top: 1rem;

          &:hover {
            transform: translateY(-2px);
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.4);
          }
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          margin-top: 2rem;
          padding: 1rem;
        }

        .page-btn {
          padding: 0.5rem 1rem;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(0, 255, 255, 0.3);
          color: rgba(0, 255, 255, 0.8);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.3s ease;

          &:hover:not(:disabled) {
            background: rgba(0, 255, 255, 0.1);
            border-color: #00ffff;
            transform: translateY(-1px);
          }

          &:disabled {
            opacity: 0.3;
            cursor: not-allowed;
          }
        }

        .page-info {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.9rem;
        }

        .loading {
          text-align: center;
          padding: 4rem;
          color: #00ffff;
          font-size: 1.2rem;
        }

        .error {
          text-align: center;
          padding: 4rem;
          color: #ff0066;
          font-size: 1.2rem;
        }

        .empty {
          text-align: center;
          padding: 4rem;
          color: rgba(255, 255, 255, 0.5);
          font-size: 1.1rem;
        }

        .back-link {
          display: inline-block;
          margin-bottom: 2rem;
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%);
          border: 2px solid #00ffff;
          color: #00ffff;
          text-decoration: none;
          font-weight: 600;
          transition: all 0.3s ease;

          &:hover {
            transform: translateY(-2px);
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.4);
          }
        }
      `}
    >
      <div className="container">
        <a href="/" className="back-link">← Back to DegenCity</a>
        
        <div className="header">
          <h1>DegenCity Assets Gallery</h1>
          <p className="subtitle">Community-uploaded assets ranked by DEGEN votes</p>
        </div>

        <div className="controls">
          <div className="sort-controls">
            <span className="sort-label">Sort by:</span>
            <div className="sort-buttons">
              <button 
                className={`sort-btn ${sortBy === 'rank' ? 'active' : ''}`}
                onClick={() => setSortBy('rank')}
              >
                <TrophyIcon size={14} style={{ display: 'inline', marginRight: '4px' }} />
                Rank
              </button>
              <button 
                className={`sort-btn ${sortBy === 'votes' ? 'active' : ''}`}
                onClick={() => setSortBy('votes')}
              >
                Most Votes
              </button>
              <button 
                className={`sort-btn ${sortBy === 'newest' ? 'active' : ''}`}
                onClick={() => setSortBy('newest')}
              >
                Newest
              </button>
              <button 
                className={`sort-btn ${sortBy === 'oldest' ? 'active' : ''}`}
                onClick={() => setSortBy('oldest')}
              >
                Oldest
              </button>
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <HashIcon size={16} />
              <span>{assets.length} assets displayed</span>
            </div>
            <div className="stat">
              <CalendarIcon size={16} />
              <span>Page {page} of {totalPages}</span>
            </div>
          </div>
        </div>

        {loading && (
          <div className="loading">Loading assets...</div>
        )}

        {error && (
          <div className="error">Error: {error}</div>
        )}

        {!loading && !error && assets.length === 0 && (
          <div className="empty">No assets found</div>
        )}

        {!loading && !error && assets.length > 0 && (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>Rank</th>
                    <th>Filename</th>
                    <th style={{ width: '120px' }}>DEGEN Votes</th>
                    <th style={{ width: '180px' }}>Uploader</th>
                    <th style={{ width: '100px' }}>Size</th>
                    <th style={{ width: '150px' }}>Uploaded</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => (
                    <>
                      <tr 
                        key={asset.hash}
                        className={expandedRows.has(asset.hash) ? 'expanded' : ''}
                        onClick={() => toggleRow(asset.hash)}
                      >
                        <td>
                          <div className="rank-cell">
                            {getRankIcon(asset.rank) && <span>{getRankIcon(asset.rank)}</span>}
                            <span className="rank-number">#{asset.rank}</span>
                          </div>
                        </td>
                        <td className="filename-cell">
                          {asset.mimeType === 'application/object' && '🎮 '}
                          {asset.filename}
                        </td>
                        <td className="votes-cell">{asset.totalDegenVotes.toLocaleString()}</td>
                        <td>
                          <div className="uploader-cell">
                            <UserIcon size={14} />
                            <span>{asset.uploaderName || 'Anonymous'}</span>
                          </div>
                        </td>
                        <td className="size-cell">{formatFileSize(asset.fileSize)}</td>
                        <td className="date-cell">{formatDate(asset.createdAt)}</td>
                        <td>
                          <ChevronDownIcon size={16} className="expand-icon" />
                        </td>
                      </tr>
                      {expandedRows.has(asset.hash) && (
                        <tr>
                          <td colSpan="7" style={{ padding: 0 }}>
                            <div className="expanded-content">
                              <div className="expanded-details">
                                <div className="detail-item">
                                  <span className="detail-label">Asset Hash</span>
                                  <span className="detail-value">{asset.hash}</span>
                                </div>
                                <div className="detail-item">
                                  <span className="detail-label">MIME Type</span>
                                  <span className="detail-value">{asset.mimeType}</span>
                                </div>
                                <div className="detail-item">
                                  <span className="detail-label">Uploader ID</span>
                                  <span className="detail-value">{asset.uploaderId}</span>
                                </div>
                                <div className="detail-item">
                                  <span className="detail-label">Last Updated</span>
                                  <span className="detail-value">{formatDate(asset.updatedAt)}</span>
                                </div>
                              </div>
                              {asset.mimeType !== 'application/object' ? (
                                <a 
                                  href={asset.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="view-asset-btn"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View Asset
                                  <ExternalLinkIcon size={14} />
                                </a>
                              ) : (
                                <div className="view-asset-btn" style={{ cursor: 'default', opacity: 0.7 }}>
                                  🎮 In-Game Object
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button 
                className="page-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <span className="page-info">
                Page {page} of {totalPages}
              </span>
              <button 
                className="page-btn"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}