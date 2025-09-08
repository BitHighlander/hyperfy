#!/usr/bin/env node

import { S3Client, PutBucketCorsCommand, PutBucketPolicyCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const s3Client = new S3Client({
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  region: 'us-east-1', // DigitalOcean Spaces uses us-east-1 for compatibility
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
  },
})

const BUCKET_NAME = 'degencity'

async function checkAndFixPermissions() {
  console.log('🔍 Checking DigitalOcean Spaces bucket configuration...\n')
  
  // 1. Test basic connectivity
  console.log('1. Testing connectivity to DigitalOcean Spaces...')
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 1,
      Prefix: 'assets/',
    })
    const response = await s3Client.send(listCommand)
    console.log('✅ Successfully connected to bucket')
    console.log(`   Found ${response.KeyCount} objects in assets/ folder\n`)
  } catch (error) {
    console.error('❌ Failed to connect to bucket:', error.message)
    console.log('\n   Please check your DO_SPACES_KEY and DO_SPACES_SECRET in .env')
    process.exit(1)
  }

  // 2. Set bucket policy for public read access
  console.log('2. Setting bucket policy for public read access...')
  const bucketPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'PublicReadGetObject',
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${BUCKET_NAME}/assets/*`],
      },
    ],
  }

  try {
    const policyCommand = new PutBucketPolicyCommand({
      Bucket: BUCKET_NAME,
      Policy: JSON.stringify(bucketPolicy),
    })
    await s3Client.send(policyCommand)
    console.log('✅ Bucket policy updated for public read access\n')
  } catch (error) {
    console.error('⚠️  Failed to update bucket policy:', error.message)
    console.log('   You may need to set this manually in the DigitalOcean Spaces dashboard\n')
  }

  // 3. Set CORS configuration
  console.log('3. Setting CORS configuration...')
  const corsConfiguration = {
    CORSRules: [
      {
        AllowedHeaders: ['*'],
        AllowedMethods: ['GET', 'HEAD'],
        AllowedOrigins: ['*'],
        ExposeHeaders: [],
        MaxAgeSeconds: 3000,
      },
    ],
  }

  try {
    const corsCommand = new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: corsConfiguration,
    })
    await s3Client.send(corsCommand)
    console.log('✅ CORS configuration updated\n')
  } catch (error) {
    console.error('⚠️  Failed to update CORS configuration:', error.message)
    console.log('   You may need to set this manually in the DigitalOcean Spaces dashboard\n')
  }

  // 4. Test public access to a sample asset
  console.log('4. Testing public access to assets...')
  try {
    // List a few assets to test
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 5,
      Prefix: 'assets/',
    })
    const response = await s3Client.send(listCommand)
    
    if (response.Contents && response.Contents.length > 0) {
      console.log('   Sample assets found:')
      for (const obj of response.Contents) {
        const url = `https://${BUCKET_NAME}.nyc3.digitaloceanspaces.com/${obj.Key}`
        console.log(`   - ${url}`)
      }
      
      console.log('\n   Testing public access to first asset...')
      const testUrl = `https://${BUCKET_NAME}.nyc3.digitaloceanspaces.com/${response.Contents[0].Key}`
      
      try {
        const fetchResponse = await fetch(testUrl, { method: 'HEAD' })
        if (fetchResponse.ok) {
          console.log('✅ Public access is working!\n')
        } else {
          console.log(`⚠️  Asset returned status ${fetchResponse.status}`)
          console.log('   Permissions may take a few minutes to propagate\n')
        }
      } catch (error) {
        console.log('⚠️  Could not test public access:', error.message)
      }
    } else {
      console.log('   No assets found in bucket to test\n')
    }
  } catch (error) {
    console.error('❌ Failed to list assets:', error.message)
  }

  // 5. Show manual instructions if needed
  console.log('📝 If permissions are still not working, manually configure in DigitalOcean:')
  console.log('   1. Go to https://cloud.digitalocean.com/spaces')
  console.log('   2. Click on the "degencity" space')
  console.log('   3. Go to Settings → File Listing')
  console.log('   4. Enable "File Listing" for the assets/ folder')
  console.log('   5. Go to Settings → CORS')
  console.log('   6. Add a rule allowing GET from all origins (*)')
  console.log('\n✨ Configuration complete!')
}

// Run the script
checkAndFixPermissions().catch(console.error)