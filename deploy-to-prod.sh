#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 DegenCity Production Deployment Script"
echo "========================================="
echo ""

# Check if kubectl is configured
if ! kubectl cluster-info &>/dev/null; then
    echo -e "${RED}❌ kubectl is not configured or cluster is not accessible${NC}"
    exit 1
fi

# Get current version from package.json
VERSION=$(node -p "require('./package.json').version" 2>/dev/null)
if [ -z "$VERSION" ]; then
    echo -e "${RED}❌ Could not read version from package.json${NC}"
    exit 1
fi

# Get current git commit
COMMIT=$(git rev-parse --short HEAD 2>/dev/null)
if [ -z "$COMMIT" ]; then
    echo -e "${RED}❌ Could not get git commit hash${NC}"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Define image tag
IMAGE_TAG="v${VERSION}"
IMAGE_NAME="registry.digitalocean.com/pioneer/degencity:${IMAGE_TAG}"
IMAGE_COMMIT="registry.digitalocean.com/pioneer/degencity:${COMMIT}"

echo "Deployment Information:"
echo "  Version: ${VERSION}"
echo "  Commit: ${COMMIT}"
echo "  Image: ${IMAGE_NAME}"
echo ""

# Check if the image exists in the registry
echo "Checking if image exists in registry..."
if ! doctl registry repository list-tags degencity | grep -q "${IMAGE_TAG}"; then
    echo -e "${YELLOW}⚠️  Image ${IMAGE_TAG} not found in registry${NC}"
    echo ""
    echo "Would you like to:"
    echo "1) Build and push the image now"
    echo "2) Use latest tag instead"
    echo "3) Exit"
    read -p "Choice (1/2/3): " -n 1 -r
    echo
    
    case $REPLY in
        1)
            echo "Triggering GitHub Actions workflow..."
            gh workflow run release.yml -f version=${VERSION}
            echo "Workflow triggered. Please wait for it to complete and run this script again."
            exit 0
            ;;
        2)
            IMAGE_NAME="registry.digitalocean.com/pioneer/degencity:latest"
            IMAGE_TAG="latest"
            echo -e "${YELLOW}Using latest tag${NC}"
            ;;
        *)
            exit 1
            ;;
    esac
fi

# Get current deployment info
echo ""
echo "Current Deployment Status:"
CURRENT_IMAGE=$(kubectl get deployment degencity-rsq8833j -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null)
if [ -n "$CURRENT_IMAGE" ]; then
    echo "  Current Image: ${CURRENT_IMAGE}"
    CURRENT_REPLICAS=$(kubectl get deployment degencity-rsq8833j -o jsonpath='{.spec.replicas}' 2>/dev/null)
    echo "  Replicas: ${CURRENT_REPLICAS}"
else
    echo -e "${RED}  Deployment not found${NC}"
fi

# Confirm deployment
echo ""
read -p "Deploy ${IMAGE_TAG} to production? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

# Update the deployment
echo ""
echo "Updating deployment..."
kubectl set image deployment/degencity-rsq8833j degencity=${IMAGE_NAME} --record

# Wait for rollout to complete
echo ""
echo "Waiting for rollout to complete..."
kubectl rollout status deployment/degencity-rsq8833j --timeout=300s

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    
    # Verify the deployment
    echo ""
    echo "Verifying deployment..."
    sleep 5
    
    # Check health endpoint
    HEALTH=$(curl -s https://degencity.ai/health)
    DEPLOYED_VERSION=$(echo "$HEALTH" | jq -r '.version' 2>/dev/null)
    DEPLOYED_COMMIT=$(echo "$HEALTH" | jq -r '.commit' 2>/dev/null)
    
    if [ "$DEPLOYED_VERSION" = "$VERSION" ]; then
        echo -e "${GREEN}✅ Version verified: ${DEPLOYED_VERSION}${NC}"
    else
        echo -e "${YELLOW}⚠️  Version mismatch: expected ${VERSION}, got ${DEPLOYED_VERSION}${NC}"
    fi
    
    if [ "$DEPLOYED_COMMIT" = "$COMMIT" ]; then
        echo -e "${GREEN}✅ Commit verified: ${DEPLOYED_COMMIT}${NC}"
    else
        echo -e "${YELLOW}⚠️  Commit mismatch: expected ${COMMIT}, got ${DEPLOYED_COMMIT}${NC}"
    fi
    
    # Show pod status
    echo ""
    echo "Pod Status:"
    kubectl get pods -l app=degencity
else
    echo -e "${RED}❌ Deployment failed!${NC}"
    echo ""
    echo "Rolling back..."
    kubectl rollout undo deployment/degencity-rsq8833j
    exit 1
fi

echo ""
echo "Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Check https://degencity.ai/health for version info"
echo "2. Monitor logs: kubectl logs -f deployment/degencity-rsq8833j"
echo "3. Check pod status: kubectl get pods -l app=degencity"