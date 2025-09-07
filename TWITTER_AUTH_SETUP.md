# Twitter (X) SSO Authentication Setup

## Overview
This project now supports Twitter/X OAuth 2.0 authentication for user login. Users can sign in using their Twitter accounts instead of creating local accounts.

## Setup Instructions

### 1. Create a Twitter App

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new app or select an existing one
3. Navigate to your app's settings
4. Under "User authentication settings", click "Set up"
5. Configure the following:
   - **App permissions**: Read
   - **Type of App**: Web App
   - **Callback URI**: `http://localhost:3000/api/auth/callback/twitter` (for development)
   - **Website URL**: Your website URL

### 2. Get Your Credentials

After setting up your app:
1. Go to the "Keys and tokens" section
2. Copy your **Client ID** (not API Key)
3. Copy your **Client Secret** (you may need to regenerate it)

### 3. Configure Environment Variables

1. Copy `.env.example` to `.env` if you haven't already:
   ```bash
   cp .env.example .env
   ```

2. Add your Twitter OAuth credentials to `.env`:
   ```env
   TWITTER_CLIENT_ID=your_twitter_client_id_here
   TWITTER_CLIENT_SECRET=your_twitter_client_secret_here
   PUBLIC_URL=http://localhost:3000
   ```

3. For production, update `PUBLIC_URL` to your actual domain:
   ```env
   PUBLIC_URL=https://yourdomain.com
   ```

### 4. Update Callback URL for Production

When deploying to production:
1. Go back to your Twitter app settings
2. Add your production callback URL: `https://yourdomain.com/api/auth/callback/twitter`
3. Keep the localhost URL for development

## Testing the Integration

### 1. Start the Development Server

```bash
npm run dev
```

### 2. Test the Login Flow

1. Open your browser and navigate to `http://localhost:3000`
2. You should see a "Sign In" button in the top-right corner
3. Click "Sign In" to open the login modal
4. Click "Sign in with X (Twitter)"
5. You'll be redirected to Twitter's authorization page
6. Authorize the app
7. You'll be redirected back and automatically logged in

### 3. Verify User Creation

The authenticated user will be stored in the database with:
- Provider: `twitter`
- Provider ID: Twitter user ID
- Name: Twitter display name
- Profile Image: Twitter profile picture URL
- Last Login: Timestamp of last authentication

### 4. Check Authentication Status

You can verify authentication by:
1. Checking browser storage for `authToken` in localStorage
2. Checking the database `users` table for the new user record
3. Observing that the login button disappears after successful authentication

## Database Schema

The following fields were added to the `users` table:
- `provider` (string): Authentication provider ('twitter' or 'local')
- `providerId` (string): Provider-specific user ID
- `email` (string): User email (if available from provider)
- `profileImage` (string): URL to user's profile image
- `lastLogin` (timestamp): Last login timestamp

## API Endpoints

### GET `/api/auth/twitter`
Initiates the Twitter OAuth flow by redirecting to Twitter's authorization page.

### GET `/api/auth/callback/twitter`
Handles the OAuth callback from Twitter:
- Exchanges authorization code for access token
- Fetches user information from Twitter
- Creates or updates user in database
- Generates JWT token
- Redirects back to the app with authentication token

## Security Considerations

1. **PKCE (Proof Key for Code Exchange)**: The implementation uses PKCE for enhanced security in the OAuth flow
2. **State Parameter**: A unique state parameter is generated and verified to prevent CSRF attacks
3. **JWT Tokens**: User sessions are managed using JWT tokens with configurable expiration
4. **HTTPS**: Always use HTTPS in production to protect tokens in transit

## Troubleshooting

### Common Issues

1. **"Invalid callback URL" error**
   - Ensure the callback URL in your `.env` matches exactly what's configured in Twitter app settings
   - Check that `PUBLIC_URL` is set correctly

2. **"Failed to exchange code for token" error**
   - Verify your Client ID and Client Secret are correct
   - Make sure your app has the correct permissions set

3. **User not staying logged in**
   - Check that JWT_SECRET is set in your `.env`
   - Verify localStorage is not being cleared
   - Check browser console for any errors

4. **Database migration issues**
   - Run the server once to apply the new migration
   - Check the database logs for any migration errors

## Additional Features

### Logout Functionality
Users can logout by:
1. Clearing the `authToken` from localStorage
2. Refreshing the page

### Profile Display
The Twitter profile image is stored and can be displayed in the UI by accessing the `profileImage` field on the player entity.

### Multiple Authentication Providers
The system is designed to support multiple authentication providers. The `provider` field in the database allows distinguishing between different authentication methods.

## Future Enhancements

Potential improvements to consider:
1. Add refresh token support for long-lived sessions
2. Implement account linking (connect Twitter to existing account)
3. Add more OAuth providers (Google, Discord, etc.)
4. Display Twitter profile information in the game UI
5. Add role-based permissions based on Twitter verification status