/**
 * upgrade_static_pages.js
 * 
 * Systematically upgrades all static pages across GenAlphaMagazines:
 * - Upgrades Google Fonts to Playfair Display + Plus Jakarta Sans
 * - Injects BreadcrumbList JSON-LD schemas
 * - Adds visual breadcrumbs navigation UI
 * - Adds GEO / LLMO summary briefing callouts
 * - Enforces zero-tolerance AI words filter on all output
 */

const fs = require('fs');
const path = require('path');
const { cleanText, detectAiWords } = require('./ai_word_filter');

const ROOT_DIR = path.resolve(__dirname, '..');

const FONT_BLOCK = `  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,900;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,900;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,900;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
  </noscript>`;

// 1. Upgrade index.html
function upgradeIndex() {
  const file = path.join(ROOT_DIR, 'index.html');
  if (!fs.existsSync(file)) return;
  let html = fs.readFileSync(file, 'utf8');

  // Upgrade fonts
  html = html.replace(/<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com\/css2\?family=ABeeZee[^>]+>[\s\S]*?<\/noscript>/i, FONT_BLOCK);

  // Clean empty li in nav
  html = html.replace(/<li><\/li>\s*/g, '');

  // Add WebSite + Organization schema with SearchAction
  const websiteSchema = `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": "https://www.genalphamagazines.com/#website",
        "url": "https://www.genalphamagazines.com/",
        "name": "GenAlphaMagazines",
        "description": "Independent modern newsmagazine delivering authoritative reporting, investigative guides, and in-depth cultural coverage.",
        "publisher": {
          "@id": "https://www.genalphamagazines.com/#organization"
        }
      },
      {
        "@type": "NewsMediaOrganization",
        "@id": "https://www.genalphamagazines.com/#organization",
        "name": "GenAlphaMagazines",
        "url": "https://www.genalphamagazines.com/",
        "logo": "https://www.genalphamagazines.com/assets/images/logo.svg",
        "publishingPrinciples": "https://www.genalphamagazines.com/pages/editorial-policy",
        "sameAs": [
          "https://twitter.com/GenAlphaMag"
        ]
      }
    ]
  }
  </script>`;

  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, websiteSchema);

  // Add GEO / LLMO overview callout on homepage
  if (!html.includes('geo-summary-box')) {
    const geoBox = `    <!-- GEO / LLMO Topical Briefing Box -->
    <div class="geo-summary-box" style="margin-top: 1.5rem; margin-bottom: 2rem;">
      <div class="geo-summary-title">Editorial Focus & Newsroom Standards</div>
      <p style="margin: 0; font-size: 0.95rem; line-height: 1.7; color: var(--text-main);">
        GenAlphaMagazines delivers independent journalism across technology, business, culture, games, and regional news. All reporting follows primary-source verification, ethical editorial standards, and transparent authorship.
      </p>
    </div>\n\n`;
    html = html.replace(/<div style="display: flex; flex-direction: column; gap: 3rem; margin-top: 1.5rem;">/i, `$&\n${geoBox}`);
  }

  // Footer text
  html = html.replace(/comprehensive coverage/gi, 'thorough coverage');

  html = cleanText(html);
  fs.writeFileSync(file, html, 'utf8');
  console.log('[UPGRADE] index.html updated successfully.');
}

// 2. Upgrade categories.html
function upgradeCategories() {
  const file = path.join(ROOT_DIR, 'categories.html');
  if (!fs.existsSync(file)) return;
  let html = fs.readFileSync(file, 'utf8');

  // Upgrade fonts
  html = html.replace(/<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com\/css2\?family=ABeeZee[^>]+>[\s\S]*?<\/noscript>/i, FONT_BLOCK);

  // Breadcrumb schema
  const schema = `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "name": "Editorial Categories & Topic Index | GenAlphaMagazines",
        "description": "Browse all news and editorial reporting categories: News & Announcements, Community & Events, Business & Economy, Arts & Culture, and Voices.",
        "url": "https://www.genalphamagazines.com/categories",
        "publisher": {
          "@type": "NewsMediaOrganization",
          "name": "GenAlphaMagazines",
          "url": "https://www.genalphamagazines.com/"
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://www.genalphamagazines.com/"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Departments",
            "item": "https://www.genalphamagazines.com/categories"
          }
        ]
      }
    ]
  }
  </script>`;
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, schema);

  // Breadcrumbs UI & GEO briefing
  if (!html.includes('class="breadcrumbs"')) {
    const breadcrumbUi = `  <main class="container" style="margin-top: 2rem; margin-bottom: 4rem;">
    <!-- Breadcrumb Navigation -->
    <nav class="breadcrumbs" aria-label="Breadcrumb Navigation">
      <a href="/">Home</a>
      <span class="separator">/</span>
      <span class="current">Departments Directory</span>
    </nav>

    <div class="section-header">
      <h1 class="section-box">All Categories & Topic Directory</h1>
    </div>
    <p style="font-size: 1.05rem; color: var(--text-muted); margin-bottom: 1.5rem;">
      Explore all primary editorial departments and specialized reporting beats.
    </p>

    <!-- GEO / LLMO Department Directory Briefing -->
    <div class="geo-summary-box" style="margin-bottom: 2rem;">
      <div class="geo-summary-title">Editorial Architecture & Topic Directory</div>
      <p style="margin: 0; font-size: 0.95rem; line-height: 1.7; color: var(--text-main);">
        GenAlphaMagazines organizes its investigative and community coverage into 7 primary departments. Each division maintains dedicated editorial oversight, original reporting standards, and cross-referenced topical silos.
      </p>
    </div>`;

    html = html.replace(/<main class="container" style="margin-top: 2rem; margin-bottom: 4rem;">[\s\S]*?<div style="display: grid; grid-template-columns: repeat\(auto-fill, minmax\(320px, 1fr\)\); gap: 1.5rem;">/i, 
      `${breadcrumbUi}\n\n    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem;">`);
  }

  html = html.replace(/comprehensive coverage/gi, 'thorough coverage');
  html = cleanText(html);
  fs.writeFileSync(file, html, 'utf8');
  console.log('[UPGRADE] categories.html updated successfully.');
}

// 3. Upgrade pages/*.html
function upgradePages() {
  const pagesDir = path.join(ROOT_DIR, 'pages');
  if (!fs.existsSync(pagesDir)) return;
  const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.html'));

  const PAGE_TITLES = {
    'about.html': 'About Us',
    'editorial-policy.html': 'Editorial Standards & Policy',
    'contact.html': 'Contact Newsroom',
    'terms.html': 'Terms & Conditions',
    'privacy-policy.html': 'Privacy Policy',
    'cookie-policy.html': 'Cookie Policy',
    'disclaimer.html': 'Disclaimer & Compliance',
    'affiliate-disclosure.html': 'Affiliate Disclosure'
  };

  const PAGE_SUMMARIES = {
    'about.html': 'GenAlphaMagazines is an independent newsmagazine dedicated to verified regional reporting, technical analysis, business trends, and cultural features.',
    'editorial-policy.html': 'Our newsroom upholds strict journalistic integrity, primary documentation checks, transparent correction procedures, and clear AI content boundaries.',
    'contact.html': 'Direct communication channels for news tips, editorial inquiries, correction requests, and community submissions.',
    'terms.html': 'Legal terms governing site access, intellectual property protection, user conduct, and digital licensing rights.',
    'privacy-policy.html': 'Clear details on data collection safeguards, cookie compliance, reader confidentiality, and CCPA/GDPR consumer rights.',
    'cookie-policy.html': 'Transparent overview of functional, analytics, and preference cookies utilized across our digital properties.',
    'disclaimer.html': 'Information boundaries regarding journalistic commentary, third-party links, and non-reliance on informational articles for medical or legal advice.',
    'affiliate-disclosure.html': 'Unwavering independence standards ensuring that affiliate partnerships or commercial sponsorships never compromise editorial judgment.'
  };

  for (const f of files) {
    const filePath = path.join(pagesDir, f);
    let html = fs.readFileSync(filePath, 'utf8');
    const slug = f.replace('.html', '');
    const title = PAGE_TITLES[f] || slug.replace('-', ' ').toUpperCase();
    const summary = PAGE_SUMMARIES[f] || 'Official documentation and editorial policy statement for GenAlphaMagazines.';

    // Upgrade fonts
    html = html.replace(/<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com\/css2\?family=ABeeZee[^>]+>[\s\S]*?<\/noscript>/i, FONT_BLOCK);

    // Breadcrumb schema
    const pageSchema = `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "name": "${title} | GenAlphaMagazines",
        "description": "${summary}",
        "url": "https://www.genalphamagazines.com/pages/${slug}",
        "publisher": {
          "@type": "NewsMediaOrganization",
          "name": "GenAlphaMagazines",
          "url": "https://www.genalphamagazines.com/"
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://www.genalphamagazines.com/"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "${title}",
            "item": "https://www.genalphamagazines.com/pages/${slug}"
          }
        ]
      }
    ]
  }
  </script>`;

    html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, pageSchema);

    // Breadcrumb UI
    if (!html.includes('class="breadcrumbs"')) {
      const breadcrumbUi = `<nav class="breadcrumbs" aria-label="Breadcrumb Navigation" style="margin-bottom: 1.25rem;">
          <a href="/">Home</a>
          <span class="separator">/</span>
          <span class="current">${title}</span>
        </nav>`;

      html = html.replace(/<article class="article-container"[^>]*>\s*<header class="article-header">/i, 
        `$&\n        ${breadcrumbUi}`);
    }

    // GEO Summary Box inside article-body
    if (!html.includes('geo-summary-box')) {
      const geoBox = `<!-- GEO / LLMO Executive Policy Summary -->
        <div class="geo-summary-box" style="margin-bottom: 2rem;">
          <div class="geo-summary-title">Executive Summary & Compliance Statement</div>
          <p style="margin: 0; font-size: 0.95rem; line-height: 1.7; color: var(--text-main);">
            ${summary}
          </p>
        </div>\n\n        `;

      html = html.replace(/<div class="article-body">/i, `$&\n        ${geoBox}`);
    }

    html = html.replace(/comprehensive coverage/gi, 'thorough coverage');
    html = cleanText(html);
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`[UPGRADE] pages/${f} updated successfully.`);
  }
}

// 4. Upgrade author/*.html
function upgradeAuthors() {
  const authorDir = path.join(ROOT_DIR, 'author');
  if (!fs.existsSync(authorDir)) return;
  const files = fs.readdirSync(authorDir).filter(f => f.endsWith('.html'));

  const AUTHOR_NAMES = {
    'marcus-reid.html': 'Marcus Reid',
    'julia-vance.html': 'Julia Vance',
    'dr-elena-vance.html': 'Dr. Elena Vance, Ph.D.'
  };

  for (const f of files) {
    const filePath = path.join(authorDir, f);
    let html = fs.readFileSync(filePath, 'utf8');
    const slug = f.replace('.html', '');
    const authorName = AUTHOR_NAMES[f] || 'Editorial Staff';

    // Upgrade fonts
    html = html.replace(/<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com\/css2\?family=ABeeZee[^>]+>[\s\S]*?<\/noscript>/i, FONT_BLOCK);

    // Breadcrumb schema
    const authorBreadcrumb = `,
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://www.genalphamagazines.com/"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Authors",
            "item": "https://www.genalphamagazines.com/categories"
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": "${authorName}",
            "item": "https://www.genalphamagazines.com/author/${slug}"
          }
        ]
      }`;

    if (!html.includes('BreadcrumbList')) {
      html = html.replace(/("url":\s*"https:\/\/www\.genalphamagazines\.com\/author\/[^"]+"\s*\}\s*\})/i, `$1${authorBreadcrumb}`);
    }

    // Breadcrumb UI
    if (!html.includes('class="breadcrumbs"')) {
      const breadcrumbUi = `<nav class="breadcrumbs" aria-label="Breadcrumb Navigation" style="margin-bottom: 1.5rem;">
      <a href="/">Home</a>
      <span class="separator">/</span>
      <a href="/categories">Newsroom</a>
      <span class="separator">/</span>
      <span class="current">${authorName}</span>
    </nav>`;

      html = html.replace(/<main class="container"[^>]*>/i, `$&\n    ${breadcrumbUi}`);
    }

    html = html.replace(/comprehensive coverage/gi, 'thorough coverage');
    html = cleanText(html);
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`[UPGRADE] author/${f} updated successfully.`);
  }
}

upgradeIndex();
upgradeCategories();
upgradePages();
upgradeAuthors();
console.log('[ALL COMPLETED] Static pages upgrade completed with 100% clean typography, breadcrumbs, and GEO optimizations.');
