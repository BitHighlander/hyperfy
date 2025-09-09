# S3 Asset Management Scripts Reference

This document provides detailed information about all S3 asset management scripts created for troubleshooting and maintenance.

## Script Overview

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `reset-s3-assets.js` | Complete bucket reset and re-upload | Fresh deployment or major issues |
| `make-assets-public.js` | Fix permissions on all assets | 403 errors on multiple assets |
| `delete-s3-assets.js` | Delete specific assets | Remove problematic individual files |
| `cleanup-bad-assets.js` | Remove all problematic assets | Clean up after upload issues |
| `fix-asset-permissions.js` | Fix single asset permissions | 403 error on specific file |
| `upload-scene-assets.js` | Upload scene-specific assets | Adding new scene content |

## Detailed Script Documentation

### reset-s3-assets.js

**Purpose:** Nuclear option - completely cleans S3 bucket and re-uploads all seed assets with correct paths and permissions.

**Location:** `/scripts/reset-s3-assets.js`

**Usage:**
```bash
node scripts/reset-s3-assets.js
```

**What it does:**
1. Connects to S3 using credentials from `.env`
2. Deletes ALL objects in the assets prefix
3. Re-uploads all seed assets from `src/world/assets/`
4. Uploads both original filenames and hashed versions
5. Sets public-read ACL on all uploads
6. Verifies critical assets are accessible

**Output Example:**
```
🚀 S3 Assets Reset Tool
========================
Endpoint: https://nyc3.digitaloceanspaces.com
Bucket: degencity
Prefix: assets/

🧹 Cleaning S3 bucket...
  Deleted 90 objects
✅ Cleaned 90 objects from bucket

📤 Uploading seed assets...
  Uploading ai.glb to assets/ai.glb
    ✅ Uploaded: ai.glb
    ✅ Hashed copy: 97fc7289a38b5b49357e6fbd74e7e77fc78493dbb1c0dbc850cb8e9db9fd2530.glb
[... more assets ...]

🔍 Verifying critical assets...
  ✅ ai.js is accessible at https://degencity.nyc3.digitaloceanspaces.com/assets/ai.js
  ✅ ai.glb is accessible at https://degencity.nyc3.digitaloceanspaces.com/assets/ai.glb
  
✅ S3 assets reset complete!
```

**When to use:**
- After fresh deployment
- When multiple assets have path/permission issues
- When you need to ensure clean state

### make-assets-public.js

**Purpose:** Sets public-read ACL on all existing assets without re-uploading.

**Location:** `/scripts/make-assets-public.js`

**Usage:**
```bash
node scripts/make-assets-public.js
```

**What it does:**
1. Lists all objects in the S3 bucket
2. Sends PutObjectAclCommand for each object
3. Sets ACL to 'public-read'
4. Reports success/failure for each asset

**Output Example:**
```
Connecting to S3-compatible storage...
Endpoint: https://nyc3.digitaloceanspaces.com
Bucket: degencity
Prefix: assets/

Listing objects...
Found 53 objects

Making objects public...
✓ assets/ai.glb
✓ assets/ai.js
[... more assets ...]

Completed: 53 successful, 0 errors
```

**When to use:**
- When assets exist but return 403 errors
- After uploading assets without proper ACL
- Quick fix without re-uploading

### delete-s3-assets.js

**Purpose:** Deletes specific assets by filename, including double-slash variants.

**Location:** `/scripts/delete-s3-assets.js`

**Usage:**
```bash
node scripts/delete-s3-assets.js <asset1> <asset2> ...

# Example:
node scripts/delete-s3-assets.js 9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js
```

**What it does:**
1. Parses asset filenames from command line
2. Searches for all path variations (with/without double slash)
3. Deletes all matching objects
4. Reports what was deleted

**Output Example:**
```
🗑️  S3 Asset Deletion Tool
========================
Endpoint: https://nyc3.digitaloceanspaces.com
Bucket: degencity
Prefix: assets/
Assets to delete: 2

🔍 Searching for matching assets...
  Found: assets//9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js
  Found: assets/9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js

🗑️  Deleting 2 objects...
✅ Successfully deleted 2 objects

✅ Deletion complete!
```

**When to use:**
- Remove specific problematic assets
- Clean up after failed uploads
- Delete test assets

### cleanup-bad-assets.js

**Purpose:** Automatically identifies and removes all problematic assets while preserving seed assets.

**Location:** `/scripts/cleanup-bad-assets.js`

**Usage:**
```bash
node scripts/cleanup-bad-assets.js
```

**What it does:**
1. Lists all objects in bucket
2. Identifies seed assets to preserve
3. Identifies bad assets (wrong paths, user uploads with issues)
4. Deletes all bad assets in batches
5. Reports analysis and results

**Output Example:**
```
🧹 S3 Bad Asset Cleanup Tool
=============================
Endpoint: https://nyc3.digitaloceanspaces.com
Bucket: degencity
Prefix: assets/

🔍 Listing all assets...
Found 37 total objects
  Bad asset: assets//dbe47170b0e71d586a5fce9cfafc448641e6cd31cead982b5be53d60736aec1f.js
  Bad asset: assets/9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js
[... more bad assets ...]

📊 Analysis:
  Good assets: 18
  Bad assets to delete: 19

🗑️  Deleting bad assets...
  Deleted batch: 19 objects

✅ Cleanup complete! Deleted 19 bad assets
   18 good assets remain
```

**Protected Seed Assets:**
- ai.glb, ai.js
- avatar.vrm
- crash-block.glb
- emote-*.glb (all emote animations)
- mp-*.glb (all movement animations)

**When to use:**
- After identifying upload issues
- Clean up user-uploaded assets with problems
- Preserve core assets while removing problematic ones

### fix-asset-permissions.js

**Purpose:** Fixes permissions for a single specific asset.

**Location:** `/scripts/fix-asset-permissions.js`

**Usage:**
```bash
node scripts/fix-asset-permissions.js <asset-hash>

# Example:
node scripts/fix-asset-permissions.js 9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js
```

**What it does:**
1. Takes asset filename/hash as argument
2. Sends PutObjectAclCommand for that specific key
3. Sets ACL to 'public-read'
4. Tests if asset is accessible
5. Reports success/failure

**Output Example:**
```
🔧 Fixing permissions for asset: 9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js
Bucket: degencity
Prefix: assets/

✅ Fixed permissions for: assets/9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js
✅ Asset is now accessible at: https://degencity.nyc3.digitaloceanspaces.com/assets/9b62e5f11209139a00a0a73b184508aee0aaf479706d450684a5853387cbb94c.js
```

**When to use:**
- Single asset returning 403
- Quick fix for individual file
- Testing permission fixes

### upload-scene-assets.js

**Purpose:** Uploads scene-specific assets with proper permissions.

**Location:** `/scripts/upload-scene-assets.js`

**Usage:**
```bash
node scripts/upload-scene-assets.js
```

**What it does:**
1. Reads scene configuration
2. Uploads scene-specific assets
3. Sets public-read ACL
4. Handles retries for failed uploads

**Note:** This script was updated to include `ACL: 'public-read'` in its PutObjectCommand.

## Environment Requirements

All scripts require these environment variables in `.env`:

```bash
# S3 Configuration (DigitalOcean Spaces)
ASSETS_S3_URI=s3://ACCESS_KEY:SECRET_KEY@nyc3.digitaloceanspaces.com/bucket/prefix
ASSETS_BASE_URL=https://bucket.nyc3.digitaloceanspaces.com/prefix

# Important: No trailing slash on the prefix!
```

## Common Patterns

### Full Reset Pattern
When everything is broken:
```bash
# 1. Clean everything
node scripts/cleanup-bad-assets.js

# 2. Reset seed assets
node scripts/reset-s3-assets.js

# 3. Restart server
npm run build && npm start
```

### Permission Fix Pattern
When assets exist but have permission issues:
```bash
# Fix all assets
node scripts/make-assets-public.js

# Or fix specific asset
node scripts/fix-asset-permissions.js [asset-filename]
```

### Cleanup Pattern
When there are problematic uploads:
```bash
# Remove all bad assets (preserves seed assets)
node scripts/cleanup-bad-assets.js

# Or remove specific assets
node scripts/delete-s3-assets.js [asset1] [asset2]
```

## Script Safety

### Safe Scripts (Non-Destructive)
- `make-assets-public.js` - Only changes permissions
- `fix-asset-permissions.js` - Only changes single asset permission

### Caution Scripts (Selective Deletion)
- `delete-s3-assets.js` - Deletes specific assets only
- `cleanup-bad-assets.js` - Deletes bad assets but preserves seed assets

### Danger Scripts (Full Reset)
- `reset-s3-assets.js` - Deletes EVERYTHING and re-uploads

## Debugging Tips

### Check Script Output
All scripts provide detailed output. Look for:
- Connection confirmation
- Asset counts
- Success/failure for each operation
- Final summary

### Verify Results
After running scripts:
```bash
# Test a seed asset
curl -I https://degencity.nyc3.digitaloceanspaces.com/assets/ai.js

# Should see: HTTP/2 200
```

### Common Issues

**Script fails to connect:**
- Check ASSETS_S3_URI format
- Verify credentials
- Ensure no special characters break the URI

**Assets still 403 after fixing:**
- CDN cache may need time to update
- Try different asset to confirm fix works
- Check if asset path has double slash

**Script deletes wrong assets:**
- cleanup-bad-assets.js has hardcoded seed asset list
- Modify SEED_ASSETS array if you have custom seed assets

## Maintenance

### Adding New Seed Assets
1. Add file to `src/world/assets/`
2. Add filename to SEED_ASSETS array in `cleanup-bad-assets.js`
3. Run `reset-s3-assets.js` to upload

### Updating Scripts
- All scripts use same S3 URI parsing
- Update parseS3Uri function if format changes
- Test with non-production bucket first

## Production Deployment

### Pre-Deployment
```bash
# Test scripts on staging
node scripts/reset-s3-assets.js

# Verify critical assets
curl -I [your-cdn-url]/assets/ai.js
```

### Post-Deployment
```bash
# If assets are private
node scripts/make-assets-public.js

# If paths are wrong
node scripts/cleanup-bad-assets.js
node scripts/reset-s3-assets.js
```

### Monitoring
Watch for these in logs:
- `403 (Forbidden)` - Permission issue
- `assets//` - Double slash issue
- `Unexpected token` - Asset serving wrong content