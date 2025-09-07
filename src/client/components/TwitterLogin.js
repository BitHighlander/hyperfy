import { css } from '@firebolt-dev/css'
import { useState, useEffect } from 'react'
import { storage } from '../../core/storage'

export function TwitterLogin({ world }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [loading, setLoading] = useState(false)

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

  // Don't show login if already authenticated
  if (isAuthenticated) {
    return null
  }

  return (
    <>
      {/* Login Button */}
      <div
        className='twitter-login-button'
        css={css`
          position: absolute;
          top: 1rem;
          right: 1rem;
          z-index: 1000;
        `}
      >
        {!showLogin && (
          <button
            onClick={() => setShowLogin(true)}
            css={css`
              padding: 0.75rem 1.5rem;
              background: linear-gradient(135deg, #1da1f2, #0d8ae8);
              color: white;
              border: none;
              border-radius: 2rem;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.3s ease;
              box-shadow: 0 4px 12px rgba(29, 161, 242, 0.3);
              
              &:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(29, 161, 242, 0.4);
              }
              
              &:active {
                transform: translateY(0);
              }
            `}
          >
            Sign In
          </button>
        )}
      </div>

      {/* Login Modal */}
      {showLogin && (
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