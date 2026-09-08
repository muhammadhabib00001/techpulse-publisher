const fs = require('fs');
const path = require('path');
const hookPath = path.join(__dirname, '..', '.git', 'hooks', 'pre-commit');
const hookContent = `#!/bin/sh
# GenAlphaMagazines pre-commit hook
# 1. If any article was deleted, auto-purge references from homepage, categories, sitemap
# 2. Auto-enforce FAQ card format on staged articles

if ! command -v node >/dev/null 2>&1; then
  exit 0
fi

REPO_DIR="$(git rev-parse --show-toplevel)"
SYNC_SCRIPT="$REPO_DIR/scripts/sync_articles.js"
FAQ_SCRIPT="$REPO_DIR/scripts/enforce_faq_format.js"

# Check for deleted articles
DELETED=$(git diff --cached --name-only --diff-filter=D | grep "^articles/.*\\.html$")
if [ -n "$DELETED" ]; then
  echo "[pre-commit] Detected deleted article(s). Running autonomous sync across all feeds..."
  node "$SYNC_SCRIPT"
  git add -u
fi

# Check for added or modified articles
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep "^articles/.*\\.html$")
if [ -n "$STAGED" ]; then
  echo "[pre-commit] Enforcing FAQ format on staged articles..."
  node "$FAQ_SCRIPT" $STAGED || { echo "[pre-commit] FAQ enforcer failed. Commit aborted."; exit 1; }
  for FILE in $STAGED; do [ -f "$FILE" ] && git add "$FILE"; done
fi

exit 0
`;

try {
  if (fs.existsSync(path.dirname(hookPath))) {
    fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
    console.log('✅ Git pre-commit hook installed successfully.');
  }
} catch (e) {
  console.warn('[WARN] Could not install git hook:', e.message);
}

