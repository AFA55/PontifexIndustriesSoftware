#!/bin/bash
# Husky Pre-commit Hook Setup
# This will automatically check for bugs before every commit

echo "🔧 Setting up Husky pre-commit hooks..."

# Install husky
npm install --save-dev husky

# Initialize husky
npx husky init

# Create pre-commit hook
cat > .husky/pre-commit << 'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🔍 Running pre-commit checks..."

# Run TypeScript type check
echo "📝 Checking TypeScript types..."
npx tsc --noEmit

if [ $? -ne 0 ]; then
  echo "❌ TypeScript check failed. Please fix type errors before committing."
  exit 1
fi

echo "✅ All checks passed!"
EOF

# Make it executable
chmod +x .husky/pre-commit

echo "✅ Husky pre-commit hooks installed!"
echo "Now every commit will automatically check for TypeScript errors."
echo ""
echo "To bypass in emergencies: git commit --no-verify"
