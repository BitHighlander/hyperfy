import 'ses'
import '../core/lockdown'
import './bootstrap'

import fs from 'fs-extra'
import path from 'path'
import Fastify from 'fastify'
import ws from '@fastify/websocket'
import cors from '@fastify/cors'
import compress from '@fastify/compress'
import statics from '@fastify/static'
import multipart from '@fastify/multipart'

import { createServerWorld } from '../core/createServerWorld'
import { getDB } from './db'
import { Storage } from './Storage'
import { assets } from './assets'
import { collections } from './collections'
import { cleaner } from './cleaner'
import { TwitterAuth } from './auth'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const rootDir = path.join(__dirname, '../')
const worldDir = path.join(rootDir, process.env.WORLD)
const port = process.env.PORT

// Get version and build info
let packageInfo = { version: 'unknown' }
try {
  packageInfo = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
} catch (e) {
  console.error('Could not read package.json:', e)
}

// Get git commit hash and build time
let gitCommit = 'unknown'
let buildTime = new Date().toISOString()
try {
  gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
} catch (e) {
  // Not in a git repo or git not available
  gitCommit = process.env.GIT_COMMIT || 'unknown'
}

// Store build metadata
const buildInfo = {
  version: packageInfo.version,
  commit: gitCommit,
  buildTime: buildTime,
  nodeVersion: process.version,
  env: process.env.NODE_ENV || 'development'
}

console.log('[Server] Starting with build info:', buildInfo)

// check envs
if (!process.env.WORLD) {
  throw new Error('[envs] WORLD not set')
}
if (!process.env.PORT) {
  throw new Error('[envs] PORT not set')
}
if (!process.env.JWT_SECRET) {
  throw new Error('[envs] JWT_SECRET not set')
}
if (!process.env.ADMIN_CODE) {
  console.warn('[envs] ADMIN_CODE not set - all users will have admin permissions!')
}
if (!process.env.SAVE_INTERVAL) {
  throw new Error('[envs] SAVE_INTERVAL not set')
}
if (!process.env.PUBLIC_MAX_UPLOAD_SIZE) {
  throw new Error('[envs] PUBLIC_MAX_UPLOAD_SIZE not set')
}
if (!process.env.PUBLIC_WS_URL) {
  throw new Error('[envs] PUBLIC_WS_URL not set')
}
if (!process.env.PUBLIC_WS_URL.startsWith('ws')) {
  throw new Error('[envs] PUBLIC_WS_URL must start with ws:// or wss://')
}
if (!process.env.PUBLIC_API_URL) {
  throw new Error('[envs] PUBLIC_API_URL must be set')
}
if (!process.env.ASSETS) {
  throw new Error(`[envs] ASSETS must be set to 'local' or 's3'`)
}
if (!process.env.ASSETS_BASE_URL) {
  throw new Error(`[envs] ASSETS_BASE_URL must be set`)
}
if (process.env.ASSETS === 's3' && !process.env.ASSETS_S3_URI) {
  throw new Error(`[envs] ASSETS_S3_URI must be set when using ASSETS=s3`)
}

const fastify = Fastify({ logger: { level: 'error' } })

// create world folder if needed
await fs.ensureDir(worldDir)

// init assets BEFORE db (db migrations may need assets)
await assets.init({ rootDir, worldDir, db: null })

// init db
const db = await getDB({ worldDir })

// update assets with db reference
assets.db = db

// init collections
await collections.init({ rootDir, worldDir })

// init cleaner
await cleaner.init({ db })

// init Twitter auth
const twitterAuth = new TwitterAuth({ db })

// init storage
const storage = new Storage(path.join(worldDir, '/storage.json'))

// create world
const world = createServerWorld()
await world.init({
  assetsDir: assets.dir,
  assetsUrl: assets.url,
  db,
  assets,
  storage,
  collections: collections.list,
})

fastify.register(cors)
fastify.register(compress)
fastify.get('/', async (req, reply) => {
  const title = world.settings.title || 'World'
  const desc = world.settings.desc || ''
  const image = world.resolveURL(world.settings.image?.url) || ''
  const url = process.env.ASSETS_BASE_URL
  const filePath = path.join(__dirname, 'public', 'index.html')
  let html = fs.readFileSync(filePath, 'utf-8')
  html = html.replaceAll('{url}', url)
  html = html.replaceAll('{title}', title)
  html = html.replaceAll('{desc}', desc)
  html = html.replaceAll('{image}', image)
  reply.type('text/html').send(html)
})

// Privacy Policy route
fastify.get('/privacy', async (req, reply) => {
  const filePath = path.join(__dirname, 'public', 'privacy.html')
  const html = fs.readFileSync(filePath, 'utf-8')
  reply.type('text/html').send(html)
})

// Terms of Service route
fastify.get('/terms', async (req, reply) => {
  const filePath = path.join(__dirname, 'public', 'terms.html')
  const html = fs.readFileSync(filePath, 'utf-8')
  reply.type('text/html').send(html)
})

// Assets Gallery route
fastify.get('/assets', async (req, reply) => {
  const filePath = path.join(__dirname, 'public', 'assets.html')
  const html = fs.readFileSync(filePath, 'utf-8')
  reply.type('text/html').send(html)
})

// S3 sync endpoint - force sync world assets to S3
fastify.post('/api/sync-s3-assets', async (request, reply) => {
  try {
    // Optional: Add authentication check here
    // const authHeader = request.headers.authorization
    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //   return reply.code(401).send({ error: 'Unauthorized' })
    // }
    
    if (process.env.ASSETS !== 's3') {
      return reply.code(400).send({ error: 'S3 storage is not configured' })
    }
    
    if (!assets.syncWorldAssets) {
      return reply.code(400).send({ error: 'S3 sync not available' })
    }
    
    console.log('[api] Starting S3 assets sync...')
    const rootDir = path.join(__dirname, '../../')
    const { recordHashes } = request.body || {}
    const results = await assets.syncWorldAssets(rootDir, recordHashes)
    
    reply.code(200).send({
      success: true,
      message: 'S3 sync completed',
      results
    })
  } catch (error) {
    console.error('Error syncing S3 assets:', error)
    reply.code(500).send({ error: 'Failed to sync S3 assets', details: error.message })
  }
})

// S3 reset endpoint - clean bucket and re-upload seed assets
fastify.post('/api/reset-s3-assets', async (request, reply) => {
  try {
    // Require admin authentication for this destructive operation
    const adminPassword = process.env.ADMIN_PASSWORD
    if (!adminPassword) {
      return reply.code(500).send({ error: 'Admin password not configured on server' })
    }
    
    const { password } = request.body || {}
    if (!password) {
      return reply.code(401).send({ error: 'Admin password required' })
    }
    
    if (password !== adminPassword) {
      return reply.code(403).send({ error: 'Invalid admin password' })
    }
    
    if (process.env.ASSETS !== 's3') {
      return reply.code(400).send({ error: 'S3 storage is not configured' })
    }
    
    if (!assets.resetAndSync) {
      return reply.code(400).send({ error: 'S3 reset not available' })
    }
    
    console.log('[api] Starting S3 assets reset (admin authenticated)...')
    const rootDir = path.join(__dirname, '../../')
    const results = await assets.resetAndSync(rootDir)
    
    reply.code(200).send({
      success: true,
      message: 'S3 reset and sync completed',
      results
    })
  } catch (error) {
    console.error('Error resetting S3 assets:', error)
    reply.code(500).send({ error: 'Failed to reset S3 assets', details: error.message })
  }
})
fastify.register(statics, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
  decorateReply: false,
  setHeaders: res => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
  },
})
if (world.assetsDir) {
  fastify.register(statics, {
    root: world.assetsDir,
    prefix: '/assets/',
    decorateReply: false,
    setHeaders: res => {
      // all assets are hashed & immutable so we can use aggressive caching
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') // 1 year
      res.setHeader('Expires', new Date(Date.now() + 31536000000).toUTCString()) // older browsers
    },
  })
}
fastify.register(multipart, {
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB
  },
})
fastify.register(ws)
fastify.register(worldNetwork)

const publicEnvs = {}
for (const key in process.env) {
  if (key.startsWith('PUBLIC_')) {
    const value = process.env[key]
    publicEnvs[key] = value
  }
}
const envsCode = `
  if (!globalThis.env) globalThis.env = {}
  globalThis.env = ${JSON.stringify(publicEnvs)}
`
fastify.get('/env.js', async (req, reply) => {
  reply.type('application/javascript').send(envsCode)
})

fastify.post('/api/upload', async (req, reply) => {
  const mp = await req.file()
  // collect into buffer
  const chunks = []
  for await (const chunk of mp.file) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)
  // convert to file
  const file = new File([buffer], mp.filename, {
    type: mp.mimetype || 'application/octet-stream',
  })
  // upload
  await assets.upload(file)
})

fastify.get('/api/upload-check', async (req, reply) => {
  const exists = await assets.exists(req.query.filename)
  return { exists }
})

fastify.get('/health', async (request, reply) => {
  try {
    // Enhanced health check with version info
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: buildInfo.version,
      commit: buildInfo.commit,
      buildTime: buildInfo.buildTime,
      nodeVersion: buildInfo.nodeVersion,
      environment: buildInfo.env,
      world: process.env.WORLD,
      publicUrl: process.env.PUBLIC_URL,
      memoryUsage: process.memoryUsage(),
      twitterAuthConfigured: !!(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET)
    }

    return reply.code(200).send(health)
  } catch (error) {
    console.error('Health check failed:', error)
    return reply.code(503).send({
      status: 'error',
      timestamp: new Date().toISOString(),
      version: buildInfo.version,
      commit: buildInfo.commit
    })
  }
})

fastify.get('/status', async (request, reply) => {
  try {
    const status = {
      uptime: Math.round(world.time),
      protected: process.env.ADMIN_CODE !== undefined ? true : false,
      connectedUsers: [],
      commitHash: process.env.COMMIT_HASH,
    }
    for (const socket of world.network.sockets.values()) {
      status.connectedUsers.push({
        id: socket.player.data.userId,
        position: socket.player.position.value.toArray(),
        name: socket.player.data.name,
      })
    }

    return reply.code(200).send(status)
  } catch (error) {
    console.error('Status failed:', error)
    return reply.code(503).send({
      status: 'error',
      timestamp: new Date().toISOString(),
    })
  }
})

// Twitter OAuth endpoints
fastify.get('/api/auth/twitter', async (request, reply) => {
  try {
    const { url, state } = twitterAuth.getAuthorizationUrl()
    reply.redirect(url)
  } catch (error) {
    console.error('Twitter auth initiation failed:', error)
    reply.code(500).send({ error: 'Failed to initiate Twitter authentication' })
  }
})

fastify.get('/api/auth/callback/twitter', async (request, reply) => {
  try {
    const { code, state } = request.query
    
    if (!code || !state) {
      return reply.redirect('/?error=missing_parameters')
    }

    const result = await twitterAuth.authenticate(code, state)
    
    if (result.success) {
      // Redirect to client with auth token
      const redirectUrl = new URL('/', process.env.PUBLIC_URL)
      redirectUrl.searchParams.set('authToken', result.authToken)
      redirectUrl.searchParams.set('provider', 'twitter')
      reply.redirect(redirectUrl.toString())
    } else {
      reply.redirect(`/?error=${encodeURIComponent(result.error)}`)
    }
  } catch (error) {
    console.error('Twitter callback error:', error)
    reply.redirect('/?error=authentication_failed')
  }
})

// Upgrade to builder endpoint (Twitter users only)
fastify.post('/api/upgrade-to-builder', async (request, reply) => {
  try {
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const token = authHeader.substring(7)
    const { readJWT } = await import('../core/utils-server')
    const { Ranks } = await import('../core/extras/ranks')
    
    const tokenData = await readJWT(token)
    if (!tokenData) {
      return reply.code(401).send({ error: 'Invalid token' })
    }

    const userId = tokenData.id || tokenData.userId
    
    // Check if user exists and is a Twitter user
    const user = await db('users').where('id', userId).first()
    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }

    if (user.provider !== 'twitter') {
      return reply.code(403).send({ error: 'Only Twitter authenticated users can become builders' })
    }

    if (user.rank >= Ranks.BUILDER) {
      return reply.code(200).send({ message: 'User is already a builder', rank: user.rank })
    }

    // Upgrade user to builder rank
    await db('users').where('id', userId).update({ rank: Ranks.BUILDER })

    // Update the player entity in the world if they're connected
    for (const socket of world.network.sockets.values()) {
      if (socket.player.data.id === userId) {
        socket.player.modify({ rank: Ranks.BUILDER })
        world.network.send('entityModified', { id: userId, rank: Ranks.BUILDER })
        break
      }
    }

    reply.code(200).send({ success: true, message: 'Successfully upgraded to builder', rank: Ranks.BUILDER })
  } catch (error) {
    console.error('Error upgrading to builder:', error)
    reply.code(500).send({ error: 'Failed to upgrade to builder' })
  }
})

// Assets API endpoints
fastify.get('/api/assets', async (request, reply) => {
  try {
    const { page = 1, limit = 50, sortBy = 'rank' } = request.query
    
    // If using S3, fetch directly from S3
    if (process.env.ASSETS === 's3' && assets.listAssets) {
      const response = await assets.listAssets({ sortBy, page, limit })
      reply.code(200).send(response)
      return
    }
    
    // Otherwise, use database (for local assets)
    const offset = (page - 1) * limit
    
    // Get assets with metadata from database
    let query = db('assets_metadata')
    
    // Apply sorting
    if (sortBy === 'rank') {
      query = query.orderBy('rank', 'desc').orderBy('totalDegenVotes', 'desc')
    } else if (sortBy === 'votes') {
      query = query.orderBy('totalDegenVotes', 'desc')
    } else if (sortBy === 'newest') {
      query = query.orderBy('createdAt', 'desc')
    } else if (sortBy === 'oldest') {
      query = query.orderBy('createdAt', 'asc')
    }
    
    // Get paginated results
    const assetsData = await query.limit(limit).offset(offset)
    
    // Get total count for pagination
    const countResult = await db('assets_metadata').count('* as total').first()
    const totalCount = countResult.total
    
    // Format response
    const response = {
      assets: assetsData.map(asset => ({
        hash: asset.hash,
        filename: asset.filename,
        url: `${assets.url}/${asset.filename}`,
        uploaderId: asset.uploaderId,
        uploaderName: asset.uploaderName,
        fileSize: asset.fileSize,
        mimeType: asset.mimeType,
        totalDegenVotes: asset.totalDegenVotes,
        rank: asset.rank,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }
    
    reply.code(200).send(response)
  } catch (error) {
    console.error('Error fetching assets:', error)
    reply.code(500).send({ error: 'Failed to fetch assets' })
  }
})

// Vote for an asset endpoint
fastify.post('/api/assets/:hash/vote', async (request, reply) => {
  try {
    const { hash } = request.params
    const { degenVotes = 1 } = request.body
    
    // Get user from auth token
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    
    const token = authHeader.substring(7)
    const { readJWT } = await import('../core/utils-server')
    const tokenData = await readJWT(token)
    if (!tokenData) {
      return reply.code(401).send({ error: 'Invalid token' })
    }
    
    const userId = tokenData.id || tokenData.userId
    
    // Verify user exists and is Twitter authenticated
    const user = await db('users').where('id', userId).first()
    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }
    
    if (user.provider !== 'twitter') {
      return reply.code(403).send({ error: 'Only Twitter authenticated users can vote' })
    }
    
    // Validate degenVotes (1-100)
    const votes = Math.max(1, Math.min(100, parseInt(degenVotes)))
    
    // Check if asset exists
    const asset = await db('assets_metadata').where('hash', hash).first()
    if (!asset) {
      return reply.code(404).send({ error: 'Asset not found' })
    }
    
    const { moment } = await import('moment')
    const now = moment().toISOString()
    
    // Check if user has already voted for this asset
    const existingVote = await db('asset_votes')
      .where('assetHash', hash)
      .where('userId', userId)
      .first()
    
    if (existingVote) {
      // Update existing vote
      const voteDiff = votes - existingVote.degenVotes
      await db('asset_votes')
        .where('id', existingVote.id)
        .update({
          degenVotes: votes,
          updatedAt: now
        })
      
      // Update asset total votes
      await db('assets_metadata')
        .where('hash', hash)
        .update({
          totalDegenVotes: asset.totalDegenVotes + voteDiff,
          updatedAt: now
        })
    } else {
      // Create new vote
      await db('asset_votes').insert({
        assetHash: hash,
        userId: userId,
        degenVotes: votes,
        createdAt: now,
        updatedAt: now
      })
      
      // Update asset total votes
      await db('assets_metadata')
        .where('hash', hash)
        .update({
          totalDegenVotes: asset.totalDegenVotes + votes,
          updatedAt: now
        })
    }
    
    // Update asset rankings
    await updateAssetRankings()
    
    // Get updated asset data
    const updatedAsset = await db('assets_metadata').where('hash', hash).first()
    
    reply.code(200).send({
      success: true,
      message: existingVote ? 'Vote updated' : 'Vote recorded',
      asset: {
        hash: updatedAsset.hash,
        totalDegenVotes: updatedAsset.totalDegenVotes,
        rank: updatedAsset.rank
      }
    })
  } catch (error) {
    console.error('Error voting for asset:', error)
    reply.code(500).send({ error: 'Failed to vote for asset' })
  }
})

// Function to update asset rankings based on total votes
async function updateAssetRankings() {
  const assets = await db('assets_metadata')
    .orderBy('totalDegenVotes', 'desc')
    .orderBy('createdAt', 'asc')
  
  for (let i = 0; i < assets.length; i++) {
    await db('assets_metadata')
      .where('hash', assets[i].hash)
      .update({ rank: i + 1 })
  }
}

// Get user's votes for assets
fastify.get('/api/assets/my-votes', async (request, reply) => {
  try {
    // Get user from auth token
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    
    const token = authHeader.substring(7)
    const { readJWT } = await import('../core/utils-server')
    const tokenData = await readJWT(token)
    if (!tokenData) {
      return reply.code(401).send({ error: 'Invalid token' })
    }
    
    const userId = tokenData.id || tokenData.userId
    
    // Get user's votes
    const votes = await db('asset_votes')
      .where('userId', userId)
      .join('assets_metadata', 'asset_votes.assetHash', 'assets_metadata.hash')
      .select(
        'asset_votes.*',
        'assets_metadata.filename',
        'assets_metadata.uploaderName',
        'assets_metadata.totalDegenVotes',
        'assets_metadata.rank'
      )
      .orderBy('asset_votes.createdAt', 'desc')
    
    reply.code(200).send({ votes })
  } catch (error) {
    console.error('Error fetching user votes:', error)
    reply.code(500).send({ error: 'Failed to fetch user votes' })
  }
})

fastify.setErrorHandler((err, req, reply) => {
  console.error(err)
  reply.status(500).send()
})

try {
  await fastify.listen({ port, host: '0.0.0.0' })
} catch (err) {
  console.error(err)
  console.error(`failed to launch on port ${port}`)
  process.exit(1)
}

async function worldNetwork(fastify) {
  fastify.get('/ws', { websocket: true }, (ws, req) => {
    world.network.onConnection(ws, req.query)
  })
}

console.log(`server listening on port ${port}`)

// Graceful shutdown
process.on('SIGINT', async () => {
  await fastify.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await fastify.close()
  process.exit(0)
})
