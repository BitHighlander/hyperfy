# DigitalOcean Container Registry Workflow

## Setup Instructions

### Required GitHub Secret

To push Docker images to DigitalOcean Container Registry, you need to configure the following secret:

- **DIGITALOCEAN_TOKEN**: Your DigitalOcean API token with write access to the Container Registry

### Getting a DigitalOcean API Token

1. Log in to your DigitalOcean account
2. Go to API → Tokens/Keys
3. Generate a new token with "Write" scope
4. Copy the token (you won't be able to see it again)

### Creating a DigitalOcean Registry

1. Log in to DigitalOcean
2. Go to Container Registry
3. Create a new registry (if you don't have one)
4. Note your registry name (e.g., "pioneer")

### Adding the Secret to GitHub

1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add:
   - Name: `DIGITALOCEAN_TOKEN`
   - Value: Your DigitalOcean API token

## Workflow Triggers

The workflow runs automatically on:
- Push to branches: `main`, `master`, `dev`, `feature-twitter`, `solana-v2`, `ai`
- Pull requests to `main` or `master`
- Version tags (v*.*.*)
- Manual trigger via GitHub Actions UI

## Docker Image Tags

The workflow creates the following tags:
- `latest` - for the default branch
- `{branch-name}` - for branch builds
- `pr-{number}` - for pull requests
- `{branch}-{sha}` - for specific commits
- Semantic version tags if you use GitHub releases

## Manual Trigger

To manually trigger the workflow:
1. Go to Actions tab in your repository
2. Select "Build and Push to DigitalOcean"
3. Click "Run workflow"
4. Select the branch and run

## Registry URL Format

Your images will be available at:
```
registry.digitalocean.com/{your-registry-name}/degen-city:{tag}
```

## Pulling Images

Once pushed, you can pull images using:
```bash
# Login to DigitalOcean registry
doctl registry login

# Pull the image
docker pull registry.digitalocean.com/{your-registry-name}/degen-city:latest
```

## Troubleshooting

- **No images appearing**: Ensure the `DIGITALOCEAN_TOKEN` secret is set correctly
- **Authentication errors**: Verify your token has write permissions
- **Registry not found**: Make sure you've created a registry in DigitalOcean first