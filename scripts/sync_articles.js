/**
 * GenAlphaMagazines - Autonomous Article Sync & Cleanup Engine
 * 
 * Scans articles/ directory for existing article files.
 * If any article was deleted (via GitHub, git, or file deletion):
 * 1. Purges all card elements and links from index.html (promoting next lead story if needed)
 * 2. Purges all card elements and ticker items from all category-*.html files
 * 3. Purges URLs from sitemap.xml
 * 4. Purges links from llms.txt
 * 5. Purges records from data/articles.json and data/published_topics.json
 * 6. Purges related links from other articles/*.html files
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

function syncDeletedArticles() {
  console.log('[sync_articles] Starting integrity check across all feeds...');

  const articlesDir = path.join(ROOT_DIR, 'articles');
  if (!fs.existsSync(articlesDir)) {
    console.error('[sync_articles] articles directory not found.');
    return { modifiedFiles: [] };
  }

  // 1. Gather all currently existing article slugs
  const existingArticleFiles = fs.readdirSync(articlesDir).filter(f => f.endsWith('.html'));
  const existingSlugs = new Set(existingArticleFiles.map(f => f.replace('.html', '')));
  console.log(`[sync_articles] Found ${existingSlugs.size} active article files in articles/`);

  let modifiedFiles = [];

  // Helper to safely write if changed
  function writeIfChanged(filePath, newContent, originalContent) {
    if (newContent !== originalContent) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      const rel = path.relative(ROOT_DIR, filePath);
      console.log(`[sync_articles] Updated: ${rel}`);
      modifiedFiles.push(rel);
      return true;
    }
    return false;
  }

  // 2. Sync data/articles.json
  const articlesJsonPath = path.join(ROOT_DIR, 'data', 'articles.json');
  let validArticlesList = [];
  if (fs.existsSync(articlesJsonPath)) {
    try {
      const original = fs.readFileSync(articlesJsonPath, 'utf8');
      const list = JSON.parse(original);
      const filtered = list.filter(item => {
        const s = item.slug || (item.file ? item.file.replace('.html', '') : '');
        return existingSlugs.has(s);
      });
      validArticlesList = filtered;
      const updated = JSON.stringify(filtered, null, 2);
      writeIfChanged(articlesJsonPath, updated, original);
    } catch (e) {
      console.error('[sync_articles] Error syncing articles.json:', e);
    }
  }

  // 3. Sync data/published_topics.json
  const publishedTopicsPath = path.join(ROOT_DIR, 'data', 'published_topics.json');
  if (fs.existsSync(publishedTopicsPath)) {
    try {
      const original = fs.readFileSync(publishedTopicsPath, 'utf8');
      const list = JSON.parse(original);
      const filtered = list.filter(item => {
        const s = item.slug || (item.file ? item.file.replace('.html', '') : '');
        return existingSlugs.has(s);
      });
      const updated = JSON.stringify(filtered, null, 2);
      writeIfChanged(publishedTopicsPath, updated, original);
    } catch (e) {
      console.error('[sync_articles] Error syncing published_topics.json:', e);
    }
  }

  // 4. Sync sitemap.xml
  const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    let original = fs.readFileSync(sitemapPath, 'utf8');
    let updated = original;

    // Match each <url> block pointing to an article
    const urlBlockRegex = /<url>[\s\S]*?<loc>https:\/\/www\.genalphamagazines\.com\/articles\/([^<]+)\.html<\/loc>[\s\S]*?<\/url>\s*/g;
    updated = updated.replace(urlBlockRegex, (match, slug) => {
      if (!existingSlugs.has(slug)) {
        console.log(`[sync_articles] Removing deleted article from sitemap.xml: ${slug}`);
        return '';
      }
      return match;
    });

    writeIfChanged(sitemapPath, updated, original);
  }

  // 5. Sync llms.txt
  const llmsPath = path.join(ROOT_DIR, 'llms.txt');
  if (fs.existsSync(llmsPath)) {
    const original = fs.readFileSync(llmsPath, 'utf8');
    const lines = original.split('\n');
    const filteredLines = lines.filter(line => {
      const match = line.match(/\/articles\/([a-zA-Z0-9_-]+)\.html/);
      if (match && !existingSlugs.has(match[1])) {
        console.log(`[sync_articles] Removing deleted article from llms.txt: ${match[1]}`);
        return false;
      }
      return true;
    });
    const updated = filteredLines.join('\n');
    writeIfChanged(llmsPath, updated, original);
  }

  // 6. Sync category-*.html files
  const rootFiles = fs.readdirSync(ROOT_DIR);
  const categoryFiles = rootFiles.filter(f => f.startsWith('category-') && f.endsWith('.html'));

  for (const catFile of categoryFiles) {
    const catPath = path.join(ROOT_DIR, catFile);
    let original = fs.readFileSync(catPath, 'utf8');
    let updated = original;

    // A. Remove cards linking to deleted articles
    // Pattern: optional <!-- Article: slug.html --> followed by <article class="card"> ... </article>
    const cardRegex = /(?:<!--\s*Article:\s*([a-zA-Z0-9_-]+)\.html\s*-->\s*)?<article class="card">([\s\S]*?)<\/article>\s*/gi;
    updated = updated.replace(cardRegex, (fullCardMatch, commentSlug, cardInner) => {
      let slug = commentSlug;
      if (!slug) {
        const slugMatch = cardInner.match(/href="(?:\.\/|\.\.\/)?articles\/([a-zA-Z0-9_-]+)\.html"/i);
        if (slugMatch) slug = slugMatch[1];
      }

      if (slug && !existingSlugs.has(slug)) {
        console.log(`[sync_articles] Removing deleted article card from ${catFile}: ${slug}`);
        return '';
      }
      return fullCardMatch;
    });

    // B. Remove ticker items linking to deleted articles
    const tickerRegex = /<a\s+href="(?:\.\/|\.\.\/)?articles\/([a-zA-Z0-9_-]+)\.html"[^>]*class="breaking-ticker-item"[^>]*>[\s\S]*?<\/a>\s*/gi;
    updated = updated.replace(tickerRegex, (fullMatch, slug) => {
      if (!existingSlugs.has(slug)) {
        return '';
      }
      return fullMatch;
    });

    // C. If grid is empty, inject placeholder
    const gridMatch = updated.match(/<div class="articles-grid"[^>]*>([\s\S]*?)<\/div>/i);
    if (gridMatch) {
      const gridContent = gridMatch[1].trim();
      if (!gridContent || !gridContent.includes('<article')) {
        const placeholder = '\n        <p style="color: var(--text-muted); padding: 3rem 1.5rem; text-align: center;">Department archive ready. Newly generated stories will appear here automatically.</p>\n      ';
        updated = updated.replace(gridMatch[0], `<div class="articles-grid" style="grid-template-columns: 1fr;">${placeholder}</div>`);
      }
    }

    writeIfChanged(catPath, updated, original);
  }

  // 7. Sync index.html (Homepage)
  const indexPath = path.join(ROOT_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    let original = fs.readFileSync(indexPath, 'utf8');
    let updated = original;

    // A. Remove ticker items linking to deleted articles
    const tickerRegex = /<a\s+href="(?:\.\/)?articles\/([a-zA-Z0-9_-]+)\.html"[^>]*class="breaking-ticker-item"[^>]*>[\s\S]*?<\/a>\s*/gi;
    updated = updated.replace(tickerRegex, (fullMatch, slug) => {
      if (!existingSlugs.has(slug)) {
        console.log(`[sync_articles] Removing deleted article ticker from index.html: ${slug}`);
        return '';
      }
      return fullMatch;
    });

    // B. Check Lead Main Card in pattern-a-main
    const mainStart = updated.indexOf('<div class="pattern-a-main">');
    const sideStart = updated.indexOf('<div class="pattern-a-side-list">');

    if (mainStart !== -1 && sideStart !== -1 && mainStart < sideStart) {
      const leadBlock = updated.slice(mainStart, sideStart);
      const leadSlugMatch = leadBlock.match(/href="(?:\.\/)?articles\/([a-zA-Z0-9_-]+)\.html"/);
      
      if (leadSlugMatch && !existingSlugs.has(leadSlugMatch[1])) {
        const deletedLeadSlug = leadSlugMatch[1];
        console.log(`[sync_articles] Lead article ${deletedLeadSlug} was deleted! Promoting next available article...`);

        // Find candidate for replacement from validArticlesList or remaining existingSlugs
        let candidate = null;
        if (validArticlesList.length > 0) {
          candidate = validArticlesList.find(a => a.slug !== deletedLeadSlug && existingSlugs.has(a.slug));
        }
        
        if (!candidate && existingSlugs.size > 0) {
          const firstSlug = Array.from(existingSlugs)[0];
          candidate = {
            slug: firstSlug,
            title: firstSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            category: 'news',
            excerpt: 'In-depth reporting from GenAlphaMagazines.',
            author: 'Julia Vance',
            authorSlug: 'julia-vance',
            date: 'Recent'
          };
        }

        if (candidate) {
          const newLeadCard = `<div class="pattern-a-main">
            <article class="card">
              <div class="card-img-wrap">
                <img src="./assets/images/${candidate.slug}.jpg" alt="${candidate.title}" width="800" height="450" loading="eager" fetchpriority="high" decoding="async">
              </div>
              <div class="card-content">
                <span class="card-tag">${(candidate.category || 'NEWS').toUpperCase()} &bull; Editorial Lead Feature</span>
                <h3 class="card-title">
                  <a href="/${candidate.slug}">${candidate.title}</a>
                </h3>
                <p class="card-excerpt">${candidate.excerpt || ''}</p>
                <div class="card-meta">
                  <span>By <a href="./author/${candidate.authorSlug || 'julia-vance'}.html">${candidate.author || 'Julia Vance'}</a></span>
                  <span>${candidate.date || 'Recent'}</span>
                </div>
              </div>
            </article>
          </div>\n\n          `;

          updated = updated.slice(0, mainStart) + newLeadCard + updated.slice(sideStart);

          // Update preload in head
          const preloadRegex = /<link\s+rel="preload"\s+as="image"\s+href="[^"]*"\s+fetchpriority="high">/;
          const newPreload = `<link rel="preload" as="image" href="./assets/images/${candidate.slug}.jpg" fetchpriority="high">`;
          if (preloadRegex.test(updated)) {
            updated = updated.replace(preloadRegex, newPreload);
          }
        }
      }
    }

    // C. Remove mini-side-cards linking to deleted articles
    const miniSideRegex = /<article class="mini-side-card">([\s\S]*?)<\/article>\s*/gi;
    updated = updated.replace(miniSideRegex, (fullMatch, inner) => {
      const slugMatch = inner.match(/href="(?:\.\/)?articles\/([a-zA-Z0-9_-]+)\.html"/i);
      if (slugMatch && !existingSlugs.has(slugMatch[1])) {
        console.log(`[sync_articles] Removing deleted mini-side-card from index.html: ${slugMatch[1]}`);
        return '';
      }
      return fullMatch;
    });

    // D. Remove general grid cards linking to deleted articles
    const gridCardRegex = /<article class="card">([\s\S]*?)<\/article>\s*/gi;
    updated = updated.replace(gridCardRegex, (fullMatch, inner) => {
      const slugMatch = inner.match(/href="(?:\.\/)?articles\/([a-zA-Z0-9_-]+)\.html"/i);
      if (slugMatch && !existingSlugs.has(slugMatch[1])) {
        console.log(`[sync_articles] Removing deleted grid card from index.html: ${slugMatch[1]}`);
        return '';
      }
      return fullMatch;
    });

    writeIfChanged(indexPath, updated, original);
  }

  // 8. Sync related links inside remaining articles/*.html
  for (const artFile of existingArticleFiles) {
    const artPath = path.join(articlesDir, artFile);
    let original = fs.readFileSync(artPath, 'utf8');
    let updated = original;

    // Pattern: <li><strong>Category:</strong> <a href="(?:./|../articles/|/)?([a-zA-Z0-9_-]+)(?:.html)?">...</a></li>
    const relatedItemRegex = /<li><strong>[^<]+:<\/strong>\s*<a\s+href="(?:\.\/|\.\.\/articles\/)([a-zA-Z0-9_-]+)\.html"[^>]*>[\s\S]*?<\/a><\/li>\s*/gi;
    updated = updated.replace(relatedItemRegex, (fullMatch, slug) => {
      if (!existingSlugs.has(slug)) {
        return '';
      }
      return fullMatch;
    });

    writeIfChanged(artPath, updated, original);
  }

  // 9. Clean up orphaned images in assets/images/
  const imagesDir = path.join(ROOT_DIR, 'assets', 'images');
  if (fs.existsSync(imagesDir)) {
    const staticBrandAssets = new Set([
      'favicon.svg', 'logo.svg', 'logo-dark.svg', 'og-banner.jpg',
      'creative-badge.svg', '.gitkeep', 'cristiano-ronaldo-career-legacy-and-records-in-2026.jpg'
    ]);
    const imgFiles = fs.readdirSync(imagesDir);
    for (const img of imgFiles) {
      if (staticBrandAssets.has(img)) continue;
      const baseSlug = img.replace(/\.(jpg|jpeg|png|webp|svg)$/i, '');
      if (!existingSlugs.has(baseSlug)) {
        try {
          fs.unlinkSync(path.join(imagesDir, img));
          console.log(`[sync_articles] Removed orphaned image: assets/images/${img}`);
        } catch (e) {}
      }
    }
  }

  console.log(`[sync_articles] Completed! Modified ${modifiedFiles.length} files.`);
  return { modifiedFiles, activeCount: existingSlugs.size };
}

// If run directly via CLI: node scripts/sync_articles.js
if (require.main === module) {
  syncDeletedArticles();
}

module.exports = { syncDeletedArticles };
