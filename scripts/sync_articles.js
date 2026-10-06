/**
 * Newsroom Synchronizer - Delegates to build-newsroom.js
 */
const { execSync } = require('child_process');
const path = require('path');

console.log('[sync_articles] Synchronizing multilingual newsroom architecture...');
try {
  execSync(`node "${path.join(__dirname, 'build-newsroom.js')}"`, { stdio: 'inherit' });
  console.log('[sync_articles] Newsroom sync completed successfully.');
} catch (err) {
  console.error('[sync_articles] Error syncing newsroom:', err.message);
  process.exit(1);
}
