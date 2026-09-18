/**
 * index_article.js
 * Instant Google Search Indexing via Google Indexing API
 *
 * Supports:
 * - Local service-account.json in project root
 * - Environment variables (INDEXING_CREDENTIALS_JSON or GCP_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS)
 * - Single URL notification (called automatically by publisher.js)
 * - CLI execution: node scripts/index_article.js <url_or_slug>
 * - Batch index all published articles: node scripts/index_article.js --all
 */

const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const ROOT_DIR = path.resolve(__dirname, '..');
const SITE_DOMAIN = 'https://www.genalphamagazines.com';

function getCredentials() {
  // 1. Check local service-account.json
  const localKeyPath = path.join(ROOT_DIR, 'service-account.json');
  if (fs.existsSync(localKeyPath)) {
    try {
      const raw = fs.readFileSync(localKeyPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`[INDEXING API] Could not parse service-account.json: ${e.message}`);
    }
  }

  // 2. Check environment variable INDEXING_CREDENTIALS_JSON
  if (process.env.INDEXING_CREDENTIALS_JSON) {
    try {
      return JSON.parse(process.env.INDEXING_CREDENTIALS_JSON);
    } catch (e) {}
  }

  // 3. Check environment variable GCP_CREDENTIALS_JSON
  if (process.env.GCP_CREDENTIALS_JSON) {
    try {
      return JSON.parse(process.env.GCP_CREDENTIALS_JSON);
    } catch (e) {}
  }

  // 4. Check GOOGLE_APPLICATION_CREDENTIALS file path
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    try {
      return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
    } catch (e) {}
  }

  return null;
}

/**
 * Sends a URL notification to Google Indexing API
 * @param {string} targetUrl - Full URL or slug
 * @param {string} action - 'URL_UPDATED' or 'URL_DELETED'
 * @returns {Promise<boolean>}
 */
async function notifyGoogleIndex(targetUrl, action = 'URL_UPDATED') {
  let url = targetUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const cleanSlug = url.replace(/^\/?articles\//, '').replace(/\.html$/, '').replace(/^\//, '');
    url = `${SITE_DOMAIN}/${cleanSlug}`;
  }

  const credentials = getCredentials();
  if (!credentials) {
    console.log(`[INDEXING API] Skipped for ${url} (No service-account.json or GCP_CREDENTIALS_JSON configured).`);
    return false;
  }

  try {
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/indexing'],
    });

    const client = await auth.getClient();
    const endpoint = 'https://indexing.googleapis.com/v1/urlNotifications:publish';

    const res = await client.request({
      url: endpoint,
      method: 'POST',
      data: {
        url,
        type: action,
      },
    });

    if (res.status === 200 || res.status === 201) {
      console.log(`[INDEXING API] Successfully pushed to Google: ${url} (${action})`);
      return true;
    } else {
      console.warn(`[INDEXING API] Unexpected status ${res.status}:`, res.data);
      return false;
    }
  } catch (err) {
    // Graceful error logging
    if (err.response && err.response.data && err.response.data.error) {
      const gError = err.response.data.error;
      console.error(`[INDEXING API ERROR] Google returned ${gError.code}: ${gError.message}`);
      if (gError.code === 403) {
        console.error(`[INDEXING API HINT] Make sure the Service Account email is added as an OWNER in Google Search Console!`);
      }
    } else {
      console.error(`[INDEXING API ERROR] ${err.message}`);
    }
    return false;
  }
}

/**
 * CLI Runner
 */
async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.log(`
Usage:
  node scripts/index_article.js <url_or_slug>
  node scripts/index_article.js --all

Requirements:
  1. service-account.json in the project root (or set INDEXING_CREDENTIALS_JSON env var)
  2. Service Account email added as "Owner" in Google Search Console for ${SITE_DOMAIN}
    `);
    return;
  }

  if (arg === '--all') {
    const articlesDir = path.join(ROOT_DIR, 'articles');
    if (!fs.existsSync(articlesDir)) {
      console.error('articles/ directory not found');
      return;
    }

    const files = fs.readdirSync(articlesDir).filter(f => f.endsWith('.html'));
    console.log(`[INDEXING API] Found ${files.length} articles to notify...`);
    console.log(`Note: Google Indexing API default quota is 200 requests/day.`);

    let successCount = 0;
    for (let i = 0; i < files.length; i++) {
      const slug = files[i].replace('.html', '');
      const url = `${SITE_DOMAIN}/${slug}`;
      const ok = await notifyGoogleIndex(url);
      if (ok) successCount++;
      // Sleep 500ms between calls to respect rate limits
      await new Promise(r => setTimeout(r, 500));
    }
    console.log(`[INDEXING API] Batch finished: ${successCount} of ${files.length} successfully notified.`);
  } else {
    await notifyGoogleIndex(arg);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  notifyGoogleIndex,
  getCredentials,
};
