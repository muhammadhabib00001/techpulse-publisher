const fs = require('fs');
const path = require('path');

const TARGET_SLUGS = [
  'himalayan-bird-changes-song-due-to-noise-pollution',
  'the-phenomenon-of-ghost-music-mystery-and-persona',
  'global-energy-summit-grid-decarbonization-agreement',
  'global-semiconductor-lithography-and-advanced-packaging',
  'central-banks-monetary-policy-liquidity-report',
  'multilateral-diplomacy-future-of-treaty-frameworks'
];

const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'ar', 'hi', 'it'];

let totalErrors = 0;
let checkedArticles = 0;

console.log('=== VERIFYING COMPILED ARTICLE HTML PAGES ===');
TARGET_SLUGS.forEach(slug => {
  LANGS.forEach(l => {
    checkedArticles++;
    const relPath = l === 'en' ? `articles/${slug}.html` : `${l}/articles/${slug}.html`;
    const fullPath = path.resolve(__dirname, '..', relPath);

    if (!fs.existsSync(fullPath)) {
      console.error(`[FAIL] Missing file: ${relPath}`);
      totalErrors++;
      return;
    }

    const html = fs.readFileSync(fullPath, 'utf8');

    // Check Article Body
    const bodyMatch = html.match(/<div class="article-body">([\s\S]*?)<\/div>/);
    if (!bodyMatch) {
      console.error(`[FAIL] ${relPath}: No <div class="article-body"> found!`);
      totalErrors++;
      return;
    }

    const bodyText = bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
    if (wordCount < 800) {
      console.error(`[FAIL] ${relPath}: Word count is ${wordCount} (< 800)`);
      totalErrors++;
    }

    // Check FAQs HTML
    if (!html.includes('class="article-faq-section"') && !html.includes('article-faq-section')) {
      console.error(`[FAIL] ${relPath}: Missing FAQ section!`);
      totalErrors++;
    }

    // Check FAQ schema
    if (!html.includes('"@type": "FAQPage"')) {
      console.error(`[FAIL] ${relPath}: Missing FAQPage schema!`);
      totalErrors++;
    }

    // Check em dash
    if (html.includes('—')) {
      console.error(`[FAIL] ${relPath}: Contains forbidden em dash (—)!`);
      totalErrors++;
    }
  });
});

console.log(`Verified ${checkedArticles} compiled HTML articles.`);

console.log('\n=== VERIFYING LOCALIZED HOMEPAGES ===');
const NON_EN_LANGS = ['es', 'de', 'fr', 'pt', 'ar', 'hi', 'it'];
NON_EN_LANGS.forEach(l => {
  const hpPath = path.resolve(__dirname, '..', `${l}/index.html`);
  if (!fs.existsSync(hpPath)) {
    console.error(`[FAIL] Missing homepage for ${l}: ${hpPath}`);
    totalErrors++;
    return;
  }
  const html = fs.readFileSync(hpPath, 'utf8');

  // Check forbidden leak words in non-English homepages
  const forbiddenLeaks = [
    'Real-Time Feed',
    'Independent Reporting',
    'Loading date...',
    'The Global Briefing',
    'Newsroom Team',
    'Legal & Trust'
  ];

  forbiddenLeaks.forEach(leak => {
    if (html.includes(leak)) {
      console.error(`[FAIL] Homepage for /${l} contains English leak: "${leak}"`);
      totalErrors++;
    }
  });
});

console.log(`\n=================================`);
if (totalErrors > 0) {
  console.error(`FAILED with ${totalErrors} issue(s)!`);
  process.exit(1);
} else {
  console.log(`ALL COMPILED HTML PAGES & LOCALIZED HOMEPAGES 100% VERIFIED!`);
  process.exit(0);
}
