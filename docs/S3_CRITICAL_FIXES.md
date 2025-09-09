# S3 Critical Fixes - MUST APPLY FOR PRODUCTION

## ⚠️ CRITICAL: ACL Permission Fix

**THE MOST IMPORTANT FIX:** Without this, ALL assets will be private and return 403 errors!

### File: `/src/server/AssetsS3.js`

#### Fix 1: Uncomment ACL in uploadBuffer method (Line ~550)

**CURRENT CODE (BROKEN):**
```javascript
async uploadBuffer(buffer, filename) {
  const key = this.getKey(filename)
  
  try {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: this.getContentType(filename),
        // ACL: 'public-read',  // ← THIS IS COMMENTED OUT - ASSETS WILL BE PRIVATE!
      })
    )
  } catch (error) {
    throw new Error(`Failed to upload to S3: ${error.message}`)
  }
}
```

**FIXED CODE:**
```javascript
async uploadBuffer(buffer, filename) {
  const key = this.getKey(filename)
  
  try {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: this.getContentType(filename),
        ACL: 'public-read',  // ← UNCOMMENTED - ASSETS WILL BE PUBLIC!
      })
    )
  } catch (error) {
    throw new Error(`Failed to upload to S3: ${error.message}`)
  }
}
```

#### Fix 2: Add ACL to syncWorldAssets method (Line ~440)

**CURRENT CODE (MISSING ACL):**
```javascript
const command = new PutObjectCommand({
  Bucket: this.bucketName,
  Key: key,
  Body: buffer,
  ContentType: contentTypes[ext] || 'application/octet-stream',
})
```

**FIXED CODE:**
```javascript
const command = new PutObjectCommand({
  Bucket: this.bucketName,
  Key: key,
  Body: buffer,
  ContentType: contentTypes[ext] || 'application/octet-stream',
  ACL: 'public-read',  // ← ADD THIS LINE!
})
```

#### Fix 3: Update getKey method to prevent double slashes (Line ~653)

**CURRENT CODE (CAN CAUSE DOUBLE SLASHES):**
```javascript
getKey(filename) {
  return `${this.prefix}${filename}`
}
```

**FIXED CODE:**
```javascript
getKey(filename) {
  // Handle empty prefix case
  if (!this.prefix || this.prefix === '/') {
    return filename
  }
  // Ensure single slash between prefix and filename
  const cleanPrefix = this.prefix.endsWith('/') ? this.prefix.slice(0, -1) : this.prefix
  return `${cleanPrefix}/${filename}`
}
```

## ⚠️ CRITICAL: Environment Configuration

### File: `.env`

**Remove trailing slash from ASSETS_S3_URI:**

**WRONG:**
```bash
ASSETS_S3_URI=s3://ACCESS_KEY:SECRET@nyc3.digitaloceanspaces.com/bucket/assets/
#                                                                            ^ REMOVE THIS
```

**CORRECT:**
```bash
ASSETS_S3_URI=s3://ACCESS_KEY:SECRET@nyc3.digitaloceanspaces.com/bucket/assets
#                                                                   No trailing slash!
```

## Quick Verification

After applying fixes:

1. **Rebuild and restart:**
```bash
npm run build
npm start
```

2. **Check server logs for correct prefix:**
```
[assets] S3 Configuration: {
  prefix: 'assets/',    # ← Should be single slash, NOT 'assets//'
  ...
}
```

3. **Test asset accessibility:**
```bash
curl -I https://your-bucket.nyc3.digitaloceanspaces.com/assets/ai.js
# Should return HTTP 200, not 403
```

## Production Deployment Checklist

- [ ] Uncomment `ACL: 'public-read'` in uploadBuffer method
- [ ] Add `ACL: 'public-read'` to syncWorldAssets PutObjectCommand
- [ ] Update getKey method to handle slashes properly
- [ ] Remove trailing slash from ASSETS_S3_URI in .env
- [ ] Rebuild application (`npm run build`)
- [ ] Test with a single asset upload
- [ ] Run `make-assets-public.js` for existing assets if needed

## If You Forget These Fixes

**Symptoms you'll see:**
```
ClientLoader.js:106 GET https://bucket.com/assets/[hash].js 403 (Forbidden)
App.js:146 script crashed
App.js:147 SyntaxError: Unexpected token '?'
```

**Quick recovery:**
```bash
# Make all existing assets public
node scripts/make-assets-public.js

# Or complete reset
node scripts/reset-s3-assets.js
```

## Why These Fixes Are Critical

1. **ACL: 'public-read'** - Without this, DigitalOcean Spaces creates PRIVATE objects by default
2. **Trailing slash** - Causes double slashes in URLs, breaking asset loading
3. **getKey method** - Prevents path construction issues

## Remember

**NEVER DEPLOY TO PRODUCTION WITHOUT THESE FIXES!**

The application will appear to work but ALL user uploads and many core features will fail with 403 errors.