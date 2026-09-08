/**
 * enforce_faq_format.js (Editorial Quality & FAQ Enforcer)
 * Called by the git pre-commit hook for every staged article HTML file.
 * Enforces:
 * 1. ZERO "2026" / "in 2026" in article titles (<title>, <h1>, og:title)
 * 2. Single canonical FAQ card format with semantic H3 headings
 *
 * Runs automatically before every git commit for both manual and automated articles.
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
  const r1 = /<div[^>]*class=['"]faq-item['"][^>]*>([\s\S]*?)<\/div>/gi;
  while ((m = r1.exec(body)) !== null) {
    const qm = m[1].match(/<h[234][^>]*>([^<]+)<\/h[234]>/i);
    const am = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (qm && am) add(qm[1], am[1]);
  }
  const bgToken = "background: var(--bg-card)";
  const r2 = /<div style="[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  while ((m = r2.exec(body)) !== null) {
    if (!m[0].includes(bgToken)) continue;
    const qm = m[1].match(/<h[234][^>]*>([^<]+)<\/h[234]>/i);
    const am = m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (qm && am) add(qm[1], am[1]);
  }
  const r3 = /<h[234]>([^<]+)<\/h[234]>\s*<p>([\s\S]*?)<\/p>/gi;
  while ((m = r3.exec(body)) !== null) add(m[1], m[2]);
  return pairs;
}

function isFaqClean(body) {
  if (/class=['"]faq-item['"]/.test(body)) return false;
  if (/<h3>[^<]+<\/h3>/.test(body)) return false;
  if (/<h4 style=/.test(body)) return false;
  const qs = []; let m;
  const qRe = /<h3 style=[^>]*>([^<]+)<\/h3>/gi;
  while ((m = qRe.exec(body)) !== null) qs.push(m[1].trim().toLowerCase());
  if (qs.length !== new Set(qs).size) return false;
  return true;
}

let fixed = 0, clean = 0, titleCleaned = 0;

for (const filePath of targetFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  let fileModified = false;

  // 1. Enforce No "2026" in Titles
  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch && /2026/.test(titleMatch[1])) {
    const parts = titleMatch[1].split('|');
    const rawHead = parts[0].trim();
    const siteSuffix = parts[1] ? ` | ${parts[1].trim()}` : '';
    const cleanHead = sanitizeTitleString(rawHead);
    const newTitle = cleanHead + siteSuffix;
    content = content.replace(titleMatch[0], `<title>${newTitle}</title>`);
    fileModified = true;
    titleCleaned++;
  }

  const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match && /2026/.test(h1Match[1])) {
    const rawH1 = h1Match[1].replace(/<[^>]+>/g, '').trim();
    const cleanH1 = sanitizeTitleString(rawH1);
    content = content.replace(h1Match[0], `<h1 class="article-title">${cleanH1}</h1>`);
    fileModified = true;
  }

  const ogTitleMatch = content.match(/<meta property="og:title" content="([^"]+)">/i);
  if (ogTitleMatch && /2026/.test(ogTitleMatch[1])) {
    const cleanOg = sanitizeTitleString(ogTitleMatch[1]);
    content = content.replace(ogTitleMatch[0], `<meta property="og:title" content="${cleanOg}">`);
    fileModified = true;
  }

  // 2. Enforce FAQ Card Format
  const sm = content.match(/(<section[^>]*id=["']frequently-asked-questions["'][^>]*>)([\s\S]*?)(<\/section>)/i);
  if (sm) {
    const [full, open, body, close] = sm;
    if (!isFaqClean(body)) {
      const pairs = extractPairs(body);
      if (pairs.length > 0) {
        const cards = pairs.map(p => renderCard(p.q, p.a)).join("");
        const newBody = `\n            <h2>Frequently Asked Questions</h2>\n            <div style="margin-top: 1.25rem;">${cards}\n            </div>\n          `;
        content = content.replace(full, open + newBody + close);
        fileModified = true;
        fixed++;
      }
    } else {
      clean++;
    }
  }

  if (fileModified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[AUTO-ENFORCED] ${path.basename(filePath)}`);
  }
}

console.log(`[enforce_faq_format] Done: ${fixed} FAQs fixed | ${titleCleaned} titles cleaned | ${clean} already clean`);
process.exit(0);