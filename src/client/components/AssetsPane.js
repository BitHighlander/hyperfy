import { css } from '@firebolt-dev/css'
import { useState, useEffect, useRef } from 'react'
import { cls } from './cls'
import { formatBytes } from '../utils'
import { usePane } from './usePane'
import { XIcon } from 'lucide-react'

const styles = css`
  .assets-pane {
    position: absolute;
    top: 20px;
    left: 20px;
    width: 65rem;
    max-width: calc(100vw - 40px);
    max-height: calc(100vh - 40px);
    background-color: rgba(15, 16, 24, 0.95);
    border-radius: 8px;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    height: 85vh;
    overflow: hidden;
  }

  .assets-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    background: rgba(0, 0, 0, 0.4);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    cursor: move;
  }

  .assets-title {
    font-size: 24px;
    font-weight: bold;
    color: white;
  }

  .assets-controls {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .sort-select {
    padding: 5px 10px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: white;
    cursor: pointer;
  }

  .close-button {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: white;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .assets-table-container {
    flex: 1;
    overflow: auto;
    padding: 10px 20px;
  }

  .assets-table {
    width: 100%;
    border-collapse: collapse;
  }

  .assets-table th {
    text-align: left;
    padding: 10px;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 500;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    position: sticky;
    top: 0;
    background: rgba(15, 16, 24, 0.95);
    z-index: 1;
  }

  .assets-table td {
    padding: 10px;
    color: white;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .assets-table tr:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .rank-cell {
    font-weight: bold;
    color: #ffd700;
    text-align: center;
    min-width: 50px;
  }

  .rank-1 { color: #ffd700; }
  .rank-2 { color: #c0c0c0; }
  .rank-3 { color: #cd7f32; }

  .asset-preview {
    width: 50px;
    height: 50px;
    object-fit: cover;
    border-radius: 4px;
    cursor: pointer;
  }

  .asset-preview-placeholder {
    width: 50px;
    height: 50px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
  }

  .asset-filename {
    font-family: monospace;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
    word-break: break-all;
    max-width: 200px;
  }

  .uploader-name {
    color: #00bfff;
  }

  .degen-votes {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .vote-count {
    font-weight: bold;
    color: #00ff00;
  }

  .vote-button {
    padding: 5px 10px;
    background: linear-gradient(135deg, #8b5cf6, #d946ef);
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.2s;
  }

  .vote-button:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
  }

  .vote-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .vote-input {
    width: 60px;
    padding: 5px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: white;
    text-align: center;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    padding: 15px 20px;
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .pagination-button {
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    color: white;
    cursor: pointer;
    transition: background 0.2s;
  }

  .pagination-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }

  .pagination-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .pagination-info {
    color: rgba(255, 255, 255, 0.7);
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: white;
    font-size: 18px;
  }

  .error {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: #ff4444;
    font-size: 18px;
  }

  .login-prompt {
    text-align: center;
    padding: 20px;
    color: rgba(255, 255, 255, 0.8);
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .login-prompt h3 {
    margin-bottom: 10px;
  }
`

export function AssetsPane({ world, close }) {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [sortBy, setSortBy] = useState('rank')
  const [voteInputs, setVoteInputs] = useState({})
  const [voting, setVoting] = useState({})
  const [userVotes, setUserVotes] = useState({})
  
  const paneRef = useRef()
  const headRef = useRef()
  usePane('assets', paneRef, headRef)

  const isAuthenticated = world?.auth?.user?.provider === 'twitter'
  const authToken = world?.auth?.token

  useEffect(() => {
    fetchAssets()
    if (isAuthenticated) {
      fetchUserVotes()
    }
  }, [page, sortBy])

  const fetchAssets = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/assets?page=${page}&limit=50&sortBy=${sortBy}`)
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

  const fetchUserVotes = async () => {
    try {
      const response = await fetch('/api/assets/my-votes', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        const votesMap = {}
        data.votes.forEach(vote => {
          votesMap[vote.assetHash] = vote.degenVotes
        })
        setUserVotes(votesMap)
      }
    } catch (err) {
      console.error('Failed to fetch user votes:', err)
    }
  }

  const handleVote = async (assetHash) => {
    if (!isAuthenticated) {
      alert('Please login with Twitter to vote')
      return
    }

    const votes = parseInt(voteInputs[assetHash] || userVotes[assetHash] || 1)
    if (isNaN(votes) || votes < 1 || votes > 100) {
      alert('Please enter a valid number between 1 and 100')
      return
    }

    setVoting({ ...voting, [assetHash]: true })
    try {
      const response = await fetch(`/api/assets/${assetHash}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ degenVotes: votes })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to vote')
      }

      const result = await response.json()
      
      // Update the asset in the list with new vote count
      setAssets(assets.map(asset => 
        asset.hash === assetHash 
          ? { ...asset, totalDegenVotes: result.asset.totalDegenVotes, rank: result.asset.rank }
          : asset
      ))
      
      // Update user votes
      setUserVotes({ ...userVotes, [assetHash]: votes })
      
      // Clear the input
      setVoteInputs({ ...voteInputs, [assetHash]: '' })
      
      // If sorted by rank or votes, refresh the list
      if (sortBy === 'rank' || sortBy === 'votes') {
        fetchAssets()
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setVoting({ ...voting, [assetHash]: false })
    }
  }

  const handleVoteInputChange = (assetHash, value) => {
    setVoteInputs({ ...voteInputs, [assetHash]: value })
  }

  const getImageUrl = (asset) => {
    // For image types, return the asset URL directly
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
    const ext = asset.filename.split('.').pop().toLowerCase()
    if (imageExtensions.includes(ext)) {
      return asset.url
    }
    // For non-image assets, return null
    return null
  }

  if (loading && assets.length === 0) {
    return (
      <div ref={paneRef} className={cls(styles.assetsPane)}>
        <div ref={headRef} className={cls(styles.assetsHeader)}>
          <h2 className={cls(styles.assetsTitle)}>Assets Gallery</h2>
          <button className={cls(styles.closeButton)} onClick={close}>
            <XIcon size={16} />
          </button>
        </div>
        <div className={cls(styles.loading)}>Loading assets...</div>
      </div>
    )
  }

  if (error && assets.length === 0) {
    return (
      <div ref={paneRef} className={cls(styles.assetsPane)}>
        <div ref={headRef} className={cls(styles.assetsHeader)}>
          <h2 className={cls(styles.assetsTitle)}>Assets Gallery</h2>
          <button className={cls(styles.closeButton)} onClick={close}>
            <XIcon size={16} />
          </button>
        </div>
        <div className={cls(styles.error)}>Error: {error}</div>
      </div>
    )
  }

  return (
    <div ref={paneRef} className={cls(styles.assetsPane)}>
      <div ref={headRef} className={cls(styles.assetsHeader)}>
        <h2 className={cls(styles.assetsTitle)}>Assets Gallery</h2>
        <div className={cls(styles.assetsControls)}>
          <select 
            className={cls(styles.sortSelect)}
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value)
              setPage(1)
            }}
          >
            <option value="rank">Sort by Rank</option>
            <option value="votes">Sort by Votes</option>
            <option value="newest">Sort by Newest</option>
            <option value="oldest">Sort by Oldest</option>
          </select>
          <button className={cls(styles.closeButton)} onClick={close}>
            <XIcon size={16} />
          </button>
        </div>
      </div>

      <div className={cls(styles.assetsTableContainer)}>
        <table className={cls(styles.assetsTable)}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Preview</th>
              <th>Filename</th>
              <th>Owner/Creator</th>
              <th>Size</th>
              <th>DEGEN Votes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const imageUrl = getImageUrl(asset)
              const currentVotes = userVotes[asset.hash] || 0
              const inputValue = voteInputs[asset.hash] !== undefined ? voteInputs[asset.hash] : currentVotes
              
              return (
                <tr key={asset.hash}>
                  <td className={cls(styles.rankCell, asset.rank <= 3 ? styles[`rank-${asset.rank}`] : '')}>
                    #{asset.rank}
                  </td>
                  <td>
                    {imageUrl ? (
                      <img 
                        src={imageUrl} 
                        alt={asset.filename}
                        className={cls(styles.assetPreview)}
                        onClick={() => window.open(asset.url, '_blank')}
                      />
                    ) : (
                      <div className={cls(styles.assetPreviewPlaceholder)}>
                        📄
                      </div>
                    )}
                  </td>
                  <td>
                    <div className={cls(styles.assetFilename)}>{asset.filename}</div>
                  </td>
                  <td>
                    <span className={cls(styles.uploaderName)}>
                      {asset.uploaderName || 'Unknown'}
                    </span>
                  </td>
                  <td>{formatBytes(asset.fileSize)}</td>
                  <td>
                    <div className={cls(styles.degenVotes)}>
                      <span className={cls(styles.voteCount)}>{asset.totalDegenVotes}</span>
                    </div>
                  </td>
                  <td>
                    {isAuthenticated ? (
                      <div className={cls(styles.degenVotes)}>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={inputValue}
                          onChange={(e) => handleVoteInputChange(asset.hash, e.target.value)}
                          className={cls(styles.voteInput)}
                          placeholder="1-100"
                          disabled={voting[asset.hash]}
                        />
                        <button
                          className={cls(styles.voteButton)}
                          onClick={() => handleVote(asset.hash)}
                          disabled={voting[asset.hash]}
                        >
                          {voting[asset.hash] ? '...' : currentVotes > 0 ? 'Update' : 'Vote'}
                        </button>
                      </div>
                    ) : (
                      <button className={cls(styles.voteButton)} disabled>
                        Login to Vote
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={cls(styles.pagination)}>
        <button
          className={cls(styles.paginationButton)}
          onClick={() => setPage(page - 1)}
          disabled={page === 1}
        >
          Previous
        </button>
        <span className={cls(styles.paginationInfo)}>
          Page {page} of {totalPages}
        </span>
        <button
          className={cls(styles.paginationButton)}
          onClick={() => setPage(page + 1)}
          disabled={page === totalPages}
        >
          Next
        </button>
      </div>

      {!isAuthenticated && (
        <div className={cls(styles.loginPrompt)}>
          <h3>Login with Twitter to vote for your favorite assets!</h3>
          <p>Twitter authenticated users can vote with 1-100 DEGEN points per asset.</p>
        </div>
      )}
    </div>
  )
}