#!/bin/bash

# LCAgents Git Repository Setup Script
# Sets up internal LendingClub distribution

echo "🏢 Setting up LCAgents for internal LendingClub distribution..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from LCAgents project root directory"
    exit 1
fi

# Check if Node.js project
if ! grep -q "@lendingclub/lcagents" package.json; then
    echo "❌ Error: Not in LCAgents project directory"
    exit 1
fi

echo "📦 Building project..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "🧪 Running tests..."
npm test
if [ $? -ne 0 ]; then
    echo "❌ Tests failed"
    exit 1
fi

echo "📝 Initializing Git repository..."
git init

# Add .gitignore for internal development
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
*.tsbuildinfo

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE
.vscode/settings.json
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log

# Coverage
coverage/
.nyc_output/

# Cache
.cache/
.parcel-cache/

# Temporary files
.tmp/
temp/

# LendingClub specific
.lc-secrets
.internal-config
EOF

echo "📋 Adding files to Git..."
git add .
git commit -m "Initial commit: LCAgents v1.0.0-alpha.1

- Complete Phase 1A Foundation implementation
- NPX CLI with init/uninstall commands  
- TypeScript-based architecture
- Resource resolution system
- Agent loading and validation
- Configuration management
- GitHub integration framework
- Comprehensive testing suite

Ready for internal LendingClub distribution via Git."

echo "🏷️  Creating release tag..."
git tag -a v1.0.0-alpha.1 -m "LCAgents Phase 1A Foundation Release

Features:
- NPX command-line interface
- 11 AI agent definitions ready
- BMAD-Core compatibility layer
- GitHub Copilot integration framework
- Team configuration management
- Internal LendingClub distribution

Installation:
npx git+https://github.lendingclub.com/engineering/lcagents.git init

For LendingClub Engineering Teams Only"

echo "✅ Git repository setup complete!"
echo ""
echo "🔗 Next steps for distribution:"
repositoryConfig=$(jq -r '.' config/repository.json)
repoUrl=$(echo $repositoryConfig | sed -n 's/.*"url": "\(.*\)".*/\1/p')
echo "1. Create repository at: ${repoUrl%.git}"
echo "2. Add remote: git remote add origin ${repoUrl}"
echo "3. Push code: git push -u origin main"
echo "4. Push tags: git push origin --tags"
echo ""
echo "🚀 Then teams can install with:"
echo "   npx git+${repoUrl} init"
