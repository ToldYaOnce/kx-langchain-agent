#!/bin/bash

set -e

echo "🚀 Building and publishing @toldyaonce LangChain Agent packages to GitHub..."

# Clean ALL package-lock.json and node_modules to ensure fresh installs
echo "🧹 Cleaning all package-lock.json files and node_modules directories..."
find packages -name "package-lock.json" -type f -delete
find packages -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true

# Build and publish runtime first (no dependencies)
echo "🔨 Building and publishing runtime package..."
cd packages/runtime
echo "📦 Bumping runtime version..."
npm version patch --no-git-tag-version
rm -rf node_modules package-lock.json
npm install
npm run build

# Verify build output
echo "✅ Verifying build output..."
if [ ! -d "lib" ] || [ ! -f "lib/index.js" ] || [ ! -f "lib/index.d.ts" ]; then
    echo "❌ Build verification failed - missing expected output files"
    exit 1
fi

# Test that the package can be loaded
node -e "
try {
    const pkg = require('./lib/index.js');
    const exports = Object.keys(pkg);
    console.log('✅ Package exports verified:', exports.length, 'exports found');
    if (exports.length === 0) {
        console.error('❌ No exports found in package');
        process.exit(1);
    }
} catch (error) {
    console.error('❌ Package loading failed:', error.message);
    process.exit(1);
}
"

npm publish
cd ../..

# Wait a moment for package to be available
echo "⏳ Waiting for package to be available..."
sleep 10

# Build and publish IaC package
echo "🔨 Building and publishing IaC package..."
cd packages/iac
echo "📦 Bumping IaC version..."
npm version patch --no-git-tag-version || echo "Version already bumped or at latest"
rm -rf node_modules package-lock.json
# Replace workspace dependency with actual version
sed -i.bak 's/"@toldyaonce\/kx-langchain-agent-runtime": "workspace:\^"/"@toldyaonce\/kx-langchain-agent-runtime": "^1.0.0"/g' package.json
# Registry is handled by publishConfig in package.json
echo "🔄 Refreshing internal dependencies (removing stale packages)..."
npm run refresh:deps || true
npm install
npm run build

# Verify build output
echo "✅ Verifying IaC build output..."
if [ ! -d "dist" ] || [ ! -f "dist/index.js" ] || [ ! -f "dist/index.d.ts" ]; then
    echo "❌ IaC build verification failed - missing expected output files"
    exit 1
fi

npm publish
# Restore original package.json
mv package.json.bak package.json
cd ../..

# Build and publish CLI package
echo "🔨 Building and publishing CLI package..."
cd packages/cli
echo "📦 Bumping CLI version..."
npm version patch --no-git-tag-version || echo "Version already bumped or at latest"
rm -rf node_modules package-lock.json
# Replace workspace dependency with actual version
sed -i.bak 's/"@toldyaonce\/kx-langchain-agent-runtime": "workspace:\^"/"@toldyaonce\/kx-langchain-agent-runtime": "^1.0.0"/g' package.json
# Registry is handled by publishConfig in package.json
echo "🔄 Refreshing internal dependencies (removing stale packages)..."
npm run refresh:deps || true
npm install
npm run build

# Verify build output
echo "✅ Verifying CLI build output..."
if [ ! -d "lib" ] || [ ! -f "lib/index.js" ] || [ ! -f "lib/index.d.ts" ]; then
    echo "❌ CLI build verification failed - missing expected output files"
    exit 1
fi

npm publish
# Restore original package.json
mv package.json.bak package.json
cd ../..

# Build and publish agent-core package
echo "🔨 Building and publishing agent-core package..."
cd packages/agent-core
echo "📦 Bumping agent-core version..."
npm version patch --no-git-tag-version || echo "Version already bumped or at latest"
rm -rf node_modules package-lock.json
npm install
npm run build
npm publish
cd ../..

# Wait a moment for package to be available
echo "⏳ Waiting for agent-core package to be available..."
sleep 5

# Build and publish release-router package
echo "🔨 Building and publishing release-router package..."
cd packages/release-router
echo "📦 Bumping release-router version..."
npm version patch --no-git-tag-version || echo "Version already bumped or at latest"
rm -rf node_modules package-lock.json
# Replace workspace dependency with actual version
sed -i.bak 's/"@toldyaonce\/kx-agent-core": "workspace:\^"/"@toldyaonce\/kx-agent-core": "^1.0.0"/g' package.json
# Registry is handled by publishConfig in package.json
echo "🔄 Refreshing internal dependencies (removing stale packages)..."
npm run refresh:deps || true
npm install
npm run build
npm publish
# Restore original package.json  
mv package.json.bak package.json
cd ../..

# Wait a moment for package to be available
echo "⏳ Waiting for release-router package to be available..."
sleep 5

# Build and publish infra package (DelayedRepliesStack)
echo "🔨 Building and publishing infra package..."
cd packages/infra
echo "📦 Bumping infra version..."
npm version patch --no-git-tag-version || echo "Version already bumped or at latest"
rm -rf node_modules package-lock.json
echo "🔄 Refreshing internal dependencies (removing stale packages)..."
npm run refresh:deps || true
npm install
npm run build
npm publish
cd ../..

echo "✅ All packages built and published successfully to GitHub!"
echo ""
echo "📋 Published packages (with new patch versions):"
echo "  - @toldyaonce/kx-langchain-agent-runtime"
echo "  - @toldyaonce/kx-langchain-agent-iac" 
echo "  - @toldyaonce/kx-langchain-agent-cli"
echo "  - @toldyaonce/kx-agent-core"
echo "  - @toldyaonce/kx-release-router"
echo "  - @toldyaonce/kx-delayed-replies-infra"
echo ""
echo "🛠️  Install CLI globally:"
echo "     npm install -g @toldyaonce/kx-langchain-agent-cli --registry https://npm.pkg.github.com"
echo ""
echo "🚀 Install delayed replies infrastructure:"
echo "     npm install @toldyaonce/kx-delayed-replies-infra --registry https://npm.pkg.github.com"
echo ""
echo "💡 Note: All packages were automatically bumped to new patch versions"