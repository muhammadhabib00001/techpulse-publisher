/**
 * index_bing.js
 * Instant Bing & Search Engine Indexing via IndexNow Protocol
 *
 * Supported Search Engines via IndexNow:
 * - Microsoft Bing
 * - Yandex
 * - Seznam.cz
 * - Naver
 *
 * Features:
 * - Submits URLs to Microsoft Bing and IndexNow endpoints
 * - Automated single URL submission upon publishing (via publisher.js)
 * - Batch submission of all sitemap pages: node scripts/index_bing.js --all
 * - CLI execution: node scripts/index_bing.js <url_or_slug>
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SITE_DOMAIN = 'https://www.genalphamagazines.com';
const SITE_HOST = 'www.genalphamagazines.com';
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || 'f7874f359b9943a1a14d06e302853b9d';
const KEY_LOCATION = `${SITE_DOMAIN}/${INDEXNOW_KEY}.txt`;

// Official IndexNow endpoints
const INDEXNOW_ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow'
];

/**
 * Ensures key verification file exists in web root
 */
function ensureKeyFile() {
  const keyFilePath = path.join(ROOT_DIR, `${INDEXNOW_KEY}.txt`);
  if (!fs.existsSync(keyFilePath)) {
    fs.writeFileSync(keyFilePath, INDEXNOW_KEY, 'utf8');
    console.log(`[INDEXNOW] Created verification file at: ${keyFilePath}`);
  }
}

/**
 * Sends a list of URLs to Bing / IndexNow
 * @param {string[]} urlList - Array of absolute URLs
 * @returns {Promise<boolean>}
 */
async function submitBatch(urlList) {
  ensureKeyFile();

  if (!urlList || urlList.length === 0) {
    console.warn('[INDEXNOW] No URLs provided to submit.');
    return false;
  }

  // Deduplicate and filter valid URLs
  const uniqueUrls = Array.from(new Set(urlList)).filter(u => typeof u === 'string' && u.startsWith('http'));

  if (uniqueUrls.length === 0) {
    console.warn('[INDEXNOW] No valid HTTP/HTTPS URLs found.');
    return false;
  }

  const payload = {
    host: SITE_HOST,
    key: INDEXNOW_KEY,
    keyLocation: KEY_LOCATION,
    urlList: uniqueUrls
  };

  console.log(`[INDEXNOW] Submitting ${uniqueUrls.length} URL(s) to Bing / IndexNow...`);

  let allSuccess = true;

  for (const endpoint of INDEXNOW_ENDPOINTS) {
    const endpointName = endpoint.includes('bing.com') ? 'Bing' : 'IndexNow (Global)';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': 'TechPulse-Publisher-IndexNow/1.0'
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 200 || response.status === 202) {
        console.log(`[INDEXNOW SUCCESS] ${endpointName} accepted ${uniqueUrls.length} URLs (HTTP ${response.status})`);
      } else {
        const errorText = await response.text();
        console.warn(`[INDEXNOW WARN] ${endpointName} returned HTTP ${response.status}: ${errorText || response.statusText}`);
        allSuccess = false;
      }
    } catch (err) {
      console.error(`[INDEXNOW ERROR] Failed to connect to ${endpointName}: ${err.message}`);
      allSuccess = false;
    }
  }

  return allSuccess;
}

/**
 * Submits a single URL or slug to Bing IndexNow
 * @param {string} targetUrl - Full URL or slug
 * @returns {Promise<boolean>}
 */
async function notifyBingIndex(targetUrl) {
  let url = (targetUrl || '').trim();
  if (!url) return false;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const cleanSlug = url.replace(/^\/?articles\//, '').replace(/\.html$/, '').replace(/^\//, '');
    url = `${SITE_DOMAIN}/${cleanSlug}`;
  }

  return await submitBatch([url]);
}

/**
 * Reads sitemap.xml and submits ALL valid site pages to Bing IndexNow
 * @returns {Promise<boolean>}
 */
async function notifyAllSitePagesToBing() {
  const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    console.error('[INDEXNOW ERROR] sitemap.xml not found in project root!');
    return false;
  }

  const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');
  const locMatches = sitemapContent.match(/<loc>(.*?)<\/loc>/g) || [];
  const urls = locMatches.map(m => m.replace(/<\/?loc>/g, '').trim());

  console.log(`[INDEXNOW] Extracted ${urls.length} clean URLs from sitemap.xml.`);

  // Submit in chunks of 500 (IndexNow supports up to 10,000, 500 is optimal)
  const chunkSize = 500;
  let overallSuccess = true;

  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    console.log(`[INDEXNOW] Processing batch ${Math.floor(i / chunkSize) + 1} (${chunk.length} URLs)...`);
    const ok = await submitBatch(chunk);
    if (!ok) overallSuccess = false;
    if (i + chunkSize < urls.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`[INDEXNOW] Finished batch submission for all site pages.`);
  return overallSuccess;
}

/**
 * CLI runner
 */
async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.log(`
Usage:
  node scripts/index_bing.js <url_or_slug>
  node scripts/index_bing.js --all

Description:
  Instantly notifies Microsoft Bing, Yandex, and IndexNow search engines
  of updated or new pages on ${SITE_DOMAIN}.
    `);
    return;
  }

  if (arg === '--all') {
    await notifyAllSitePagesToBing();
  } else {
    await notifyBingIndex(arg);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  notifyBingIndex,
  notifyAllSitePagesToBing,
  submitBatch,
  INDEXNOW_KEY
};
