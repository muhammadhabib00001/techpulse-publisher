const fs = require('fs');
const path = require('path');
const hookPath = path.join(__dirname, '..', '.git', 'hooks', 'pre-commit');
const hookContent = "#!/bin/sh\n# GenAlphaMagazines pre-commit hook\n# Auto-enforces FAQ card format on any staged article HTML before every commit.\necho \"[pre-commit] Enforcing FAQ format on staged articles...\"\n\nif ! command -v node >/dev/null 2>&1; then\n  echo \"[pre-commit] node not found — skipping.\"; exit 0\nfi\n\nSCRIPT=\"$(git rev-parse --show-toplevel)/scripts/enforce_faq_format.js\"\n[ -f \"$SCRIPT\" ] || { echo \"[pre-commit] enforce_faq_format.js missing.\"; exit 0; }\n\nSTAGED=$(git diff --cached --name-only --diff-filter=ACM | grep \"^articles/.*\\.html$\")\n[ -z \"$STAGED\" ] && { echo \"[pre-commit] No article files staged.\"; exit 0; }\n\nnode \"$SCRIPT\" $STAGED || { echo \"[pre-commit] FAQ enforcer failed. Commit aborted.\"; exit 1; }\n\n# Re-stage any files the fixer modified\nfor FILE in $STAGED; do [ -f \"$FILE\" ] && git add \"$FILE\"; done\n\necho \"[pre-commit] Done.\"\nexit 0\n";
try {
  if (fs.existsSync(path.dirname(hookPath))) {
    fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
    console.log('✅ Git pre-commit hook installed successfully.');
  }
} catch (e) {
  console.warn('[WARN] Could not install git hook:', e.message);
}
