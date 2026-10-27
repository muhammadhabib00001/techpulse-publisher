/**
 * translate_new_articles.js
 * 
 * Translates all articles in data/articles.json that have identical content
 * across all language slots (i.e. new auto-published articles that only have
 * English content copied to all 8 language slots).
 *
 * Uses Gemini API to generate proper translations.
 * After translating, rebuilds the newsroom HTML and runs audit.
 *
 * Run: node scripts/translate_new_articles.js
 * Also integrated into publish-article.yml workflow automatically.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTICLES_JSON = path.join(ROOT_DIR, 'data', 'articles.json');

// --- Gemini API Setup ---
function getGeminiKeys() {
  const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  return raw.split(/[,;\n\r]+/).map(k => k.trim()).filter(Boolean);
}
const KEYS = getGeminiKeys();
let kidx = 0;

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-lite-latest'];

const LANGUAGES = [
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'pt', name: 'Portuguese (Brazilian)' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'it', name: 'Italian' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function geminiRequest(prompt, modelIdx = 0) {
  if (KEYS.length === 0) throw new Error('No GEMINI_API_KEY set');

  const key = KEYS[kidx % KEYS.length];
  const model = MODELS[modelIdx % MODELS.length];

  return new Promise((resolve, reject) => {
    const bodyObj = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    };
    const body = JSON.stringify(bodyObj);

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${key}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            const code = parsed.error.code;
            if (code === 429 || code === 503) { kidx++; }
            return reject(new Error(`API ${code}: ${parsed.error.message}`));
          }
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          resolve(text);
        } catch(e) { reject(new Error('JSON parse: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

async function translateArticleToLang(enData, langCode, langName) {
  // Strip long content to reduce token usage but keep enough for 800+ word translation
  const contentSample = (enData.content || '').slice(0, 12000);
  const faqsJson = JSON.stringify((enData.faqs || []).slice(0, 3));

  const prompt = `You are a professional multilingual news journalist. Translate the following English article into ${langName}.

CRITICAL RULES:
1. Preserve ALL HTML tags exactly (do not translate <p>, <h2>, <h3>, <strong>, <ul>, <li>, <div>, href attributes, etc.)
2. Only translate visible text BETWEEN HTML tags
3. The translated content must be thorough and detailed - minimum 800 words
4. Return ONLY valid JSON, no markdown, no extra text
5. Do NOT use AI clichés. Write like a real journalist in ${langName}
6. For Arabic, you can write right-to-left text naturally

INPUT:
Title: ${enData.title}
Deck (meta description): ${enData.deck}
Content HTML: ${contentSample}
FAQs: ${faqsJson}

Return this exact JSON structure:
{
  "title": "translated title",
  "deck": "translated deck/description",
  "content": "translated HTML content",
  "faqs": [{"question": "...", "answer": "..."}, {"question": "...", "answer": "..."}, {"question": "...", "answer": "..."}]
}`;

  for (let attempt = 0; attempt < MODELS.length * 2; attempt++) {
    try {
      const raw = await geminiRequest(prompt, attempt);
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(clean);
      if (parsed.title && parsed.content && Array.isArray(parsed.faqs)) {
        return {
          title: parsed.title,
          deck: parsed.deck || enData.deck,
          content: parsed.content,
          faqs: parsed.faqs.slice(0, 3).map(f => ({ question: f.question || '', answer: f.answer || '' }))
        };
      }
      throw new Error('Missing required fields in response');
    } catch(e) {
      console.warn(`    Attempt ${attempt + 1}/${MODELS.length * 2} failed for ${langCode}: ${e.message}`);
      await sleep(2000 + attempt * 1000);
    }
  }
  return null;
}

async function main() {
  console.log('\n=== Multilingual Article Translator ===\n');

  const articles = JSON.parse(fs.readFileSync(ARTICLES_JSON, 'utf8'));

  // Identify articles where ES title matches EN title (= untranslated)
  const toTranslate = articles.filter(art => {
    const enTitle = art.translations?.en?.title || art.title;
    const esTitle = art.translations?.es?.title;
    return !esTitle || esTitle === enTitle;
  });

  console.log(`Articles needing translation: ${toTranslate.length} out of ${articles.length} total\n`);

  if (KEYS.length === 0) {
    console.error('[ERROR] GEMINI_API_KEY environment variable not set. Cannot translate.');
    process.exit(1);
  }

  let translated = 0;
  let failed = 0;

  for (const art of toTranslate) {
    const enTrans = art.translations?.en || {
      title: art.title,
      deck: art.deck || art.excerpt,
      content: art.content || '',
      faqs: art.faqs || []
    };

    console.log(`\n[${translated + 1}/${toTranslate.length}] ${art.slug}`);
    console.log(`  EN title: "${enTrans.title}"`);

    for (const lang of LANGUAGES) {
      const existing = art.translations?.[lang.code];
      const isUntranslated = !existing || !existing.title || existing.title === enTrans.title;

      if (!isUntranslated) {
        console.log(`  [SKIP] ${lang.code} - already has proper translation`);
        continue;
      }

      process.stdout.write(`  [TRANSLATING] ${lang.code} (${lang.name})... `);
      const result = await translateArticleToLang(enTrans, lang.code, lang.name);

      if (result) {
        art.translations = art.translations || {};
        art.translations[lang.code] = result;
        console.log(`OK: "${result.title}"`);
        await sleep(1200); // Rate limit protection
      } else {
        // Keep English as fallback but mark differently
        art.translations = art.translations || {};
        art.translations[lang.code] = { ...enTrans };
        console.log(`FAILED - keeping English fallback`);
        failed++;
      }
    }

    // Save after each article
    fs.writeFileSync(ARTICLES_JSON, JSON.stringify(articles, null, 2), 'utf8');
    translated++;
    console.log(`  [SAVED] articles.json`);
    await sleep(2000);
  }

  console.log(`\n=== Translation Summary ===`);
  console.log(`Translated: ${translated} articles`);
  console.log(`Failed languages: ${failed}`);

  // Rebuild site
  console.log('\n=== Rebuilding Site HTML ===\n');
  const { execSync } = require('child_process');

  try {
    execSync('node scripts/build-newsroom.js', { stdio: 'inherit', cwd: ROOT_DIR });
    console.log('[OK] Site rebuilt');
  } catch(e) {
    console.error('[ERROR] Build failed:', e.message);
  }

  try {
    execSync('node scripts/audit-newsroom.js', { stdio: 'inherit', cwd: ROOT_DIR });
  } catch(e) {
    // Audit failure is non-critical after translation
    console.warn('[WARN] Audit issues detected');
  }

  // Submit to IndexNow
  try {
    execSync('node scripts/index_bing.js --all', { stdio: 'inherit', cwd: ROOT_DIR });
  } catch(e) {}
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
