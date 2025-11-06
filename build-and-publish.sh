#!/bin/bash

set -e

echo "🚀 Building and publishing @toldyaonce LangChain Agent packages to GitHub..."

# Build and publish runtime first (no dependencies)
echo "🔨 Building and publishing runtime package..."
cd packages/runtime
echo "📦 Bumping runtime version..."
npm version patch --no-git-tag-version
npm install --no-package-lock
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

npm publish --registry https://npm.pkg.github.com
cd ../..

# Wait a moment for package to be available
echo "⏳ Waiting for package to be available..."
sleep 10

# Build and publish IaC package
echo "🔨 Building and publishing IaC package..."
cd packages/iac
echo "📦 Bumping IaC version..."
npm version patch --no-git-tag-version || echo "Version already bumped or at latest"
# Replace workspace dependency with actual version
sed -i.bak 's/"@toldyaonce\/kx-langchain-agent-runtime": "workspace:\^"/"@toldyaonce\/kx-langchain-agent-runtime": "^1.0.0"/g' package.json
# Set up scoped registry for our packages
echo "@toldyaonce:registry=https://npm.pkg.github.com" > .npmrc
npm install --no-package-lock
npm run build

# Verify build output
echo "✅ Verifying IaC build output..."
if [ ! -d "lib" ] || [ ! -f "lib/index.js" ] || [ ! -f "lib/index.d.ts" ]; then
    echo "❌ IaC build verification failed - missing expected output files"
    exit 1
fi

npm publish --registry https://npm.pkg.github.com
# Restore original package.json and clean up
mv package.json.bak package.json
rm -f .npmrc
cd ../..

# Build and publish CLI package
echo "🔨 Building and publishing CLI package..."
cd packages/cli
echo "📦 Bumping CLI version..."
npm version patch --no-git-tag-version || echo "Version already bumped or at latest"
# Replace workspace dependency with actual version
sed -i.bak 's/"@toldyaonce\/kx-langchain-agent-runtime": "workspace:\^"/"@toldyaonce\/kx-langchain-agent-runtime": "^1.0.0"/g' package.json
# Set up scoped registry for our packages
echo "@toldyaonce:registry=https://npm.pkg.github.com" > .npmrc
npm install --no-package-lock
npm run build

# Verify build output
echo "✅ Verifying CLI build output..."
if [ ! -d "lib" ] || [ ! -f "lib/index.js" ] || [ ! -f "lib/index.d.ts" ]; then
    echo "❌ CLI build verification failed - missing expected output files"
    exit 1
fi

npm publish --registry https://npm.pkg.github.com
# Restore original package.json and clean up
mv package.json.bak package.json
rm -f .npmrc
cd ../..

# Build and publish agent-core package
echo "🔨 Building and publishing agent-core package..."
cd packages/agent-core
echo "📦 Bumping agent-core version..."
npm version patch --no-git-tag-version || echo "Version already bumped or at latest"
npm install --no-package-lock
npm run build
npm publish --registry https://npm.pkg.github.com
cd ../..

# Wait a moment for package to be available
echo "⏳ Waiting for agent-core package to be available..."
sleep 5

# Build and publish release-router package
echo "🔨 Building and publishing release-router package..."
cd packages/release-router
echo "📦 Bumping release-router version..."
npm version patch --no-git-tag-version || echo "Version already bumped or at latest"
# Replace workspace dependency with actual version
sed -i.bak 's/"@toldyaonce\/kx-agent-core": "workspace:\^"/"@toldyaonce\/kx-agent-core": "^1.0.0"/g' package.json
# Set up scoped registry for our packages
echo "@toldyaonce:registry=https://npm.pkg.github.com" > .npmrc
npm install --no-package-lock
npm run build
npm publish --registry https://npm.pkg.github.com
# Restore original package.json and clean up
mv package.json.bak package.json
rm -f .npmrc
cd ../..

# Wait a moment for package to be available
echo "⏳ Waiting for release-router package to be available..."
sleep 5

# Build and publish infra package (DelayedRepliesStack)
echo "🔨 Building and publishing infra package..."
cd packages/infra
echo "📦 Bumping infra version..."
npm version patch --no-git-tag-version || echo "Version already bumped or at latest"
npm install --no-package-lock
npm run build
npm publish --registry https://npm.pkg.github.com
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