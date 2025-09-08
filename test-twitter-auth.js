#!/usr/bin/env node

// Test Twitter OAuth configuration
import 'dotenv/config'

const clientId = process.env.TWITTER_CLIENT_ID
const clientSecret = process.env.TWITTER_CLIENT_SECRET
const publicUrl = process.env.PUBLIC_URL

console.log('Twitter OAuth Configuration Test')
console.log('================================')
console.log('')

// Check Client ID
if (!clientId) {
  console.log('❌ TWITTER_CLIENT_ID is not set')
} else {
  console.log('✅ TWITTER_CLIENT_ID is set')
  console.log(`   Length: ${clientId.length} characters`)
  console.log(`   Starts with: ${clientId.substring(0, 5)}...`)
  
  // OAuth 2.0 Client IDs are typically 25-30 characters
  if (clientId.length < 20 || clientId.length > 35) {
    console.log('   ⚠️  Warning: Client ID length seems unusual for OAuth 2.0')
    console.log('   (OAuth 2.0 Client IDs are typically 25-30 characters)')
  }
}

console.log('')

// Check Client Secret
if (!clientSecret) {
  console.log('❌ TWITTER_CLIENT_SECRET is not set')
} else {
  console.log('✅ TWITTER_CLIENT_SECRET is set')
  console.log(`   Length: ${clientSecret.length} characters`)
  console.log(`   Starts with: ${clientSecret.substring(0, 5)}...`)
  
  // OAuth 2.0 Client Secrets are typically 50+ characters
  if (clientSecret.length < 40) {
    console.log('   ⚠️  Warning: Client Secret length seems short for OAuth 2.0')
    console.log('   (OAuth 2.0 Client Secrets are typically 50+ characters)')
  }
}

console.log('')

// Check PUBLIC_URL
if (!publicUrl) {
  console.log('❌ PUBLIC_URL is not set')
} else {
  console.log('✅ PUBLIC_URL is set to:', publicUrl)
  const redirectUri = `${publicUrl}/api/auth/callback/twitter`
  console.log('   Redirect URI will be:', redirectUri)
}

console.log('')
console.log('Important Notes:')
console.log('================')
console.log('1. OAuth 2.0 Client ID is NOT the same as API Key')
console.log('2. OAuth 2.0 Client Secret is NOT the same as API Secret')
console.log('3. Make sure these callback URLs are registered in Twitter:')
console.log('   - http://localhost:3000/api/auth/callback/twitter')
console.log('   - http://localhost:4000/api/auth/callback/twitter')
console.log('   - https://degencity.ai/api/auth/callback/twitter')
console.log('')
console.log('To get OAuth 2.0 credentials:')
console.log('1. Go to https://developer.twitter.com/en/portal/dashboard')
console.log('2. Select your app')
console.log('3. Go to "User authentication settings"')
console.log('4. Make sure OAuth 2.0 is enabled')
console.log('5. Copy the Client ID and Client Secret (NOT the API Key/Secret)')