
#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")"

REMOTE="https://github.com/matiasfa98/IDUS.git"

fail() {
    echo
    echo "ERROR: $*"
    exit 1
}

echo "=== IDUS: FRONTEND + BACKEND ==="

[[ -d idus-app/.git ]] || fail "Frontend Git repository missing."
[[ -d idus-api ]] || fail "Backend folder missing."

# Prevent accidentally uploading secrets
if [[ ! -f .gitignore ]]; then
    cat > .gitignore <<'EOF'
.env
.env.*
!.env.example
node_modules/
.expo/
dist/
build/
*.log
EOF
fi

# Add missing ignore rules without overwriting existing ones
for rule in '.env' '.env.*' '!.env.example' 'node_modules/' '.expo/' 'dist/' 'build/' '*.log'; do
    grep -Fxq "$rule" .gitignore || echo "$rule" >> .gitignore
done

# Refuse nested repository initialization: preserve frontend history
if [[ -e .git ]]; then
    fail "Parent already has .git. Review repository layout before proceeding."
fi

# Initialize the parent repository and import the existing frontend history
git init
git branch -M main

git -C idus-app status --short
echo
echo "Checking frontend remote..."

if [[ -n "$(git -C idus-app remote)" ]]; then
    echo "Frontend has an existing remote:"
    git -C idus-app remote -v
    echo
    echo "The frontend already has its own remote."
    echo "This script will not overwrite it automatically."
    fail "Confirm the intended repository structure first."
fi

# Set up the frontend's remote, then preserve its existing history
git -C idus-app remote add origin "$REMOTE"
git -C idus-app branch -M main

echo
echo "IMPORTANT: This script will use one repository for the entire project."
echo "The existing frontend has its own Git history."
echo "We must not push it as a nested repository inside the parent."
echo
echo "Use a deliberate migration to combine histories safely."
echo "No automatic push performed to avoid losing existing commits."
echo
echo "Setup paused safely."
