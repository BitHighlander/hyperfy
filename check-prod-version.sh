#!/bin/bash

echo "Checking DegenCity Production Version..."
echo "======================================="
echo ""

# Check health endpoint
HEALTH=$(curl -s https://degencity.ai/health)

if [ $? -eq 0 ]; then
    echo "Production Health Check:"
    echo "$HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"
    
    # Extract key information
    VERSION=$(echo "$HEALTH" | jq -r '.version' 2>/dev/null || echo "unknown")
    COMMIT=$(echo "$HEALTH" | jq -r '.commit' 2>/dev/null || echo "unknown")
    BUILD_TIME=$(echo "$HEALTH" | jq -r '.buildTime' 2>/dev/null || echo "unknown")
    TWITTER_AUTH=$(echo "$HEALTH" | jq -r '.twitterAuthConfigured' 2>/dev/null || echo "unknown")
    
    echo ""
    echo "Summary:"
    echo "  Version: $VERSION"
    echo "  Commit: $COMMIT"
    echo "  Build Time: $BUILD_TIME"
    echo "  Twitter Auth Configured: $TWITTER_AUTH"
    
    # Compare with local version
    LOCAL_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
    LOCAL_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    
    echo ""
    echo "Local Version:"
    echo "  Version: $LOCAL_VERSION"
    echo "  Commit: $LOCAL_COMMIT"
    
    echo ""
    if [ "$VERSION" = "$LOCAL_VERSION" ] && [ "$COMMIT" = "$LOCAL_COMMIT" ]; then
        echo "✅ Production is up to date!"
    else
        echo "⚠️  Production version differs from local:"
        if [ "$VERSION" != "$LOCAL_VERSION" ]; then
            echo "   - Version: prod=$VERSION vs local=$LOCAL_VERSION"
        fi
        if [ "$COMMIT" != "$LOCAL_COMMIT" ]; then
            echo "   - Commit: prod=$COMMIT vs local=$LOCAL_COMMIT"
        fi
    fi
else
    echo "❌ Failed to reach production health endpoint"
    echo "   Please check if https://degencity.ai is accessible"
fi

echo ""
echo "To deploy a new version:"
echo "1. Update version in package.json"
echo "2. Commit and push to the degencity branch"
echo "3. GitHub Actions will build and tag the release"
echo "4. Update Kubernetes deployment with new image tag"