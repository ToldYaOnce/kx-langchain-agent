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
sed -i.bak 's/"@toldyaonce\/langchain-agent-runtime": "workspace:\^"/"@toldyaonce\/langchain-agent-runtime": "^1.0.0"/g' package.json
# Set up scoped registry for our packages
echo "@toldyaonce:registry=https://npm.pkg.github.com" > .npmrc
npm install --no-package-lock
npm run build
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
sed -i.bak 's/"@toldyaonce\/langchain-agent-runtime": "workspace:\^"/"@toldyaonce\/langchain-agent-runtime": "^1.0.0"/g' package.json
# Set up scoped registry for our packages
echo "@toldyaonce:registry=https://npm.pkg.github.com" > .npmrc
npm install --no-package-lock
npm run build
npm publish --registry https://npm.pkg.github.com
# Restore original package.json and clean up
mv package.json.bak package.json
rm -f .npmrc
cd ../..

echo "✅ All packages built and published successfully to GitHub!"
echo ""
echo "📋 Published packages (with new patch versions):"
echo "  - @toldyaonce/langchain-agent-runtime"
echo "  - @toldyaonce/kx-langchain-agent-iac" 
echo "  - @toldyaonce/kx-langchain-agent-cli"
echo ""
echo "🛠️  Install CLI globally:"
echo "     npm install -g @toldyaonce/kx-langchain-agent-cli --registry https://npm.pkg.github.com"
echo ""
echo "💡 Note: All packages were automatically bumped to new patch versions"