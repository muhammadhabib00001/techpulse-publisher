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

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
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

function sanitizeAllDashes(html) {
  if (!html) return '';
  return html
    .replace(/(\d+)\s*(?:[\u2013\u2014]|&mdash;|&ndash;)\s*(\d+)/g, '$1 to $2')
    .replace(/\s*(?:[\u2013\u2014]|&mdash;|&ndash;)\s*/g, ', ')
    .replace(/,\s*,/g, ', ')
    .replace(/,\s*\./g, '.')
    .replace(/,\s*:/g, ':')
    .replace(/:\s*,/g, ':')
    .replace(/\(\s*,\s*/g, '(')
    .replace(/,\s*\)/g, ')')
    .replace(/\s{2,}/g, ' ');
}

function removeObsoleteBoxes(html) {
  if (!html) return '';
  return html
    .replace(/<div class="external-resources-box"[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<div class="external-resources-box"[\s\S]*?<\/div>/gi, '')
    .replace(/<div style="background:#eff6ff;border-left:4px solid #2563eb;[\s\S]*?<\/div>\s*<\/div>/gi, '')
    .replace(/<div[^>]*border-left:\s*4px\s+solid\s+#2563eb;[\s\S]*?External Reference[\s\S]*?<\/div>\s*<\/div>/gi, '');
}

function sanitizeMarkdownAndSnippets(html) {
  if (!html) return '';
  let cleaned = html;

  // 1. Convert any raw markdown headers (e.g. ### Subheading -> <h3>Subheading</h3>)
  cleaned = cleaned.replace(/(?:<p>|<p\s+[^>]*>)?\s*#{3}\s+([^<\n\r]+)(?:<\/p>)?/gi, (match, headingText) => {
    return '<h3>' + headingText.trim() + '</h3>';
  });
  cleaned = cleaned.replace(/(?:<p>|<p\s+[^>]*>)?\s*#{2}\s+([^<\n\r]+)(?:<\/p>)?/gi, (match, headingText) => {
    return '<h2>' + headingText.trim() + '</h2>';
  });
  cleaned = cleaned.replace(/(?:<p>|<p\s+[^>]*>)?\s*#{4,6}\s+([^<\n\r]+)(?:<\/p>)?/gi, (match, headingText) => {
    return '<h4>' + headingText.trim() + '</h4>';
  });
  // Strip any leftover isolated hash marks or markdown heading fragments
  cleaned = cleaned.replace(/(?:<p>|<p\s+[^>]*>)?\s*#{1,6}\s*(?:<\/p>)?/gi, '');
  cleaned = cleaned.replace(/#{1,6}\s*/g, '');

  // 2. Remove 'Featured Snippet' boxes or headings
  // Remove container blocks that explicitly mention Featured Snippet
  cleaned = cleaned.replace(/<div[^>]*class=["'][^"']*(?:bg-gray|border|snippet|takeaways|key-takeaways|p-)[^"']*["'][^>]*>[\s\S]*?Featured Snippet[\s\S]*?<\/div>\s*<\/div>/gi, '');
  cleaned = cleaned.replace(/<div[^>]*>[\s\S]{0,300}?Featured Snippet[\s\S]{0,1200}?<\/ul>\s*<\/div>/gi, '');
  cleaned = cleaned.replace(/<div[^>]*>[\s\S]{0,150}?Featured Snippet[\s\S]{0,400}?<\/div>/gi, '');
  // Remove standalone headings or tags mentioning Featured Snippet
  cleaned = cleaned.replace(/<h[1-6][^>]*>[\s\S]*?Featured Snippet[\s\S]*?<\/h[1-6]>/gi, '');
  cleaned = cleaned.replace(/<p[^>]*>[\s\S]*?Featured Snippet[\s\S]*?<\/p>/gi, '');
  cleaned = cleaned.replace(/<strong[^>]*>[\s\S]*?Featured Snippet[\s\S]*?<\/strong>/gi, '');
  cleaned = cleaned.replace(/Featured Snippet:?\s*/gi, '');

  return cleaned;
}

const CATEGORY_EXTERNAL_FALLBACKS = {
  entertainment: {
    url: 'https://en.wikipedia.org/wiki/Independent_film',
    label: 'Independent Film Archive',
    domain: 'en.wikipedia.org',
    keywords: ['independent film', 'indie film', 'film festival', 'film festivals', 'visual storytelling', 'cinematography', 'cinema', 'storytelling', 'theatrical release', 'screenplay', 'director', 'entertainment', 'movies', 'films']
  },
  celebrity: {
    url: 'https://en.wikipedia.org/wiki/Celebrity',
    label: 'Celebrity Culture & Media',
    domain: 'en.wikipedia.org',
    keywords: ['pop culture', 'entertainment industry', 'cultural influence', 'celebrity culture', 'stardom', 'culture', 'athletics', 'career', 'celebrity', 'basketball', 'nba', 'championship']
  },
  business: {
    url: 'https://www.bls.gov/',
    label: 'U.S. Bureau of Labor Statistics',
    domain: 'bls.gov',
    keywords: ['business operations', 'economic indicators', 'monetary policy', 'labor market', 'retail foot traffic', 'small business', 'commercial operations', 'interest rates', 'inflation', 'economy', 'business']
  },
  technology: {
    url: 'https://www.wired.com/',
    label: 'Wired Technology Review',
    domain: 'wired.com',
    keywords: ['smart home technology', 'mobile operating system', 'energy efficiency', 'hardware benchmarks', 'silicon architecture', 'artificial intelligence', 'battery storage', 'technology', 'hardware', 'solar', 'energy', 'battery', 'storage']
  },
  games: {
    url: 'https://www.rockstargames.com/VI',
    label: 'Rockstar Games Grand Theft Auto VI Portal',
    domain: 'rockstargames.com',
    keywords: ['video game', 'multiplayer', 'gameplay mechanics', 'open-world', 'game development', 'interactive entertainment', 'gaming hardware', 'gameplay', 'gaming', 'games', 'vice city', 'gta', 'rockstar']
  },
  health: {
    url: 'https://www.who.int/',
    label: 'World Health Organization',
    domain: 'who.int',
    keywords: ['cardiovascular health', 'health guidelines', 'preventative care', 'wellness', 'clinical research', 'public health', 'symptoms', 'health', 'wellness', 'medical']
  },
  news: {
    url: 'https://www.reuters.com/',
    label: 'Reuters News & Financial Markets',
    domain: 'reuters.com',
    keywords: ['monetary policy', 'Federal Reserve', 'interest rates', 'economic indicators', 'international commerce', 'trade policy', 'regulatory framework', 'regulations', 'reporting', 'news', 'policy']
  },
  lifestyle: {
    url: 'https://en.wikipedia.org/wiki/Vinyl_revival',
    label: 'Vinyl Revival Audio Archive',
    domain: 'en.wikipedia.org',
    keywords: ['vinyl records', 'vinyl revival', 'analog audio', 'turntable', 'travel planning', 'passenger rights', 'travel disruptions', 'culinary arts', 'interior design', 'lifestyle', 'culinary', 'records']
  },
  others: {
    url: 'https://www.britannica.com/',
    label: 'Encyclopaedia Britannica',
    domain: 'britannica.com',
    keywords: ['cultural heritage', 'historical context', 'civic engagement', 'community preservation', 'public interest', 'community', 'heritage', 'society']
  }
};

const ARTICLE_INTERNAL_TARGETS = [
  // Business
  { slug: 'sba-loan-requirements-timelines-rates-and-down-payments', title: 'SBA Loan Requirements: Timelines, Rates, and Down Payments', category: 'business', keywords: ['SBA loan requirements', 'SBA loans', 'small business loan requirements', 'down payment requirements'] },
  { slug: 'main-street-business-revitalization-guide-for-2026', title: 'Main Street Business Revitalization: Driving Local Retail Foot Traffic', category: 'business', keywords: ['Main Street business revitalization', 'retail foot traffic', 'commercial revitalization', 'Main Street businesses', 'small business revitalization'] },
  { slug: 'how-ai-is-reshaping-main-street-business-operations', title: 'How AI Is Reshaping Main Street Business Operations', category: 'business', keywords: ['AI in business operations', 'business operations', 'artificial intelligence in business', 'operational resilience'] },
  { slug: 'inside-the-business-empire-of-elon-musk-today', title: 'Inside the Business Empire of Elon Musk Today', category: 'business', keywords: ['Elon Musk business empire', 'business empire', 'corporate leadership', 'enterprise strategy'] },
  { slug: 'fomc-meeting-sept-2026-interest-rates-and-market-outlook', title: 'FOMC Meeting: Interest Rates and Market Outlook', category: 'business', keywords: ['FOMC meeting', 'Federal Reserve interest rates', 'monetary policy', 'interest rate outlook'] },
  { slug: 'the-evolving-hr-manager-strategy-tech-and-culture', title: 'The Evolving HR Manager: Strategy, Tech, and Culture', category: 'business', keywords: ['evolving HR manager', 'human resources strategy', 'employee retention', 'workplace culture', 'human resources'] },
  { slug: 'us-interest-rates-yields-inflation-and-borrowing-strategy', title: 'US Interest Rates: Yields, Inflation, and Borrowing Strategy', category: 'business', keywords: ['borrowing strategy', 'US interest rates', 'yield curves', 'inflation strategy'] },

  // Celebrity
  { slug: 'red-carpet-fashion-trends-inside-haute-couture-aesthetics', title: 'Red Carpet Fashion Trends: Inside Haute Couture Aesthetics', category: 'celebrity', keywords: ['red carpet fashion trends', 'haute couture aesthetics', 'celebrity stylists', 'haute couture', 'red carpet fashion'] },
  { slug: '25-famous-celebrity-in-usa-career-influence-and-cultur', title: '25 Famous Celebrities in USA: Career, Influence, and Cultural Impact', category: 'celebrity', keywords: ['famous celebrities in USA', 'celebrity culture', 'cultural influence', 'American cultural icons'] },
  { slug: 'lebron-james-the-evolution-of-nba-royalty-on-and-off-court', title: 'LeBron James: The Evolution of NBA Royalty On and Off Court', category: 'celebrity', keywords: ['LeBron James', 'NBA royalty', 'basketball icons', 'athletic career'] },
  { slug: 'cristiano-ronaldo-career-legacy-and-records', title: 'Cristiano Ronaldo: Career Legacy, Milestones and Records', category: 'celebrity', keywords: ['Cristiano Ronaldo', 'career legacy', 'football records', 'soccer records'] },
  { slug: 'top-german-celebrities-shaping-global-culture-today', title: 'Top German Celebrities Shaping Global Culture Today', category: 'celebrity', keywords: ['German celebrities', 'global culture', 'European cultural figures'] },

  // Entertainment
  { slug: '25-american-movies-defining-visual-storytelling-today', title: '25 American Movies Defining Visual Storytelling Today', category: 'entertainment', keywords: ['visual storytelling', 'contemporary cinema', 'American cinema', 'cinematography', 'visual storytelling today'] },
  { slug: 'grassroots-indie-film-distribution-how-regional-festival', title: 'Grassroots Indie Film Distribution: How Regional Festivals Launch Emerging Directors', category: 'entertainment', keywords: ['grassroots indie film distribution', 'regional film festivals', 'independent film distribution', 'indie film distribution'] },
  { slug: 'the-vinyl-record-resurgence-turntable-setups-pressing', title: 'The Vinyl Record Resurgence: Turntable Setups, Pressing', category: 'entertainment', keywords: ['vinyl record resurgence', 'turntable setups', 'vinyl records', 'analog audio'] },
  { slug: 'local-playwrights-guide-independent-theater-spotlight', title: 'Local Playwrights Guide: Independent Theater Spotlight', category: 'entertainment', keywords: ['independent theater spotlight', 'local playwrights', 'theatrical productions', 'independent theater'] },
  { slug: 'cinematic-masterpieces-unforgettable-films-centering-women', title: 'Cinematic Masterpieces: Unforgettable Films Centering Women', category: 'entertainment', keywords: ['cinematic masterpieces', 'films centering women', 'female-centered cinema', 'masterpiece films'] },
  { slug: 'the-kitchen-as-canvas-designing-creative-culinary-spaces', title: 'The Kitchen as Canvas: Designing Creative Culinary Spaces', category: 'entertainment', keywords: ['kitchen as canvas', 'creative culinary spaces', 'culinary spaces', 'kitchen design'] },

  // Technology
  { slug: 'inside-apple-s-ios-27-architecture-and-ai-innovations', title: 'Inside Apple\'s iOS 27 Architecture and AI Innovations', category: 'technology', keywords: ['iOS architecture', 'Apple AI innovations', 'mobile operating system', 'mobile silicon'] },
  { slug: 'top-7-phone-features-and-specs', title: 'Top 7 Phone Features and Specs', category: 'technology', keywords: ['flagship phone specs', 'smartphone hardware', 'phone features', 'mobile hardware'] },
  { slug: 'smart-home-energy-audits-heat-pump-and-solar-storage', title: 'Smart Home Energy Audits: Heat Pump and Solar Storage', category: 'technology', keywords: ['smart home energy audits', 'heat pump systems', 'energy efficiency', 'home energy audits'] },
  { slug: 'solar-battery-storage-guide-costs-types-and-savings', title: 'Solar Battery Storage Guide: Costs, Types, and Savings', category: 'technology', keywords: ['solar battery storage', 'battery storage systems', 'energy savings', 'solar storage'] },
  { slug: 'modern-bathroom-upgrades-spa-luxury-meets-smart-tech', title: 'Modern Bathroom Upgrades: Spa Luxury Meets Smart Tech', category: 'technology', keywords: ['modern bathroom upgrades', 'smart bathroom tech', 'bathroom upgrades', 'spa luxury'] },

  // Games
  { slug: 'gta-6-release-date-map-and-gameplay-guide', title: 'GTA 6 Release Date, Map and Gameplay Guide', category: 'games', keywords: ['GTA 6 release date', 'GTA 6 gameplay', 'open-world gameplay', 'GTA 6 map'] },
  { slug: 'gta-6-vice-city-map-comparison-setting-scale-landmarks', title: 'GTA 6 Vice City Map Comparison: Setting, Scale, Landmarks', category: 'games', keywords: ['Vice City map comparison', 'Vice City landmarks', 'GTA map scale'] },
  { slug: 'what-are-the-most-popular-games-dominating-players-today', title: 'What Are the Most Popular Games Dominating Players Today', category: 'games', keywords: ['most popular games', 'popular video games', 'multiplayer games', 'gaming culture'] },

  // Health
  { slug: 'heart-problems-evidence-based-insights-and-expert-guidance', title: 'Heart Problems: Evidence-Based Insights and Expert Guidance', category: 'health', keywords: ['cardiovascular health', 'heart problems', 'heart disease prevention', 'cardiovascular disease'] },
  { slug: 'key-health-issues-affecting-women-symptoms-and-solutions', title: 'Key Health Issues Affecting Women: Symptoms and Solutions', category: 'health', keywords: ['health issues affecting women', 'women health solutions', 'preventative care', 'women health'] },

  // News
  { slug: 'how-high-interest-rates-are-reshaping-the-us-economy', title: 'How High Interest Rates Are Reshaping the US Economy', category: 'news', keywords: ['high interest rates', 'US economy', 'macroeconomic trends', 'economic impact'] },
  { slug: 'trump-crypto-policy-guide-2026-regulations-and-impact', title: 'Trump Crypto Policy Guide: Regulations and Impact', category: 'news', keywords: ['crypto policy', 'cryptocurrency regulations', 'digital asset framework', 'crypto regulation'] },
  { slug: 'us-army-modernization-strategy-tech-and-troop-structure', title: 'US Army Modernization Strategy: Tech and Troop Structure', category: 'news', keywords: ['Army modernization strategy', 'defense technology', 'military modernization', 'troop structure'] },

  // Others
  { slug: 'mastering-bathroom-drainage-systems-for-every-home', title: 'Mastering Bathroom Drainage Systems For Every Home', category: 'others', keywords: ['bathroom drainage systems', 'residential drainage', 'plumbing infrastructure', 'bathroom drainage'] },
  { slug: 'common-travel-problems-and-solutions-a-complete-guide', title: 'Common Travel Problems and Solutions: A Complete Guide', category: 'others', keywords: ['common travel problems', 'travel solutions', 'travel planning', 'travel disruptions'] },
  { slug: 'how-to-handle-flight-delays-and-travel-disruptions', title: 'How to Handle Flight Delays and Travel Disruptions', category: 'others', keywords: ['flight delays', 'travel disruptions', 'airline passenger rights', 'flight cancellation'] },
  { slug: 'waterfront-heritage-festival-2026-record-artisan-lineup', title: 'Waterfront Heritage Festival: Record Artisan Lineup', category: 'others', keywords: ['waterfront heritage festival', 'artisan lineup', 'community cultural festival', 'heritage festival'] }
];

function getAllInternalArticleTargets() {
  const map = [...ARTICLE_INTERNAL_TARGETS];
  const knownSlugs = new Set(map.map(m => m.slug));

  try {
    const jsonPath = path.join(ROOT_DIR, 'data', 'articles.json');
    if (fs.existsSync(jsonPath)) {
      const articles = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      for (const art of articles) {
        const slug = art.slug || (art.file ? art.file.replace('.html', '') : '');
        if (!slug || knownSlugs.has(slug)) continue;
        const title = (art.title || '').replace(/\s*\|\s*GenAlphaMagazines.*$/i, '').trim();
        const cat = (art.category || 'others').toLowerCase();
        
        const keywords = new Set();
        const titleParts = title.split(/[:|–—]/);
        if (titleParts.length > 0 && titleParts[0].trim().length >= 4) keywords.add(titleParts[0].trim());
        if (titleParts.length > 1 && titleParts[1].trim().length >= 6) keywords.add(titleParts[1].trim());
        const words = slug.split('-');
        if (words.length >= 3) keywords.add(words.slice(0, 3).join(' '));

        map.push({
          slug,
          title,
          category: cat,
          keywords: Array.from(keywords).filter(k => k && k.length >= 4 && k.length <= 35)
        });
        knownSlugs.add(slug);
      }
    }
  } catch (e) {}

  return map;
}

function ensureArticleFaqs(html, slug) {
  if (html.includes('class="faq-card"')) return html;

  // Extract from JSON-LD schema if present
  let faqs = [];
  const scriptMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
  for (const sm of scriptMatches) {
    const jsonStr = sm.replace(/<\/?script[^>]*>/gi, '').trim();
    try {
      const data = JSON.parse(jsonStr);
      const graph = data['@graph'] || [data];
      const faqEntity = graph.find(item => item && (item['@type'] === 'FAQPage' || item['@type'] === 'FAQ'));
      if (faqEntity && Array.isArray(faqEntity.mainEntity)) {
        for (const item of faqEntity.mainEntity) {
          const q = item.name || (item.question && item.question.text) || '';
          const a = (item.acceptedAnswer && item.acceptedAnswer.text) || (item.answer && item.answer.text) || '';
          if (q && a) faqs.push({ question: q.trim(), answer: a.trim() });
        }
      }
    } catch (e) {}
  }

  if (faqs.length === 0) return html;

  const faqCards = faqs.map(f => `
            <div class="faq-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1rem;">
              <h3 class="faq-question" style="margin-top: 0; margin-bottom: 0.5rem; color: var(--primary); font-size: 1.05rem;">${f.question}</h3>
              <p class="faq-answer" style="margin-bottom: 0; color: var(--text-main); font-size: 0.95rem; line-height: 1.7;">${f.answer}</p>
            </div>`).join('\n');

  const faqSectionHtml = `
          <section id="frequently-asked-questions" class="faq-section" style="margin-top: 2rem;">
            <h2>Frequently Asked Questions</h2>
            <div style="margin-top: 1.25rem;">
${faqCards}
            </div>
          </section>`;

  // Check if an empty or malformed FAQ section exists and replace it
  const emptySectionRegex = /<section[^>]*id=["'](?:frequently-asked-questions|undefined)["'][^>]*>\s*<h2>Frequently Asked Questions<\/h2>\s*<\/section>/i;
  if (emptySectionRegex.test(html)) {
    return html.replace(emptySectionRegex, faqSectionHtml.trim());
  }

  // Otherwise insert before related section or author box
  if (html.includes('<!-- Related Department Stories -->')) {
    return html.replace('<!-- Related Department Stories -->', `${faqSectionHtml}\n\n        <!-- Related Department Stories -->`);
  } else if (html.includes('<section class="author-box">')) {
    return html.replace('<section class="author-box">', `${faqSectionHtml}\n\n        <section class="author-box">`);
  } else if (html.includes('</article>')) {
    return html.replace('</article>', `${faqSectionHtml}\n      </article>`);
  }

  return html;
}

function safeKeywordReplace(html, keyword, replaceFn) {
  if (!keyword || keyword.length < 3) return { html, replaced: false };
  const esc = keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const kwRegex = new RegExp('\\b' + esc + '\\b', 'i');

  const tokens = html.split(/(<[^>]+>)/g);
  let insideAnchor = 0;
  let replaced = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (t.startsWith('<')) {
      if (/^<a\b/i.test(t)) {
        insideAnchor++;
      } else if (/^<\/a\b/i.test(t)) {
        insideAnchor = Math.max(0, insideAnchor - 1);
      }
    } else if (insideAnchor === 0 && !replaced) {
      if (kwRegex.test(t)) {
        tokens[i] = t.replace(kwRegex, replaceFn);
        replaced = true;
      }
    }
  }

  return { html: tokens.join(''), replaced };
}

function getCategoryFromHtml(html) {
  const m1 = html.match(/class="article-category-badge">([A-Z\s]+)/i);
  if (m1) return m1[1].replace(/•[\s\S]*$/, '').trim().toLowerCase();
  const m2 = html.match(/<meta property="article:section" content="([^"]+)"/i);
  if (m2) return m2[1].trim().toLowerCase();
  return 'news';
}

function restoreNavigationAndFooter(html, category) {
  const cat = (category || 'others').toLowerCase().trim();

  // 1. Restore Top Utility Bar links if stripped (clean extensionless URLs)
  html = html.replace(/<nav class="top-nav"[^>]*>[\s\S]*?<\/nav>/i, `
      <nav class="top-nav" aria-label="Utility Navigation">
        <ul>
          <li><a href="/pages/about">About</a></li>
          <li><a href="/pages/editorial-policy">Editorial Standards</a></li>
          <li><a href="/pages/privacy-policy">Privacy</a></li>
          <li><a href="/pages/contact">Contact</a></li>
        </ul>
      </nav>`.trim());

  // 2. Restore Main Nav Links if stripped (clean extensionless URLs)
  const mainNavUl = `
          <ul class="main-nav-links">
            <li><a href="/">Home</a></li>
            <li><a href="/category-news" class="${cat === 'news' ? 'active' : ''}">News</a></li>
            <li><a href="/category-business" class="${cat === 'business' ? 'active' : ''}">Business</a></li>
            <li><a href="/category-celebrity" class="${cat === 'celebrity' ? 'active' : ''}">Celebrity</a></li>
            <li><a href="/category-entertainment" class="${cat === 'entertainment' ? 'active' : ''}">Entertainment</a></li>
            <li><a href="/category-games" class="${cat === 'games' ? 'active' : ''}">Games</a></li>
            <li><a href="/category-health" class="${cat === 'health' ? 'active' : ''}">Health</a></li>
            <li><a href="/category-technology" class="${cat === 'technology' ? 'active' : ''}">Technology</a></li>
            <li><a href="/category-others" class="${cat === 'others' ? 'active' : ''}">Others</a></li>
            <li><a href="/categories">All Topics</a></li>
          </ul>`.trim();
  html = html.replace(/<ul class="main-nav-links">[\s\S]*?<\/ul>/i, mainNavUl);

  // 3. Restore Footer Columns if stripped (clean extensionless URLs)
  const footerCategories = `
      <div class="footer-col">
        <h5>Categories</h5>
        <ul class="footer-links">
          <li><a href="/category-news">News</a></li>
          <li><a href="/category-business">Business</a></li>
          <li><a href="/category-celebrity">Celebrity</a></li>
          <li><a href="/category-entertainment">Entertainment</a></li>
          <li><a href="/category-games">Games</a></li>
          <li><a href="/category-health">Health</a></li>
          <li><a href="/category-technology">Technology</a></li>
          <li><a href="/category-others">Others</a></li>
        </ul>
      </div>`;

  const footerEditorial = `
      <div class="footer-col">
        <h5>Editorial</h5>
        <ul class="footer-links">
          <li><a href="/pages/about">About Us</a></li>
          <li><a href="/pages/editorial-policy">Editorial Standards</a></li>
          <li><a href="/pages/affiliate-disclosure">Affiliate Disclosure</a></li>
          <li><a href="/pages/contact">Contact Us</a></li>
        </ul>
      </div>`;

  const footerCompliance = `
      <div class="footer-col">
        <h5>Compliance</h5>
        <ul class="footer-links">
          <li><a href="/pages/privacy-policy">Privacy Policy</a></li>
          <li><a href="/pages/terms">Terms & Conditions</a></li>
          <li><a href="/pages/cookie-policy">Cookie Policy</a></li>
          <li><a href="/pages/disclaimer">Disclaimer</a></li>
        </ul>
      </div>`;

  html = html.replace(/<div class="footer-col">\s*<h5>Categories<\/h5>[\s\S]*?<\/div>/i, footerCategories.trim());
  html = html.replace(/<div class="footer-col">\s*<h5>Editorial<\/h5>[\s\S]*?<\/div>/i, footerEditorial.trim());
  html = html.replace(/<div class="footer-col">\s*<h5>Compliance<\/h5>[\s\S]*?<\/div>/i, footerCompliance.trim());

  return html;
}

function standardizeArticleLinks(content, slug, customCategory = '', customExternalLink = null) {
  const category = customCategory || getCategoryFromHtml(content);

  // 1. Sanitize dashes
  content = sanitizeAllDashes(content);

  // 2. Remove obsolete callout boxes
  content = removeObsoleteBoxes(content);

  const startIdx = content.indexOf('<div class="article-body">');
  const endIdx = content.indexOf('</article>');
  if (startIdx === -1 || endIdx === -1) {
    return restoreNavigationAndFooter(content, category);
  }

  let body = content.substring(startIdx, endIdx);

  // Parse prose body (before FAQs and Related section)
  const faqStart = body.search(/<section[^>]*id=["']frequently-asked-questions["']/i);
  let proseBody = faqStart !== -1 ? body.substring(0, faqStart) : body;
  const trailingBody = faqStart !== -1 ? body.substring(faqStart) : '';

  // 2.5 Unnest any malformed or recursively nested <a> tags in proseBody
  proseBody = proseBody.replace(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/a>/gi, '$1');

  // 3. Strip any secondary images inside proseBody (strictly enforce 1 hero image per article)
  proseBody = proseBody.replace(/<img\s+[^>]*>/gi, '');

  // 4. Strip any links in headings or lists inside proseBody ONLY
  proseBody = proseBody.replace(/(<h[1-6][^>]*>)([\s\S]*?)(<\/h[1-6]>)/gi, (m, open, text, close) => {
    return open + text.replace(/<a\s+[^>]*>([\s\S]*?)<\/a>/gi, '$1') + close;
  });
  proseBody = proseBody.replace(/(<li[^>]*>)([\s\S]*?)(<\/li>)/gi, (m, open, text, close) => {
    return open + text.replace(/<a\s+[^>]*>([\s\S]*?)<\/a>/gi, '$1') + close;
  });

  // Handle specific known hallucinated domains
  if (slug === 'mastering-bathroom-drainage-systems-for-every-home') {
    proseBody = proseBody.replace(/<a\s+[^>]*href=["']https?:\/\/www\.watersanitation\.org[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi, '$1');
  }

  // 5. Handle External Links (strictly 1 external link on a concise 2-4 word target keyword)
  const extRegex = /<a\s+([^>]*href=["'](https?:\/\/(?!www\.genalphamagazines\.com)[^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let extMatches = [];
  let em;
  while ((em = extRegex.exec(proseBody)) !== null) {
    extMatches.push({ fullTag: em[0], href: em[2], text: em[3] });
  }

  if (extMatches.length > 0) {
    let firstExt = extMatches[0];
    let anchorText = firstExt.text.replace(/<[^>]+>/g, '').replace(/"/g, '&quot;').trim();
    let cleanAnchor = anchorText;
    if (anchorText.length > 35 || anchorText.split(/\s+/).length > 5) {
      const words = anchorText.split(/[:|–—,\s]+/).filter(w => w.length > 2);
      cleanAnchor = words.slice(0, 3).join(' ');
      if (cleanAnchor.length < 4) cleanAnchor = 'authoritative industry reference';
    }
    const safeHref = firstExt.href.replace(/"/g, '&quot;');
    const styledTag = `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="external-link" style="color: var(--primary); font-weight: 700; text-decoration: underline;" title="${cleanAnchor}">${cleanAnchor}</a>`;
    proseBody = proseBody.replace(firstExt.fullTag, styledTag);

    // Remove any secondary external links from body
    for (let i = 1; i < extMatches.length; i++) {
      proseBody = proseBody.replace(extMatches[i].fullTag, extMatches[i].text);
    }
  } else {
    // Inject external link from custom link or curated category fallback
    let targetLink;
    if (slug === 'mastering-bathroom-drainage-systems-for-every-home') {
      targetLink = {
        url: 'https://en.wikipedia.org/wiki/Drain_(plumbing)',
        label: 'Drain Plumbing Reference',
        anchorKeyword: 'bathroom drainage',
        keywords: ['bathroom drainage', 'drainage network', 'drainage systems', 'plumbing infrastructure', 'waste pipes']
      };
    } else {
      const catFallback = CATEGORY_EXTERNAL_FALLBACKS[category] || CATEGORY_EXTERNAL_FALLBACKS.others;
      targetLink = (customExternalLink && customExternalLink.url) ? customExternalLink : catFallback;
    }
    const targetLabel = (targetLink.label || 'Reference Documentation').replace(/"/g, '&quot;');
    const targetUrl = String(targetLink.url).replace(/"/g, '&quot;');
    const rawTargetAnchor = (targetLink.anchorKeyword && targetLink.anchorKeyword.length <= 35) ? targetLink.anchorKeyword : (targetLink.keywords ? targetLink.keywords[0] : 'authoritative reference');
    const targetAnchor = rawTargetAnchor.replace(/"/g, '&quot;');

    const keywordsToTry = [rawTargetAnchor, ...(targetLink.keywords || [])];
    let injected = false;
    for (const kw of keywordsToTry) {
      if (!kw || kw.length < 3) continue;
      const cleanKwTitle = kw.replace(/"/g, '&quot;');
      const repResult = safeKeywordReplace(proseBody, kw, (matched) => {
        return `<a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="external-link" style="color: var(--primary); font-weight: 700; text-decoration: underline;" title="${cleanKwTitle}">${matched}</a>`;
      });
      if (repResult.replaced) {
        proseBody = repResult.html;
        injected = true;
        break;
      }
    }
    if (!injected) {
      const lastPIdx = proseBody.lastIndexOf('</p>');
      if (lastPIdx !== -1) {
        const extAddition = ` For authoritative reference and source documentation, consult the <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="external-link" style="color: var(--primary); font-weight: 700; text-decoration: underline;" title="${targetAnchor}">${targetLabel}</a>.`;
        proseBody = proseBody.substring(0, lastPIdx) + extAddition + proseBody.substring(lastPIdx);
      }
    }
  }

  // 6. Handle Internal Links (strictly 2 in-text links to RELEVANT PUBLISHED ARTICLES - zero editorial policy or category links)
  // A. Purge any static page / category links from the article body prose completely!
  proseBody = proseBody.replace(/<a\s+[^>]*href=["'][^"']*(?:\/pages\/editorial-policy\.html|\/pages\/about\.html|\/pages\/[a-z0-9-]+\.html|\/category-[a-z0-9-]+\.html)[\s\S]*?<\/a>/gi, (match) => {
    return match.replace(/<a\s+[^>]*>([\s\S]*?)<\/a>/gi, '$1');
  });
  proseBody = proseBody.replace(/\s*Readers can explore extensive departmental reporting in our[\s\S]*?editorial standards\.\s*/gi, ' ');
  proseBody = proseBody.replace(/\s*Related regional investigations are published under our verified[\s\S]*?editorial standards\.\s*/gi, ' ');

  const allArticleTargets = getAllInternalArticleTargets();
  const existingSlugs = new Set(allArticleTargets.map(t => t.slug));

  const intRegex = /<a\s+([^>]*href=["']((?:\/|\.\.\/|\.\/|https:\/\/www\.genalphamagazines\.com\/)([^"']+))["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let intMatches = [];
  let im;
  while ((im = intRegex.exec(proseBody)) !== null) {
    const cleanPath = im[3].replace(/^\/?articles\//, '').replace(/\.html$/, '').replace(/^\//, '').toLowerCase();
    intMatches.push({ fullTag: im[0], href: im[2], cleanPath, text: im[4] });
  }

  const keptUrls = new Set();
  let keptCount = 0;
  for (const item of intMatches) {
    const isRealArticle = existingSlugs.has(item.cleanPath) && item.cleanPath !== slug;
    if (!isRealArticle || keptUrls.has(item.cleanPath) || keptCount >= 2) {
      proseBody = proseBody.replace(item.fullTag, item.text);
    } else {
      const cleanIntTitle = item.text.replace(/<[^>]+>/g, '').replace(/"/g, '&quot;').trim();
      const styledInt = `<a href="/${item.cleanPath}" class="internal-link" style="color: var(--primary); font-weight: 700; text-decoration: underline;" title="${cleanIntTitle}">${item.text}</a>`;
      proseBody = proseBody.replace(item.fullTag, styledInt);
      keptUrls.add(item.cleanPath);
      keptCount++;
    }
  }

  // If keptCount < 2, find candidate peer articles (same category first, then related)
  const candidateArticles = allArticleTargets.filter(t => t.slug !== slug && !keptUrls.has(t.slug));
  candidateArticles.sort((a, b) => {
    if (a.category === category && b.category !== category) return -1;
    if (b.category === category && a.category !== category) return 1;
    return 0;
  });

  // Step 6B: Try natural keyword matching on word boundaries safely outside tags
  for (const cand of candidateArticles) {
    if (keptCount >= 2) break;
    for (const kw of cand.keywords) {
      if (keptCount >= 2) break;
      const cleanCandTitle = cand.title.replace(/"/g, '&quot;');
      const repResult = safeKeywordReplace(proseBody, kw, (matched) => {
        return `<a href="/${cand.slug}" class="internal-link" style="color: var(--primary); font-weight: 700; text-decoration: underline;" title="${cleanCandTitle}">${matched}</a>`;
      });
      if (repResult.replaced) {
        proseBody = repResult.html;
        keptUrls.add(cand.slug);
        keptCount++;
        break;
      }
    }
  }

  // Step 6C: If still < 2, weave relevant editorial sentences linking to peer articles
  for (const cand of candidateArticles) {
    if (keptCount >= 2) break;
    if (keptUrls.has(cand.slug)) continue;

    const lastPIdx = proseBody.lastIndexOf('</p>');
    if (lastPIdx !== -1) {
      const addition = ` For related reporting and practical insights, read our complete coverage on <a href="/${cand.slug}" class="internal-link" style="color: var(--primary); font-weight: 700; text-decoration: underline;" title="${cand.title}">${cand.title}</a>.`;
      proseBody = proseBody.substring(0, lastPIdx) + addition + proseBody.substring(lastPIdx);
      keptUrls.add(cand.slug);
      keptCount++;
    }
  }

  body = proseBody + trailingBody;
  content = content.substring(0, startIdx) + body + content.substring(endIdx);

  // Restore navigation and footer links
  content = restoreNavigationAndFooter(content, category);

  return content;
}

function buildRelatedSectionHtml(currentSlug, articlesDir) {
  const files = fs.readdirSync(articlesDir).filter(f => f.endsWith('.html') && f !== `${currentSlug}.html`);
  const list = [];
  for (const f of files) {
    try {
      const html = fs.readFileSync(path.join(articlesDir, f), 'utf8');
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      let title = titleMatch ? titleMatch[1].replace(/\s*\|\s*GenAlphaMagazines.*$/, '').trim() : f.replace('.html', '');
      const catMatch = html.match(/<meta property="article:section" content="([^"]+)"/) || html.match(/<span class="card-tag">([A-Z\s]+)(?:&bull;|•|&middot;|\s)+/);
      let cat = catMatch ? catMatch[1].trim().toUpperCase() : 'FEATURE';
      list.push({ slug: f.replace('.html', ''), title, category: cat });
    } catch (e) {}
  }

  const count = Math.min(list.length, Math.floor(Math.random() * 3) + 3);
  const selected = list.sort(() => 0.5 - Math.random()).slice(0, count);
  const itemsHtml = selected.map(r => 
    `<li><strong>${r.category}:</strong> <a href="/${r.slug}" style="color: var(--primary); font-weight: 700; text-decoration: underline;">${r.title}</a></li>`
  ).join('\n            ');

  return `
        <!-- Related Department Stories -->
        <div style="background: var(--bg-subtle); border-left: 4px solid var(--primary); padding: 1.25rem 1.5rem; margin: 2.5rem 0; border-radius: var(--radius-sm);">
          <h4 style="color: var(--primary); margin-top: 0; font-size: 1.1rem; text-transform: uppercase;">Related Investigative Reports & Department Features</h4>
          <p style="font-size: 0.95rem; line-height: 1.7; margin-bottom: 0.75rem;">
            Continue reading in-depth community coverage from GenAlphaMagazines:
          </p>
          <ul style="margin-left: 1.5rem; line-height: 1.8; font-size: 0.95rem;">
            ${itemsHtml}
          </ul>
        </div>`;
}

function ensureRelatedSection(html, currentSlug, articlesDir) {
  if (html.includes('Related Investigative Reports & Department Features')) {
    return html;
  }
  const relBlock = buildRelatedSectionHtml(currentSlug, articlesDir);
  if (html.includes('<section class="author-box">')) {
    return html.replace('<section class="author-box">', `${relBlock}\n\n        <section class="author-box">`);
  } else if (html.includes('</article>')) {
    return html.replace('</article>', `${relBlock}\n      </article>`);
  }
  return html;
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

const VECTOR_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <defs>
    <radialGradient id="badgeRadial" cx="50%" cy="38%" r="62%">
      <stop offset="0%" stop-color="#ef233c" />
      <stop offset="60%" stop-color="#c1121e" />
      <stop offset="100%" stop-color="#780000" />
    </radialGradient>
    <linearGradient id="goldPageGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
    <linearGradient id="wingLeft" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="35%" stop-color="#ffccd5" />
      <stop offset="100%" stop-color="#c1121e" />
    </linearGradient>
    <linearGradient id="wingRight" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffccd5" />
      <stop offset="50%" stop-color="#e63946" />
      <stop offset="100%" stop-color="#590d22" />
    </linearGradient>
    <filter id="crispShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#780000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <circle cx="50" cy="50" r="48" fill="url(#goldPageGrad)" />
  <circle cx="50" cy="50" r="45" fill="#111827" />
  <circle cx="50" cy="50" r="43" fill="url(#badgeRadial)" filter="url(#crispShadow)" />
  <circle cx="50" cy="42" r="28" fill="#ffffff" opacity="0.12" />
  <g id="magazine-pages">
    <path d="M 50 78 L 22 68 L 22 55 L 50 64 Z" fill="url(#goldPageGrad)" stroke="#78350f" stroke-width="0.8" />
    <path d="M 50 78 L 24 70 L 24 58 L 50 66 Z" fill="#ffffff" opacity="0.85" />
    <path d="M 50 78 L 78 68 L 78 55 L 50 64 Z" fill="url(#goldPageGrad)" stroke="#78350f" stroke-width="0.8" />
    <path d="M 50 78 L 76 70 L 76 58 L 50 66 Z" fill="#ffffff" opacity="0.95" />
    <polygon points="48,64 52,64 51,80 49,80" fill="#fef08a" />
  </g>
  <g id="soaring-falcon">
    <polygon points="50,44 24,24 38,40 50,47" fill="url(#wingLeft)" stroke="#590d22" stroke-width="0.75" />
    <polygon points="24,24 16,34 32,44 38,40" fill="#e63946" stroke="#590d22" stroke-width="0.6" />
    <polygon points="16,34 12,42 26,46 32,44" fill="#a4161a" stroke="#590d22" stroke-width="0.6" />
    <polygon points="50,44 76,20 62,38 50,47" fill="url(#wingRight)" stroke="#590d22" stroke-width="0.75" />
    <polygon points="76,20 84,30 68,42 62,38" fill="#d90429" stroke="#590d22" stroke-width="0.6" />
    <polygon points="84,30 88,38 74,44 68,42" fill="#800f2f" stroke="#590d22" stroke-width="0.6" />
    <polygon points="50,48 44,60 50,65 56,60" fill="#590d22" stroke="#ffccd5" stroke-width="0.5" />
    <polygon points="50,30 46,38 50,48 54,38" fill="#ffffff" stroke="#590d22" stroke-width="0.8" />
    <polygon points="50,24 53,28 50,32 47,28" fill="#fef08a" stroke="#78350f" stroke-width="0.6" />
    <polygon points="53,28 57,30 52,31" fill="#f59e0b" />
  </g>
  <circle cx="50" cy="18" r="1.8" fill="#fef08a" />
  <circle cx="28" cy="22" r="1.2" fill="#ffffff" opacity="0.9" />
  <circle cx="72" cy="18" r="1.2" fill="#ffffff" opacity="0.9" />
</svg>`;

const CATEGORY_META = {
  business: {
    displayName: 'Business & Economy',
    title: 'Business & Economy News | GenAlphaMagazines',
    description: 'Explore GenAlphaMagazines Business department: Enterprise spotlights, commercial revitalization, small business financing, entrepreneurship, and market economic trends.',
    subtitle: 'Enterprise spotlights, commercial revitalization, small business financing, entrepreneurship, and market economic trends.',
    schemaDesc: 'Regional commercial trends, small business strategy, retail insights, and macroeconomic updates.'
  },
  celebrity: {
    displayName: 'Celebrity & Profiles',
    title: 'Celebrity Profiles & News | GenAlphaMagazines',
    description: 'Comprehensive profiles of global celebrities, cultural icons, entertainment legends, and transformative artists from GenAlphaMagazines.',
    subtitle: 'In-depth profiles, career retrospectives, and cultural impact analysis of world-renowned personalities.',
    schemaDesc: 'Celebrity profiles, cultural impact analysis, and retrospective reporting on iconic figures.'
  },
  entertainment: {
    displayName: 'Arts & Entertainment',
    title: 'Arts & Entertainment | GenAlphaMagazines',
    description: 'Explore GenAlphaMagazines Arts & Entertainment: Film reviews, independent cinema, theatrical productions, and cultural deep dives.',
    subtitle: 'Independent cinema, award-winning films, theater spotlights, and contemporary cultural discourse.',
    schemaDesc: 'In-depth coverage of cinematic masterpieces, independent film distribution, and visual storytelling.'
  },
  games: {
    displayName: 'Games & Esports',
    title: 'Games & Esports News | GenAlphaMagazines',
    description: 'Explore GenAlphaMagazines Games department: Next-gen console analysis, open-world gameplay guides, and gaming culture.',
    subtitle: 'Next-gen gaming coverage, map analysis, mechanics breakdowns, and player trends.',
    schemaDesc: 'Comprehensive video game coverage, gameplay breakdowns, and interactive entertainment analysis.'
  },
  health: {
    displayName: 'Health & Wellness',
    title: 'Health & Wellness News | GenAlphaMagazines',
    description: 'Explore GenAlphaMagazines Health department: Evidence-based health guidance, cardiovascular insights, women\'s wellness, and preventive care.',
    subtitle: 'Evidence-based clinical insights, disease prevention strategies, and holistic wellness guidance.',
    schemaDesc: 'Authoritative health reporting, clinical insights, and evidence-based preventive wellness strategies.'
  },
  news: {
    displayName: 'News & Announcements',
    title: 'Regional & National News | GenAlphaMagazines',
    description: 'Verified investigative reports, monetary policy analysis, macroeconomic developments, and breaking regional news from GenAlphaMagazines.',
    subtitle: 'Verified investigative reports, central bank policies, and in-depth global economic developments.',
    schemaDesc: 'Authoritative reporting on regional affairs, monetary policy, and global economic developments.'
  },
  others: {
    displayName: 'Community & Culture',
    title: 'Community & Culture | GenAlphaMagazines',
    description: 'Explore GenAlphaMagazines Community & Culture: Home architecture, travel strategies, local heritage, and everyday practical guides.',
    subtitle: 'Home architecture, drainage solutions, travel resilience, and enriching cultural features.',
    schemaDesc: 'Practical home guides, travel solutions, and community features from GenAlphaMagazines.'
  },
  technology: {
    displayName: 'Technology & Hardware',
    title: 'Technology & Hardware | GenAlphaMagazines',
    description: 'Explore GenAlphaMagazines Technology department: Mobile OS architectures, AI integration, clean energy audits, and hardware benchmarks.',
    subtitle: 'Next-generation mobile operating systems, artificial intelligence innovation, and sustainable energy tech.',
    schemaDesc: 'Cutting-edge technology analysis, mobile OS innovations, and sustainable clean tech.'
  }
};

function buildCategoryPageHtml(catName, matchingArticles, validArticlesList) {
  const meta = CATEGORY_META[catName] || {
    displayName: catName.charAt(0).toUpperCase() + catName.slice(1),
    title: `${catName.charAt(0).toUpperCase() + catName.slice(1)} | GenAlphaMagazines`,
    description: `Explore GenAlphaMagazines ${catName} department for the latest investigative reporting, news, and analysis.`,
    subtitle: `Explore authoritative reporting and community coverage in our ${catName} department.`,
    schemaDesc: `Comprehensive coverage of ${catName} from GenAlphaMagazines.`
  };

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const tickerItems = (validArticlesList || []).slice(0, 10).map(art => 
    `          <a href="/${art.slug}" class="breaking-ticker-item"><span class="ticker-bullet">&bull;</span> ${escapeHtml(art.title)}</a>`
  ).join('\n');

  let cardsHtml = '';
  if (matchingArticles && matchingArticles.length > 0) {
    cardsHtml = matchingArticles.map(art => {
      const imgSrc = art.image || ('./assets/images/' + art.slug + '.jpg');
      return `          <!-- Article: ${art.slug}.html -->
          <article class="card">
            <div class="card-img-wrap">
              <img src="${imgSrc}" alt="${escapeHtml(art.title)}" loading="lazy" width="400" height="225">
            </div>
            <div class="card-content">
              <span class="card-tag">${(art.category || catName).toUpperCase()} &bull; Feature</span>
              <h3 class="card-title">
                <a href="/${art.slug}">${escapeHtml(art.title)}</a>
              </h3>
              <p class="card-excerpt">${escapeHtml(art.excerpt || '')}</p>
              <div class="card-meta">
                <span>By <a href="/author/${art.authorSlug || 'julia-vance'}">${escapeHtml(art.author || 'Julia Vance')}</a></span>
                <span>${art.date || 'Recent'}</span>
              </div>
            </div>
          </article>`;
    }).join('\n\n');
  } else {
    cardsHtml = `          <p style="color: var(--text-muted); padding: 3rem 1.5rem; text-align: center; grid-column: 1 / -1;">Department archive ready. Newly generated stories will appear here automatically.</p>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-052TFQ4D4Q"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-052TFQ4D4Q');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${meta.title}</title>
  <meta name="description" content="${meta.description}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${meta.title}">
  <meta property="og:description" content="${meta.description}">
  <meta property="og:image" content="https://www.genalphamagazines.com/assets/images/og-banner.jpg">
  <meta property="og:url" content="https://www.genalphamagazines.com/category-${catName}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@GenAlphaMag">
  <meta name="twitter:title" content="${meta.title}">
  <meta name="twitter:description" content="${meta.description}">
  <meta name="twitter:image" content="https://www.genalphamagazines.com/assets/images/og-banner.jpg">
  <link rel="canonical" href="https://www.genalphamagazines.com/category-${catName}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <link rel="dns-prefetch" href="https://fonts.googleapis.com">
  <link rel="dns-prefetch" href="https://fonts.gstatic.com">
  <link rel="dns-prefetch" href="https://www.googletagmanager.com">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://www.googletagmanager.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=ABeeZee:ital@0;1&family=Inter:wght@400;500;600;700;800;900&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=ABeeZee:ital@0;1&family=Inter:wght@400;500;600;700;800;900&display=swap" media="print" onload="this.media='all'">
  <noscript>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=ABeeZee:ital@0;1&family=Inter:wght@400;500;600;700;800;900&display=swap">
  </noscript>
  <link rel="stylesheet" href="./assets/css/style.min.css?v=final_stable_v1">
  <link rel="icon" type="image/svg+xml" href="./assets/images/favicon.svg">
  <link rel="alternate icon" href="./favicon.ico">
  <link rel="manifest" href="./site.webmanifest">
  <meta name="theme-color" content="#c1121e">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "${meta.displayName} | GenAlphaMagazines",
    "description": "${meta.schemaDesc}",
    "url": "https://www.genalphamagazines.com/category-${catName}",
    "publisher": {
      "@type": "NewsMediaOrganization",
      "name": "GenAlphaMagazines",
      "url": "https://www.genalphamagazines.com/"
    }
  }
  </script>
</head>
<body>
  <div id="menu-backdrop" class="menu-backdrop"></div>
  
  <!-- Top Utility Bar -->
  <div class="top-bar">
    <div class="container top-bar-inner">
      <div class="top-date">
        <span>📅 ${dateFormatted}</span>
        <span>&bull;</span>
        <span>Positively Local, Supporting Regional Community</span>
      </div>
      <nav class="top-nav" aria-label="Utility Navigation">
        <ul>
          <li><a href="/pages/about">About</a></li>
          <li><a href="/pages/editorial-policy">Editorial Standards</a></li>
          <li><a href="/pages/privacy-policy">Privacy</a></li>
          <li><a href="/pages/contact">Contact</a></li>
        </ul>
      </nav>
    </div>
  </div>

  <!-- Main Newspaper Header -->
  <header class="main-header">
    <div class="container header-inner">
      <a href="/" class="brand-logo" aria-label="GenAlphaMagazines Homepage">
        <div class="creative-logo-badge">
          ${VECTOR_LOGO_SVG}
        </div>
        <div class="brand-text-block">
          <div class="brand-main-title">
            <span>GEN</span><span class="alpha-word">ALPHA</span><span class="mag-word">MAGAZINES</span>
          </div>
          <div class="brand-sub-tagline">
            Positively Local &bull; Supporting Community
          </div>
        </div>
      </a>
      
      <div class="header-actions">
        <a href="/pages/contact" class="news-tip-btn">
          <span>✉️</span> News Tip?
        </a>
        <button id="theme-toggle" class="theme-btn" aria-label="Toggle Dark/Light Mode">
          <span class="theme-icon">🌙</span>
          <span class="theme-text">Dark</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Sticky Navigation Bar with Mobile Dropdown -->
  <nav class="main-nav-wrapper">
    <div class="container mobile-nav-bar-inner">
      <div class="mobile-nav-title" style="display: none;">
        <span>📰 Departments</span>
      </div>
      <button id="mobile-menu-btn" class="mobile-menu-btn" aria-label="Toggle Navigation Menu" aria-expanded="false">
        <span>☰ Menu</span>
      </button>
      <div id="main-nav" class="main-nav" aria-label="Main Navigation">
        <ul class="main-nav-links">
          <li><a href="/">Home</a></li>
          <li><a href="/category-news" class="${catName === 'news' ? 'active' : ''}">News</a></li>
          <li><a href="/category-business" class="${catName === 'business' ? 'active' : ''}">Business</a></li>
          <li><a href="/category-celebrity" class="${catName === 'celebrity' ? 'active' : ''}">Celebrity</a></li>
          <li><a href="/category-entertainment" class="${catName === 'entertainment' ? 'active' : ''}">Entertainment</a></li>
          <li><a href="/category-games" class="${catName === 'games' ? 'active' : ''}">Games</a></li>
          <li><a href="/category-health" class="${catName === 'health' ? 'active' : ''}">Health</a></li>
          <li><a href="/category-technology" class="${catName === 'technology' ? 'active' : ''}">Technology</a></li>
          <li><a href="/category-others" class="${catName === 'others' ? 'active' : ''}">Others</a></li>
          <li><a href="/categories">All Topics</a></li>
        </ul>
      </div>
    </div>
  </nav>

  <!-- Multi-Story Dynamic Breaking News Ticker -->
  <div class="breaking-bar">
    <div class="container breaking-inner">
      <div class="breaking-badge">
        <span class="pulse-dot"></span>
        <span>BREAKING NEWS</span>
      </div>
      <div class="breaking-ticker-wrap">
        <div class="breaking-ticker-track">
${tickerItems}
        </div>
      </div>
    </div>
  </div>

  <main class="container" style="margin-top: 2rem; margin-bottom: 4rem;">
    <div class="section-header">
      <h1 class="section-box">${meta.displayName}</h1>
    </div>
    <p style="font-size: 1.05rem; color: var(--text-muted); margin-bottom: 2rem;">${meta.subtitle}</p>

    <div class="main-layout">
      <section aria-label="${meta.displayName} Articles">
        <div class="articles-grid">
${cardsHtml}
        </div>
      </section>

      <aside class="sidebar">
        <div class="newsletter-box">
          <h4>Subscribe to ${meta.displayName.toUpperCase()}</h4>
          <p>Get the latest stories delivered directly to your inbox every week.</p>
          <form onsubmit="event.preventDefault(); alert('Thank you for subscribing to GenAlphaMagazines!');">
            <input type="email" placeholder="Enter your email" required aria-label="Email address">
            <button type="submit">Subscribe Free</button>
          </form>
        </div>

        <div class="sidebar-widget">
          <h3 class="widget-title">Editorial Standards</h3>
          <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.8rem;">
            Every publication in GenAlphaMagazines adheres to strict EEAT guidelines, verified primary sources, and high-standard community journalism.
          </p>
          <a href="/pages/editorial-policy" style="font-weight: 700; color: var(--primary); font-size: 0.88rem;">Read Editorial Guidelines &rarr;</a>
        </div>

        <div class="ad-slot-wrap" aria-label="Sponsored Ad Unit">
          <span class="ad-label">Advertisement</span>
          <div class="ad-placeholder ad-sidebar">
            <span>Google AdSense Display Unit (300x250)</span>
          </div>
        </div>
      </aside>
    </div>
  </main>

  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <a href="/" class="footer-logo" aria-label="GenAlphaMagazines Homepage">
          <div class="creative-logo-badge">
            ${VECTOR_LOGO_SVG}
          </div>
          <div class="brand-text-block">
            <div class="brand-main-title">
              <span>GEN</span><span class="alpha-word">ALPHA</span><span class="mag-word">MAGAZINES</span>
            </div>
            <div class="brand-sub-tagline">
              Positively Local &bull; Supporting Community
            </div>
          </div>
        </a>
        <p style="font-size: 0.9rem; color: #94a3b8; line-height: 1.6;">
          GenAlphaMagazines is an independent community newsmagazine providing comprehensive coverage of regional affairs, local business innovation, arts, culture, and thoughtful opinion pieces.
        </p>
      </div>
      <div class="footer-col">
        <h5>Categories</h5>
        <ul class="footer-links">
          <li><a href="/category-news">News</a></li>
          <li><a href="/category-business">Business</a></li>
          <li><a href="/category-celebrity">Celebrity</a></li>
          <li><a href="/category-entertainment">Entertainment</a></li>
          <li><a href="/category-games">Games</a></li>
          <li><a href="/category-health">Health</a></li>
          <li><a href="/category-technology">Technology</a></li>
          <li><a href="/category-others">Others</a></li>
        </ul>
      </div>

      <div class="footer-col">
        <h5>Editorial</h5>
        <ul class="footer-links">
          <li><a href="/pages/about">About Us</a></li>
          <li><a href="/pages/editorial-policy">Editorial Standards</a></li>
          <li><a href="/pages/affiliate-disclosure">Affiliate Disclosure</a></li>
          <li><a href="/pages/contact">Contact Us</a></li>
        </ul>
      </div>

      <div class="footer-col">
        <h5>Compliance</h5>
        <ul class="footer-links">
          <li><a href="/pages/privacy-policy">Privacy Policy</a></li>
          <li><a href="/pages/terms">Terms & Conditions</a></li>
          <li><a href="/pages/cookie-policy">Cookie Policy</a></li>
          <li><a href="/pages/disclaimer">Disclaimer</a></li>
        </ul>
      </div>
    </div>

    <div class="container footer-bottom">
      <p>&copy; 2026 GenAlphaMagazines. All rights reserved. Operating under independent editorial governance.</p>
    </div>
  </footer>
  <script src="./assets/js/main.min.js" defer></script>
</body>
</html>`;
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
      }).map(item => {
        // Enforce Author Whitelist (Marcus Reid for News/Business/Technology/Games, Julia Vance for others)
        let author = item.author || 'Julia Vance';
        let authorSlug = item.authorSlug || 'julia-vance';
        const cat = (item.category || '').toLowerCase();
        if (authorSlug === 'artificial-intelligence' || author.toLowerCase() === 'artificial intelligence' || !['marcus-reid', 'julia-vance'].includes(authorSlug)) {
          if (['news', 'business', 'technology', 'games'].includes(cat)) {
            author = 'Marcus Reid';
            authorSlug = 'marcus-reid';
          } else {
            author = 'Julia Vance';
            authorSlug = 'julia-vance';
          }
        }
        return { ...item, author, authorSlug };
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

  // 4. Sync sitemap.xml (Complete dynamic rebuild with clean URLs and daily changefreq)
  const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    const currentDate = new Date().toISOString().split('T')[0];
    const sitemapUrls = [];

    // 1. Core Hubs (clean extensionless URLs)
    sitemapUrls.push({ loc: `${BASE_URL}/`, lastmod: currentDate, changefreq: 'daily', priority: '1.0' });
    sitemapUrls.push({ loc: `${BASE_URL}/categories`, lastmod: currentDate, changefreq: 'daily', priority: '0.9' });

    // 2. Category Hubs (clean extensionless URLs)
    const activeCategoriesList = ['news', 'business', 'celebrity', 'entertainment', 'games', 'health', 'technology', 'others'];
    for (const cat of activeCategoriesList) {
      sitemapUrls.push({ loc: `${BASE_URL}/category-${cat}`, lastmod: currentDate, changefreq: 'daily', priority: '0.85' });
    }

    // 3. Static Pages (clean extensionless URLs)
    const pagesDir = path.join(ROOT_DIR, 'pages');
    if (fs.existsSync(pagesDir)) {
      const pFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith('.html'));
      for (const pf of pFiles) {
        sitemapUrls.push({ loc: `${BASE_URL}/pages/${pf.replace('.html', '')}`, lastmod: currentDate, changefreq: 'daily', priority: '0.6' });
      }
    }

    // 4. Author Profiles (clean extensionless URLs)
    const authorDir = path.join(ROOT_DIR, 'author');
    if (fs.existsSync(authorDir)) {
      const aFiles = fs.readdirSync(authorDir).filter(f => f.endsWith('.html'));
      for (const af of aFiles) {
        sitemapUrls.push({ loc: `${BASE_URL}/author/${af.replace('.html', '')}`, lastmod: currentDate, changefreq: 'daily', priority: '0.7' });
      }
    }

    // 5. All Active Articles (clean extensionless URLs)
    for (const art of validArticlesList) {
      sitemapUrls.push({
        loc: `${BASE_URL}/${art.slug}`,
        lastmod: (art.publishedAt ? art.publishedAt.split('T')[0] : currentDate),
        changefreq: 'daily',
        priority: '0.8'
      });
    }

    const xmlEntries = sitemapUrls.map(u => 
      `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    ).join('\n');

    const fullSitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmlEntries}\n</urlset>\n`;
    writeIfChanged(sitemapPath, fullSitemapXml, fs.readFileSync(sitemapPath, 'utf8'));
    console.log(`[sync_articles] Sitemap synchronized: ${sitemapUrls.length} clean URLs with daily changefreq`);
  }

  // 5. Sync llms.txt and llms-full.txt
  syncLlmsFiles(existingSlugs, writeIfChanged);

  // 6. Sync category-*.html files (Clean Semantic Grid Rebuild)
  const activeCategories = [
    'business',
    'celebrity',
    'entertainment',
    'games',
    'health',
    'news',
    'others',
    'technology'
  ];

  for (const catName of activeCategories) {
    const catFile = `category-${catName}.html`;
    const catPath = path.join(ROOT_DIR, catFile);
    const original = fs.existsSync(catPath) ? fs.readFileSync(catPath, 'utf8') : '';

    const matchingArticles = validArticlesList.filter(a => {
      const artCat = (a.category || 'news').toLowerCase();
      if (artCat === catName) return true;
      if (catName === 'entertainment' && ['entertainment', 'celebrity', 'arts', 'culture'].includes(artCat)) return true;
      if (catName === 'lifestyle' && ['lifestyle', 'wellness', 'health'].includes(artCat)) return true;
      return false;
    });

    const cleanHtml = buildCategoryPageHtml(catName, matchingArticles, validArticlesList);
    writeIfChanged(catPath, cleanHtml, original);
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
                  <span>By <a href="/author/${leadArticle.authorSlug || 'julia-vance'}">${escapeHtml(leadArticle.author || 'Julia Vance')}</a></span>
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

    // D. Automatically purge dead cards from all section grids in index.html
    const cardRegex = /<article\s+class="card">[\s\S]*?<\/article>/gi;
    updated = updated.replace(cardRegex, (cardHtml) => {
      const linkMatch = cardHtml.match(/<a\s+href="(?:\/|\.\/|\.\/articles\/)?([a-zA-Z0-9_-]+)(?:\.html)?"/i);
      if (linkMatch) {
        const slug = linkMatch[1];
        if (!existingSlugs.has(slug)) {
          console.log(`[sync_articles] Purged dead card from index.html: ${slug}`);
          return '';
        }
      }
      return cardHtml;
    });

    // Standardize assets in index.html to minified versions
    updated = updated.replace(/<script\s+src=["'][^"']*(?:theme|main)\.js["'][^>]*><\/script>/gi, '<script src="./assets/js/main.min.js" defer></script>');
    updated = updated.replace(/<link\s+rel=["']stylesheet["']\s+href=["'][^"']*style\.css(?:\?[^"']*)?["']>/gi, '<link rel="stylesheet" href="./assets/css/style.min.css?v=final_stable_v1">');

    writeIfChanged(indexPath, updated, original);
  }

  // 7b. Sync categories.html (Ticker Track, Clean Canonical, Clean og:url, Clean Internal Links)
  const categoriesPath = path.join(ROOT_DIR, 'categories.html');
  if (fs.existsSync(categoriesPath) && validArticlesList.length > 0) {
    let original = fs.readFileSync(categoriesPath, 'utf8');
    let updated = original;

    // Standardize assets in categories.html to minified versions
    updated = updated.replace(/<script\s+src=["'][^"']*(?:theme|main)\.js["'][^>]*><\/script>/gi, '<script src="./assets/js/main.min.js" defer></script>');
    updated = updated.replace(/<link\s+rel=["']stylesheet["']\s+href=["'][^"']*style\.css(?:\?[^"']*)?["']>/gi, '<link rel="stylesheet" href="./assets/css/style.min.css?v=final_stable_v1">');

    // Clean canonical to extensionless
    updated = updated.replace(/<link\s+rel=["']canonical["']\s+href=["']https:\/\/www\.genalphamagazines\.com\/categories(?:\.html)?["']>+/gi, '<link rel="canonical" href="https://www.genalphamagazines.com/categories">');
    // Clean og:url to extensionless
    updated = updated.replace(/<meta\s+property=["']og:url["']\s+content=["']https:\/\/www\.genalphamagazines\.com\/categories(?:\.html)?["']>+/gi, '<meta property="og:url" content="https://www.genalphamagazines.com/categories">');
    // Clean schema url
    updated = updated.replace(/"url":\s*"https:\/\/www\.genalphamagazines\.com\/categories\.html"/g, '"url": "https://www.genalphamagazines.com/categories"');

    // Ensure H1 exists on categories.html
    updated = updated.replace(/<span class="section-box">All Categories &amp; Topic Directory<\/span>/gi, '<h1 class="section-box">All Categories & Topic Directory</h1>');
    updated = updated.replace(/<span class="section-box">All Categories & Topic Directory<\/span>/gi, '<h1 class="section-box">All Categories & Topic Directory</h1>');

    // Clean nav links
    updated = restoreNavigationAndFooter(updated, 'all');

    // Update ticker track with top 10 articles
    const catTickerStart = updated.indexOf('<div class="breaking-ticker-track">');
    if (catTickerStart !== -1) {
      const trackContentStart = updated.indexOf('>', catTickerStart) + 1;
      const trackEnd = updated.indexOf('</div>', trackContentStart);
      if (trackEnd !== -1) {
        const tickerItems = validArticlesList.slice(0, 10).map(art => 
          `          <a href="/${art.slug}" class="breaking-ticker-item"><span class="ticker-bullet">&bull;</span> ${escapeHtml(art.title)}</a>`
        ).join('\n');
        updated = updated.slice(0, trackContentStart) + '\n' + tickerItems + '\n        ' + updated.slice(trackEnd);
      }
    }

    writeIfChanged(categoriesPath, updated, original);
  }

  // 7c. Ensure static pages in pages/ and author/ have clean extensionless canonical tags
  const staticSubDirs = ['pages', 'author'];
  for (const sub of staticSubDirs) {
    const sDir = path.join(ROOT_DIR, sub);
    if (fs.existsSync(sDir)) {
      const files = fs.readdirSync(sDir).filter(f => f.endsWith('.html'));
      for (const f of files) {
        const fPath = path.join(sDir, f);
        const original = fs.readFileSync(fPath, 'utf8');
        let updated = original;
        const base = f.replace('.html', '');
        
        // Fix canonical tag (match entire tag up to and including >)
        const canRegex = new RegExp(`<link\\s+rel=["']canonical["']\\s+href=["']https://www\\.genalphamagazines\\.com/${sub}/${base}(?:\\.html)?["']>+`, 'i');
        updated = updated.replace(canRegex, `<link rel="canonical" href="https://www.genalphamagazines.com/${sub}/${base}">`);

        // Fix og:url tag (match entire tag up to and including >)
        const ogUrlRegex = new RegExp(`<meta\\s+property=["']og:url["']\\s+content=["']https://www\\.genalphamagazines\\.com/${sub}/${base}(?:\\.html)?["']>+`, 'i');
        updated = updated.replace(ogUrlRegex, `<meta property="og:url" content="https://www.genalphamagazines.com/${sub}/${base}">`);

        // Fix JSON-LD URL
        const jsonLdUrlRegex = new RegExp(`"url":\\s*"https://www\\.genalphamagazines\\.com/${sub}/${base}\\.html"`, 'g');
        updated = updated.replace(jsonLdUrlRegex, `"url": "https://www.genalphamagazines.com/${sub}/${base}"`);

        // Restore navigation links
        updated = restoreNavigationAndFooter(updated, sub === 'author' ? 'all' : 'all');

        // Ensure primary H1 exists on page
        if (!/<h1[^>]*>/i.test(updated)) {
          updated = updated.replace(/<span class="section-box">([^<]+)<\/span>/i, '<h1 class="section-box">$1</h1>');
        }

        // Standardize script and css to minified versions
        updated = updated.replace(/<script\s+src=["'][^"']*(?:theme|main)\.js["'][^>]*><\/script>/gi, '<script src="../assets/js/main.min.js" defer></script>');
        updated = updated.replace(/<link\s+rel=["']stylesheet["']\s+href=["'][^"']*style\.css(?:\?[^"']*)?["']>/gi, '<link rel="stylesheet" href="../assets/css/style.min.css?v=final_stable_v1">');

        writeIfChanged(fPath, updated, original);
      }
    }
  }

  // 8. Enforce Dash Sanitization, Clean Related Stories, and Remove Obsolete Placeholders inside articles/*.html
  for (const artFile of existingArticleFiles) {
    const artPath = path.join(articlesDir, artFile);
    const slug = artFile.replace('.html', '');
    let original = fs.readFileSync(artPath, 'utf8');
    let updated = original;

    // A. Strip all em-dashes and en-dashes across the article
    updated = sanitizeAllDashes(updated);

    // A2. Strip raw markdown hashes and Featured Snippet text/boxes
    updated = sanitizeMarkdownAndSnippets(updated);

    // B. Strip obsolete empty external reference box if present
    updated = removeObsoleteBoxes(updated);

    // C. Guarantee Related Investigative Reports & Department Features block exists
    updated = ensureRelatedSection(updated, slug, articlesDir);

    // C2. Guarantee visible FAQ cards exist if FAQPage schema is present
    updated = ensureArticleFaqs(updated, slug);

    // D. Enforce Exactly 2 Internal Links and 1 External Link on targeted keywords
    updated = standardizeArticleLinks(updated, slug);

    // E. Purge any broken links from existing related items
    const relatedItemRegex = /<li><strong>[^<]+:<\/strong>\s*<a\s+href="(?:\.\/|\.\.\/articles\/|\/)?([a-zA-Z0-9_-]+)(?:\.html)?"[^>]*>[\s\S]*?<\/a><\/li>\s*/gi;
    updated = updated.replace(relatedItemRegex, (fullMatch, targetSlug) => {
      const reservedSlugs = new Set(['categories', 'index', '404', 'admin']);
      if (!reservedSlugs.has(targetSlug) && !targetSlug.startsWith('category-') && !existingSlugs.has(targetSlug)) {
        return '';
      }
      return fullMatch;
    });

    // F. Standardize script and css tags to minified assets
    updated = updated.replace(/<script\s+src=["'][^"']*(?:theme|main)\.js["'][^>]*><\/script>/gi, '<script src="../assets/js/main.min.js" defer></script>');
    updated = updated.replace(/<link\s+rel=["']stylesheet["']\s+href=["'][^"']*style\.css(?:\?[^"']*)?["']>/gi, '<link rel="stylesheet" href="../assets/css/style.min.css?v=final_stable_v1">');

    // G. Guarantee Title Tag is Distinct from H1 and strictly <= 60 characters
    const h1Match = updated.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      const h1Text = h1Match[1].replace(/<[^>]+>/g, '').trim();
      let pageTitle;
      if (h1Text.length + 21 <= 60) {
        pageTitle = `${h1Text} | GenAlphaMagazines`;
      } else if (h1Text.length + 15 <= 60) {
        pageTitle = `${h1Text} | GenAlphaMag`;
      } else if (h1Text.length + 12 <= 60) {
        pageTitle = `${h1Text} | GenAlpha`;
      } else if (h1Text.includes(':')) {
        const parts = h1Text.split(':');
        const main = parts[0].trim();
        if (main.length + 15 <= 60) {
          pageTitle = `${main} | GenAlphaMag`;
        } else if (main.length + 12 <= 60) {
          pageTitle = `${main} | GenAlpha`;
        } else {
          const maxBase = 60 - 12;
          let base = main.slice(0, maxBase).replace(/\s+[^\s]*$/, '').replace(/[:,\-\s]+$/, '').trim();
          pageTitle = `${base} | GenAlpha`;
        }
      } else if (h1Text.includes(',')) {
        const parts = h1Text.split(',');
        const main = parts[0].trim();
        if (main.length + 15 <= 60) {
          pageTitle = `${main} | GenAlphaMag`;
        } else {
          const maxBase = 60 - 12;
          let base = main.slice(0, maxBase).replace(/\s+[^\s]*$/, '').replace(/[:,\-\s]+$/, '').trim();
          pageTitle = `${base} | GenAlpha`;
        }
      } else {
        const maxBase = 60 - 12;
        let base = h1Text.slice(0, maxBase).replace(/\s+[^\s]*$/, '').replace(/[:,\-\s]+$/, '').trim();
        pageTitle = `${base} | GenAlpha`;
      }

      const titleTagRegex = /<title>[\s\S]*?<\/title>/i;
      if (titleTagRegex.test(updated)) {
        updated = updated.replace(titleTagRegex, `<title>${pageTitle}</title>`);
      }
    }

    writeIfChanged(artPath, updated, original);
  }

  // 9. Clean up orphaned images in assets/images/
  const imagesDir = path.join(ROOT_DIR, 'assets', 'images');
  if (fs.existsSync(imagesDir)) {
    const staticBrandAssets = new Set([
      'favicon.svg', 'logo.svg', 'logo-dark.svg', 'og-banner.jpg',
      'creative-badge.svg', '.gitkeep',
      'cristiano-ronaldo-career-legacy-and-records-in-2026.jpg',
      'preventing-bathroom-drainage-failures-in-modern-homes.jpg'
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
    'category-arts.html', 'category-community.html', 'category-lifestyle.html', 'category-voices.html',
    'category-ai.html', 'category-cloud.html', 'category-security.html'
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


module.exports = {
  syncDeletedArticles,
  syncLlmsFiles,
  sanitizeAllDashes,
  sanitizeMarkdownAndSnippets,
  removeObsoleteBoxes,
  buildRelatedSectionHtml,
  ensureRelatedSection,
  ensureArticleFaqs,
  standardizeArticleLinks,
  restoreNavigationAndFooter,
  getCategoryFromHtml,
  CATEGORY_EXTERNAL_FALLBACKS,
  ARTICLE_INTERNAL_TARGETS,
  getAllInternalArticleTargets,
  buildCategoryPageHtml,
  CATEGORY_META,
  VECTOR_LOGO_SVG
};
