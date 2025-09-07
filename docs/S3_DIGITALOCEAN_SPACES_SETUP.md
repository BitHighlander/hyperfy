# S3 / DigitalOcean Spaces Configuration Guide

## Overview

This project supports S3-compatible object storage for asset management, including:
- Amazon S3
- DigitalOcean Spaces
- Cloudflare R2
- Any S3-compatible storage service

The system uses AWS SDK v3 to interact with S3-compatible services, providing a scalable solution for storing game assets like 3D models, textures, audio files, and other media.

## Architecture

### Core Components

1. **AssetsS3.js** (`src/server/AssetsS3.js`)
   - S3 client implementation using AWS SDK v3
   - Handles upload, download, listing, and deletion of assets
   - Supports custom endpoints for S3-compatible services
   - Content-based hashing for deduplication

2. **Asset Manager** (`src/server/assets.js`)
   - Factory pattern selecting between local and S3 storage
   - Configured via `ASSETS` environment variable

3. **Storage Types**
   - **Local**: Files stored on server filesystem
   - **S3**: Files stored in S3-compatible bucket

## Environment Configuration

### Required Environment Variables

```bash
# Asset Storage Configuration
ASSETS=s3                    # Set to 's3' for S3/Spaces, 'local' for filesystem
ASSETS_BASE_URL=https://your-cdn-url.com/assets  # Public URL for asset access
ASSETS_S3_URI=s3://access_key:secret_key@endpoint/bucket/prefix  # S3 connection string
```

### DigitalOcean Spaces Configuration

For DigitalOcean Spaces, you mentioned you've added:
- `DO_SPACES_KEY` - Your Spaces access key
- `DO_SPACES_SECRET` - Your Spaces secret key  
- `DO_SPACES_BUCKET` - Your Spaces bucket name

To use these with the current system, format your `ASSETS_S3_URI` as:

```bash
# DigitalOcean Spaces example (replace with your actual values)
ASSETS_S3_URI=s3://DO_SPACES_KEY:DO_SPACES_SECRET@region.digitaloceanspaces.com/DO_SPACES_BUCKET/assets/

# Example for NYC3 region
ASSETS_S3_URI=s3://YOUR_KEY:YOUR_SECRET@nyc3.digitaloceanspaces.com/your-bucket-name/assets/
```

### URI Format Examples

#### DigitalOcean Spaces
```bash
# Format: s3://access_key:secret_key@region.digitaloceanspaces.com/bucket/prefix
ASSETS_S3_URI=s3://KEY:SECRET@nyc3.digitaloceanspaces.com/my-bucket/assets/
```

#### Amazon S3
```bash
# With explicit region
ASSETS_S3_URI=s3://KEY:SECRET@bucket-name.s3.eu-west-1.amazonaws.com/assets/

# Simple format (defaults to us-east-1)
ASSETS_S3_URI=s3://KEY:SECRET@bucket-name/assets/
```

#### Cloudflare R2
```bash
# Format: s3://access_key:secret_key@account_id.r2.cloudflarestorage.com/bucket/prefix
ASSETS_S3_URI=s3://KEY:SECRET@account123.r2.cloudflarestorage.com/my-bucket/assets/
```

## Setup Guide

### Step 1: Create Your Bucket

#### For DigitalOcean Spaces:

1. Log into DigitalOcean Dashboard
2. Navigate to Spaces
3. Create a new Space:
   - Choose a region (e.g., NYC3, SFO3, etc.)
   - Set a unique name for your Space
   - Configure CDN if desired
   - Set file listing permissions (typically "Private")

4. Generate API Keys:
   - Go to API → Tokens/Keys
   - Generate new Spaces access keys
   - Save the access key and secret key

5. Configure CORS (if needed):
   ```json
   {
     "CORSRules": [{
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3000
     }]
   }
   ```

### Step 2: Configure Environment

Update your `.env` file:

```bash
# Core configuration
ASSETS=s3
ASSETS_BASE_URL=https://your-space.nyc3.cdn.digitaloceanspaces.com/assets
ASSETS_S3_URI=s3://YOUR_DO_SPACES_KEY:YOUR_DO_SPACES_SECRET@nyc3.digitaloceanspaces.com/your-space/assets/

# Optional: Enable cleanup
CLEAN=true  # Removes unused assets on startup
```

### Step 3: Verify Configuration

The system will verify bucket access on startup. Check logs for:
```
[assets] initializing
```

If there are issues, you'll see:
```
Failed to access S3 bucket: [error message]
```

## Asset Management

### Asset Structure

Assets are organized with:
- **Content-based naming**: Files named by SHA256 hash + extension
- **Deduplication**: Same content only stored once
- **Built-in assets**: Core assets from `src/world/assets/` 
- **User uploads**: Assets uploaded through the API

### File Types Supported

The system automatically sets correct MIME types for:

**Images**: jpg, jpeg, png, gif, webp, svg
**Audio**: mp3, wav, ogg
**Video**: mp4, webm
**3D Models**: gltf, glb, obj
**Other**: json, pdf, zip

### Upload Flow

1. File uploaded via API (`POST /api/upload`)
2. File hashed (SHA256) for unique identifier
3. Check if file already exists in bucket
4. If new, upload to S3 with appropriate content type
5. Return asset URL for use in world

### Cleanup Process

When `CLEAN=true`:
1. On startup, system lists all assets in bucket
2. Compares with assets referenced in world data
3. Deletes orphaned assets (not referenced anywhere)
4. Batch deletion for efficiency (up to 1000 at once)

## API Endpoints

### Upload Asset
```http
POST /api/upload
Content-Type: multipart/form-data

file: [binary data]
```

Returns:
```json
{
  "url": "https://your-cdn.com/assets/[hash].[ext]"
}
```

### Asset Access
Assets are served directly from CDN:
```
GET https://your-cdn.com/assets/[hash].[ext]
```

## Performance Considerations

### CDN Configuration

For DigitalOcean Spaces:
1. Enable CDN in Spaces settings
2. Use CDN URL in `ASSETS_BASE_URL`
3. Configure cache headers for optimal performance

### Optimization Tips

1. **Enable CDN**: Reduces latency for global users
2. **Set Cache Headers**: Leverage browser caching
3. **Use Compression**: Enable gzip/brotli on CDN
4. **Batch Operations**: System batches deletions (1000 items max)
5. **Connection Pooling**: AWS SDK handles connection reuse

## Troubleshooting

### Common Issues

#### 1. "Failed to access S3 bucket"
- Verify credentials are correct
- Check bucket exists and region is correct
- Ensure IAM/API permissions include:
  - `s3:GetObject`
  - `s3:PutObject`
  - `s3:DeleteObject`
  - `s3:ListBucket`

#### 2. "Invalid S3 URI format"
- Ensure URI starts with `s3://`
- Check format matches examples above
- Verify no special characters in credentials

#### 3. Assets not loading
- Verify `ASSETS_BASE_URL` is publicly accessible
- Check CORS configuration if cross-origin
- Ensure CDN is properly configured

#### 4. Upload failures
- Check `PUBLIC_MAX_UPLOAD_SIZE` limit
- Verify bucket write permissions
- Check available storage space

### Debug Mode

To debug S3 operations, you can add logging:

```javascript
// In AssetsS3.js constructor
console.log('S3 Config:', {
  bucket: this.bucketName,
  prefix: this.prefix,
  endpoint: config.endpoint,
  region: config.region
})
```

## Migration from Local to S3

### Steps to Migrate

1. **Backup existing assets**:
   ```bash
   cp -r world/assets world/assets.backup
   ```

2. **Configure S3** in `.env`

3. **Start server** - Built-in assets will auto-upload

4. **Manual migration** (if needed):
   ```bash
   # Use AWS CLI or similar
   aws s3 sync world/assets s3://your-bucket/assets/
   ```

5. **Verify** all assets load correctly

6. **Clean up** local files once confirmed

## Security Best Practices

### Access Control

1. **Use IAM Policies**: Limit permissions to minimum required
2. **Private Bucket**: Keep bucket private, serve through CDN
3. **Signed URLs**: For sensitive content (not implemented yet)
4. **Access Logs**: Enable S3 access logging for audit

### Credential Management

1. **Never commit credentials**: Use environment variables
2. **Rotate keys regularly**: Update access keys periodically
3. **Use IAM roles**: When running on cloud infrastructure
4. **Limit key scope**: Create keys specific to this application

### Example IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket/assets/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::your-bucket",
      "Condition": {
        "StringLike": {
          "s3:prefix": "assets/*"
        }
      }
    }
  ]
}
```

## Cost Optimization

### Storage Costs
- Monitor unused assets with cleanup process
- Use lifecycle policies for old assets
- Consider storage classes for infrequently accessed content

### Transfer Costs
- Enable CDN caching to reduce origin requests
- Optimize asset sizes before upload
- Use appropriate compression for file types

### Monitoring
- Set up billing alerts
- Monitor bucket metrics
- Track CDN usage statistics

## Future Enhancements

Potential improvements to the S3 integration:

1. **Signed URL Support**: Generate temporary URLs for private content
2. **Multipart Upload**: For large files (>100MB)
3. **Image Processing**: Automatic thumbnail generation
4. **Versioning**: Track asset versions
5. **Metadata Storage**: Store additional asset metadata
6. **Backup System**: Automated S3 to S3 backup
7. **CloudFront Integration**: Native AWS CloudFront support
8. **Progressive Upload**: Stream large files during upload

## Support

For issues specific to:
- **DigitalOcean Spaces**: Check [DigitalOcean Docs](https://docs.digitalocean.com/products/spaces/)
- **AWS S3**: Refer to [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- **Cloudflare R2**: See [R2 Documentation](https://developers.cloudflare.com/r2/)

For application-specific issues, check the server logs for detailed error messages and ensure all environment variables are correctly configured.