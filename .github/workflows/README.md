# GitHub Actions Docker Workflow

## Setup Instructions

### Required GitHub Secrets

To use the Docker build and push workflow, you need to configure the following secret in your GitHub repository:

1. **DIGITALOCEAN_TOKEN**: Your DigitalOcean API token with write access to the Container Registry

### How to Add the Secret

1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add the following:
   - Name: `DIGITALOCEAN_TOKEN`
   - Value: Your DigitalOcean API token

### Getting a DigitalOcean API Token

1. Log in to your DigitalOcean account
2. Go to API → Tokens/Keys
3. Generate a new token with "Write" scope
4. Copy the token (you won't be able to see it again)

### Workflow Triggers

The workflow runs on:
- Push to `main`, `master`, or `feature-twitter` branches
- Pull requests to `main` or `master`
- Manual trigger via GitHub Actions UI

### Docker Image Tags

The workflow creates the following tags:
- `latest` - for the default branch
- `{branch-name}` - for branch builds
- `pr-{number}` - for pull requests
- `{branch}-{sha}` - for specific commits
- Semantic version tags if you use GitHub releases

### Manual Trigger

You can manually trigger the workflow:
1. Go to Actions tab in your repository
2. Select "Build and Push Docker Image"
3. Click "Run workflow"
4. Select the branch and run