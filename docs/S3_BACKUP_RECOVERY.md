# S3 Backup and Recovery System

## Overview

The S3 Backup and Recovery system provides resilience against database loss by automatically backing up all blueprints to S3. This ensures that even if the database is completely lost, the entire world structure can be recovered from S3 backups.

## Architecture

### Storage Structure in S3

```
bucket/
├── assets/                 # Asset files (models, scripts, textures)
│   ├── {hash}.{ext}        # Content-addressed assets
│   └── ...
├── blueprints/             # Blueprint backups
│   ├── json/               # Current blueprint JSON
│   │   ├── {blueprint-id}.json
│   │   └── ...
│   ├── hyp/                # Exported .hyp files
│   │   ├── {blueprint-id}.hyp
│   │   └── ...
│   └── versions/           # Version history
│       ├── {blueprint-id}/
│       │   ├── v0.json
│       │   ├── v1.json
│       │   └── ...
│       └── ...
```

### Key Components

1. **BlueprintS3Backup** (`src/server/BlueprintS3Backup.js`)
   - Handles all blueprint backup operations
   - Exports .hyp files for complete app recovery
   - Manages versioning for rollback capability
   - Provides recovery and sync functionality

2. **Automatic Backup Integration**
   - Integrated into ServerNetwork save cycle
   - Backs up blueprints on every save (default: 60 seconds)
   - Non-blocking async operation

3. **Recovery Scripts**
   - `backup-blueprints.js`: Manual backup all blueprints
   - `recover-from-s3.js`: Restore database from S3
   - `cleanup-orphaned-assets.js`: Remove unused assets

## Features

### 1. Automatic Blueprint Backup

Every time a blueprint is saved to the database, it's automatically backed up to S3:

- **JSON Backup**: Complete blueprint definition
- **.hyp Export**: Portable app format with all assets
- **Versioning**: Historical versions for rollback
- **Metadata Tags**: Asset relationships and tracking

### 2. Database Recovery

When the database is lost, recovery is possible from S3:

```bash
npm run recover:database
```

This will:
1. List all available S3 backups
2. Restore blueprints to database
3. Recreate scene entities
4. Identify orphaned assets
5. Provide recovery report

### 3. Manual Backup

Force a complete backup of all blueprints:

```bash
npm run backup:blueprints
```

### 4. Orphaned Asset Cleanup

Identify and remove assets no longer referenced by blueprints:

```bash
# Dry run - shows what would be deleted
npm run cleanup:assets

# Actually delete orphaned assets
npm run cleanup:assets -- --delete
```

## Usage Scenarios

### Scenario 1: Database Corruption

```bash
# 1. Stop the server
# 2. Backup corrupted database (optional)
mv world/db.sqlite world/db.sqlite.backup

# 3. Recover from S3
npm run recover:database

# 4. Start server
npm run dev
```

### Scenario 2: Migration to New Server

```bash
# On new server:
# 1. Set up environment variables (including S3 credentials)
# 2. Recover database from S3
npm run recover:database

# 3. Start server
npm run dev
```

### Scenario 3: Rollback Blueprint to Previous Version

```javascript
// Using the BlueprintS3Backup API
const backup = new BlueprintS3Backup(s3Client, bucket)
const oldVersion = await backup.restoreBlueprint('blueprint-id', 'v1')
// Save oldVersion to database
```

### Scenario 4: Clean Up Storage

```bash
# 1. Backup everything first
npm run backup:blueprints

# 2. Identify orphaned assets
npm run cleanup:assets

# 3. Delete orphaned assets
npm run cleanup:assets -- --delete
```

## Configuration

### Environment Variables

```env
# S3 Configuration
ASSETS_S3_URI=s3://access_key:secret_key@bucket/assets/
ASSETS_BASE_URL=https://your-cdn.com

# Backup Settings
SAVE_INTERVAL=60  # Seconds between saves/backups
```

### S3 Permissions Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket/*",
        "arn:aws:s3:::your-bucket"
      ]
    }
  ]
}
```

## API Reference

### BlueprintS3Backup Methods

```javascript
// Initialize
const backup = new BlueprintS3Backup(s3Client, bucketName, prefix)
backup.init(db)

// Backup single blueprint
await backup.backupBlueprint(blueprint, saveHyp = true)

// Backup all blueprints
await backup.backupAllBlueprints()

// List backups
const backups = await backup.listBackups()
// Returns: { json: [], hyp: [], versions: {} }

// Restore single blueprint
const blueprint = await backup.restoreBlueprint(blueprintId, version = null)

// Restore all to database
await backup.restoreAllToDatabase()

// Sync database with S3
const report = await backup.syncWithDatabase()

// Delete backup
await backup.deleteBackup(blueprintId)
```

## Best Practices

1. **Regular Backups**: The automatic backup runs every save cycle (default 60s)

2. **Pre-Update Backup**: Before major updates, run manual backup:
   ```bash
   npm run backup:blueprints
   ```

3. **Monitor Orphaned Assets**: Periodically check for orphaned assets:
   ```bash
   npm run cleanup:assets
   ```

4. **Test Recovery**: Periodically test recovery in a staging environment

5. **Version Important Changes**: Blueprint versioning is automatic and helps with rollback

## Troubleshooting

### Backup Failures

If backups are failing silently:
1. Check S3 credentials and permissions
2. Look for errors in server logs
3. Verify S3 bucket exists and is accessible
4. Check available S3 storage quota

### Recovery Issues

If recovery fails:
1. Verify S3 connectivity
2. Check for corrupted backup files
3. Ensure database migrations are up to date
4. Look for specific error messages in recovery output

### Performance Impact

Backups are non-blocking but if performance is impacted:
1. Increase SAVE_INTERVAL
2. Disable .hyp exports (modify code)
3. Use a separate backup schedule

## Security Considerations

1. **S3 Access**: Use IAM roles or secure credential storage
2. **Backup Encryption**: Enable S3 server-side encryption
3. **Access Logs**: Enable S3 access logging for audit trails
4. **Versioning**: S3 versioning provides additional protection
5. **Lifecycle Policies**: Set up S3 lifecycle rules for old backups

## Limitations

1. **Entity State**: Entity states are not backed up (only blueprint references)
2. **User Data**: User accounts need separate backup strategy
3. **Large Assets**: Very large assets may timeout during .hyp export
4. **Real-time Sync**: Backups happen on save cycle, not real-time

## Future Enhancements

Potential improvements to the system:

1. **Incremental Backups**: Only backup changed blueprints
2. **Compressed Storage**: Compress JSON before storage
3. **Point-in-Time Recovery**: Full world state snapshots
4. **Multi-Region Backup**: Replicate to multiple S3 regions
5. **Backup Monitoring**: Dashboard for backup status
6. **Automated Testing**: Regular recovery drills
7. **Entity Backup**: Include entity positions and states
8. **Differential Sync**: Smart sync between database and S3