const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

// Load databases
const siteSettings = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'site_settings.json'), 'utf8'));
const categories = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'categories.json'), 'utf8'));
const authors = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'authors.json'), 'utf8'));
const articles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'articles.json'), 'utf8'));
const translations = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'translations.json'), 'utf8'));

const DOMAIN = siteSettings.domain.replace(/\/+$/, '');
const LANGUAGES = siteSettings.activeLanguages; // [en, es, de, fr, pt, ar, hi, it]

// Helper to escape HTML
function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// Ensure directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Generate Hreflang Tags for a given relative path across all languages
function getHreflangTags(relPath) {
  // relPath is e.g. "" (for home), "articles/foo" or "categories/bar"
  let tags = '';
  LANGUAGES.forEach(lang => {
    const url = lang.code === 'en' 
      ? (relPath ? `${DOMAIN}/${relPath}` : `${DOMAIN}/`)
      : (relPath ? `${DOMAIN}/${lang.code}/${relPath}` : `${DOMAIN}/${lang.code}/`);
    tags += `  <link rel="alternate" hreflang="${lang.code}" href="${url}" />\n`;
  });
  tags += `  <link rel="alternate" hreflang="x-default" href="${relPath ? `${DOMAIN}/${relPath}` : `${DOMAIN}/`}" />\n`;
  return tags;
}

// Generate Header HTML
function renderHeader(currentLangCode, activeNavSlug = '') {
  const t = translations[currentLangCode] || translations['en'];
  const isRTL = currentLangCode === 'ar';
  const prefix = currentLangCode === 'en' ? '' : `/${currentLangCode}`;

  let breakingHTML = '';
  if (siteSettings.breakingAlert && siteSettings.breakingAlert.enabled) {
    const alertUrl = `${prefix}${siteSettings.breakingAlert.url}`;
    breakingHTML = `
      <div class="breaking-banner" role="region" aria-label="Breaking News">
        <div class="container breaking-inner">
          <span class="breaking-tag">${t.breakingNews || 'BREAKING'}</span>
          <a href="${alertUrl}" class="breaking-text">${escapeHTML(siteSettings.breakingAlert.headline)}</a>
        </div>
      </div>
    `;
  }

  let navItemsHTML = `<li><a href="${prefix || '/'}" class="${activeNavSlug === 'home' ? 'active' : ''}">${t.home || 'Home'}</a></li>`;
  categories.forEach(cat => {
    const catName = (cat.translations && cat.translations[currentLangCode]) || cat.name;
    const catUrl = `${prefix}/categories/${cat.slug}`;
    const isActive = activeNavSlug === cat.slug ? 'active' : '';
    navItemsHTML += `<li><a href="${catUrl}" class="${isActive}">${escapeHTML(catName)}</a></li>`;
  });

  return `
    <!-- Skip to Content -->
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <!-- Top Utility Bar -->
    <aside class="top-utility-bar">
      <div class="container top-utility-inner">
        <div class="utility-left">
          <span id="liveClock" class="utility-date">Loading date...</span>
          <span class="utility-edition">${escapeHTML(t.edition || siteSettings.edition)}</span>
        </div>
        <div class="utility-right">
          <button type="button" class="lang-selector-btn" data-open-modal="langModal" aria-label="Change edition / language">
            🌐 ${escapeHTML(LANGUAGES.find(l => l.code === currentLangCode)?.nativeName || 'English')}
          </button>
          <button type="button" id="themeToggleBtn" class="theme-toggle-btn" aria-label="Toggle dark mode">
            🌓 Mode
          </button>
        </div>
      </div>
    </aside>

    ${breakingHTML}

    <!-- Masthead -->
    <header class="masthead">
      <div class="container masthead-inner">
        <div class="masthead-side-left">
          <button type="button" class="search-trigger-btn" data-open-modal="searchModal" aria-label="Search articles">
            🔍 <span>${escapeHTML(t.search || 'Search')}</span>
          </button>
        </div>
        <div class="masthead-center">
          <a href="${prefix || '/'}" class="site-logo">${escapeHTML(siteSettings.siteName)}</a>
          <p class="site-tagline">${escapeHTML(t.tagline || siteSettings.tagline)}</p>
        </div>
        <div class="masthead-side-right">
          <a href="#newsletter-signup" class="btn-newsletter-top" data-open-modal="newsletterModal">The Global Briefing</a>
        </div>
      </div>
    </header>

    <!-- Category Navigation -->
    <nav class="category-nav" aria-label="Main navigation">
      <div class="container category-nav-inner">
        <ul class="category-nav-list">
          ${navItemsHTML}
        </ul>
      </div>
    </nav>
  `;
}

// Generate Footer HTML
function renderFooter(currentLangCode) {
  const t = translations[currentLangCode] || translations['en'];
  const prefix = currentLangCode === 'en' ? '' : `/${currentLangCode}`;

  let catLinks = '';
  categories.slice(0, 6).forEach(c => {
    const cName = (c.translations && c.translations[currentLangCode]) || c.name;
    catLinks += `<li><a href="${prefix}/categories/${c.slug}">${escapeHTML(cName)}</a></li>`;
  });

  let editionsLinks = '';
  LANGUAGES.forEach(l => {
    const url = l.code === 'en' ? '/' : `/${l.code}/`;
    editionsLinks += `<a href="${url}">${escapeHTML(l.nativeName)}</a>`;
  });

  return `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-top-grid">
          <div class="footer-brand">
            <h3>${escapeHTML(siteSettings.siteName)}</h3>
            <p>${escapeHTML(siteSettings.description)}</p>
            <p style="font-size:0.8125rem;color:var(--text-muted);">
              Editorial Offices: Geneva · London · New York · Tokyo · Singapore
            </p>
          </div>
          <div class="footer-col">
            <h4>${escapeHTML(t.quickLinks || 'Sections')}</h4>
            <ul>${catLinks}</ul>
          </div>
          <div class="footer-col">
            <h4>${escapeHTML(t.editorialPolicy || 'Standards')}</h4>
            <ul>
              <li><a href="${prefix}/pages/editorial-policy">${escapeHTML(t.editorialPolicy || 'Editorial Policy')}</a></li>
              <li><a href="${prefix}/pages/fact-checking">Fact Checking Code</a></li>
              <li><a href="${prefix}/pages/corrections">${escapeHTML(t.corrections || 'Corrections')}</a></li>
              <li><a href="${prefix}/pages/about">Newsroom Team</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Legal &amp; Trust</h4>
            <ul>
              <li><a href="${prefix}/pages/privacy-policy">${escapeHTML(t.privacyPolicy || 'Privacy Policy')}</a></li>
              <li><a href="${prefix}/pages/terms">${escapeHTML(t.termsOfService || 'Terms of Service')}</a></li>
              <li><a href="${prefix}/pages/contact">${escapeHTML(t.contactUs || 'Contact Bureau')}</a></li>
              <li><a href="/sitemap.xml">XML Sitemap</a></li>
              <li><a href="/rss.xml">RSS Feed</a></li>
            </ul>
          </div>
        </div>

        <div class="footer-bottom">
          <div class="footer-editions">
            <span style="font-weight:700;margin-right:0.5rem;">Editions:</span>
            ${editionsLinks}
          </div>
          <p>&copy; ${new Date().getFullYear()} ${escapeHTML(siteSettings.siteName)}. ${escapeHTML(t.allRightsReserved)}</p>
        </div>
      </div>
    </footer>

    <!-- Search Modal -->
    <div id="searchModal" class="newsroom-modal" role="dialog" aria-modal="true" aria-label="Search articles">
      <div class="modal-content">
        <button type="button" class="modal-close-btn" data-close-modal aria-label="Close search">&times;</button>
        <h3 style="font-family:var(--font-headline);margin-bottom:1rem;">Search Newsroom Archive</h3>
        <input type="text" id="liveSearchInput" placeholder="${escapeHTML(t.searchPlaceholder || 'Search headlines, topics...')}" style="width:100%;padding:0.75rem 1rem;font-size:1rem;border:1px solid var(--border-light);border-radius:4px;background:var(--bg-primary);color:var(--text-primary);" />
        <div id="searchResultsContainer"></div>
      </div>
    </div>

    <!-- Language Switcher Modal -->
    <div id="langModal" class="newsroom-modal" role="dialog" aria-modal="true" aria-label="Select edition">
      <div class="modal-content">
        <button type="button" class="modal-close-btn" data-close-modal aria-label="Close language selector">&times;</button>
        <h3 style="font-family:var(--font-headline);margin-bottom:0.5rem;">${escapeHTML(t.switchLanguage || 'Select Edition')}</h3>
        <p style="font-size:0.875rem;color:var(--text-muted);">Choose your preferred language and regional news coverage.</p>
        <div class="language-grid">
          ${LANGUAGES.map(l => `
            <a href="${l.code === 'en' ? '/' : `/${l.code}/`}" class="language-card ${l.code === currentLangCode ? 'active' : ''}">
              <span class="lang-native">${escapeHTML(l.nativeName)}</span>
              <span class="lang-intl">${escapeHTML(l.name)}</span>
            </a>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Newsletter Modal -->
    <div id="newsletterModal" class="newsroom-modal" role="dialog" aria-modal="true" aria-label="Newsletter Subscription">
      <div class="modal-content" style="text-align:center;">
        <button type="button" class="modal-close-btn" data-close-modal aria-label="Close newsletter">&times;</button>
        <h3 style="font-family:var(--font-headline);font-size:1.75rem;margin-bottom:0.5rem;">${escapeHTML(t.newsletterHeading || 'The Global Briefing')}</h3>
        <p style="font-size:0.9375rem;color:var(--text-secondary);margin-bottom:1.5rem;">${escapeHTML(t.newsletterDesc)}</p>
        <form class="newsletter-form" style="display:flex;flex-direction:column;gap:0.75rem;">
          <input type="email" required placeholder="${escapeHTML(t.newsletterPlaceholder || 'Enter your email...')}" class="newsletter-input" style="width:100%;" />
          <button type="submit" class="newsletter-submit">${escapeHTML(t.subscribeBtn || 'Subscribe Free')}</button>
        </form>
      </div>
    </div>

    <script src="/assets/js/newsroom.js" defer></script>
  `;
}

// 1. Build Localized Homepages
function buildHomepages() {
  console.log('Building localized homepages for all 8 languages...');
  
  LANGUAGES.forEach(lang => {
    const code = lang.code;
    const isRTL = lang.dir === 'rtl';
    const t = translations[code] || translations['en'];
    const prefix = code === 'en' ? '' : `/${code}`;
    const pageUrl = code === 'en' ? `${DOMAIN}/` : `${DOMAIN}/${code}/`;

    // Filter published articles
    const published = articles.filter(a => a.status === 'published');
    const heroArticle = published.find(a => a.is_featured) || published[0];
    const secondaryArticles = published.filter(a => a.id !== heroArticle.id).slice(0, 2);
    const opinionArticles = published.filter(a => a.category_id === 'opinion');
    const latestFeed = published.slice(0, 5);

    // Hero Lead Article Data
    const heroTrans = heroArticle.translations[code] || heroArticle.translations['en'];
    const heroAuthor = authors.find(au => au.id === heroArticle.author_id) || authors[0];
    const heroCat = categories.find(c => c.id === heroArticle.category_id) || categories[0];
    const heroCatName = (heroCat.translations && heroCat.translations[code]) || heroCat.name;

    // Secondary articles HTML
    let secondaryHTML = '';
    secondaryArticles.forEach(sec => {
      const sTrans = sec.translations[code] || sec.translations['en'];
      const sCat = categories.find(c => c.id === sec.category_id) || categories[0];
      const sCatName = (sCat.translations && sCat.translations[code]) || sCat.name;
      secondaryHTML += `
        <article class="secondary-news-card">
          <div class="card-media">
            <img src="${sec.featured_image}" alt="${escapeHTML(sTrans.title)}" loading="lazy" />
          </div>
          <a href="${prefix}/categories/${sec.category_id}" class="category-pill">${escapeHTML(sCatName)}</a>
          <h3 class="secondary-title"><a href="${prefix}/articles/${sec.slug}">${escapeHTML(sTrans.title)}</a></h3>
          <div class="card-meta">
            <span>${new Date(sec.published_at).toLocaleDateString(code, { month: 'short', day: 'numeric' })}</span> · 
            <span>${sec.reading_time} ${t.minutesRead || 'min read'}</span>
          </div>
        </article>
      `;
    });

    // Opinion HTML
    let opinionHTML = '';
    const opItem = opinionArticles[0] || published[published.length - 1];
    if (opItem) {
      const opTrans = opItem.translations[code] || opItem.translations['en'];
      const opAuthor = authors.find(au => au.id === opItem.author_id) || authors[0];
      opinionHTML = `
        <div class="opinion-item">
          <div class="opinion-author-header">
            <img src="${opAuthor.avatar || '/assets/images/author-placeholder.jpg'}" alt="${escapeHTML(opAuthor.name)}" class="opinion-author-avatar" />
            <span class="opinion-author-name">${escapeHTML(opAuthor.name)}</span>
          </div>
          <h4 class="opinion-title"><a href="${prefix}/articles/${opItem.slug}">${escapeHTML(opTrans.title)}</a></h4>
        </div>
      `;
    }

    // Latest Feed HTML
    let latestFeedHTML = '';
    latestFeed.forEach(item => {
      const iTrans = item.translations[code] || item.translations['en'];
      const iCat = categories.find(c => c.id === item.category_id) || categories[0];
      const iCatName = (iCat.translations && iCat.translations[code]) || iCat.name;
      latestFeedHTML += `
        <article class="feed-card">
          <div class="card-media">
            <img src="${item.featured_image}" alt="${escapeHTML(iTrans.title)}" loading="lazy" />
          </div>
          <div class="feed-content">
            <a href="${prefix}/categories/${item.category_id}" class="category-pill">${escapeHTML(iCatName)}</a>
            <h3 class="feed-title"><a href="${prefix}/articles/${item.slug}">${escapeHTML(iTrans.title)}</a></h3>
            <p class="feed-deck">${escapeHTML(iTrans.deck)}</p>
            <div class="card-meta">
              <span>${new Date(item.published_at).toLocaleDateString(code, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> · 
              <span>${item.reading_time} ${t.minutesRead || 'min read'}</span>
            </div>
          </div>
        </article>
      `;
    });

    // Trending Sidebar HTML
    let trendingHTML = '';
    published.slice(0, 5).forEach((tr, idx) => {
      const trTrans = tr.translations[code] || tr.translations['en'];
      trendingHTML += `
        <li class="trending-item">
          <span class="trending-number">${idx + 1}</span>
          <a href="${prefix}/articles/${tr.slug}" class="trending-link">${escapeHTML(trTrans.title)}</a>
        </li>
      `;
    });

    // Structured Data JSON-LD
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "NewsMediaOrganization",
      "name": siteSettings.siteName,
      "url": pageUrl,
      "logo": `${DOMAIN}/assets/images/logo.svg`,
      "description": siteSettings.description,
      "publishingPrinciples": `${DOMAIN}/pages/editorial-policy`
    };

    const fullHTML = `<!DOCTYPE html>
<html lang="${code}" dir="${lang.dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(siteSettings.siteName)} · ${escapeHTML(t.tagline || siteSettings.tagline)}</title>
  <meta name="description" content="${escapeHTML(siteSettings.description)}">
  <link rel="canonical" href="${pageUrl}">
  
  <!-- Hreflang alternates -->
${getHreflangTags('')}

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escapeHTML(siteSettings.siteName)}">
  <meta property="og:title" content="${escapeHTML(siteSettings.siteName)} · ${escapeHTML(t.edition || siteSettings.edition)}">
  <meta property="og:description" content="${escapeHTML(siteSettings.description)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${heroArticle.featured_image}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHTML(siteSettings.siteName)}">
  <meta name="twitter:description" content="${escapeHTML(siteSettings.description)}">
  <meta name="twitter:image" content="${heroArticle.featured_image}">

  <link rel="stylesheet" href="/assets/css/newsroom.css">
  <script type="application/ld+json">
    ${JSON.stringify(jsonLd, null, 2)}
  </script>
</head>
<body>
  ${renderHeader(code, 'home')}

  <main id="main-content">
    <div class="container">
      <!-- Top Hero Grid -->
      <section class="news-hero-grid">
        <!-- Lead Hero Story -->
        <article class="hero-lead-card">
          <div class="card-media">
            <img src="${heroArticle.featured_image}" alt="${escapeHTML(heroTrans.title)}" />
          </div>
          <a href="${prefix}/categories/${heroArticle.category_id}" class="category-pill">${escapeHTML(heroCatName)}</a>
          <h2 class="hero-lead-title"><a href="${prefix}/articles/${heroArticle.slug}">${escapeHTML(heroTrans.title)}</a></h2>
          <p class="hero-lead-deck">${escapeHTML(heroTrans.deck)}</p>
          <div class="card-meta">
            <a href="${prefix}/author/${heroAuthor.slug}" class="byline-author">${escapeHTML(heroAuthor.name)}</a> · 
            <span>${new Date(heroArticle.published_at).toLocaleDateString(code, { month: 'short', day: 'numeric', year: 'numeric' })}</span> · 
            <span>${heroArticle.reading_time} ${t.minutesRead || 'min read'}</span>
          </div>
        </article>

        <!-- Secondary Column -->
        <div class="hero-secondary-col">
          ${secondaryHTML}
        </div>

        <!-- Opinion Column -->
        <div class="hero-opinion-col">
          <h3 class="col-header">${escapeHTML(t.opinion || 'Opinion & Analysis')}</h3>
          ${opinionHTML}
          <div style="margin-top:auto;padding-top:1rem;border-top:1px solid var(--border-light);">
            <a href="${prefix}/categories/opinion" style="font-size:0.8125rem;font-weight:700;color:var(--brand-red);text-decoration:none;">
              ${escapeHTML(t.viewAll || 'View All Opinion')} &rarr;
            </a>
          </div>
        </div>
      </section>

      <!-- Main Layout Split: Chronological Feed & Sidebar -->
      <div class="news-layout-split">
        <section class="feed-section">
          <div class="section-title-wrap">
            <h2 class="section-heading">${escapeHTML(t.latestNews || 'Latest Reports')}</h2>
            <span style="font-size:0.8125rem;color:var(--text-muted);font-weight:600;">Real-Time Feed</span>
          </div>
          <div class="feed-list">
            ${latestFeedHTML}
          </div>
        </section>

        <aside class="sidebar-section">
          <div class="sidebar-box">
            <h3 class="sidebar-title">${escapeHTML(t.trending || 'Trending Reports')}</h3>
            <ol class="trending-list">
              ${trendingHTML}
            </ol>
          </div>

          <div class="sidebar-box" style="text-align:center;">
            <h4 style="font-family:var(--font-headline);font-size:1.15rem;margin-bottom:0.5rem;">Independent Reporting</h4>
            <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:1rem;">Verified fact-checking, zero undisclosed sponsors, and real-time coverage across 8 global editions.</p>
            <a href="${prefix}/pages/editorial-policy" style="display:inline-block;padding:0.4rem 0.85rem;border:1px solid var(--border-light);border-radius:3px;font-size:0.8125rem;font-weight:700;text-decoration:none;color:var(--text-primary);">Read Editorial Code</a>
          </div>
        </aside>
      </div>

      <!-- Newsletter Banner -->
      <section id="newsletter-signup" class="newsletter-strip">
        <h2>${escapeHTML(t.newsletterHeading || 'The Global Briefing')}</h2>
        <p>${escapeHTML(t.newsletterDesc)}</p>
        <form class="newsletter-form">
          <input type="email" required placeholder="${escapeHTML(t.newsletterPlaceholder || 'Enter your email...')}" class="newsletter-input" />
          <button type="submit" class="newsletter-submit">${escapeHTML(t.subscribeBtn || 'Subscribe Free')}</button>
        </form>
      </section>
    </div>
  </main>

  ${renderFooter(code)}
</body>
</html>`;

    // Save localized file
    if (code === 'en') {
      fs.writeFileSync(path.join(ROOT_DIR, 'index.html'), fullHTML, 'utf8');
      ensureDir(path.join(ROOT_DIR, 'en'));
      fs.writeFileSync(path.join(ROOT_DIR, 'en', 'index.html'), fullHTML, 'utf8');
    } else {
      ensureDir(path.join(ROOT_DIR, code));
      fs.writeFileSync(path.join(ROOT_DIR, code, 'index.html'), fullHTML, 'utf8');
    }
  });
}

// 2. Build Static Article Pages
function buildArticles() {
  console.log('Building static article pages...');

  articles.forEach(art => {
    const author = authors.find(au => au.id === art.author_id) || authors[0];
    const category = categories.find(c => c.id === art.category_id) || categories[0];

    LANGUAGES.forEach(lang => {
      const code = lang.code;
      const t = translations[code] || translations['en'];
      const trans = art.translations[code] || art.translations['en'];
      const catName = (category.translations && category.translations[code]) || category.name;
      const prefix = code === 'en' ? '' : `/${code}`;
      const relPath = `articles/${art.slug}`;
      const articleUrl = code === 'en' ? `${DOMAIN}/${relPath}` : `${DOMAIN}/${code}/${relPath}`;

      // Key Takeaways HTML
      let takeawaysHTML = '';
      if (art.key_takeaways && art.key_takeaways.length > 0) {
        takeawaysHTML = `
          <div class="key-takeaways-box">
            <h4 class="key-takeaways-title">${escapeHTML(t.keyTakeaways || 'Key Takeaways')}</h4>
            <ul>
              ${art.key_takeaways.map(k => `<li>${escapeHTML(k)}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      // Sources Box HTML
      let sourcesHTML = '';
      if (art.sources && art.sources.length > 0) {
        sourcesHTML = `
          <div class="sources-box">
            <h4 class="sources-title">${escapeHTML(t.primarySources || 'Primary Sources & References')}</h4>
            <ul class="sources-list">
              ${art.sources.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${escapeHTML(s.name)}</a></li>`).join('')}
            </ul>
          </div>
        `;
      }

      // Related articles HTML
      const related = articles.filter(a => a.id !== art.id).slice(0, 2);
      let relatedHTML = '';
      related.forEach(r => {
        const rTrans = r.translations[code] || r.translations['en'];
        relatedHTML += `
          <div style="border-bottom:1px solid var(--border-light);padding-bottom:1rem;margin-bottom:1rem;">
            <a href="${prefix}/articles/${r.slug}" style="font-family:var(--font-headline);font-size:1.15rem;font-weight:700;color:var(--text-primary);text-decoration:none;">
              ${escapeHTML(rTrans.title)}
            </a>
          </div>
        `;
      });

      // JSON-LD NewsArticle Schema
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": trans.title,
        "description": trans.deck,
        "image": [art.featured_image],
        "datePublished": art.published_at,
        "dateModified": art.updated_at || art.published_at,
        "author": [{
          "@type": "Person",
          "name": author.name,
          "jobTitle": author.role,
          "url": `${DOMAIN}/author/${author.slug}`
        }],
        "publisher": {
          "@type": "NewsMediaOrganization",
          "name": siteSettings.siteName,
          "logo": {
            "@type": "ImageObject",
            "url": `${DOMAIN}/assets/images/logo.svg`
          }
        },
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": articleUrl
        }
      };

      const fullHTML = `<!DOCTYPE html>
<html lang="${code}" dir="${lang.dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(trans.title)} · ${escapeHTML(siteSettings.siteName)}</title>
  <meta name="description" content="${escapeHTML(trans.deck)}">
  <link rel="canonical" href="${articleUrl}">
  
  <!-- Hreflang alternates -->
${getHreflangTags(relPath)}

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${escapeHTML(siteSettings.siteName)}">
  <meta property="og:title" content="${escapeHTML(trans.title)}">
  <meta property="og:description" content="${escapeHTML(trans.deck)}">
  <meta property="og:url" content="${articleUrl}">
  <meta property="og:image" content="${art.featured_image}">
  <meta property="article:published_time" content="${art.published_at}">
  <meta property="article:modified_time" content="${art.updated_at || art.published_at}">
  <meta property="article:section" content="${escapeHTML(category.name)}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHTML(trans.title)}">
  <meta name="twitter:description" content="${escapeHTML(trans.deck)}">
  <meta name="twitter:image" content="${art.featured_image}">

  <link rel="stylesheet" href="/assets/css/newsroom.css">
  <script type="application/ld+json">
    ${JSON.stringify(jsonLd, null, 2)}
  </script>
</head>
<body>
  ${renderHeader(code, category.slug)}

  <main id="main-content">
    <article class="article-container">
      <header class="article-header">
        <nav class="article-breadcrumbs" aria-label="Breadcrumb">
          <a href="${prefix || '/'}">${t.home || 'Home'}</a> &gt; 
          <a href="${prefix}/categories/${category.slug}">${escapeHTML(catName)}</a>
        </nav>

        <h1 class="article-headline">${escapeHTML(trans.title)}</h1>
        <p class="article-deck">${escapeHTML(trans.deck)}</p>

        <div class="article-meta-bar">
          <div>
            ${t.bylinePrefix || 'By'} <a href="${prefix}/author/${author.slug}" class="byline-author">${escapeHTML(author.name)}</a> · 
            <span>${new Date(art.published_at).toLocaleDateString(code, { month: 'long', day: 'numeric', year: 'numeric' })}</span> · 
            <span>${art.reading_time} ${t.minutesRead || 'min read'}</span>
          </div>
          <span class="fact-checked-badge">✓ ${escapeHTML(t.factCheckedBadge || 'Fact Checked')}</span>
        </div>

        <figure class="article-featured-image-wrap">
          <img src="${art.featured_image}" alt="${escapeHTML(trans.title)}" />
          <figcaption class="image-caption-bar">
            <span>${escapeHTML(art.image_caption || '')}</span>
            <span>Credit: ${escapeHTML(art.image_credit || 'News Wire')}</span>
          </figcaption>
        </figure>
      </header>

      ${takeawaysHTML}

      <div class="article-body">
        ${trans.content}
      </div>

      ${sourcesHTML}

      <!-- Author Bio Box -->
      <section class="author-bio-card">
        <img src="${author.avatar || '/assets/images/author-placeholder.jpg'}" alt="${escapeHTML(author.name)}" />
        <div>
          <h3 class="author-bio-name"><a href="${prefix}/author/${author.slug}" style="color:var(--text-primary);text-decoration:none;">${escapeHTML(author.name)}</a></h3>
          <p class="author-bio-role">${escapeHTML(author.role)}</p>
          <p class="author-bio-text">${escapeHTML(author.bio)}</p>
        </div>
      </section>

      <!-- Related Stories -->
      <section style="margin:2.5rem 0;">
        <h3 style="font-family:var(--font-headline);font-size:1.5rem;margin-bottom:1rem;border-bottom:2px solid var(--text-primary);padding-bottom:0.5rem;">
          ${escapeHTML(t.relatedStories || 'Related Coverage')}
        </h3>
        <div>${relatedHTML}</div>
      </section>
    </article>
  </main>

  ${renderFooter(code)}
</body>
</html>`;

      // Save files
      if (code === 'en') {
        ensureDir(path.join(ROOT_DIR, 'articles'));
        fs.writeFileSync(path.join(ROOT_DIR, 'articles', `${art.slug}.html`), fullHTML, 'utf8');
      } else {
        ensureDir(path.join(ROOT_DIR, code, 'articles'));
        fs.writeFileSync(path.join(ROOT_DIR, code, 'articles', `${art.slug}.html`), fullHTML, 'utf8');
      }
    });
  });
}

// 3. Build Category Pages
function buildCategories() {
  console.log('Building category hub pages...');
  
  categories.forEach(cat => {
    const catArticles = articles.filter(a => a.category_id === cat.id && a.status === 'published');

    LANGUAGES.forEach(lang => {
      const code = lang.code;
      const t = translations[code] || translations['en'];
      const catName = (cat.translations && cat.translations[code]) || cat.name;
      const prefix = code === 'en' ? '' : `/${code}`;
      const relPath = `categories/${cat.slug}`;
      const pageUrl = code === 'en' ? `${DOMAIN}/${relPath}` : `${DOMAIN}/${code}/${relPath}`;

      let articlesHTML = '';
      if (catArticles.length === 0) {
        articlesHTML = `<p class="text-muted" style="padding:2rem 0;">No active dispatches filed in this section today.</p>`;
      } else {
        catArticles.forEach(item => {
          const trans = item.translations[code] || item.translations['en'];
          articlesHTML += `
            <article class="feed-card">
              <div class="card-media">
                <img src="${item.featured_image}" alt="${escapeHTML(trans.title)}" loading="lazy" />
              </div>
              <div class="feed-content">
                <h3 class="feed-title"><a href="${prefix}/articles/${item.slug}">${escapeHTML(trans.title)}</a></h3>
                <p class="feed-deck">${escapeHTML(trans.deck)}</p>
                <div class="card-meta">
                  <span>${new Date(item.published_at).toLocaleDateString(code, { month: 'short', day: 'numeric', year: 'numeric' })}</span> · 
                  <span>${item.reading_time} ${t.minutesRead || 'min read'}</span>
                </div>
              </div>
            </article>
          `;
        });
      }

      const fullHTML = `<!DOCTYPE html>
<html lang="${code}" dir="${lang.dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(catName)} Coverage · ${escapeHTML(siteSettings.siteName)}</title>
  <meta name="description" content="${escapeHTML(cat.description)}">
  <link rel="canonical" href="${pageUrl}">
  
${getHreflangTags(relPath)}

  <link rel="stylesheet" href="/assets/css/newsroom.css">
</head>
<body>
  ${renderHeader(code, cat.slug)}

  <main id="main-content">
    <div class="container" style="max-width:960px;">
      <div style="border-bottom:3px double var(--text-primary);padding-bottom:1.5rem;margin-bottom:2rem;">
        <span style="font-size:0.75rem;text-transform:uppercase;color:var(--brand-red);font-weight:800;letter-spacing:0.1em;">Section Bureau</span>
        <h1 style="font-family:var(--font-headline);font-size:2.5rem;margin:0.25rem 0;">${escapeHTML(catName)}</h1>
        <p style="font-size:1.1rem;color:var(--text-secondary);">${escapeHTML(cat.description)}</p>
      </div>

      <div class="feed-list">
        ${articlesHTML}
      </div>
    </div>
  </main>

  ${renderFooter(code)}
</body>
</html>`;

      if (code === 'en') {
        ensureDir(path.join(ROOT_DIR, 'categories'));
        fs.writeFileSync(path.join(ROOT_DIR, 'categories', `${cat.slug}.html`), fullHTML, 'utf8');
      } else {
        ensureDir(path.join(ROOT_DIR, code, 'categories'));
        fs.writeFileSync(path.join(ROOT_DIR, code, 'categories', `${cat.slug}.html`), fullHTML, 'utf8');
      }
    });
  });
}

// 4. Build Author Pages
function buildAuthors() {
  console.log('Building author credential profile pages...');

  authors.forEach(author => {
    const authorArticles = articles.filter(a => a.author_id === author.id && a.status === 'published');
    const relPath = `author/${author.slug}`;
    const pageUrl = `${DOMAIN}/${relPath}`;

    let articlesHTML = '';
    authorArticles.forEach(item => {
      const trans = item.translations['en'];
      articlesHTML += `
        <article class="feed-card">
          <div class="card-media">
            <img src="${item.featured_image}" alt="${escapeHTML(trans.title)}" loading="lazy" />
          </div>
          <div class="feed-content">
            <h3 class="feed-title"><a href="/articles/${item.slug}">${escapeHTML(trans.title)}</a></h3>
            <p class="feed-deck">${escapeHTML(trans.deck)}</p>
            <div class="card-meta">
              <span>${new Date(item.published_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          </div>
        </article>
      `;
    });

    const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(author.name)} · Staff Correspondent · ${escapeHTML(siteSettings.siteName)}</title>
  <meta name="description" content="${escapeHTML(author.bio)}">
  <link rel="canonical" href="${pageUrl}">
  <link rel="stylesheet" href="/assets/css/newsroom.css">
</head>
<body>
  ${renderHeader('en')}

  <main id="main-content">
    <div class="container" style="max-width:960px;">
      <div class="author-bio-card" style="margin-top:0;">
        <img src="${author.avatar || '/assets/images/author-placeholder.jpg'}" alt="${escapeHTML(author.name)}" style="width:96px;height:96px;" />
        <div>
          <h1 style="font-family:var(--font-headline);font-size:2rem;margin-bottom:0.25rem;">${escapeHTML(author.name)}</h1>
          <p class="author-bio-role">${escapeHTML(author.role)}</p>
          <p class="author-bio-text">${escapeHTML(author.bio)}</p>
          <div style="margin-top:1rem;display:flex;gap:1rem;font-size:0.8125rem;">
            ${author.twitter ? `<a href="${author.twitter}" target="_blank" rel="noopener noreferrer">Twitter / X</a>` : ''}
            ${author.linkedin ? `<a href="${author.linkedin}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ''}
            <a href="mailto:${author.email}">Contact Desk</a>
          </div>
        </div>
      </div>

      <div style="margin:2.5rem 0;">
        <h2 style="font-family:var(--font-headline);font-size:1.5rem;margin-bottom:1.5rem;border-bottom:2px solid var(--text-primary);padding-bottom:0.5rem;">
          Published Reporting (${authorArticles.length})
        </h2>
        <div class="feed-list">
          ${articlesHTML}
        </div>
      </div>
    </div>
  </main>

  ${renderFooter('en')}
</body>
</html>`;

    ensureDir(path.join(ROOT_DIR, 'author'));
    fs.writeFileSync(path.join(ROOT_DIR, 'author', `${author.slug}.html`), fullHTML, 'utf8');
  });
}

// 5. Build Sitemaps, Feeds, and LLM Manifests
function buildSitemapsAndFeeds() {
  console.log('Generating sitemaps, RSS, and LLM manifests...');

  // Standard XML Sitemap with Hreflang Alternates
  let sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  sitemapXML += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;

  // Root & Language Homepages
  sitemapXML += `  <url>\n    <loc>${DOMAIN}/</loc>\n    <changefreq>hourly</changefreq>\n    <priority>1.0</priority>\n`;
  LANGUAGES.forEach(l => {
    const lUrl = l.code === 'en' ? `${DOMAIN}/` : `${DOMAIN}/${l.code}/`;
    sitemapXML += `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${lUrl}"/>\n`;
  });
  sitemapXML += `  </url>\n`;

  LANGUAGES.filter(l => l.code !== 'en').forEach(l => {
    sitemapXML += `  <url>\n    <loc>${DOMAIN}/${l.code}/</loc>\n    <changefreq>hourly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
  });

  // Articles
  articles.filter(a => a.status === 'published').forEach(art => {
    sitemapXML += `  <url>\n    <loc>${DOMAIN}/articles/${art.slug}</loc>\n    <lastmod>${art.updated_at || art.published_at}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n`;
    LANGUAGES.forEach(l => {
      const artUrl = l.code === 'en' ? `${DOMAIN}/articles/${art.slug}` : `${DOMAIN}/${l.code}/articles/${art.slug}`;
      sitemapXML += `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${artUrl}"/>\n`;
    });
    sitemapXML += `  </url>\n`;
  });

  // Categories
  categories.forEach(cat => {
    sitemapXML += `  <url>\n    <loc>${DOMAIN}/categories/${cat.slug}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  });

  sitemapXML += `</urlset>\n`;
  fs.writeFileSync(path.join(ROOT_DIR, 'sitemap.xml'), sitemapXML, 'utf8');

  // Google News Sitemap
  let newsSitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  newsSitemapXML += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n`;
  articles.filter(a => a.status === 'published').forEach(art => {
    newsSitemapXML += `  <url>\n`;
    newsSitemapXML += `    <loc>${DOMAIN}/articles/${art.slug}</loc>\n`;
    newsSitemapXML += `    <news:news>\n`;
    newsSitemapXML += `      <news:publication>\n`;
    newsSitemapXML += `        <news:name>${escapeHTML(siteSettings.siteName)}</news:name>\n`;
    newsSitemapXML += `        <news:language>en</news:language>\n`;
    newsSitemapXML += `      </news:publication>\n`;
    newsSitemapXML += `      <news:publication_date>${art.published_at}</news:publication_date>\n`;
    newsSitemapXML += `      <news:title>${escapeHTML(art.translations['en'].title)}</news:title>\n`;
    newsSitemapXML += `    </news:news>\n`;
    newsSitemapXML += `  </url>\n`;
  });
  newsSitemapXML += `</urlset>\n`;
  fs.writeFileSync(path.join(ROOT_DIR, 'news-sitemap.xml'), newsSitemapXML, 'utf8');

  // RSS 2.0 Feed
  let rssXML = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  rssXML += `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n`;
  rssXML += `  <channel>\n`;
  rssXML += `    <title>${escapeHTML(siteSettings.siteName)}</title>\n`;
  rssXML += `    <link>${DOMAIN}/</link>\n`;
  rssXML += `    <description>${escapeHTML(siteSettings.description)}</description>\n`;
  rssXML += `    <language>en-us</language>\n`;
  rssXML += `    <atom:link href="${DOMAIN}/rss.xml" rel="self" type="application/rss+xml"/>\n`;
  articles.filter(a => a.status === 'published').forEach(art => {
    rssXML += `    <item>\n`;
    rssXML += `      <title>${escapeHTML(art.translations['en'].title)}</title>\n`;
    rssXML += `      <link>${DOMAIN}/articles/${art.slug}</link>\n`;
    rssXML += `      <description>${escapeHTML(art.translations['en'].deck)}</description>\n`;
    rssXML += `      <pubDate>${new Date(art.published_at).toUTCString()}</pubDate>\n`;
    rssXML += `      <guid>${DOMAIN}/articles/${art.slug}</guid>\n`;
    rssXML += `    </item>\n`;
  });
  rssXML += `  </channel>\n`;
  rssXML += `</rss>\n`;
  fs.writeFileSync(path.join(ROOT_DIR, 'rss.xml'), rssXML, 'utf8');
  fs.writeFileSync(path.join(ROOT_DIR, 'feed.xml'), rssXML, 'utf8');

  // robots.txt
  const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin.html

Sitemap: ${DOMAIN}/sitemap.xml
Sitemap: ${DOMAIN}/news-sitemap.xml
`;
  fs.writeFileSync(path.join(ROOT_DIR, 'robots.txt'), robotsTxt, 'utf8');

  // llms.txt (Section 26: LLMO & AI Search Systems)
  let llmsTxt = `# GenAlpha Magazines - International Newsroom Manifest
> Global Perspectives, Real-Time Independent Journalism

GenAlpha Magazines publishes verified international news, diplomatic developments, economic reports, and science coverage across eight launch editions.

## Editions
- English: ${DOMAIN}/
- Spanish: ${DOMAIN}/es/
- German: ${DOMAIN}/de/
- French: ${DOMAIN}/fr/
- Portuguese: ${DOMAIN}/pt/
- Arabic: ${DOMAIN}/ar/
- Hindi: ${DOMAIN}/hi/
- Italian: ${DOMAIN}/it/

## Core Sections
`;
  categories.forEach(c => {
    llmsTxt += `- [${c.name}](${DOMAIN}/categories/${c.slug}): ${c.description}\n`;
  });
  llmsTxt += `\n## Recent Dispatches\n`;
  articles.filter(a => a.status === 'published').forEach(art => {
    llmsTxt += `- [${art.translations['en'].title}](${DOMAIN}/articles/${art.slug}): ${art.translations['en'].deck}\n`;
  });
  fs.writeFileSync(path.join(ROOT_DIR, 'llms.txt'), llmsTxt, 'utf8');
}

// 6. Build Trust & Compliance Pages
function buildPages() {
  console.log('Building editorial trust and policy pages...');
  ensureDir(path.join(ROOT_DIR, 'pages'));

  const staticPages = [
    {
      file: 'editorial-policy.html',
      title: 'Editorial Standards & Verification Policy',
      content: `<h1>Editorial Standards &amp; Verification Policy</h1><p>GenAlpha Magazines operates according to strict standards of factual accuracy, source verification, and independent editorial judgment. Our reporting is produced and fact-checked by experienced journalists before publication.</p><h2>Source Attribution</h2><p>We require corroboration from primary documentation, on-the-record statements, or multiple independent sources before publishing claims of fact. When anonymous sources are consulted, the senior editor must review the source's access and credentials.</p><h2>Conflicts of Interest</h2><p>Staff writers and contributors are prohibited from holding financial interests or accepting compensation from entities they cover.</p>`
    },
    {
      file: 'fact-checking.html',
      title: 'Fact-Checking Code & Methodology',
      content: `<h1>Fact-Checking Code &amp; Methodology</h1><p>Every claim, figure, and quote published on GenAlpha Magazines undergoes verification against authoritative primary records. Our fact-checking team operates independently of commercial interests.</p><h2>Correction Workflow</h2><p>If an error of fact occurs, we issue an explicit correction note at the top or bottom of the article identifying the original wording and the corrected information.</p>`
    },
    {
      file: 'corrections.html',
      title: 'Corrections & Clarifications Policy',
      content: `<h1>Corrections &amp; Clarifications</h1><p>We are committed to correcting errors promptly and transparently. Readers can report potential errors directly to our editorial desk at <a href="mailto:editor@genalphamagazines.com">editor@genalphamagazines.com</a>.</p>`
    },
    {
      file: 'about.html',
      title: 'About GenAlpha Magazines Newsroom',
      content: `<h1>About GenAlpha Magazines</h1><p>GenAlpha Magazines is an international digital news organization providing continuous, verified news coverage across eight languages. We maintain bureaus and correspondents in key diplomatic and financial centers.</p>`
    },
    {
      file: 'privacy-policy.html',
      title: 'Privacy Policy',
      content: `<h1>Privacy Policy</h1><p>This privacy policy explains how GenAlpha Magazines collects, uses, and safeguards information when you visit our website. We do not sell personal data to third parties.</p>`
    },
    {
      file: 'terms.html',
      title: 'Terms of Service',
      content: `<h1>Terms of Service</h1><p>By accessing GenAlpha Magazines, you agree to comply with our terms of service and applicable international copyright laws.</p>`
    },
    {
      file: 'contact.html',
      title: 'Newsroom Directory & Bureau Contacts',
      content: `<h1>Newsroom Directory &amp; Bureau Contacts</h1><p>General Inquiries: <a href="mailto:newsroom@genalphamagazines.com">newsroom@genalphamagazines.com</a></p><p>Press Releases: <a href="mailto:press@genalphamagazines.com">press@genalphamagazines.com</a></p>`
    }
  ];

  staticPages.forEach(p => {
    const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(p.title)} · ${escapeHTML(siteSettings.siteName)}</title>
  <link rel="canonical" href="${DOMAIN}/pages/${p.file.replace('.html', '')}">
  <link rel="stylesheet" href="/assets/css/newsroom.css">
</head>
<body>
  ${renderHeader('en')}

  <main id="main-content">
    <div class="container article-container" style="max-width:760px;">
      <div class="article-body">
        ${p.content}
      </div>
    </div>
  </main>

  ${renderFooter('en')}
</body>
</html>`;

    fs.writeFileSync(path.join(ROOT_DIR, 'pages', p.file), fullHTML, 'utf8');
  });
}

// Execute complete build
buildHomepages();
buildArticles();
buildCategories();
buildAuthors();
buildPages();
buildSitemapsAndFeeds();

console.log('Build complete! All 8 languages, articles, categories, authors, and feeds compiled.');
