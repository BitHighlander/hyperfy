# S3 Asset Troubleshooting Guide

This document details common S3 asset issues encountered with DigitalOcean Spaces and their solutions.

## Table of Contents
- [Common Issues](#common-issues)
- [Root Causes](#root-causes)
- [Solutions](#solutions)
- [Utility Scripts](#utility-scripts)
- [Prevention](#prevention)
- [Quick Fixes](#quick-fixes)

## Common Issues

### 1. 403 Forbidden Errors
**Symptoms:**
- Browser console shows: `GET https://degencity.nyc3.digitaloceanspaces.com/assets/[hash].js 403 (Forbidden)`
- Assets fail to load in the application
- Script crashes with `SyntaxError: Unexpected token '?'`

**Example:**
```
ClientLoader.js:106 GET https://degencity.nyc3.digitaloceanspaces.com/assets/9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js 403 (Forbidden)
```

### 2. Double Slash in Asset URLs
**Symptoms:**
- Assets uploaded to paths like `assets//filename` instead of `assets/filename`
- Some assets accessible at wrong URL with double slash
- Inconsistent asset paths

**Example:**
```
https://degencity.nyc3.digitaloceanspaces.com/assets//ai.js (works)
https://degencity.nyc3.digitaloceanspaces.com/assets/ai.js (403 error)
```

### 3. Seed Assets Using Wrong Filenames
**Symptoms:**
- Core assets like `ai.js` uploaded with hash names only
- Application looking for `ai.js` but only hash version exists
- Missing original filename versions of seed assets

## Root Causes

### 1. Missing ACL Permissions
The `PutObjectCommand` in `AssetsS3.js` was not setting the `ACL` parameter to `'public-read'`, causing all uploaded assets to be private by default.

**Problematic Code:**
```javascript
const command = new PutObjectCommand({
  Bucket: this.bucketName,
  Key: key,
  Body: buffer,
  ContentType: contentTypes[ext] || 'application/octet-stream',
  // Missing: ACL: 'public-read'
})
```

### 2. Trailing Slash in S3 URI Configuration
The `.env` file contained a trailing slash in the S3 URI path:
```
ASSETS_S3_URI=s3://[credentials]@nyc3.digitaloceanspaces.com/degencity/assets/
```

This caused the prefix to be `assets/`, which when combined with filename construction, created double slashes.

### 3. Incorrect Path Construction
The `getKey()` method wasn't handling the trailing slash properly:
```javascript
getKey(filename) {
  return `${this.prefix}${filename}` // Results in assets//filename
}
```

### 4. Seed Asset Upload Logic
Seed assets were only being uploaded with hashed filenames, not their original names that the application expects.

## Solutions

### 1. Fix ACL Permissions in AssetsS3.js

**Update all `PutObjectCommand` calls to include ACL:**
```javascript
const command = new PutObjectCommand({
  Bucket: this.bucketName,
  Key: key,
  Body: buffer,
  ContentType: this.getContentType(filename),
  ACL: 'public-read', // REQUIRED for public access
  Metadata: {
    // ... metadata
  }
})
```

### 2. Fix S3 URI Configuration

**Remove trailing slash from `.env`:**
```bash
# WRONG:
ASSETS_S3_URI=s3://[credentials]@nyc3.digitaloceanspaces.com/degencity/assets/

# CORRECT:
ASSETS_S3_URI=s3://[credentials]@nyc3.digitaloceanspaces.com/degencity/assets
```

### 3. Fix Path Construction

**Update `getKey()` method in AssetsS3.js:**
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

### 4. Fix Seed Asset Upload

**Update `uploadDirectory()` to upload both original and hashed versions:**
```javascript
async uploadDirectory(localDir, baseDir, subPath = '') {
  // ... file reading logic ...
  
  // Upload with original filename for direct access (e.g., ai.js)
  const originalExists = await this.exists(file)
  if (!originalExists) {
    await this.uploadBuffer(buffer, file, {
      'original-name': file,
      'asset-source': 'seed',
      'asset-category': 'built-in',
      'content-hash': hash
    })
    console.log(`[assets] Uploaded seed asset: ${file}`)
  }
  
  // Also upload with hashed filename for deduplication
  const hashedFilename = `${hash}.${ext}`
  const hashExists = await this.exists(hashedFilename)
  if (!hashExists) {
    await this.uploadBuffer(buffer, hashedFilename, {
      'original-name': file,
      'asset-source': 'seed',
      'asset-category': 'built-in'
    })
    console.log(`[assets] Uploaded hashed asset: ${file} -> ${hashedFilename}`)
  }
}
```

## Utility Scripts

### 1. reset-s3-assets.js
Completely resets S3 bucket and re-uploads seed assets correctly.

**Usage:**
```bash
node scripts/reset-s3-assets.js
```

**Features:**
- Cleans entire bucket
- Re-uploads seed assets with correct names and permissions
- Verifies critical assets are accessible

### 2. make-assets-public.js
Makes all existing S3 assets publicly readable.

**Usage:**
```bash
node scripts/make-assets-public.js
```

**Features:**
- Lists all objects in bucket
- Sets ACL to public-read for each object
- Reports success/failure for each asset

### 3. delete-s3-assets.js
Deletes specific problematic assets by filename.

**Usage:**
```bash
node scripts/delete-s3-assets.js [asset1] [asset2] ...
# Example:
node scripts/delete-s3-assets.js 9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js
```

**Features:**
- Searches for assets with or without double slashes
- Deletes all matching versions
- Reports what was deleted

### 4. cleanup-bad-assets.js
Identifies and removes all incorrectly uploaded assets.

**Usage:**
```bash
node scripts/cleanup-bad-assets.js
```

**Features:**
- Preserves seed assets
- Removes all user-uploaded assets with issues
- Provides detailed analysis before deletion

### 5. fix-asset-permissions.js
Fixes permissions for a specific asset.

**Usage:**
```bash
node scripts/fix-asset-permissions.js [asset-hash]
```

## Prevention

### 1. Environment Configuration Checklist
- [ ] Ensure `ASSETS_S3_URI` has NO trailing slash on the path
- [ ] Verify `ASSETS_BASE_URL` matches your S3 endpoint
- [ ] Check credentials have proper permissions for public ACL

### 2. Code Review Checklist
- [ ] All `PutObjectCommand` calls include `ACL: 'public-read'`
- [ ] Path construction handles trailing slashes properly
- [ ] Seed assets uploaded with both original and hashed names

### 3. Deployment Checklist
- [ ] Run `node scripts/reset-s3-assets.js` after fresh deployment
- [ ] Verify critical assets are accessible before going live
- [ ] Test asset upload functionality with a test file

## Quick Fixes

### If assets are returning 403 errors:

1. **Quick fix for all assets:**
```bash
node scripts/make-assets-public.js
```

2. **Complete reset (nuclear option):**
```bash
node scripts/reset-s3-assets.js
```

3. **Fix specific problematic assets:**
```bash
node scripts/cleanup-bad-assets.js
```

### If you see double slashes in URLs:

1. **Check and fix .env:**
```bash
# Remove trailing slash from ASSETS_S3_URI
grep ASSETS_S3_URI .env
# Edit to remove trailing slash
```

2. **Restart server:**
```bash
npm run build
npm start
```

### If seed assets are missing:

1. **Re-upload seed assets:**
```bash
node scripts/reset-s3-assets.js
```

## Testing

### Verify Asset Accessibility
```bash
# Test a seed asset
curl -I https://degencity.nyc3.digitaloceanspaces.com/assets/ai.js

# Should return HTTP 200, not 403
```

### Check S3 Configuration
Look for this in server startup logs:
```
[assets] S3 Configuration: {
  prefix: 'assets/',  # Should be single slash, not 'assets//'
  ...
}
```

## Important Notes

1. **Always rebuild after code changes:**
```bash
npm run build
npm start
```

2. **ACL is critical:** Without `ACL: 'public-read'`, all assets will be private

3. **Path construction matters:** Double slashes break asset loading

4. **Seed assets need original names:** The app expects `ai.js`, not just the hash

5. **Environment variables are cached:** Restart server after .env changes

## Troubleshooting Flowchart

```
Asset 403 Error?
├─> Check if asset exists with double slash
│   └─> Run cleanup-bad-assets.js
├─> Check if ACL is set correctly
│   └─> Run make-assets-public.js
├─> Check .env for trailing slash
│   └─> Fix and restart server
└─> Nuclear option: reset-s3-assets.js
```

## Contact

If issues persist after following this guide, check:
1. DigitalOcean Spaces permissions and CORS settings
2. CDN cache if using CDN
3. Server logs for upload errors
4. Browser console for detailed error messages