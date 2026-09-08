/**
 * enforce_faq_format.js
 * Called by the git pre-commit hook for every staged article HTML file.
 * Enforces single canonical FAQ card format. Runs before every git commit.
 *
 * Usage (manual): node scripts/enforce_faq_format.js [articles/file.html ...]
 * Usage (auto):   called by .git/hooks/pre-commit
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const articlesDir = path.join(ROOT, 'articles');

const args = process.argv.slice(2).filter(f => f.endsWith('.html'));
const targetFiles = args.length > 0
  ? args.map(f => path.isAbsolute(f) ? f : path.join(ROOT, f)).filter(fs.existsSync)
  : fs.readdirSync(articlesDir).map(f => path.join(articlesDir, f)).filter(f => f.endsWith('.html'));

const CARD_BG   = "background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1rem;";
const H3_STYLE  = "margin-top: 0; margin-bottom: 0.5rem; color: var(--primary); font-size: 1.05rem;";
const P_STYLE   = "margin-bottom: 0; color: var(--text-main); font-size: 0.95rem; line-height: 1.7;";

function renderCard(q, a) {
  return `\n            <div style="${CARD_BG}">\n              <h3 style="${H3_STYLE}">${q}</h3>\n              <p style="${P_STYLE}">${a}</p>\n            </div>`;
}

function extractPairs(body) {
  const pairs = [], seen = new Set();
  function add(q, a) {
    const key = q.toLowerCase().trim().slice(0, 80);
    if (!seen.has(key) && q.length > 5 && a.length > 5) {
      seen.add(key);
      pairs.push({ q: q.trim(), a: a.trim().replace(/<[^>]+>/g, '') });
    }
  }
  let m;
  // faq-item class (single or double quotes)
  const r1 = /<div[^>]*class=['"]faq-item['"][^>]*>([\s\S]*?)<\/div>/gi;
  while ((m = r1.exec(body)) !== null) {
    const qm = m[1].match(/<h[234][^>]*>([^<]+)<\/h[234]>/i);
    const am = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (qm && am) add(qm[1], am[1]);
  }
  // styled bg-card divs (already correct format — extract to de-dupe)
  const bgToken = "background: var(--bg-card)";
  const r2 = /<div style="[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  while ((m = r2.exec(body)) !== null) {
    if (!m[0].includes(bgToken)) continue;
    const qm = m[1].match(/<h[234][^>]*>([^<]+)<\/h[234]>/i);
    const am = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (qm && am) add(qm[1], am[1]);
  }
  // plain unstyled h3/h4 + p pairs
  const r3 = /<h[234]>([^<]+)<\/h[234]>\s*<p>([\s\S]*?)<\/p>/gi;
  while ((m = r3.exec(body)) !== null) add(m[1], m[2]);
  return pairs;
}

function isClean(body) {
  if (/class=['"]faq-item['"]/.test(body)) return false;
  if (/<h3>[^<]+<\/h3>/.test(body)) return false;
  if (/<h4 style=/.test(body)) return false;
  const qs = []; let m;
  const qRe = /<h3 style=[^>]*>([^<]+)<\/h3>/gi;
  while ((m = qRe.exec(body)) !== null) qs.push(m[1].trim().toLowerCase());
  if (qs.length !== new Set(qs).size) return false;
  return true;
}

let fixed = 0, clean = 0;
for (const filePath of targetFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  const sm = content.match(/(<section[^>]*id=["']frequently-asked-questions["'][^>]*>)([\s\S]*?)(<\/section>)/i);
  if (!sm) continue;
  const [full, open, body, close] = sm;
  if (isClean(body)) { clean++; continue; }
  const pairs = extractPairs(body);
  if (!pairs.length) { console.log('[SKIP] ' + path.basename(filePath)); continue; }
  const cards = pairs.map(p => renderCard(p.q, p.a)).join('');
  const newBody = `\n            <h2>Frequently Asked Questions</h2>\n            <div style="margin-top: 1.25rem;">${cards}\n            </div>\n          `;
  content = content.replace(full, open + newBody + close);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('[FIXED] ' + path.basename(filePath) + ' — ' + pairs.length + ' items → card format');
  fixed++;
}
if (fixed || clean) console.log('[enforce_faq_format] Done: ' + fixed + ' fixed | ' + clean + ' already clean');
process.exit(0);