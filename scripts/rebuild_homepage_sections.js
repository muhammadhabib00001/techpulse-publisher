const fs = require('fs');
const path = require('path');

const articles = JSON.parse(fs.readFileSync('data/articles.json', 'utf8'));

const homepageCategories = [
  { name: 'News', label: 'News', keys: ['news'] },
  { name: 'Business', label: 'Business', keys: ['business'] },
  { name: 'Celebrity', label: 'Celebrity', keys: ['celebrity'] },
  { name: 'Entertainment', label: 'Entertainment', keys: ['entertainment', 'arts', 'culture'] },
  { name: 'Games', label: 'Games', keys: ['games', 'gaming', 'esports'] },
  { name: 'Health', label: 'Health', keys: ['health', 'wellness'] },
  { name: 'Technology', label: 'Technology', keys: ['technology', 'tech'] },
  { name: 'Others', label: 'Others', keys: ['others', 'lifestyle'] }
];

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCard(art, catLabel) {
  const img = art.image || `./assets/images/${art.slug}.jpg`;
  const author = art.author || 'Julia Vance';
  const authorSlug = art.authorSlug || 'julia-vance';
  const dateStr = art.date || 'Recent';

  return `          <article class="card">
            <div class="card-img-wrap">
              <img src="${img}" alt="${escapeHtml(art.title)}" width="400" height="225" loading="lazy" decoding="async">
            </div>
            <div class="card-content">
              <span class="card-tag">${catLabel.toUpperCase()}</span>
              <h3 class="card-title"><a href="/${art.slug}">${escapeHtml(art.title)}</a></h3>
              <p class="card-excerpt">${escapeHtml(art.excerpt || '')}</p>
              <div class="card-meta"><span>By <a href="/author/${authorSlug}">${escapeHtml(author)}</a></span><span>${dateStr}</span></div>
            </div>
          </article>`;
}

let sectionsHtml = '';

homepageCategories.forEach(cat => {
  const matching = articles.filter(a => {
    const c = (a.category || 'others').toLowerCase();
    return cat.keys.includes(c);
  }).slice(0, 8); // MAX 8 ARTICLES STRICTLY

  if (matching.length === 0) return;

  const cardsHtml = matching.map(art => renderCard(art, cat.name)).join('\n');

  sectionsHtml += `
      <!-- ================================================================
           ${cat.name.toUpperCase()} SECTION
           ================================================================ -->
      <section aria-label="${cat.name}">
        <div class="section-header">
          <span class="section-box">${cat.name}</span>
        </div>

        <div class="pattern-b-grid">
${cardsHtml}
        </div>
      </section>
`;
});

let html = fs.readFileSync('index.html', 'utf8');

const latestSecPos = html.indexOf('<section aria-label="Latest Publications">');
if (latestSecPos === -1) {
  console.error('Could not find Latest Publications section in index.html');
  process.exit(1);
}

const latestEndPos = html.indexOf('</section>', latestSecPos) + '</section>'.length;
const mainClosePos = html.indexOf('</main>');

if (latestEndPos > 0 && mainClosePos > latestEndPos) {
  const newContent = '\n' + sectionsHtml + '\n    </div>\n  ';
  html = html.substring(0, latestEndPos) + newContent + html.substring(mainClosePos);
  fs.writeFileSync('index.html', html, 'utf8');
  console.log('Successfully updated index.html homepage category sections with max 8 articles per section!');
} else {
  console.error('Could not find insertion position');
}
