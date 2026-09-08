/**
 * GenAlphaMagazines - Delete Article CLI Engine
 * 
 * Usage:
 *   node scripts/delete_article.js <slug-or-filename>
 *   npm run delete-article <slug-or-filename>
 * 
 * Example:
 *   node scripts/delete_article.js cristiano-ronaldo-career-legacy-and-records
 */

const fs = require('fs');
const path = require('path');
const { syncDeletedArticles } = require('./sync_articles');

const ROOT_DIR = path.resolve(__dirname, '..');
const articlesDir = path.join(ROOT_DIR, 'articles');
const imagesDir = path.join(ROOT_DIR, 'assets', 'images');

const query = process.argv[2];

if (!query) {
  console.error('\n❌ Please provide an article slug, title keyword, or filename to delete.');
  console.error('Usage: npm run delete-article <slug-or-filename>\n');
  process.exit(1);
}

// Clean input query
let targetSlug = query
  .replace(/\.html$/i, '')
  .replace(/^articles[\\/]/i, '')
  .trim()
  .toLowerCase();

console.log(`\n🔍 Searching for article matching: "${targetSlug}"...`);

const files = fs.readdirSync(articlesDir).filter(f => f.endsWith('.html'));

let matchedFile = files.find(f => f.toLowerCase() === `${targetSlug}.html`);

// If not exact match, check substring match
if (!matchedFile) {
  matchedFile = files.find(f => f.toLowerCase().includes(targetSlug));
}

if (!matchedFile) {
  console.log(`⚠️ No article file directly matched "${targetSlug}" in articles/ directory.`);
  console.log('Running global sync in case the article was already deleted from GitHub...');
} else {
  const fileSlug = matchedFile.replace('.html', '');
  const articleFilePath = path.join(articlesDir, matchedFile);

  // 1. Delete article HTML file from both articles/ and root
  if (fs.existsSync(articleFilePath)) {
    fs.unlinkSync(articleFilePath);
    console.log(`🗑️  Deleted HTML file: articles/${matchedFile}`);
  }
  const rootArticleFilePath = path.join(ROOT_DIR, matchedFile);
  if (fs.existsSync(rootArticleFilePath)) {
    fs.unlinkSync(rootArticleFilePath);
    console.log(`🗑️  Deleted root HTML file: ${matchedFile}`);
  }

  // 2. Delete corresponding image file if present
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  for (const ext of imageExtensions) {
    const imgPath = path.join(imagesDir, `${fileSlug}${ext}`);
    if (fs.existsSync(imgPath)) {
      fs.unlinkSync(imgPath);
      console.log(`🖼️  Deleted associated image: assets/images/${fileSlug}${ext}`);
    }
  }
}

// 3. Run full sync to purge references across index.html, category-*.html, sitemap, llms, data ledgers
console.log('\n🔄 Purging references across homepage, category sections, sitemap, and data ledgers...');
const result = syncDeletedArticles();

console.log(`\n✅ Article successfully deleted and purged from the entire site!`);
console.log(`📊 Active articles remaining: ${result.activeCount}`);
if (result.modifiedFiles.length > 0) {
  console.log(`📝 Cleaned feeds and pages (${result.modifiedFiles.length}):`);
  result.modifiedFiles.forEach(f => console.log(`   - ${f}`));
}
console.log('');
