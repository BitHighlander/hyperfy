import crypto from 'crypto'
import { createJWT } from '../core/utils-server'
import { uuid } from '../core/utils'
import moment from 'moment'
import { Ranks } from '../core/extras/ranks'

// OAuth 2.0 configuration for Twitter
const TWITTER_AUTH_URL = 'https://x.com/i/oauth2/authorize'
const TWITTER_TOKEN_URL = 'https://api.x.com/2/oauth2/token'
const TWITTER_USER_URL = 'https://api.x.com/2/users/me'

export class TwitterAuth {
  constructor({ db }) {
    this.db = db
    // Trim any whitespace from environment variables
    this.clientId = process.env.TWITTER_CLIENT_ID?.trim()
    this.clientSecret = process.env.TWITTER_CLIENT_SECRET?.trim()
    const publicUrl = process.env.PUBLIC_URL?.trim()
    this.redirectUri = `${publicUrl}/api/auth/callback/twitter`
    
    console.log('[TwitterAuth] Initialization:')
    console.log('[TwitterAuth] - Redirect URI:', this.redirectUri)
    console.log('[TwitterAuth] - PUBLIC_URL:', publicUrl)
    console.log('[TwitterAuth] - Client ID exists:', !!this.clientId)
    console.log('[TwitterAuth] - Client Secret exists:', !!this.clientSecret)
    console.log('[TwitterAuth] - Client ID length:', this.clientId?.length)
    
    // Validate configuration
    if (!this.clientId || !this.clientSecret) {
      console.error('[TwitterAuth] ERROR: Missing OAuth credentials!')
      console.error('[TwitterAuth] Please set TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET environment variables')
    }
    
    this.states = new Map() // Store state tokens temporarily
  }

  // Generate PKCE challenge
  generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url')
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url')
    return { verifier, challenge }
  }

  // Generate authorization URL
  getAuthorizationUrl() {
    const state = crypto.randomBytes(16).toString('hex')
    const { verifier, challenge } = this.generatePKCE()
    
    // Store state and verifier for later verification
    this.states.set(state, { verifier, createdAt: Date.now() })
    
    // Clean up old states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000
    for (const [key, value] of this.states.entries()) {
      if (value.createdAt < tenMinutesAgo) {
        this.states.delete(key)
      }
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'users.read tweet.read offline.access',
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    })

    return {
      url: `${TWITTER_AUTH_URL}?${params.toString()}`,
      state
    }
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(code, state) {
    const storedState = this.states.get(state)
    if (!storedState) {
      throw new Error('Invalid state parameter')
    }

    const { verifier } = storedState
    this.states.delete(state) // Use once and delete

    console.log('[TwitterAuth] Token exchange - Redirect URI:', this.redirectUri)
    console.log('[TwitterAuth] Token exchange - Code:', code.substring(0, 10) + '...')
    console.log('[TwitterAuth] Client ID exists:', !!this.clientId)
    console.log('[TwitterAuth] Client Secret exists:', !!this.clientSecret)
    
    // Check if credentials are configured
    if (!this.clientId || !this.clientSecret) {
      console.error('[TwitterAuth] Missing Twitter OAuth credentials!')
      console.error('[TwitterAuth] TWITTER_CLIENT_ID is:', this.clientId ? 'set' : 'missing')
      console.error('[TwitterAuth] TWITTER_CLIENT_SECRET is:', this.clientSecret ? 'set' : 'missing')
      throw new Error('Twitter OAuth credentials not configured')
    }
    
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: this.redirectUri,
      code_verifier: verifier,
      client_id: this.clientId
    })

    // Create Basic Auth header with client credentials
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
    
    console.log('[TwitterAuth] Request params:', {
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      client_id: this.clientId.substring(0, 10) + '...',
      code_verifier: verifier.substring(0, 10) + '...'
    })
    
    console.log('[TwitterAuth] Auth header created, credentials length:', credentials.length)
    console.log('[TwitterAuth] Full request body:', params.toString())
    
    const response = await fetch(TWITTER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: params.toString()
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[TwitterAuth] Token exchange failed:', error)
      console.error('[TwitterAuth] Response status:', response.status)
      throw new Error(`Failed to exchange code for token: ${error}`)
    }

    return await response.json()
  }

  // Get user info from Twitter
  async getUserInfo(accessToken) {
    const response = await fetch(`${TWITTER_USER_URL}?user.fields=profile_image_url,name,username,created_at`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to get user info: ${error}`)
    }

    const result = await response.json()
    return result.data
  }

  // Create or update user in database
  async upsertUser(twitterUser) {
    const now = moment().toISOString()
    
    // Check if user exists
    let user = await this.db('users')
      .where('provider', 'twitter')
      .where('providerId', twitterUser.id)
      .first()

    if (user) {
      // Update existing user
      await this.db('users')
        .where('id', user.id)
        .update({
          name: twitterUser.name || twitterUser.username,
          profileImage: twitterUser.profile_image_url,
          lastLogin: now
        })
    } else {
      // Create new user
      const userId = uuid()
      user = {
        id: userId,
        name: twitterUser.name || twitterUser.username,
        provider: 'twitter',
        providerId: twitterUser.id,
        email: twitterUser.email || null,
        profileImage: twitterUser.profile_image_url,
        avatar: null,
        rank: Ranks.VISITOR,
        createdAt: now,
        lastLogin: now
      }
      
      await this.db('users').insert(user)
    }

    return user
  }

  // Complete authentication flow
  async authenticate(code, state) {
    try {
      // Exchange code for token
      const tokenData = await this.exchangeCodeForToken(code, state)
      
      // Get user info
      const twitterUser = await this.getUserInfo(tokenData.access_token)
      
      // Create or update user
      const user = await this.upsertUser(twitterUser)
      
      // Create JWT token
      const authToken = await createJWT({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        rank: user.rank
      })

      return {
        success: true,
        authToken,
        user: {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          profileImage: user.profileImage,
          rank: user.rank
        }
      }
    } catch (error) {
      console.error('Twitter authentication error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }
}