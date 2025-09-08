# Twitter OAuth Production Fix

## The Issue
The error "Missing valid authorization header" indicates that the OAuth 2.0 credentials are not properly configured in production.

## Current Setup Issues

1. **Wrong Credentials**: You have Twitter API v1.1 credentials (`TWITTER_API_KEY`, `TWITTER_API_SECRET`) but need OAuth 2.0 credentials (`TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`)

2. **Environment Variables Needed**:
   - `TWITTER_CLIENT_ID` - OAuth 2.0 Client ID  
   - `TWITTER_CLIENT_SECRET` - OAuth 2.0 Client Secret
   - `PUBLIC_URL` - Must be `https://degencity.ai` in production

## Steps to Fix

### 1. Get OAuth 2.0 Credentials from Twitter Developer Portal

1. Go to https://developer.twitter.com/en/portal/projects-and-apps
2. Select your app
3. Go to "User authentication settings"
4. Make sure OAuth 2.0 is enabled with these settings:
   - Type of App: Web App
   - Callback URLs:
     ```
     http://localhost:3000/api/auth/callback/twitter
     http://localhost:4000/api/auth/callback/twitter  
     https://degencity.ai/api/auth/callback/twitter
     ```
   - Website URL: https://degencity.ai
5. Save and note down:
   - **Client ID** (not API Key)
   - **Client Secret** (not API Secret)

### 2. Update Production Environment Variables

Set these in your production environment:
```bash
TWITTER_CLIENT_ID=your_oauth2_client_id_here
TWITTER_CLIENT_SECRET=your_oauth2_client_secret_here
PUBLIC_URL=https://degencity.ai
```

### 3. Update Local Development .env

```bash
TWITTER_CLIENT_ID=your_oauth2_client_id_here
TWITTER_CLIENT_SECRET=your_oauth2_client_secret_here
PUBLIC_URL=http://localhost:3000
```

## Important Notes

- OAuth 2.0 Client ID/Secret are DIFFERENT from API Key/Secret
- The redirect URI must match EXACTLY (including https vs http)
- Remove the callback URL `https://degencity.ai/auth/callback/twitter` (missing /api) from Twitter settings

## Testing

After updating:
1. Restart the production server
2. Check server logs for these messages:
   - `[TwitterAuth] Redirect URI: https://degencity.ai/api/auth/callback/twitter`
   - `[TwitterAuth] Client ID exists: true`
   - `[TwitterAuth] Client Secret exists: true`

## Local vs Production URLs

Local:
- PUBLIC_URL=http://localhost:3000
- Callback: http://localhost:3000/api/auth/callback/twitter

Production:
- PUBLIC_URL=https://degencity.ai
- Callback: https://degencity.ai/api/auth/callback/twitter