/**
 * Newsroom Synchronizer & Editorial Normalization Utilities
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');

// 1. Sanitize Dashes (No em dashes — or en dashes –)
function sanitizeAllDashes(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/[—–]/g, ': ').replace(/\s+:\s+/g, ': ');
}

// 2. Sanitize Markdown Snippets
function sanitizeMarkdownAndSnippets(html) {
  if (typeof html !== 'string') return html;
  return html.replace(/```[a-z]*[\s\S]*?```/gi, '').replace(/`([^`]+)`/g, '$1');
}

// 3. Remove Obsolete Boxes
function removeObsoleteBoxes(html) {
  if (typeof html !== 'string') return html;
  return html.replace(/<div class="obsolete-box"[\s\S]*?<\/div>/gi, '');
}

// 4. Get All Internal Article Targets from data/articles.json
function getAllInternalArticleTargets() {
  const articlesFile = path.join(ROOT_DIR, 'data', 'articles.json');
  if (fs.existsSync(articlesFile)) {
    try {
      const list = JSON.parse(fs.readFileSync(articlesFile, 'utf8'));
      return list.map(a => {
        const title = a.title || (a.translations && a.translations.en ? a.translations.en.title : a.slug);
        return {
          slug: a.slug,
          title: title,
          category: (a.category_id || a.category || 'news').toLowerCase(),
          keywords: a.tags && a.tags.length ? a.tags : [title]
        };
      });
    } catch (e) {
      console.warn('[sync_articles] Error reading articles.json:', e.message);
    }
  }
  return [];
}

const ARTICLE_INTERNAL_TARGETS = getAllInternalArticleTargets();

// 5. Build & Ensure Related Section
function buildRelatedSectionHtml(category = '', currentSlug = '') {
  const targets = getAllInternalArticleTargets().filter(a => a.slug !== currentSlug);
  const sameCat = targets.filter(a => a.category === category);
  const pool = sameCat.length >= 3 ? sameCat : targets;
  const selected = pool.slice(0, 3);

  if (!selected.length) return '';

  let itemsHtml = '';
  selected.forEach(item => {
    itemsHtml += `
      <div class="related-card" style="padding:1rem;background:var(--bg-secondary);border-radius:4px;margin-bottom:0.75rem;">
        <h4 style="margin:0 0 0.25rem 0;font-size:1rem;"><a href="/articles/${item.slug}">${item.title}</a></h4>
      </div>
    `;
  });

  return `
    <section class="related-articles" style="margin-top:2.5rem;border-top:1px solid var(--border-light);padding-top:1.5rem;">
      <h3 style="font-family:var(--font-headline);font-size:1.25rem;margin-bottom:1rem;">Related In-Depth Reporting</h3>
      <div class="related-grid">${itemsHtml}</div>
    </section>
  `;
}

function ensureRelatedSection(html, category = '', currentSlug = '') {
  if (typeof html !== 'string') return html;
  if (html.includes('class="related-articles"')) return html;
  const relatedHtml = buildRelatedSectionHtml(category, currentSlug);
  return html + relatedHtml;
}

// 6. Ensure Article FAQs
function ensureArticleFaqs(html) {
  return html;
}

// 7. Standardize Links
function standardizeArticleLinks(html) {
  if (typeof html !== 'string') return html;
  return html.replace(/href=["']https:\/\/www\.genalphamagazines\.com\/articles\/([^"']+)["']/g, 'href="/articles/$1"');
}

// 8. Category from HTML
function getCategoryFromHtml(html) {
  const match = html.match(/<meta\s+property=["']article:section["']\s+content=["']([^"']+)["']/i);
  return match ? match[1].toLowerCase() : 'news';
}

function syncLlmsFiles() {
  return true;
}

function runSync() {
  console.log('[sync_articles] Synchronizing multilingual newsroom architecture...');
  try {
    execSync(`node "${path.join(__dirname, 'build-newsroom.js')}"`, { stdio: 'inherit' });
    console.log('[sync_articles] Newsroom sync completed successfully.');
  } catch (err) {
    console.error('[sync_articles] Error syncing newsroom:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runSync();
}

module.exports = {
  sanitizeAllDashes,
  sanitizeMarkdownAndSnippets,
  removeObsoleteBoxes,
  buildRelatedSectionHtml,
  ensureRelatedSection,
  ensureArticleFaqs,
  standardizeArticleLinks,
  getAllInternalArticleTargets,
  ARTICLE_INTERNAL_TARGETS,
  getCategoryFromHtml,
  syncLlmsFiles,
  runSync
};
