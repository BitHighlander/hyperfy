# Deployment and Version Tracking Fixes

## Problem
The production deployment was using unversioned `latest` tags, making it impossible to track what code was actually running. The GitHub Actions workflow was overwriting the `latest` tag on every push to any branch, causing version confusion.

## Solution

### 1. Fixed GitHub Actions Tagging Strategy

**Before (Problematic):**
- Every push to ANY branch tagged as `latest`
- Tags like `20250108-abc123` (date + short SHA)
- No branch-specific tags
- No version tags

**After (Fixed):**
- `latest` tag ONLY for `degencity` or `main` branches
- Branch-specific tags: `feature-twitter`, `degencity`, etc.
- SHA tags with branch prefix: `feature-twitter-abc123`
- Full tags: `feature-twitter-20250108-abc123`
- Version tags when git tags are pushed: `v0.15.1`

### 2. Enhanced Health Endpoint

The `/health` endpoint now returns:
```json
{
  "status": "ok",
  "timestamp": "2025-09-08T21:43:12.074Z",
  "uptime": 371.958,
  "version": "0.15.1",
  "commit": "9a898b1",
  "buildTime": "2025-09-08T21:37:00.620Z",
  "nodeVersion": "v23.6.0",
  "environment": "production",
  "world": "degencity",
  "publicUrl": "https://degencity.ai",
  "memoryUsage": {...},
  "twitterAuthConfigured": true
}
```

### 3. Version Management

- Version is tracked in `package.json`
- Build process passes version as Docker build arg
- Version is available as environment variable in container
- Health endpoint exposes version for verification

### 4. Deployment Scripts

**check-prod-version.sh**: Quick version check
```bash
./check-prod-version.sh
# Shows production vs local version comparison
```

**deploy-to-prod.sh**: Controlled deployment with verification
```bash
./deploy-to-prod.sh
# Interactive deployment with version verification
```

## How Tags Work Now

When you push to `feature-twitter`:
- `registry.digitalocean.com/pioneer/degencity:feature-twitter`
- `registry.digitalocean.com/pioneer/degencity:feature-twitter-abc123`
- `registry.digitalocean.com/pioneer/degencity:feature-twitter-20250108-abc123`

When you push to `degencity` (production):
- `registry.digitalocean.com/pioneer/degencity:latest` ✅
- `registry.digitalocean.com/pioneer/degencity:degencity`
- `registry.digitalocean.com/pioneer/degencity:degencity-abc123`
- `registry.digitalocean.com/pioneer/degencity:degencity-20250108-abc123`

## Deployment Best Practices

1. **Never use `latest` in production deployments** - Use specific tags
2. **Always verify version after deployment** - Check `/health` endpoint
3. **Use branch-specific tags** for different environments
4. **Tag releases with version numbers** for production deployments

## Next Steps

1. Commit and push these changes
2. Let GitHub Actions build with proper tags
3. Deploy specific version to production:
   ```bash
   kubectl set image deployment/degencity-rsq8833j \
     degencity=registry.digitalocean.com/pioneer/degencity:degencity-abc123
   ```
4. Verify deployment:
   ```bash
   curl https://degencity.ai/health | jq .
   ```