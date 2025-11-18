#!/bin/bash

# Build and publish script for kx-delayed-replies-infra package
set -e

echo "🚀 Building and publishing @toldyaonce/kx-delayed-replies-infra..."

# Clean previous build
echo "🧹 Cleaning previous build..."
npm run clean

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Bump minor version
echo "📈 Bumping minor version..."
npm version minor

# Build the package
echo "🔨 Building package..."
npm run build

# Verify build output exists
if [ ! -d "lib" ]; then
    echo "❌ Build failed - lib directory not found"
    exit 1
fi

echo "✅ Build verification passed"

# Publish to GitHub Packages
echo "📤 Publishing to GitHub Packages..."
npm publish

echo "🎉 Successfully published @toldyaonce/kx-delayed-replies-infra!"
echo "📋 To install: npm install @toldyaonce/kx-delayed-replies-infra@latest"

