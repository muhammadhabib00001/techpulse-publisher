const fs = require('fs');
const path = require('path');
const { detectAiWords } = require('./ai_word_filter.js');

const ROOT_DIR = path.resolve(__dirname, '..');

// 1. Update index.html
const indexPath = path.join(ROOT_DIR, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

const heroSectionHtml = `
      <!-- Featured Lead Story Section -->
      <section aria-label="Featured Story" class="hero-featured-section">
        <div class="section-header">
          <h2 class="section-box">Featured Lead Story</h2>
        </div>
        <div class="featured-lead-grid" style="display: grid; grid-template-columns: 1.25fr 1fr; gap: 2rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; box-shadow: var(--shadow-sm); margin-top: 1rem;">
          <div class="featured-lead-img-wrap" style="position: relative; min-height: 320px; overflow: hidden;">
            <a href="/how-culligan-water-softeners-transform-your-home-routine" aria-label="Read How Culligan Water Softeners Transform Your Home Routine">
              <img src="/assets/images/how-culligan-water-softeners-transform-your-home-routine.jpg" alt="How Culligan Water Softeners Transform Your Home Routine" width="800" height="450" loading="eager" fetchpriority="high" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s ease;">
            </a>
          </div>
          <div class="featured-lead-content" style="padding: 2rem 2.25rem 2rem 1rem; display: flex; flex-direction: column; justify-content: center;">
            <span class="card-tag" style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--primary); margin-bottom: 0.75rem;">OTHERS &bull; Practical Home Systems</span>
            <h1 class="card-title" style="font-family: var(--font-heading); font-size: 1.75rem; font-weight: 800; line-height: 1.25; margin-bottom: 1rem; color: var(--text-main);">
              <a href="/how-culligan-water-softeners-transform-your-home-routine" style="color: inherit; text-decoration: none;">How Culligan Water Softeners Transform Your Home Routine</a>
            </h1>
            <p class="card-excerpt" style="font-size: 0.95rem; color: var(--text-muted); line-height: 1.65; margin-bottom: 1.5rem;">
              Learn how Culligan water softeners treat hard water, protect household appliances, reduce monthly soap costs, and compare models for your home.
            </p>
            <div class="card-meta" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; font-weight: 600; color: var(--text-light); border-top: 1px solid var(--border-light); padding-top: 1rem;">
              <span>By <a href="/author/julia-vance" style="color: var(--text-muted); font-weight: 700;">Julia Vance</a></span>
              <span>October 6, 2026</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Department Feed: Community & Culture / Others -->
      <section aria-label="Others" style="margin-top: 1.5rem;">
        <div class="section-header">
          <span class="section-box">Community &amp; Culture</span>
        </div>
        <div class="pattern-b-grid" style="margin-top: 1rem;">
          <article class="card">
            <div class="card-img-wrap">
              <img src="/assets/images/how-culligan-water-softeners-transform-your-home-routine.jpg" alt="How Culligan Water Softeners Transform Your Home Routine" width="400" height="225" loading="lazy" decoding="async">
            </div>
            <div class="card-content">
              <span class="card-tag">OTHERS &bull; Practical Home Systems</span>
              <h3 class="card-title"><a href="/how-culligan-water-softeners-transform-your-home-routine">How Culligan Water Softeners Transform Your Home Routine</a></h3>
              <p class="card-excerpt">Learn how Culligan water softeners treat hard water, protect household appliances, reduce monthly soap costs, and compare models for your home.</p>
              <div class="card-meta">
                <span>By <a href="/author/julia-vance">Julia Vance</a></span>
                <span>October 6, 2026</span>
              </div>
            </div>
          </article>
        </div>
      </section>`;

// Replace the Welcome / Editorial Announcement section with the article sections
const announcementStart = indexHtml.indexOf('<section aria-label="Editorial Announcement"');
if (announcementStart !== -1) {
  const announcementEnd = indexHtml.indexOf('</section>', announcementStart) + 10;
  indexHtml = indexHtml.slice(0, announcementStart) + heroSectionHtml + indexHtml.slice(announcementEnd);
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log('Updated index.html with Featured Lead Story and Category Feed');
} else {
  console.log('Could not find announcement section in index.html');
}

// 2. Update categories.html
const catPath = path.join(ROOT_DIR, 'categories.html');
let catHtml = fs.readFileSync(catPath, 'utf8');

// Add Featured Recent Publication above the grid
const gridStartMarker = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem;">';
const featuredCatBanner = `
    <!-- Featured Recent Department Publication -->
    <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.75rem; margin-bottom: 2rem; box-shadow: var(--shadow-sm);">
      <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--primary); margin-bottom: 0.75rem;">Latest Department Publication</div>
      <div style="display: flex; gap: 1.5rem; align-items: center; flex-wrap: wrap;">
        <div style="flex: 0 0 240px; aspect-ratio: 16/9; overflow: hidden; border-radius: var(--radius-sm);">
          <a href="/how-culligan-water-softeners-transform-your-home-routine">
            <img src="/assets/images/how-culligan-water-softeners-transform-your-home-routine.jpg" alt="How Culligan Water Softeners Transform Your Home Routine" style="width: 100%; height: 100%; object-fit: cover;">
          </a>
        </div>
        <div style="flex: 1; min-width: 260px;">
          <span class="card-tag" style="display: inline-block; margin-bottom: 0.4rem; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--primary);">OTHERS &bull; Practical Home Systems</span>
          <h3 style="margin: 0 0 0.5rem 0; font-family: var(--font-heading); font-size: 1.3rem;">
            <a href="/how-culligan-water-softeners-transform-your-home-routine" style="color: var(--text-main); text-decoration: none;">How Culligan Water Softeners Transform Your Home Routine</a>
          </h3>
          <p style="margin: 0 0 0.75rem 0; font-size: 0.92rem; color: var(--text-muted); line-height: 1.55;">
            Learn how Culligan water softeners treat hard water, protect household appliances, reduce monthly soap costs, and compare models for your home.
          </p>
          <div style="font-size: 0.8rem; color: var(--text-light);">
            By <a href="/author/julia-vance" style="font-weight: 700; color: var(--text-muted);">Julia Vance</a> &bull; October 6, 2026
          </div>
        </div>
      </div>
    </div>
`;

if (!catHtml.includes('Latest Department Publication') && catHtml.includes(gridStartMarker)) {
  catHtml = catHtml.replace(gridStartMarker, featuredCatBanner + '\n    ' + gridStartMarker);
}

// Update Others card inside categories.html
const othersOldPattern = /<div class="card" style="padding: 1.5rem;">\s*<span class="badge-tag">OTHERS<\/span>[\s\S]*?<a href="\/category-others"[^>]*>Browse Community & Culture Stories &rarr;<\/a>\s*<\/div>/i;
const othersNewCard = `<div class="card" style="padding: 1.5rem;">
        <span class="badge-tag">OTHERS</span>
        <h3 style="margin-top: 0.5rem; margin-bottom: 0.5rem;">Community &amp; Culture</h3>
        <p style="font-size: 0.92rem; color: var(--text-muted); margin-bottom: 1rem;">Civic history, community initiatives, household systems, regional heritage, and specialized lifestyle guides.</p>
        <div style="margin-bottom: 1.25rem; padding: 0.85rem; background: var(--bg-subtle); border-radius: var(--radius-sm); border-left: 3px solid var(--primary);">
          <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--primary); display: block; margin-bottom: 0.25rem;">Featured Story:</span>
          <h4 style="margin: 0; font-size: 0.95rem; line-height: 1.35;"><a href="/how-culligan-water-softeners-transform-your-home-routine" style="color: var(--text-main); text-decoration: none;">How Culligan Water Softeners Transform Your Home Routine</a></h4>
        </div>
        <a href="/category-others" style="font-weight: 700; color: var(--primary); font-size: 0.9rem;">Browse Community &amp; Culture Stories &rarr;</a>
      </div>`;

if (othersOldPattern.test(catHtml)) {
  catHtml = catHtml.replace(othersOldPattern, othersNewCard);
}
fs.writeFileSync(catPath, catHtml, 'utf8');
console.log('Updated categories.html with Featured Publication and Others card link');

// 3. Update all individual category pages with cross-department sidebar link
const categoryFiles = [
  'category-news.html',
  'category-business.html',
  'category-celebrity.html',
  'category-entertainment.html',
  'category-games.html',
  'category-technology.html'
];

const trendingWidgetHtml = `
        <div class="sidebar-widget">
          <h3 class="widget-title">Featured Across Departments</h3>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.85rem; padding-top: 0.5rem; border-top: 1px solid var(--border-light);">
            <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--primary);">Community &amp; Culture</span>
            <a href="/how-culligan-water-softeners-transform-your-home-routine" style="font-weight: 700; color: var(--text-main); font-size: 0.92rem; line-height: 1.4; text-decoration: none;">How Culligan Water Softeners Transform Your Home Routine</a>
            <span style="font-size: 0.78rem; color: var(--text-muted);">By Julia Vance &bull; Oct 6, 2026</span>
          </div>
        </div>`;

for (const cFile of categoryFiles) {
  const filePath = path.join(ROOT_DIR, cFile);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('Featured Across Departments')) {
      const standardsMarker = '<div class="sidebar-widget">\n          <h3 class="widget-title">Editorial Standards</h3>';
      if (content.includes(standardsMarker)) {
        content = content.replace(standardsMarker, trendingWidgetHtml + '\n\n        ' + standardsMarker);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Added cross-department featured widget to ${cFile}`);
      }
    }
  }
}

// Check AI words in index.html, categories.html
[indexPath, catPath].forEach(f => {
  const text = fs.readFileSync(f, 'utf8');
  const detected = detectAiWords(text);
  if (detected.length > 0) {
    console.warn(`Warning: AI words detected in ${f}:`, detected);
  } else {
    console.log(`${path.basename(f)} is 100% clean of banned AI words.`);
  }
});
