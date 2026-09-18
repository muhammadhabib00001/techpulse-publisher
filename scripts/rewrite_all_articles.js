// rewrite_all_articles.js v2 - MASTER SEO batch rewriter
// Run: node scripts/rewrite_all_articles.js
'use strict';
const fs   = require('fs');
const path = require('path');
const https= require('https');

const ROOT         = path.resolve(__dirname, '..');
const ARTICLES_DIR = path.join(ROOT, 'articles');
const GEM_KEY      = Buffer.from('QVEuQWI4Uk42SlhCSVkwbGFFelQ0QmpBLXNZN2dkSW9GME80eVlnRXJXNlkxMzhIUXYxekE=','base64').toString('utf8');
const API_KEY      = process.env.GEMINI_API_KEY || GEM_KEY;
const BATCH_SIZE   = 3;
const BATCH_PAUSE  = 15000;
const ART_PAUSE    = 3000;

// Most reliable first based on live API testing 2026-09-18
const MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3-flash-preview',
];

const AUTHORS = {
  news:          { name: 'Marcus Reid',  role: 'Editor-in-Chief and Civic Affairs Correspondent', initials: 'MR' },
  business:      { name: 'Marcus Reid',  role: 'Senior Business and Financial Editor',             initials: 'MR' },
  celebrity:     { name: 'Julia Vance',  role: 'Culture and Entertainment Columnist',              initials: 'JV' },
  entertainment: { name: 'Julia Vance',  role: 'Managing Editor and Arts Lead',                    initials: 'JV' },
  games:         { name: 'Marcus Reid',  role: 'Senior Tech and Gaming Correspondent',             initials: 'MR' },
  health:        { name: 'Julia Vance',  role: 'Health and Wellness Contributor',                  initials: 'JV' },
  technology:    { name: 'Marcus Reid',  role: 'Technology and Innovation Editor',                 initials: 'MR' },
  others:        { name: 'Julia Vance',  role: 'Managing Editor and Community Lead',               initials: 'JV' },
};
const CAT_BADGE = {
  news: 'NEWS', business: 'BUSINESS', celebrity: 'CELEBRITY',
  entertainment: 'ENTERTAINMENT', games: 'GAMES', health: 'HEALTH',
  technology: 'TECHNOLOGY', others: 'OTHERS'
};

// ── Robust JSON parser with repair fallback ───────────────────────────────
function tryParseJSON(raw) {
  let clean = raw.trim();
  // Strip markdown fences
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
  }
  // Try straight parse
  try { return JSON.parse(clean); } catch (e1) {
    // Repair: strip control chars and retry
    const stripped = clean.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
    try { return JSON.parse(stripped); } catch (e2) {
      // Repair: truncate at last complete section object
      const lastGoodIdx = stripped.lastIndexOf('{"id"');
      if (lastGoodIdx > 200) {
        // find the end of the previous section
        const before = stripped.slice(0, lastGoodIdx).trimEnd();
        const trimmed = before.endsWith(',') ? before.slice(0, -1) : before;
        const repaired = trimmed + '],"faqs":[]}';
        try { return JSON.parse(repaired); } catch (e3) {
          throw new Error('Unparseable JSON after repair: ' + e1.message);
        }
      }
      throw new Error('Unparseable JSON: ' + e1.message);
    }
  }
}

// ── Gemini API call with model fallback + retry on high demand ────────────
async function callGemini(userPrompt, systemInstruction) {
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await new Promise((resolve, reject) => {
          const body = JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.25,
              maxOutputTokens: 16000,
            }
          });
          const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + API_KEY;
          const req = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
              try {
                const p = JSON.parse(d);
                if (p.error) { reject(new Error('[' + model + '] ' + p.error.message)); return; }
                const text = (p.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('');
                if (!text) { reject(new Error('[' + model + '] Empty response')); return; }
                resolve(tryParseJSON(text));
              } catch (e) { reject(e); }
            });
          });
          req.on('error', reject);
          req.write(body); req.end();
        });
        console.log('    [OK] ' + model + (attempt > 0 ? ' (retry ' + attempt + ')' : ''));
        return result;
      } catch (e) {
        const msg = e.message || '';
        const isGone = msg.includes('no longer available') || msg.includes('not found for API') || msg.includes('deprecated');
        const isHighDemand = msg.includes('high demand') || msg.includes('overloaded') || msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED');
        console.warn('    [WARN] ' + model + ' a' + (attempt + 1) + ': ' + msg.slice(0, 90));
        if (isGone) break;
        if (isHighDemand && attempt === 0) {
          await new Promise(r => setTimeout(r, 6000));
        } else {
          await new Promise(r => setTimeout(r, 1500));
          break;
        }
      }
    }
  }
  throw new Error('All Gemini models failed');
}

// ── Extract metadata from existing article HTML ───────────────────────────
function extractMeta(html, filename) {
  const slug = filename.replace('.html', '');
  const h1m = html.match(/<h1[^>]*class="article-title"[^>]*>([^<]+)<\/h1>/i)
           || html.match(/<title>([^|<]+)/i);
  let topic = h1m ? h1m[1].trim() : slug.replace(/-/g, ' ');
  topic = topic.replace(/\s*\|\s*GenAlpha.*$/i, '').trim();

  const badgeM = html.match(/class="article-category-badge"[^>]*>([A-Z]+)/i);
  let category = badgeM ? badgeM[1].toLowerCase().trim() : 'others';
  if (!AUTHORS[category]) category = 'others';

  const dateM = html.match(/datePublished["']?\s*:\s*["']([^"']{8,})/i)
             || html.match(/published_time["']\s+content=["']([^"']{8,})/i);
  const publishedDate = dateM ? dateM[1].slice(0, 10) : new Date().toISOString().slice(0, 10);

  const imgM = html.match(/<img[^>]+src="([^"]+\/assets\/images\/[^"]+)"[^>]+fetchpriority/i);
  const imgSrc = imgM ? imgM[1] : '../assets/images/' + slug + '.jpg';

  // Skip if already has Quick Answer box (already rewritten in MASTER SEO format)
  const alreadyDone = html.includes('<strong>Quick Answer:</strong>');
  return { slug, topic, category, publishedDate, imgSrc, alreadyDone };
}

// ── Build MASTER SEO prompts ──────────────────────────────────────────────
function buildPrompts(topic, category, author) {
  const systemInstruction = `You are a Senior SEO Content Strategist and Copywriter. Write MASTER SEO articles: real, specific, helpful. Zero generic filler.

RULES:
1. HEADLINE: 50-60 chars. Click-worthy. Never add year 2026. Never use generic suffixes.
2. QUICK ANSWER BOX: First element in section 1 contentHtml MUST be:
   <div style="background:var(--bg-subtle);border-left:4px solid var(--primary);padding:1.25rem 1.5rem;border-radius:var(--radius-sm);margin:0 0 1.5rem 0;"><p style="margin:0;font-size:1rem;line-height:1.75;"><strong>Quick Answer:</strong> [REAL 2-3 sentence answer with specific facts, prices, brands, steps for this exact topic]</p></div>
3. STRUCTURE: Exactly 6 sections.
   S1: heading="" - Quick Answer box then 2-3 hook paragraphs, keyword in first 100 words
   S2-S4: H2 heading + 2-3 H3 subheadings - REAL specific content with USD prices, brand names, real steps
   S5: id="final-thoughts" heading="Final Thoughts" - key takeaway in <div style="background:var(--bg-subtle);border-left:4px solid var(--primary);padding:1.5rem;border-radius:var(--radius-sm);">...</div>
   S6: id="frequently-asked-questions" heading="Frequently Asked Questions" contentHtml=""
4. contentHtml: HTML only - h2, h3, p, ul, ol, li, strong. No markdown hashes. No Featured Snippet label.
5. WORD COUNT: 1000-1500 words total across body sections.
6. NO EM-DASH or EN-DASH anywhere.
7. FAQs: Exactly 5. Direct, specific, 35+ words each. Real facts. No vague answers.
8. BANNED generic H3s for non-tech topics: Architecture and Build, Performance Optimization, Ecosystem Integration.
9. OUTPUT: Raw JSON only. No markdown fences. Schema: {"title":"","slug":"","metaDescription":"","sections":[{"id":"","heading":"","contentHtml":""}],"faqs":[{"question":"","answer":""}]}`;

  const userPrompt = `Write a MASTER SEO article.
TOPIC: "${topic}"
CATEGORY: ${category}
AUTHOR: ${author.name}
AUDIENCE: Worldwide
LENGTH: 1000-1500 words
TONE: Professional, trustworthy, informative

MANDATORY:
- Section 1 (heading=""): Start with Quick Answer box containing REAL facts for "${topic}" (prices, brands, steps, timelines). Then 2-3 hook paragraphs.
- Sections 2-4: H2 + 2-3 H3 each. REAL specific subtopics, real USD prices, real brand names, real statistics.
- Section 5 (id="final-thoughts", heading="Final Thoughts"): Key takeaway in styled div.
- Section 6 (id="frequently-asked-questions", heading="Frequently Asked Questions", contentHtml="").
- faqs array: exactly 5, direct answers 35+ words, real facts only.

Output raw JSON only. No explanation. No markdown fences.`;

  return { systemInstruction, userPrompt };
}

// ── Strip dashes ──────────────────────────────────────────────────────────
function sd(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/(\d+)\s*[\u2013\u2014]\s*(\d+)/g, '$1 to $2')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/,\s*,/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Build complete article HTML ───────────────────────────────────────────
function buildHTML(data, slug, imgSrc, publishedDate, category) {
  const a   = AUTHORS[category] || AUTHORS.others;
  const cb  = CAT_BADGE[category] || 'OTHERS';
  const pf  = new Date(publishedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const mod = new Date().toISOString();
  const pub = new Date(publishedDate).toISOString();
  const siteUrl = 'https://www.genalphamagazines.com/' + slug;
  const img = imgSrc.startsWith('../') ? imgSrc : '../assets/images/' + slug + '.jpg';
  const as  = a.name.toLowerCase().replace(/ /g, '-');
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const secs = (data.sections || []).map(s => ({
    ...s,
    heading: sd(s.heading || ''),
    contentHtml: sd(s.contentHtml || '')
  }));
  const faqs = (data.faqs || []).map(f => ({
    question: sd(f.question || ''),
    answer: sd(f.answer || '')
  }));

  let secHtml = '';
  for (const s of secs) {
    if (s.id === 'frequently-asked-questions') continue;
    if (s.heading) {
      secHtml += '\n        <section id="' + (s.id || '') + '">\n          <h2>' + s.heading + '</h2>\n          ' + s.contentHtml + '\n        </section>';
    } else {
      secHtml += '\n        <section id="' + (s.id || 'introduction') + '">\n          ' + s.contentHtml + '\n        </section>';
    }
  }

  const faqCards = faqs.map(f =>
    '<div class="faq-card" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:1.25rem;margin-bottom:1rem;">' +
    '<h3 style="margin-top:0;margin-bottom:0.5rem;color:var(--primary);font-size:1.05rem;">' + f.question + '</h3>' +
    '<p style="margin-bottom:0;font-size:0.95rem;line-height:1.7;">' + f.answer + '</p></div>'
  ).join('');

  const faqLd = faqs.map(f =>
    '{"@type":"Question","name":"' + f.question.replace(/"/g, '\\"') + '",' +
    '"acceptedAnswer":{"@type":"Answer","text":"' + f.answer.replace(/"/g, '\\"') + '"}}'
  ).join(',');

  const titleEsc = (data.title || '').replace(/"/g, '\\"');
  const descEsc  = (data.metaDescription || '').replace(/"/g, '\\"');

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
'<script async src="https://www.googletagmanager.com/gtag/js?id=G-052TFQ4D4Q"></script>\n' +
'<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag(\'js\',new Date());gtag(\'config\',\'G-052TFQ4D4Q\');</script>\n' +
'<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<meta name="msvalidate.01" content="25038A8801D42437BBC34723A41AC6C4">\n' +
'<title>' + data.title + ' | GenAlpha</title>\n' +
'<meta name="description" content="' + data.metaDescription + '">\n' +
'<link rel="canonical" href="' + siteUrl + '">\n' +
'<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">\n' +
'<meta property="og:type" content="article"><meta property="og:title" content="' + data.title + '">\n' +
'<meta property="og:description" content="' + data.metaDescription + '">\n' +
'<meta property="og:image" content="https://www.genalphamagazines.com/assets/images/' + slug + '.jpg">\n' +
'<meta property="og:url" content="' + siteUrl + '">\n' +
'<meta property="article:published_time" content="' + pub + '">\n' +
'<meta property="article:modified_time" content="' + mod + '">\n' +
'<meta property="article:section" content="' + category + '">\n' +
'<meta name="twitter:card" content="summary_large_image">\n' +
'<meta name="twitter:title" content="' + data.title + '">\n' +
'<meta name="twitter:description" content="' + data.metaDescription + '">\n' +
'<meta name="twitter:image" content="https://www.genalphamagazines.com/assets/images/' + slug + '.jpg">\n' +
'<link rel="icon" type="image/x-icon" href="/favicon.ico">\n' +
'<link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon-32x32.png">\n' +
'<link rel="apple-touch-icon" sizes="180x180" href="/assets/images/apple-touch-icon.png">\n' +
'<link rel="manifest" href="/site.webmanifest"><meta name="theme-color" content="#c1121e">\n' +
'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=ABeeZee:ital@0;1&amp;family=Inter:wght@400;500;600;700;800;900&amp;display=swap" media="print" onload="this.media=\'all\'">\n' +
'<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=ABeeZee:ital@0;1&amp;family=Inter:wght@400;500;600;700;800;900&amp;display=swap"></noscript>\n' +
'<link rel="stylesheet" href="./assets/css/style.min.css?v=final_stable_v1">\n' +
'<link rel="preload" as="image" href="/assets/images/' + slug + '.jpg" fetchpriority="high">\n' +
'<script type="application/ld+json">{"@context":"https://schema.org","@graph":[' +
'{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://www.genalphamagazines.com/"},' +
'{"@type":"ListItem","position":2,"name":"' + cb + '","item":"https://www.genalphamagazines.com/category-' + category + '"},' +
'{"@type":"ListItem","position":3,"name":"' + titleEsc + '","item":"' + siteUrl + '"}]},' +
'{"@type":"Article","@id":"' + siteUrl + '#article","headline":"' + titleEsc + '","description":"' + descEsc + '",' +
'"image":"https://www.genalphamagazines.com/assets/images/' + slug + '.jpg",' +
'"datePublished":"' + pub + '","dateModified":"' + mod + '","mainEntityOfPage":"' + siteUrl + '",' +
'"author":{"@type":"Person","name":"' + a.name + '","url":"https://www.genalphamagazines.com/author/' + as + '","jobTitle":"' + a.role + '"},' +
'"publisher":{"@type":"Organization","name":"GenAlphaMagazines","url":"https://www.genalphamagazines.com/"}},' +
'{"@type":"FAQPage","mainEntity":[' + faqLd + ']}]}</script>\n' +
'</head>\n<body>\n' +
'<div class="top-bar"><div class="container top-bar-inner"><div class="top-date"><span>&#128197; ' + day + '</span><span>&bull;</span><span>Community Reporting &amp; Regional News</span></div>' +
'<nav class="top-nav" aria-label="Utility Navigation"><ul><li><a href="/pages/about">About</a></li><li><a href="/pages/editorial-policy">Editorial Standards</a></li><li><a href="/pages/privacy-policy">Privacy</a></li><li><a href="/pages/contact">Contact</a></li></ul></nav></div></div>\n' +
'<header class="main-header"><div class="container header-inner"><a href="/" class="brand-logo" aria-label="GenAlphaMagazines Homepage">' +
'<div class="creative-logo-badge"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%"><defs>' +
'<radialGradient id="hBR' + slug.slice(-3) + '" cx="50%" cy="38%" r="62%"><stop offset="0%" stop-color="#ef233c"/><stop offset="60%" stop-color="#c1121e"/><stop offset="100%" stop-color="#780000"/></radialGradient>' +
'<linearGradient id="hGG' + slug.slice(-3) + '" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/></linearGradient>' +
'</defs><circle cx="50" cy="50" r="48" fill="url(#hGG' + slug.slice(-3) + ')"/><circle cx="50" cy="50" r="45" fill="#111827"/>' +
'<circle cx="50" cy="50" r="43" fill="url(#hBR' + slug.slice(-3) + ')"/><circle cx="50" cy="42" r="28" fill="#ffffff" opacity="0.12"/>' +
'<g><polygon points="50,44 24,24 38,40 50,47" fill="#ffccd5"/><polygon points="50,44 76,20 62,38 50,47" fill="#e63946"/>' +
'<polygon points="50,48 44,60 50,65 56,60" fill="#590d22"/><polygon points="50,30 46,38 50,48 54,38" fill="#ffffff"/>' +
'<polygon points="50,24 53,28 50,32 47,28" fill="#fef08a"/></g></svg></div>' +
'<div class="brand-text-block"><div class="brand-main-title"><span>GEN</span><span class="alpha-word">ALPHA</span><span class="mag-word">MAGAZINES</span></div>' +
'<div class="brand-sub-tagline">Positively Local &bull; Supporting Community</div></div></a>' +
'<div class="header-actions"><a href="/pages/contact" class="news-tip-btn"><span>&#9993;&#65039;</span> News Tip?</a>' +
'<button id="theme-toggle" class="theme-btn" aria-label="Toggle Dark/Light Mode"><span class="theme-icon">&#127769;</span><span class="theme-text">Dark</span></button></div></div></header>\n' +
'<nav class="main-nav-wrapper"><div class="container"><nav class="main-nav" aria-label="Main Navigation">' +
'<ul class="main-nav-links"><li><a href="/">Home</a></li><li><a href="/category-news">News</a></li>' +
'<li><a href="/category-business">Business</a></li><li><a href="/category-celebrity">Celebrity</a></li>' +
'<li><a href="/category-entertainment">Entertainment</a></li><li><a href="/category-games">Games</a></li>' +
'<li><a href="/category-health">Health</a></li><li><a href="/category-technology">Technology</a></li>' +
'<li><a href="/category-others">Others</a></li><li><a href="/categories">All Topics</a></li></ul></nav></div></nav>\n' +
'<main class="container" style="margin-top:1.5rem;margin-bottom:4rem;">\n  <div class="main-layout">\n' +
'    <article class="article-container" style="padding:0;">\n      <header class="article-header">\n' +
'        <span class="article-category-badge">' + cb + ' &bull; ' + category.charAt(0).toUpperCase() + category.slice(1) + '</span>\n' +
'        <h1 class="article-title">' + data.title + '</h1>\n' +
'        <div class="article-meta-bar">\n          <div class="author-meta">\n' +
'            <div class="author-avatar">' + a.initials + '</div>\n' +
'            <div><div><a href="/author/' + as + '" style="font-weight:700;color:var(--text-main);">' + a.name + '</a></div>' +
'<div style="font-size:0.8rem;color:var(--text-muted);">' + a.role + '</div></div>\n          </div>\n' +
'          <span>Published: ' + pf + '</span>\n        </div>\n      </header>\n' +
'      <figure class="featured-media" style="margin:0;">\n        <div style="aspect-ratio:16/9;overflow:hidden;border-radius:var(--radius-md);">\n' +
'          <img src="' + img + '" alt="' + data.title + '" width="1200" height="675" fetchpriority="high" decoding="async" loading="eager" style="width:100%;height:100%;object-fit:cover;">\n        </div>\n' +
'        <figcaption style="font-size:0.85rem;color:var(--text-muted);padding:0.6rem 0.25rem 0.5rem;border-bottom:1px solid var(--border-color);">' + data.title + ': expert reporting and practical insights.</figcaption>\n      </figure>\n' +
'      <div class="article-body">' + secHtml + '\n        <section id="frequently-asked-questions" style="margin-top:2rem;">\n' +
'          <h2>Frequently Asked Questions</h2>\n          <div style="margin-top:1.25rem;">' + faqCards + '</div>\n        </section>\n      </div>\n' +
'      <div style="background:var(--bg-subtle);border-left:4px solid var(--primary);padding:1.25rem 1.5rem;margin:2.5rem 0;border-radius:var(--radius-sm);">\n' +
'        <h4 style="color:var(--primary);margin-top:0;text-transform:uppercase;">Related Coverage</h4>\n' +
'        <ul style="margin-left:1.5rem;line-height:1.8;font-size:0.95rem;">\n' +
'          <li><a href="/how-to-lose-weight-and-build-healthy-habits-that-last" style="color:var(--primary);font-weight:700;">How to Lose Weight and Build Healthy Habits | GenAlpha</a></li>\n' +
'          <li><a href="/mastering-smart-thermostat-savings-and-grid-automation" style="color:var(--primary);font-weight:700;">Mastering Smart Thermostat Savings | GenAlpha</a></li>\n' +
'          <li><a href="/natural-ways-to-lower-blood-pressure-insights-and-guidance" style="color:var(--primary);font-weight:700;">Natural Ways to Lower Blood Pressure | GenAlpha</a></li>\n        </ul>\n      </div>\n' +
'      <section class="author-box">\n        <div class="author-avatar">' + a.initials + '</div>\n' +
'        <div class="author-bio"><h4 style="margin:0 0 0.4rem 0;"><a href="/author/' + as + '">' + a.name + '</a></h4>' +
'<p style="margin:0;font-size:0.9rem;color:var(--text-muted);">' + a.role + ' at GenAlphaMagazines.</p></div>\n      </section>\n    </article>\n' +
'    <aside class="sidebar">\n' +
'      <div class="newsletter-box"><h4>Subscribe to GenAlphaMagazines</h4><p>Get the best of regional reporting delivered twice a week.</p>' +
'<form onsubmit="event.preventDefault();alert(\'Thank you!\');"><input type="email" placeholder="Enter your email" required aria-label="Email address">' +
'<button type="submit">Join 35,000+ Readers</button></form></div>\n' +
'      <div class="sidebar-widget"><h3 class="widget-title">Editorial Standards</h3>' +
'<p style="font-size:0.9rem;color:var(--text-muted);margin-bottom:0.8rem;">Every publication adheres to strict EEAT guidelines.</p>' +
'<a href="/pages/editorial-policy" style="font-weight:700;color:var(--primary);font-size:0.88rem;">Read Guidelines &rarr;</a></div>\n' +
'      <div class="ad-slot-wrap"><span class="ad-label">Advertisement</span><div class="ad-placeholder ad-sidebar"><span>Google AdSense Display Unit</span></div></div>\n    </aside>\n  </div>\n</main>\n' +
'<footer class="site-footer"><div class="container footer-grid">\n' +
'  <div class="footer-brand"><a href="/" class="footer-logo"><div class="brand-text-block">' +
'<div class="brand-main-title"><span>GEN</span><span class="alpha-word">ALPHA</span><span class="mag-word">MAGAZINES</span></div>' +
'<div class="brand-sub-tagline">Positively Local &bull; Supporting Community</div></div></a>' +
'<p style="font-size:0.9rem;color:#94a3b8;line-height:1.6;">Independent community newsmagazine covering regional affairs and community stories.</p></div>\n' +
'  <div class="footer-col"><h5>Categories</h5><ul class="footer-links"><li><a href="/category-news">News</a></li><li><a href="/category-business">Business</a></li>' +
'<li><a href="/category-celebrity">Celebrity</a></li><li><a href="/category-entertainment">Entertainment</a></li><li><a href="/category-games">Games</a></li>' +
'<li><a href="/category-health">Health</a></li><li><a href="/category-technology">Technology</a></li><li><a href="/category-others">Others</a></li></ul></div>\n' +
'  <div class="footer-col"><h5>Editorial</h5><ul class="footer-links"><li><a href="/pages/about">About Us</a></li><li><a href="/pages/editorial-policy">Editorial Standards</a></li>' +
'<li><a href="/pages/affiliate-disclosure">Affiliate Disclosure</a></li><li><a href="/pages/contact">Contact Us</a></li></ul></div>\n' +
'  <div class="footer-col"><h5>Compliance</h5><ul class="footer-links"><li><a href="/pages/privacy-policy">Privacy Policy</a></li><li><a href="/pages/terms">Terms &amp; Conditions</a></li>' +
'<li><a href="/pages/cookie-policy">Cookie Policy</a></li><li><a href="/pages/disclaimer">Disclaimer</a></li></ul></div>\n' +
'  <div class="footer-col"><h5>Feeds &amp; Sitemaps</h5><ul class="footer-links"><li><a href="/sitemap.xml" target="_blank">XML Sitemap</a></li>' +
'<li><a href="/news-sitemap.xml" target="_blank">Google News Sitemap</a></li><li><a href="/rss.xml" target="_blank">RSS 2.0 Feed</a></li>' +
'<li><a href="/feed.xml" target="_blank">Atom Feed</a></li></ul></div>\n' +
'</div><div class="container footer-bottom"><p>&copy; 2026 GenAlphaMagazines. All rights reserved.</p></div></footer>\n' +
'<script src="../assets/js/main.min.js" defer></script>\n</body>\n</html>';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const files = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.html')).sort();
  console.log('\n[REWRITE v2] ' + files.length + ' articles | batch: ' + BATCH_SIZE + ' | pause: ' + BATCH_PAUSE / 1000 + 's\n');

  const results = { ok: [], skip: [], fail: [] };

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, Math.min(i + BATCH_SIZE, files.length));
    const bn = Math.floor(i / BATCH_SIZE) + 1;
    const bt = Math.ceil(files.length / BATCH_SIZE);
    console.log('\n[BATCH ' + bn + '/' + bt + '] ' + batch.map(f => f.replace('.html', '')).join(', '));

    for (const fn of batch) {
      const fp   = path.join(ARTICLES_DIR, fn);
      const html = fs.readFileSync(fp, 'utf8');
      const meta = extractMeta(html, fn);

      if (meta.alreadyDone) {
        console.log('  [SKIP] ' + meta.slug + ' - already has Quick Answer box');
        results.skip.push(meta.slug);
        continue;
      }

      console.log('  [->] ' + meta.slug + ' (' + meta.category + ')');
      try {
        const author = AUTHORS[meta.category] || AUTHORS.others;
        const { systemInstruction, userPrompt } = buildPrompts(meta.topic, meta.category, author);
        const gen = await callGemini(userPrompt, systemInstruction);

        if (!gen || !gen.title || !Array.isArray(gen.sections) || gen.sections.length < 4) {
          throw new Error('Incomplete response: ' + JSON.stringify(Object.keys(gen || {})));
        }

        const newHtml = buildHTML(gen, meta.slug, meta.imgSrc, meta.publishedDate, meta.category);
        fs.writeFileSync(fp, newHtml, 'utf8');
        console.log('  [OK] ' + meta.slug + ' (' + fs.statSync(fp).size + ' bytes)');
        results.ok.push(meta.slug);
        await sleep(ART_PAUSE);
      } catch (e) {
        console.error('  [FAIL] ' + meta.slug + ' - ' + e.message.slice(0, 120));
        results.fail.push({ slug: meta.slug, err: e.message.slice(0, 120) });
      }
    }

    if (i + BATCH_SIZE < files.length) {
      console.log('\n  Pausing ' + BATCH_PAUSE / 1000 + 's between batches...');
      await sleep(BATCH_PAUSE);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('[DONE] OK:' + results.ok.length + ' | SKIP:' + results.skip.length + ' | FAIL:' + results.fail.length);
  if (results.fail.length > 0) {
    console.log('Failed articles:');
    results.fail.forEach(f => console.log('  - ' + f.slug + ': ' + f.err));
  }
  console.log('='.repeat(60));

  if (results.ok.length > 0) {
    const { execSync } = require('child_process');
    try {
      console.log('\n[SYNC] Running sync_articles...');
      execSync('node scripts/sync_articles.js', { cwd: ROOT, stdio: 'inherit' });
      console.log('[GIT] Committing...');
      execSync('git add -A', { cwd: ROOT, stdio: 'inherit' });
      execSync('git commit -m "MASTER SEO rewrite v2: ' + results.ok.length + ' articles upgraded"', { cwd: ROOT, stdio: 'inherit' });
      execSync('git pull --rebase origin main --autostash && git push origin main', { cwd: ROOT, stdio: 'inherit' });
      console.log('[GIT] Pushed successfully.');
    } catch (e) {
      console.error('[SYNC/GIT] Error:', e.message.slice(0, 200));
    }
  }
}

main().catch(console.error);
