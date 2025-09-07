import { css } from '@firebolt-dev/css'
import { useState, useEffect } from 'react'
import { storage } from '../../core/storage'
import { Ranks } from '../../core/extras/ranks'

export function TwitterLogin({ world }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isTwitterUser, setIsTwitterUser] = useState(false)
  const [isBuilder, setIsBuilder] = useState(false)
  const [upgradingToBuilder, setUpgradingToBuilder] = useState(false)

  useEffect(() => {
    // Check if we have an auth token already
    const authToken = storage.get('authToken')
    setIsAuthenticated(!!authToken)

    // Check URL params for auth callback
    const urlParams = new URLSearchParams(window.location.search)
    const newAuthToken = urlParams.get('authToken')
    const provider = urlParams.get('provider')
    const error = urlParams.get('error')

    if (newAuthToken && provider === 'twitter') {
      // Store the new auth token
      storage.set('authToken', newAuthToken)
      setIsAuthenticated(true)
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
      
      // Reload to connect with the new auth
      window.location.reload()
    }

    if (error) {
      console.error('Authentication error:', error)
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  // Monitor player status
  useEffect(() => {
    if (!world) return

    const checkPlayerStatus = () => {
      const player = world.entities.player
      if (player) {
        setIsTwitterUser(player.data.provider === 'twitter')
        setIsBuilder(player.data.rank >= Ranks.BUILDER)
      }
    }

    // Check initial status
    checkPlayerStatus()

    // Listen for player changes
    world.on('player', checkPlayerStatus)
    
    // Listen for entity modifications (rank changes)
    const onEntityModified = (data) => {
      const player = world.entities.player
      if (player && data.id === player.data.id) {
        checkPlayerStatus()
      }
    }
    world.on('entityModified', onEntityModified)

    return () => {
      world.off('player', checkPlayerStatus)
      world.off('entityModified', onEntityModified)
    }
  }, [world])

  const handleTwitterLogin = () => {
    setLoading(true)
    // Redirect to Twitter OAuth
    window.location.href = '/api/auth/twitter'
  }

  const handleLogout = () => {
    storage.remove('authToken')
    setIsAuthenticated(false)
    window.location.reload()
  }

  const handleBecomeBuilder = async () => {
    setUpgradingToBuilder(true)
    try {
      const response = await fetch('/api/upgrade-to-builder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${storage.get('authToken')}`
        },
        body: JSON.stringify({}) // Add empty body to satisfy content-type
      })
      
      if (response.ok) {
        // The rank will be updated via WebSocket
        console.log('Successfully upgraded to builder!')
      } else {
        console.error('Failed to upgrade to builder')
      }
    } catch (error) {
      console.error('Error upgrading to builder:', error)
    } finally {
      setUpgradingToBuilder(false)
    }
  }

  return (
    <>
      {/* Builder Badge - Bottom Right */}
      {isBuilder && (
        <div
          className='builder-badge'
          css={css`
            position: absolute;
            bottom: 1.5rem;
            right: 1.5rem;
            z-index: 1000;
            pointer-events: auto !important;
          `}
          onPointerDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
        >
          <div
            css={css`
              padding: 0.75rem 1.25rem;
              background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%);
              border: 2px solid;
              border-image: linear-gradient(135deg, #00ffff, #ff00ff, #00ff00) 1;
              position: relative;
              overflow: hidden;
              
              &::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.3), transparent);
                animation: scan 3s linear infinite;
              }
              
              &::after {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(135deg, 
                  rgba(0, 255, 255, 0.1) 0%, 
                  transparent 40%, 
                  transparent 60%, 
                  rgba(255, 0, 255, 0.1) 100%
                );
                pointer-events: none;
              }
              
              @keyframes scan {
                to { left: 100%; }
              }
            `}
          >
            <div
              css={css`
                position: relative;
                z-index: 1;
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
              `}
            >
              <div
                css={css`
                  display: flex;
                  align-items: center;
                  gap: 0.5rem;
                `}
              >
                <span
                  css={css`
                    font-size: 1.25rem;
                    filter: drop-shadow(0 0 4px rgba(0, 255, 255, 0.8));
                  `}
                >
                  ⚡
                </span>
                <span
                  css={css`
                    color: #00ffff;
                    font-weight: 700;
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    text-shadow: 
                      0 0 10px rgba(0, 255, 255, 0.8),
                      0 0 20px rgba(0, 255, 255, 0.4);
                  `}
                >
                  Builder
                </span>
              </div>
              <div
                css={css`
                  color: rgba(255, 255, 255, 0.6);
                  font-size: 0.65rem;
                  text-transform: uppercase;
                  letter-spacing: 0.15em;
                  padding-left: 2rem;
                  font-family: 'Courier New', monospace;
                `}
              >
                Access Granted
              </div>
              <div
                css={css`
                  color: rgba(0, 255, 255, 0.7);
                  font-size: 0.7rem;
                  letter-spacing: 0.05em;
                  padding-left: 2rem;
                  font-family: 'Courier New', monospace;
                  margin-top: 0.25rem;
                  text-shadow: 0 0 5px rgba(0, 255, 255, 0.4);
                `}
              >
                type /create to begin
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Become Builder Button - Bottom Right */}
      {!isBuilder && (
        <div
          className='become-builder-button'
          css={css`
            position: absolute;
            bottom: 1.5rem;
            right: 1.5rem;
            z-index: 1000;
            pointer-events: auto !important;
          `}
          onPointerDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              if (isTwitterUser) {
                // Already authenticated with Twitter, just upgrade rank
                handleBecomeBuilder()
              } else {
                // Not authenticated, redirect to Twitter login
                setLoading(true)
                window.location.href = '/api/auth/twitter'
              }
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
            disabled={loading || upgradingToBuilder}
            css={css`
              padding: 0.75rem 1.5rem;
              background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%);
              border: 2px solid;
              border-image: linear-gradient(135deg, #00ffff, #ff00ff) 1;
              color: #00ffff;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              cursor: pointer;
              transition: all 0.3s ease;
              display: flex;
              align-items: center;
              gap: 0.75rem;
              pointer-events: auto !important;
              position: relative;
              overflow: hidden;
              text-shadow: 0 0 10px rgba(0, 255, 255, 0.8);
              
              &::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.3), transparent);
                animation: scan 3s linear infinite;
              }
              
              &::after {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(135deg, 
                  rgba(0, 255, 255, 0.1) 0%, 
                  transparent 50%, 
                  rgba(255, 0, 255, 0.1) 100%
                );
                pointer-events: none;
              }
              
              @keyframes scan {
                to { left: 100%; }
              }
              
              &:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 
                  0 0 20px rgba(0, 255, 255, 0.6),
                  0 0 40px rgba(0, 255, 255, 0.3),
                  inset 0 0 20px rgba(0, 255, 255, 0.1);
                border-image: linear-gradient(135deg, #00ff00, #00ffff, #ff00ff) 1;
              }
              
              &:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                filter: grayscale(0.5);
              }
              
              &:active:not(:disabled) {
                transform: translateY(0);
              }
            `}
          >
            {loading || upgradingToBuilder ? (
              <>
                <span
                  css={css`
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid rgba(0, 255, 255, 0.3);
                    border-top-color: #00ffff;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                    filter: drop-shadow(0 0 3px rgba(0, 255, 255, 0.8));
                    position: relative;
                    z-index: 1;
                    
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  `}
                />
                <span css={css`position: relative; z-index: 1;`}>
                  {isTwitterUser ? 'Upgrading...' : 'Connecting...'}
                </span>
              </>
            ) : (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  css={css`
                    filter: drop-shadow(0 0 4px rgba(0, 255, 255, 0.8));
                    position: relative;
                    z-index: 1;
                  `}
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span css={css`position: relative; z-index: 1;`}>
                  Become a Builder
                </span>
                <span
                  css={css`
                    font-size: 1.25rem;
                    filter: drop-shadow(0 0 4px rgba(0, 255, 255, 0.8));
                    position: relative;
                    z-index: 1;
                  `}
                >
                  ⚡
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Login Modal - Removed, using direct Twitter login instead */}
      {false && showLogin && (
        <div
          className='login-modal'
          css={css`
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
            
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}
          onClick={() => setShowLogin(false)}
        >
          <div
            className='login-container'
            css={css`
              background: linear-gradient(135deg, #1e1e1e, #2d2d2d);
              border-radius: 1.5rem;
              padding: 3rem;
              min-width: 400px;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
              border: 1px solid rgba(255, 255, 255, 0.1);
              animation: slideUp 0.3s ease;
              
              @keyframes slideUp {
                from { 
                  opacity: 0;
                  transform: translateY(20px);
                }
                to { 
                  opacity: 1;
                  transform: translateY(0);
                }
              }
            `}
            onClick={e => e.stopPropagation()}
          >
            <h2
              css={css`
                color: white;
                margin: 0 0 0.5rem 0;
                font-size: 2rem;
                font-weight: 700;
                text-align: center;
              `}
            >
              Welcome to DegenCity
            </h2>
            <p
              css={css`
                color: rgba(255, 255, 255, 0.7);
                margin: 0 0 2rem 0;
                text-align: center;
                font-size: 1rem;
              `}
            >
              Sign in to enter the virtual world
            </p>

            <button
              onClick={handleTwitterLogin}
              disabled={loading}
              css={css`
                width: 100%;
                padding: 1rem;
                background: linear-gradient(135deg, #1da1f2, #0d8ae8);
                color: white;
                border: none;
                border-radius: 0.75rem;
                font-size: 1.1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.75rem;
                box-shadow: 0 4px 12px rgba(29, 161, 242, 0.3);
                
                &:hover:not(:disabled) {
                  transform: translateY(-2px);
                  box-shadow: 0 6px 20px rgba(29, 161, 242, 0.4);
                }
                
                &:disabled {
                  opacity: 0.7;
                  cursor: not-allowed;
                }
              `}
            >
              {loading ? (
                <>
                  <span
                    css={css`
                      display: inline-block;
                      width: 20px;
                      height: 20px;
                      border: 3px solid rgba(255, 255, 255, 0.3);
                      border-top-color: white;
                      border-radius: 50%;
                      animation: spin 0.8s linear infinite;
                      
                      @keyframes spin {
                        to { transform: rotate(360deg); }
                      }
                    `}
                  />
                  Connecting...
                </>
              ) : (
                <>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Sign in with X (Twitter)
                </>
              )}
            </button>

            <div
              css={css`
                margin-top: 2rem;
                padding-top: 1.5rem;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                text-align: center;
              `}
            >
              <p
                css={css`
                  color: rgba(255, 255, 255, 0.5);
                  font-size: 0.875rem;
                  margin: 0;
                `}
              >
                By signing in, you agree to our Terms of Service
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}