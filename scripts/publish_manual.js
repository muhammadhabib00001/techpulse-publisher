/**
 * publish_manual.js - Dedicated Manual Article Publishing & Standardization Suite
 * 
 * Usage:
 *   node scripts/publish_manual.js [path/to/article.html or slug]
 *   npm run publish-manual [path/to/article.html or slug]
 * 
 * Automatically enforces all editorial and technical standards:
 * 1. ZERO "2026" / calendar years in title, h1, og:title, and slug
 * 2. Clean root URLs (https://www.genalphamagazines.com/<slug>) in canonical, og:url, and JSON-LD
 * 3. Unified .faq-card layout (.faq-section, .faq-card, .faq-question, .faq-answer) + FAQPage Schema
 * 4. High-performance tags (hero image fetchpriority, explicit dimensions, async Google Fonts)
 * 5. Official working email (intouchmagazines26@gmail.com) and GA4 (G-052TFQ4D4Q)
 * 6. Root-relative assets (/assets/...) and internal links (/<slug>)
 * 7. Physical root mirror (<slug>.html) for instant Vercel clean URL serving
 * 8. Automatic injection into index.html, category-*.html, sitemap.xml, llms.txt, and data/articles.json
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const articlesDir = path.join(ROOT_DIR, 'articles');
const BASE_URL = 'https://www.genalphamagazines.com';
const { sanitizeAllDashes, removeObsoleteBoxes, ensureRelatedSection, syncLlmsFiles, standardizeArticleLinks, getCategoryFromHtml } = require('./sync_articles');

const CARD_BG = "background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1rem;";
const H3_STYLE = "margin-top: 0; margin-bottom: 0.5rem; color: var(--primary); font-size: 1.05rem;";
const P_STYLE = "margin-bottom: 0; color: var(--text-main); font-size: 0.95rem; line-height: 1.7;";

function sanitizeTitleString(t) {
  if (!t) return '';
  return t
    .replace(/\b(in|for)?\s*202[0-9]\b/gi, '')
    .replace(/[—–]/g, ': ')
    .replace(/:\s*A Complete Guide/gi, '')
    .replace(/:\s*Complete Practical Guide/gi, '')
    .replace(/\s+Guide for 2026/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[:\-\s]+$/, '')
    .trim();
}

function extractFaqPairs(body) {
  const pairs = [];
  const seen = new Set();
  function add(q, a) {
    const cleanQ = q.replace(/<[^>]+>/g, '').trim();
    const cleanA = a.replace(/<[^>]+>/g, '').trim();
    const key = cleanQ.toLowerCase().slice(0, 80);
    if (!seen.has(key) && cleanQ.length > 5 && cleanA.length > 5) {
      seen.add(key);
      pairs.push({ q: cleanQ, a: cleanA });
    }
  }

  let m;
  const r1 = /<div[^>]*class=['"](?:faq-item|faq-card)['"][^>]*>([\s\S]*?)<\/div>/gi;
  while ((m = r1.exec(body)) !== null) {
    const qm = m[1].match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i);
    const am = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (qm && am) add(qm[1], am[1]);
  }
  const r2 = /<div style="[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  while ((m = r2.exec(body)) !== null) {
    if (!m[0].includes('var(--bg-card)')) continue;
    const qm = m[1].match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i);
    const am = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (qm && am) add(qm[1], am[1]);
  }
  const r3 = /<h[234][^>]*>([^<]+)<\/h[234]>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  while ((m = r3.exec(body)) !== null) {
    if (/Frequently Asked Questions/i.test(m[1])) continue;
    add(m[1], m[2]);
  }
  return pairs;
}

function processArticleFile(filePath) {
  const fileName = path.basename(filePath);
  const slug = fileName.replace('.html', '');
  const cleanUrl = `${BASE_URL}/${slug}`;

  console.log(`\n========================================`);
  console.log(`[publish_manual] Processing: ${fileName}`);
  console.log(`[publish_manual] Target Clean URL: ${cleanUrl}`);

  let content = fs.readFileSync(filePath, 'utf8');
  let modifications = [];

  // 1. Sanitize Title
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  let articleTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (titleMatch) {
    const parts = titleMatch[1].split('|');
    const rawHead = parts[0].trim();
    const siteSuffix = parts[1] ? ` | ${parts[1].trim()}` : ' | GenAlphaMagazines';
    const cleanHead = sanitizeTitleString(rawHead);
    articleTitle = cleanHead;
    if (titleMatch[1] !== `${cleanHead}${siteSuffix}`) {
      content = content.replace(titleMatch[0], `<title>${cleanHead}${siteSuffix}</title>`);
      modifications.push('Title sanitized (removed 2026/extraneous text)');
    }
  }

  // 2. Sanitize H1
  const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const rawH1 = h1Match[1].replace(/<[^>]+>/g, '').trim();
    const cleanH1 = sanitizeTitleString(rawH1);
    if (h1Match[1] !== cleanH1) {
      content = content.replace(h1Match[0], `<h1 class="article-title">${cleanH1}</h1>`);
      modifications.push('H1 sanitized');
    }
  }

  // 3. Sanitize OG Title
  const ogTitleMatch = content.match(/<meta property="og:title" content="([^"]+)">/i);
  if (ogTitleMatch) {
    const cleanOg = sanitizeTitleString(ogTitleMatch[1]);
    if (ogTitleMatch[1] !== cleanOg) {
      content = content.replace(ogTitleMatch[0], `<meta property="og:title" content="${cleanOg}">`);
      modifications.push('og:title sanitized');
    }
  }

  // 4. Enforce Clean Root URLs for Canonical & og:url
  const canonicalMatch = content.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  if (canonicalMatch && canonicalMatch[1] !== cleanUrl) {
    content = content.replace(canonicalMatch[0], `<link rel="canonical" href="${cleanUrl}"`);
    modifications.push(`Canonical URL updated to ${cleanUrl}`);
  }
  const ogUrlMatch = content.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i);
  if (ogUrlMatch && ogUrlMatch[1] !== cleanUrl) {
    content = content.replace(ogUrlMatch[0], `<meta property="og:url" content="${cleanUrl}"`);
    modifications.push(`og:url updated to ${cleanUrl}`);
  }

  // 5. Clean JSON-LD URLs
  content = content.replace(new RegExp(`https://www\\.genalphamagazines\\.com/articles/${slug}(?:\\.html)?`, 'g'), cleanUrl);
  content = content.replace(new RegExp(`https://www\\.genalphamagazines\\.com/${slug}\\.html`, 'g'), cleanUrl);

  // 6. Ensure Google Analytics GA4
  if (!content.includes('G-052TFQ4D4Q')) {
    const gaSnippet = `
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-052TFQ4D4Q"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-052TFQ4D4Q');
  </script>`;
    content = content.replace('</head>', `${gaSnippet}\n</head>`);
    modifications.push('Injected GA4 tag (G-052TFQ4D4Q)');
  }

  // 7. Ensure Official Email
  if (/[a-zA-Z0-9._%+-]+@(?!gmail\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi.test(content)) {
    content = content.replace(/[a-zA-Z0-9._%+-]+@(?!gmail\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, 'intouchmagazines26@gmail.com');
    modifications.push('Updated email to intouchmagazines26@gmail.com');
  }

  // 8. Standardize FAQ Section to .faq-card
  const faqSecMatch = content.match(/(<section[^>]*id=["']frequently-asked-questions["'][^>]*>)([\s\S]*?)(<\/section>)/i);
  let faqPairs = [];
  if (faqSecMatch) {
    const [full, openTag, body, closeTag] = faqSecMatch;
    faqPairs = extractFaqPairs(body);
    if (faqPairs.length > 0) {
      const cardsHtml = faqPairs.map(p => `
            <div class="faq-card" style="${CARD_BG}">
              <h3 class="faq-question" style="${H3_STYLE}">${p.q}</h3>
              <p class="faq-answer" style="${P_STYLE}">${p.a}</p>
            </div>`).join('\n');

      const standardizedFaqSection = `<section id="frequently-asked-questions" class="faq-section" style="margin-top: 2rem;">
            <h2>Frequently Asked Questions</h2>
            <div style="margin-top: 1.25rem;">
${cardsHtml}
            </div>
          </section>`;

      if (full !== standardizedFaqSection) {
        content = content.replace(full, standardizedFaqSection);
        modifications.push(`Standardized ${faqPairs.length} FAQ items to .faq-card layout`);
      }
    }
  }

  // 8b. Strip any Table of Contents
  content = content
    .replace(/<nav class="table-of-contents"[\s\S]*?<\/nav>/gi, '')
    .replace(/<div class="table-of-contents-box"[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*table-of-contents[^"]*"[\s\S]*?<\/div>/gi, '');

  // 9. Root-relative assets and internal links
  content = content.replace(/href=["']\.\.\/assets\//gi, 'href="/assets/');
  content = content.replace(/src=["']\.\.\/assets\//gi, 'src="/assets/');
  content = content.replace(/href=["']\.\/assets\//gi, 'href="/assets/');
  content = content.replace(/src=["']\.\/assets\//gi, 'src="/assets/');
  content = content.replace(/href=["'](?:\.\.\/|\.\/)?pages\/([a-zA-Z0-9_-]+\.html)["']/gi, 'href="/pages/$1"');
  content = content.replace(/href=["'](?:\.\.\/|\.\/)?(category-[a-zA-Z0-9_-]+\.html)["']/gi, 'href="/$1"');

  // 10. Async Google Fonts
  content = content.replace(/<link\s+rel="stylesheet"\s+href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*"\s*>/i, (m) => {
    if (!m.includes('onload')) {
      return m.replace('rel="stylesheet"', 'rel="stylesheet" media="print" onload="this.media=\'all\'"') +
        `\n  <noscript>${m}</noscript>`;
    }
    return m;
  });

  // 10b. Enforce Zero Dashes across full article
  const dashCleaned = sanitizeAllDashes(content);
  if (dashCleaned !== content) {
    content = dashCleaned;
    modifications.push('Sanitized all em-dashes and en-dashes across article');
  }

  // 10c. Remove Obsolete Boxes & Enforce Related Department Features block
  content = removeObsoleteBoxes(content);
  const relatedEnforced = ensureRelatedSection(content, slug, articlesDir);
  if (relatedEnforced !== content) {
    content = relatedEnforced;
    modifications.push('Injected Related Investigative Reports & Department Features block');
  }

  // 11. Detect Category
  const category = getCategoryFromHtml(content);

  // 12. Enforce Permanent Link Standard (strictly 2 internal links & 1 external link on targeted keywords, zero dashes)
  const linksStandardized = standardizeArticleLinks(content, slug, category);
  if (linksStandardized !== content) {
    content = linksStandardized;
    modifications.push('Standardized links: exactly 2 internal & 1 external on targeted keywords, stripped heading/list links');
  }

  // 13. Word Count Validation (Strictly 1,000 - 1,500 words)
  const bodyText = (content.substring(content.indexOf('<div class="article-body">'), content.indexOf('</article>')) || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  if (wordCount >= 1000 && wordCount <= 1500) {
    console.log(`[publish_manual] Word count verified: ${wordCount} words (Compliant: 1,000-1,500 words).`);
  } else {
    console.warn(`[publish_manual] [NOTICE] Word count is ${wordCount} words (Target: 1,000-1,500 words).`);
  }

  // Write updated file to articles/ and mirror to root
  const artTarget = path.join(articlesDir, fileName);
  const rootTarget = path.join(ROOT_DIR, fileName);

  fs.writeFileSync(artTarget, content, 'utf8');
  fs.writeFileSync(rootTarget, content, 'utf8');
  console.log(`[publish_manual] Saved to: ${artTarget}`);
  console.log(`[publish_manual] Mirrored to root: ${rootTarget}`);

  const descMatch = content.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  const excerpt = descMatch ? descMatch[1] : `In-depth analysis and reporting on ${articleTitle}.`;

  const authorMatch = content.match(/By\s+<a[^>]*>([^<]+)<\/a>/i) || content.match(/class="author-name"[^>]*>([^<]+)</i);
  const authorName = authorMatch ? authorMatch[1].trim() : 'Julia Vance';

  // 12. Update Feeds (sitemap.xml, llms.txt, data/articles.json)
  updateSitemapAndLlms(slug, articleTitle, excerpt);
  updateArticlesJson(slug, articleTitle, category, excerpt, authorName);

  if (modifications.length > 0) {
    console.log(`[publish_manual] Applied standardizations:`);
    modifications.forEach(m => console.log(`   - ${m}`));
  } else {
    console.log(`[publish_manual] All standards already 100% compliant.`);
  }

  try {
    const { execSync } = require('child_process');
    console.log('[publish_manual] Invoking sync_articles engine...');
    execSync('node scripts/sync_articles.js', { stdio: 'inherit', cwd: ROOT_DIR });
  } catch (syncErr) {
    console.warn('[publish_manual] sync_articles notice: ' + syncErr.message);
  }
  console.log(`[publish_manual] Successfully published & synced "${slug}"!`);
}

function updateSitemapAndLlms(slug, title, description) {
  const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
  const cleanUrl = `${BASE_URL}/${slug}`;
  const currentDate = new Date().toISOString().split('T')[0];

  if (fs.existsSync(sitemapPath)) {
    let sitemap = fs.readFileSync(sitemapPath, 'utf8');
    if (!sitemap.includes(cleanUrl)) {
      const entry = `  <url>\n    <loc>${cleanUrl}</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>`;
      sitemap = sitemap.replace('</urlset>', entry);
      fs.writeFileSync(sitemapPath, sitemap, 'utf8');
      console.log(`[publish_manual] Added to sitemap.xml: ${cleanUrl}`);
    }
  }

  // Synchronize both llms.txt and llms-full.txt
  try {
    const { syncLlmsFiles } = require('./sync_articles');
    const existingSlugs = new Set(fs.readdirSync(articlesDir).filter(f => f.endsWith('.html')).map(f => f.replace('.html', '')));
    existingSlugs.add(slug);
    syncLlmsFiles(existingSlugs, (fPath, updated, original) => {
      if (updated !== original) {
        fs.writeFileSync(fPath, updated, 'utf8');
        console.log(`[publish_manual] Synchronized ${path.basename(fPath)}`);
      }
    });
  } catch (e) {
    console.warn(`[publish_manual] Warning syncing LLM files:`, e.message);
  }
}

function updateArticlesJson(slug, title, category, excerpt, author) {
  const articlesJsonPath = path.join(ROOT_DIR, 'data', 'articles.json');
  try {
    let list = [];
    if (fs.existsSync(articlesJsonPath)) {
      list = JSON.parse(fs.readFileSync(articlesJsonPath, 'utf8'));
    }
    const existingIdx = list.findIndex(a => a.slug === slug || (a.file && a.file.replace('.html', '') === slug));
    const record = {
      slug,
      title,
      category,
      excerpt,
      author,
      authorSlug: author.toLowerCase().replace(/\s+/g, '-'),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      url: `/${slug}`
    };

    if (existingIdx !== -1) {
      list[existingIdx] = { ...list[existingIdx], ...record };
    } else {
      list.unshift(record);
    }
    fs.writeFileSync(articlesJsonPath, JSON.stringify(list, null, 2), 'utf8');
    console.log(`[publish_manual] Updated data/articles.json for: ${slug}`);
  } catch (e) {
    console.warn(`[publish_manual] Warning updating articles.json:`, e.message);
  }
}

// CLI Execution Entrypoint
const rawArgs = process.argv.slice(2);
const topicIdx = rawArgs.indexOf('--topic');
if (topicIdx !== -1) {
  console.log(`[publish_manual] --topic flag detected. Routing through standardized publisher pipeline...`);
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'publisher.js'), ...rawArgs], {
      stdio: 'inherit',
      cwd: ROOT_DIR
    });
    console.log(`\n🎉 Manual publisher suite finished successfully.`);
    process.exit(0);
  } catch (err) {
    console.error(`[publish_manual] Error during topic publication: ${err.message}`);
    process.exit(1);
  }
}

const targetArg = process.argv[2];
if (targetArg) {
  let targetPath = targetArg;
  if (!fs.existsSync(targetPath)) {
    targetPath = path.join(articlesDir, targetArg.endsWith('.html') ? targetArg : `${targetArg}.html`);
  }
  if (!fs.existsSync(targetPath)) {
    targetPath = path.join(ROOT_DIR, targetArg.endsWith('.html') ? targetArg : `${targetArg}.html`);
  }

  if (fs.existsSync(targetPath)) {
    processArticleFile(targetPath);
  } else {
    console.error(`[ERROR] File not found: ${targetArg}`);
    process.exit(1);
  }
} else {
  // Batch process all active articles in articles/
  console.log(`[publish_manual] No specific file provided. Auditing all active articles in articles/...`);
  const files = fs.readdirSync(articlesDir).filter(f => f.endsWith('.html'));
  for (const f of files) {
    processArticleFile(path.join(articlesDir, f));
  }
}

console.log(`\n🎉 Manual publisher suite finished successfully.`);
