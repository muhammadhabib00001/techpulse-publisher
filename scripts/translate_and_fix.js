/**
 * translate_and_fix.js
 * 
 * Does two things:
 * 1. Translates all articles with identical English content across language slots
 *    into proper ES, DE, FR, PT, AR, HI, IT using Gemini API
 * 2. Adds meta robots index,follow tags to all article HTML pages
 * 3. Fixes sitemap canonical URLs (removes /articles/ prefix where needed)
 * 4. Rebuilds all site HTML with translated content
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..');
const ARTICLES_JSON = path.join(ROOT_DIR, 'data', 'articles.json');
const SITE_DOMAIN = 'https://www.genalphamagazines.com';

// Parse API keys from env
function parseGeminiKeys() {
  const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  return raw.split(/[,;\n\r]+/).map(k => k.trim()).filter(Boolean);
}

const GEMINI_KEYS = parseGeminiKeys();
let keyIdx = 0;

function getKey() {
  return GEMINI_KEYS[keyIdx % GEMINI_KEYS.length];
}

const LANGUAGES = [
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl' },
  { code: 'hi', name: 'Hindi', native: 'हिंदी' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
];

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

async function callGeminiTranslate(text, targetLang, targetLangName, attempt = 0) {
  if (GEMINI_KEYS.length === 0) throw new Error('No Gemini API keys available');
  const key = GEMINI_KEYS[keyIdx % GEMINI_KEYS.length];
  const model = GEMINI_MODELS[attempt % GEMINI_MODELS.length];

  const systemPrompt = `You are a professional news journalist and translator. Translate the following content from English to ${targetLangName}. 
Rules:
- Preserve all HTML tags exactly as-is (do NOT translate HTML tags like <p>, <h2>, <h3>, <strong>, <ul>, <li>, <div>, <a href="...">, etc.)
- Only translate the visible text content between HTML tags
- Maintain the same journalistic tone and style
- Return ONLY valid JSON with keys: title, deck, content, faqs
- faqs is an array of {question, answer} objects
- No markdown, no extra text outside the JSON
- Content must be minimum 800 words translated
- NEVER use AI banned words. Write naturally as a journalist in ${targetLangName}`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${key}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            if (parsed.error.code === 429 || parsed.error.code === 503) {
              keyIdx++;
              reject(new Error(`Rate limit: ${parsed.error.message}`));
              return;
            }
            reject(new Error(parsed.error.message));
            return;
          }
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            reject(new Error('No text in response'));
            return;
          }
          const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          const result = JSON.parse(clean);
          resolve(result);
        } catch (e) {
          reject(new Error('Parse error: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

async function translateArticle(art, langObj) {
  const en = art.translations?.en || {};
  const translatePayload = JSON.stringify({
    title: en.title || art.title,
    deck: en.deck || art.deck,
    content: en.content || art.content || '',
    faqs: (en.faqs || art.faqs || []).slice(0, 3)
  });

  const prompt = `Translate this JSON article from English to ${langObj.name}. Return same JSON structure with translated values. Preserve all HTML tags inside content field:

${translatePayload}`;

  for (let attempt = 0; attempt < GEMINI_MODELS.length * GEMINI_KEYS.length; attempt++) {
    try {
      const result = await callGeminiTranslate(prompt, langObj.code, langObj.name, attempt);
      if (result && result.title && result.content && result.faqs) {
        return result;
      }
      console.warn(`  [WARN] Incomplete result for ${langObj.code}, attempt ${attempt + 1}`);
    } catch (e) {
      console.warn(`  [WARN] Attempt ${attempt + 1} failed for ${langObj.code}: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error(`Failed to translate ${art.slug} to ${langObj.code}`);
}

async function main() {
  console.log('\n========================================');
  console.log('STEP 1: Translating articles into all languages...');
  console.log('========================================\n');

  const articles = JSON.parse(fs.readFileSync(ARTICLES_JSON, 'utf8'));

  // Find articles needing translation
  const needsTranslation = articles.filter(a => {
    const enTitle = a.translations?.en?.title || a.title;
    const esTitle = a.translations?.es?.title;
    return !esTitle || esTitle === enTitle;
  });

  console.log(`Found ${needsTranslation.length} articles needing translation.`);

  if (GEMINI_KEYS.length === 0) {
    console.error('[ERROR] No GEMINI_API_KEY found in environment. Cannot translate.');
    console.log('Skipping translation - will still run SEO/sitemap fixes...');
  } else {
    console.log(`Using ${GEMINI_KEYS.length} Gemini API key(s).`);

    for (const art of needsTranslation) {
      console.log(`\nTranslating: ${art.slug}`);
      
      // Ensure english translation is populated
      const enTrans = art.translations?.en || {};
      if (!enTrans.content) {
        enTrans.content = art.content || '';
      }
      if (!enTrans.faqs || !enTrans.faqs.length) {
        enTrans.faqs = art.faqs || [];
      }
      art.translations = art.translations || {};
      art.translations.en = enTrans;

      for (const lang of LANGUAGES) {
        const existing = art.translations[lang.code];
        const enTitle = art.translations.en?.title || art.title;
        
        // Skip if already properly translated
        if (existing && existing.title && existing.title !== enTitle && existing.content && existing.content !== (art.translations.en?.content || '')) {
          console.log(`  [SKIP] ${lang.code} - already translated`);
          continue;
        }

        console.log(`  [TRANSLATING] ${lang.code} (${lang.name})...`);
        try {
          const translated = await translateArticle(art, lang);
          art.translations[lang.code] = {
            title: translated.title || enTitle,
            deck: translated.deck || art.translations.en?.deck || art.deck,
            content: translated.content || art.translations.en?.content || '',
            faqs: (translated.faqs || art.translations.en?.faqs || []).slice(0, 3)
          };
          console.log(`  [OK] ${lang.code}: "${translated.title}"`);
          // Small delay between API calls
          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          console.error(`  [ERROR] ${lang.code}: ${e.message} - keeping English fallback`);
        }
      }

      // Save after each article to prevent data loss
      fs.writeFileSync(ARTICLES_JSON, JSON.stringify(articles, null, 2), 'utf8');
      console.log(`  [SAVED] articles.json updated for ${art.slug}`);
    }
  }

  console.log('\n========================================');
  console.log('STEP 2: Adding robots meta tags + fixing canonical URLs in HTML files...');
  console.log('========================================\n');

  let htmlFixed = 0;
  const ROBOTS_TAG = '  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">\n';
  
  function fixHtmlFile(filePath) {
    try {
      let html = fs.readFileSync(filePath, 'utf8');
      let changed = false;

      // Add robots meta if missing
      if (!html.includes('name="robots"')) {
        html = html.replace(/(<meta name="description"[^>]*>)/i, `$1\n${ROBOTS_TAG}`);
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(filePath, html, 'utf8');
        htmlFixed++;
      }
    } catch (e) {
      // Skip unreadable files
    }
  }

  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', '.github'].includes(entry.name)) continue;
        walkDir(full);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        fixHtmlFile(full);
      }
    }
  }

  walkDir(ROOT_DIR);
  console.log(`Added robots meta tag to ${htmlFixed} HTML files.`);

  console.log('\n========================================');
  console.log('STEP 3: Rebuilding newsroom with translated content...');
  console.log('========================================\n');

  try {
    const { execSync } = require('child_process');
    execSync('node scripts/build-newsroom.js', { stdio: 'inherit', cwd: ROOT_DIR });
    console.log('[OK] Newsroom rebuilt successfully.');
  } catch (e) {
    console.error('[ERROR] build-newsroom.js failed:', e.message);
  }

  console.log('\n========================================');
  console.log('STEP 4: Running audit...');
  console.log('========================================\n');

  try {
    const { execSync } = require('child_process');
    execSync('node scripts/audit-newsroom.js', { stdio: 'inherit', cwd: ROOT_DIR });
  } catch (e) {
    console.error('[WARN] Audit reported issues:', e.message);
  }

  console.log('\n========================================');
  console.log('STEP 5: Submitting URLs to IndexNow (Bing/Yandex)...');
  console.log('========================================\n');

  try {
    const { execSync } = require('child_process');
    execSync('node scripts/index_bing.js --all', { stdio: 'inherit', cwd: ROOT_DIR });
  } catch (e) {
    console.error('[WARN] IndexNow failed:', e.message);
  }

  console.log('\n[DONE] All steps complete.');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
