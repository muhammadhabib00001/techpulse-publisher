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
const BASE_URL = 'https://www.genalphamagazines.com';

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&bull;|•|&middot;/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

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

function syncLlmsFiles(existingSlugs, writeIfChanged) {
  const articlesDir = path.join(ROOT_DIR, 'articles');
  if (!fs.existsSync(articlesDir)) return;

  const categoryMap = {
    "inside-the-business-empire-of-elon-musk-today": "Business",
    "how-high-interest-rates-are-reshaping-the-us-economy": "Business",
    "gta-6-vice-city-map-comparison-setting-scale-landmarks": "Games",
    "the-vinyl-record-resurgence-turntable-setups-pressing": "Lifestyle",
    "top-7-phone-features-and-specs": "Technology",
    "inside-apple-s-ios-27-architecture-and-ai-innovations": "Technology",
    "25-american-movies-defining-visual-storytelling-today": "Entertainment",
    "how-ai-is-reshaping-main-street-business-operations": "Business",
    "common-travel-problems-and-solutions-a-complete-guide": "Lifestyle",
    "fomc-meeting-sept-2026-interest-rates-and-market-outlook": "Business",
    "gta-6-release-date-map-and-gameplay-guide": "Games",
    "how-to-handle-flight-delays-and-travel-disruptions": "Lifestyle",
    "main-street-business-revitalization-guide-for-2026": "Business",
    "the-evolving-hr-manager-strategy-tech-and-culture": "Business",
    "cristiano-ronaldo-career-legacy-and-records": "Celebrity",
    "lebron-james-the-evolution-of-nba-royalty-on-and-off-court": "Celebrity",
    "top-german-celebrities-shaping-global-culture-today": "Celebrity",
    "25-famous-celebrity-in-usa-career-influence-and-cultur": "Celebrity",
    "grassroots-indie-film-distribution-how-regional-festival": "Entertainment",
    "cinematic-masterpieces-unforgettable-films-centering-women": "Entertainment",
    "local-playwrights-guide-independent-theater-spotlight": "Entertainment",
    "the-kitchen-as-canvas-designing-creative-culinary-spaces": "Lifestyle",
    "what-are-the-most-popular-games-dominating-players-today": "Games",
    "key-health-issues-affecting-women-symptoms-and-solutions": "Health",
    "heart-problems-evidence-based-insights-and-expert-guidance": "Health",
    "us-interest-rates-yields-inflation-and-borrowing-strategy": "News",
    "trump-crypto-policy-guide-2026-regulations-and-impact": "News",
    "us-army-modernization-strategy-tech-and-troop-structure": "News",
    "waterfront-heritage-festival-2026-record-artisan-lineup": "Community",
    "modern-bathroom-upgrades-spa-luxury-meets-smart-tech": "Lifestyle",
    "smart-home-energy-audits-heat-pump-and-solar-storage": "Technology",
    "solar-battery-storage-guide-costs-types-and-savings": "Technology"
  };

  const files = fs.readdirSync(articlesDir).filter(f => f.endsWith('.html') && existingSlugs.has(f.replace('.html', '')));
  const articlesData = [];

  for (const file of files) {
    const slug = file.replace('.html', '');
    const filePath = path.join(articlesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    let title = '';
    const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      title = sanitizeTitleString(stripHtml(h1Match[1]));
    } else {
      const tMatch = content.match(/<title>([^<|]+)/i);
      title = sanitizeTitleString(tMatch ? tMatch[1].trim() : slug.replace(/-/g, ' '));
    }

    let summary = '';
    const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    if (descMatch) {
      summary = stripHtml(descMatch[1]);
    } else {
      summary = `In-depth reporting and investigative analysis on ${title}.`;
    }

    const category = categoryMap[slug] || 'News';

    let author = 'Julia Vance';
    const authorMatch = content.match(/By\s+<a[^>]*>([^<]+)<\/a>/i) || content.match(/class=["']author-name["'][^>]*>([^<]+)</i);
    if (authorMatch) {
      author = authorMatch[1].trim();
    }

    const faqs = [];
    const faqSec = content.match(/<section[^>]*id=["']frequently-asked-questions["'][^>]*>([\s\S]*?)<\/section>/i);
    if (faqSec) {
      const cardRe = /<div[^>]*class=["'](?:faq-card|faq-item)["'][^>]*>([\s\S]*?)<\/div>/gi;
      let cm;
      while ((cm = cardRe.exec(faqSec[1])) !== null) {
        const qm = cm[1].match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i);
        const am = cm[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        if (qm && am) {
          faqs.push({
            question: stripHtml(qm[1]),
            answer: stripHtml(am[1])
          });
        }
      }
    }

    const sections = [];
    const secRe = /<section\s+(?:id=["']([^"']+)["'][^>]*)?>([\s\S]*?)<\/section>/gi;
    let sm;
    while ((sm = secRe.exec(content)) !== null) {
      const secId = sm[1] || '';
      if (secId === 'frequently-asked-questions') continue;
      const h2Match = sm[2].match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      const heading = h2Match ? stripHtml(h2Match[1]) : '';
      const pMatches = sm[2].match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
      const paragraphs = pMatches.map(p => stripHtml(p)).filter(p => p.length > 20);

      if (heading && paragraphs.length > 0) {
        sections.push({ heading, paragraphs });
      }
    }

    articlesData.push({
      slug,
      url: `${BASE_URL}/${slug}`,
      title,
      summary,
      category,
      author,
      faqs,
      sections
    });
  }

  articlesData.sort((a, b) => a.title.localeCompare(b.title));

  // Build llms.txt
  let llmsTxt = `# GenAlphaMagazines

> GenAlphaMagazines is an independent modern newsmagazine delivering authoritative reporting, investigative guides, and in-depth coverage across business, technology, celebrity culture, entertainment, games, health, and current affairs.

## Main Navigation
- [Home](${BASE_URL}/): Positively local and global journalism, culture, and deep-dive analysis.
- [Categories](${BASE_URL}/categories.html): Comprehensive directory of all editorial departments and topic beats.
- [About Us](${BASE_URL}/pages/about.html): Mission, journalistic integrity standards, and editorial values.
- [Editorial Standards](${BASE_URL}/pages/editorial-policy.html): Fact-checking, correction policy, and journalistic ethics.
- [Authors Directory](${BASE_URL}/author/marcus-reid.html): Editorial staff profiles and accredited correspondents.

## Editorial Categories
- [News](${BASE_URL}/category-news.html): Breaking local, national, and international reporting, investigative journalism, municipal affairs, and policy updates.
- [Business](${BASE_URL}/category-business.html): Commercial enterprise, financial markets, small business development, and macroeconomic policy.
- [Celebrity](${BASE_URL}/category-celebrity.html): Exclusive profiles, pop-culture icons, behind-the-scenes interviews, red carpet reports, and entertainment personalities.
- [Entertainment](${BASE_URL}/category-entertainment.html): Cinema, television releases, theater productions, music premieres, streaming highlights, and arts reviews.
- [Games](${BASE_URL}/category-games.html): Video game reviews, release schedules, gameplay guides, console breakthroughs, and competitive esports coverage.
- [Health](${BASE_URL}/category-health.html): Clinical medical breakthroughs, physical fitness guides, holistic wellness, nutrition science, and mental health.
- [Technology](${BASE_URL}/category-technology.html): Artificial intelligence, smart hardware, renewable green tech, clean energy infrastructure, and digital consumer tech.
- [Lifestyle](${BASE_URL}/category-lifestyle.html): Living spaces, domestic design, modern culture, travel guides, and culinary arts.
- [Community](${BASE_URL}/category-community.html): Regional festivals, civic initiatives, independent culture, and local commerce.
- [Others](${BASE_URL}/category-others.html): Specialized coverage, emerging topics, multi-disciplinary guides, and diverse general reporting.

## Published Articles & In-Depth Reports
`;

  for (const a of articlesData) {
    llmsTxt += `- [${a.title}](${a.url}): ${a.summary}\n`;
  }

  llmsTxt += `
## Compliance & Legal
- [Privacy Policy](${BASE_URL}/pages/privacy-policy.html): Data protection and privacy practices.
- [Terms & Conditions](${BASE_URL}/pages/terms.html): Terms of service and content usage.
- [Cookie Policy](${BASE_URL}/pages/cookie-policy.html): Cookie usage and preferences.
- [Disclaimer](${BASE_URL}/pages/disclaimer.html): Content liability and accuracy disclosures.
- [Affiliate Disclosure](${BASE_URL}/pages/affiliate-disclosure.html): Transparency regarding partnerships and affiliations.
- [Contact](${BASE_URL}/pages/contact.html): Newsroom contact information and news tips (intouchmagazines26@gmail.com).

## Full Documentation for LLMs
- [Complete Knowledge Base](${BASE_URL}/llms-full.txt): Comprehensive text content of all published articles and reference guides.
`;

  const llmsPath = path.join(ROOT_DIR, 'llms.txt');
  const originalLlms = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, 'utf8') : '';
  writeIfChanged(llmsPath, llmsTxt.trim() + '\n', originalLlms);

  // Build llms-full.txt
  let llmsFullTxt = `# GenAlphaMagazines - Full Knowledge Base & Editorial Archive

> Site URL: ${BASE_URL}
> Official Newsroom Email: intouchmagazines26@gmail.com
> Total Active Articles: ${articlesData.length}
> Last Updated: ${new Date().toISOString().split('T')[0]}
> Description: Independent modern newsmagazine delivering authoritative reporting, investigative guides, and in-depth coverage across business, technology, celebrity culture, entertainment, games, health, and current affairs.

`;

  for (const a of articlesData) {
    llmsFullTxt += `## ${a.title}\n`;
    llmsFullTxt += `URL: ${a.url}\n`;
    llmsFullTxt += `Category: ${a.category}\n`;
    llmsFullTxt += `Author: ${a.author}\n`;
    llmsFullTxt += `Summary: ${a.summary}\n\n`;

    if (a.sections.length > 0) {
      llmsFullTxt += `### Key Reporting & Editorial Content\n\n`;
      for (const sec of a.sections) {
        llmsFullTxt += `#### ${sec.heading}\n`;
        llmsFullTxt += `${sec.paragraphs.join('\n\n')}\n\n`;
      }
    }

    if (a.faqs.length > 0) {
      llmsFullTxt += `### Frequently Asked Questions\n\n`;
      for (const f of a.faqs) {
        llmsFullTxt += `- **Q: ${f.question}**\n  **A:** ${f.answer}\n\n`;
      }
    }

    llmsFullTxt += `---\n\n`;
  }

  const llmsFullPath = path.join(ROOT_DIR, 'llms-full.txt');
  const originalFull = fs.existsSync(llmsFullPath) ? fs.readFileSync(llmsFullPath, 'utf8') : '';
  writeIfChanged(llmsFullPath, llmsFullTxt.trim() + '\n', originalFull);
}


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
      const reservedSlugs = new Set(['categories', 'index', '404', 'admin']);
      if (!reservedSlugs.has(slug) && !slug.startsWith('category-') && !existingSlugs.has(slug)) {
        console.log(`[sync_articles] Removing deleted article from sitemap.xml: ${slug}`);
        return '';
      }
      return match;
    });

    writeIfChanged(sitemapPath, updated, original);
  }

    // 5. Sync llms.txt and llms-full.txt
  syncLlmsFiles(existingSlugs, writeIfChanged);

  // 6. Sync category-*.html files (Grids, Cards, and Tickers)
  const rootFiles = fs.readdirSync(ROOT_DIR);
  const categoryFiles = rootFiles.filter(f => f.startsWith('category-') && f.endsWith('.html'));

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  for (const catFile of categoryFiles) {
    const catPath = path.join(ROOT_DIR, catFile);
    let original = fs.readFileSync(catPath, 'utf8');
    let updated = original;

    // Detect category name from filename, e.g. category-news.html -> news
    const catName = catFile.replace('category-', '').replace('.html', '').toLowerCase();

    // Matching articles for this category
    const matchingArticles = validArticlesList.filter(a => {
      const artCat = (a.category || 'news').toLowerCase();
      if (artCat === catName) return true;
      if (catName === 'entertainment' && ['entertainment', 'celebrity', 'arts', 'culture'].includes(artCat)) return true;
      if (catName === 'lifestyle' && ['lifestyle', 'wellness', 'health'].includes(artCat)) return true;
      return false;
    });

    if (matchingArticles.length > 0) {
      // Rebuild <div class="articles-grid"> with all matching articles ordered newest first
      const gridStart = updated.indexOf('<div class="articles-grid"');
      if (gridStart !== -1) {
        const gridContentStart = updated.indexOf('>', gridStart) + 1;
        const gridEnd = updated.indexOf('</div>', gridContentStart);
        if (gridEnd !== -1) {
          const cardsHtml = matchingArticles.map(art => {
            const imgSrc = art.image || ('./assets/images/' + art.slug + '.jpg');
            return `
          <!-- Article: ${art.slug}.html -->
          <article class="card">
            <div class="card-img-wrap">
              <img src="${imgSrc}" alt="${escapeHtml(art.title)}" loading="lazy">
            </div>
            <div class="card-content">
              <span class="card-tag">${(art.category || catName).toUpperCase()} &bull; Feature</span>
              <h3 class="card-title">
                <a href="/${art.slug}">${escapeHtml(art.title)}</a>
              </h3>
              <p class="card-excerpt">${escapeHtml(art.excerpt || '')}</p>
              <div class="card-meta">
                <span>By <a href="./author/${art.authorSlug || 'julia-vance'}.html">${escapeHtml(art.author || 'Julia Vance')}</a></span>
                <span>${art.date || 'Recent'}</span>
              </div>
            </div>
          </article>`;
          }).join('\n');

          updated = updated.slice(0, gridContentStart) + cardsHtml + '\n        ' + updated.slice(gridEnd);
        }
      }
    }

    // Refresh Breaking Ticker in category page with top 10 recent articles
    const tickerTrackStart = updated.indexOf('<div class="breaking-ticker-track">');
    if (tickerTrackStart !== -1) {
      const trackContentStart = updated.indexOf('>', tickerTrackStart) + 1;
      const trackEnd = updated.indexOf('</div>', trackContentStart);
      if (trackEnd !== -1) {
        const tickerItems = validArticlesList.slice(0, 10).map(art => 
          `          <a href="/${art.slug}" class="breaking-ticker-item"><span class="ticker-bullet">&bull;</span> ${escapeHtml(art.title)}</a>`
        ).join('\n');
        updated = updated.slice(0, trackContentStart) + '\n' + tickerItems + '\n        ' + updated.slice(trackEnd);
      }
    }

    writeIfChanged(catPath, updated, original);
  }

  // 7. Sync index.html (Homepage: Section 1 Latest Stories, Head Preloads, and Breaking Ticker)
  const indexPath = path.join(ROOT_DIR, 'index.html');
  if (fs.existsSync(indexPath) && validArticlesList.length > 0) {
    let original = fs.readFileSync(indexPath, 'utf8');
    let updated = original;

    const leadArticle = validArticlesList[0];
    const sideArticles = validArticlesList.slice(1, 8);

    // A. Rebuild pattern-a-grid in Latest Stories section
    const patternAStart = updated.indexOf('<div class="pattern-a-grid">');
    if (patternAStart !== -1) {
      const gridContentStart = updated.indexOf('>', patternAStart) + 1;
      // Find the closing </div> of pattern-a-grid (preceding </section>)
      const sectionEnd = updated.indexOf('</section>', gridContentStart);
      if (sectionEnd !== -1) {
        const gridEnd = updated.lastIndexOf('</div>', sectionEnd);
        if (gridEnd > gridContentStart) {
          const leadImgSrc = leadArticle.image || ('./assets/images/' + leadArticle.slug + '.jpg');
          const leadCardHtml = `
          <!-- 1 Main Big Lead Article -->
          <div class="pattern-a-main">
            <article class="card">
              <div class="card-img-wrap">
                <img src="${leadImgSrc}" alt="${escapeHtml(leadArticle.title)}" width="800" height="450" loading="eager" fetchpriority="high" decoding="async">
              </div>
              <div class="card-content">
                <span class="card-tag">${(leadArticle.category || 'NEWS').toUpperCase()} &bull; Editorial Lead Feature</span>
                <h3 class="card-title">
                  <a href="/${leadArticle.slug}">${escapeHtml(leadArticle.title)}</a>
                </h3>
                <p class="card-excerpt">${escapeHtml(leadArticle.excerpt || '')}</p>
                <div class="card-meta">
                  <span>By <a href="./author/${leadArticle.authorSlug || 'julia-vance'}.html">${escapeHtml(leadArticle.author || 'Julia Vance')}</a></span>
                  <span>${leadArticle.date || 'Recent'}</span>
                </div>
              </div>
            </article>
          </div>

          <div class="pattern-a-side-list">
${sideArticles.map(art => {
  const sideImg = art.image || ('./assets/images/' + art.slug + '.jpg');
  return `            <article class="mini-side-card">
              <div class="mini-side-thumb">
                <img src="${sideImg}" alt="${escapeHtml(art.title)}" loading="lazy">
              </div>
              <div class="mini-side-content">
                <span class="mini-side-tag">${(art.category || 'NEWS').toUpperCase()}</span>
                <h4 class="mini-side-title">
                  <a href="/${art.slug}">${escapeHtml(art.title)}</a>
                </h4>
                <div class="mini-side-meta">${art.date || 'Recent'}</div>
              </div>
            </article>`;
}).join('\n\n')}
          </div>
        `;

          updated = updated.slice(0, gridContentStart) + leadCardHtml + updated.slice(gridEnd);
        }
      }
    }

    // B. Update LCP preload in <head> for the new lead story image
    const leadImgSrc = leadArticle.image || ('./assets/images/' + leadArticle.slug + '.jpg');
    const preloadRegex = /<link\s+rel="preload"\s+as="image"\s+href="[^"]*"\s+fetchpriority="high">/;
    const newPreload = `<link rel="preload" as="image" href="${leadImgSrc}" fetchpriority="high">`;
    if (preloadRegex.test(updated)) {
      updated = updated.replace(preloadRegex, newPreload);
    }

    // C. Rebuild Breaking News Ticker Track with top 10 articles
    const tickerTrackStart = updated.indexOf('<div class="breaking-ticker-track">');
    if (tickerTrackStart !== -1) {
      const trackContentStart = updated.indexOf('>', tickerTrackStart) + 1;
      const trackEnd = updated.indexOf('</div>', trackContentStart);
      if (trackEnd !== -1) {
        const tickerItems = validArticlesList.slice(0, 10).map(art => 
          `          <a href="/${art.slug}" class="breaking-ticker-item"><span class="ticker-bullet">&bull;</span> ${escapeHtml(art.title)}</a>`
        ).join('\n');
        updated = updated.slice(0, trackContentStart) + '\n' + tickerItems + '\n        ' + updated.slice(trackEnd);
      }
    }

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
      const reservedSlugs = new Set(['categories', 'index', '404', 'admin']);
      if (!reservedSlugs.has(slug) && !slug.startsWith('category-') && !existingSlugs.has(slug)) {
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

  // 10. Synchronize root directory HTML files with articles/
  const knownStaticPages = new Set([
    'index.html', '404.html', 'admin.html', 'categories.html',
    'category-business.html', 'category-celebrity.html', 'category-entertainment.html',
    'category-games.html', 'category-health.html', 'category-news.html',
    'category-others.html', 'category-technology.html',
    'category-arts.html', 'category-community.html', 'category-lifestyle.html', 'category-voices.html'
  ]);

  // Ensure every active article exists in root
  for (const artFile of existingArticleFiles) {
    const rootPath = path.join(ROOT_DIR, artFile);
    const artPath = path.join(articlesDir, artFile);
    if (!fs.existsSync(rootPath) || fs.readFileSync(rootPath, 'utf8') !== fs.readFileSync(artPath, 'utf8')) {
      fs.copyFileSync(artPath, rootPath);
      console.log(`[sync_articles] Mirrored/synced active article to root: ${artFile}`);
      modifiedFiles.push(artFile);
    }
  }

  // Remove any deleted articles lingering in root
  const rootFilesAll = fs.readdirSync(ROOT_DIR);
  for (const rf of rootFilesAll) {
    if (rf.endsWith('.html') && !knownStaticPages.has(rf)) {
      const baseSlug = rf.replace('.html', '');
      if (!existingSlugs.has(baseSlug)) {
        try {
          fs.unlinkSync(path.join(ROOT_DIR, rf));
          console.log(`[sync_articles] Removed deleted article file from root: ${rf}`);
          modifiedFiles.push(rf);
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


module.exports = { syncDeletedArticles, syncLlmsFiles };
