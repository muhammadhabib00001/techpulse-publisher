/**
 * GenAlphaMagazines - Automated Content Publishing Engine
 * Fully upgraded for GenAlphaMagazines:
 * - Categories: news, community, business, arts, lifestyle, voices
 * - Command-line options: --topic "<Topic>" --category "<Category>"
 * - TOPIC-RELEVANT IMAGE ENGINE: Automatically generates/downloads high-res topic-specific photo directly to assets/images/<slug>.jpg
 * - 5 In-Depth Community FAQs with JSON-LD FAQPage Schema Markup
 * - 1,200 to 1,500+ Word Exhaustive Reporting
 * - Auto-Updates index.html, category-*.html, and sitemap.xml
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT_DIR = path.resolve(__dirname, '..');

// Parse Command Line Arguments (--topic "..." --category "...")
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      parsed[key] = val;
    }
  }
  return parsed;
}

const CLI_ARGS = parseArgs();

// Environment & Config
const GEMINI_API_KEY     = process.env.GEMINI_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || 'rug2wxB71o1mh5kYy_K6kJVLxXZ6CA2apSHUrGqZYLk';
const CUSTOM_TOPIC       = CLI_ARGS.topic || process.env.CUSTOM_TOPIC || '';
const TARGET_CATEGORY    = (CLI_ARGS.category || process.env.TARGET_CATEGORY || 'news').toLowerCase();


const AUTHORS = {
  news: { name: 'Marcus Reid', slug: 'marcus-reid', role: 'Editor-in-Chief & Civic Affairs Correspondent', initials: 'MR' },
  business: { name: 'Marcus Reid', slug: 'marcus-reid', role: 'Editor-in-Chief & Civic Affairs Correspondent', initials: 'MR' },
  lifestyle: { name: 'Marcus Reid', slug: 'marcus-reid', role: 'Editor-in-Chief & Civic Affairs Correspondent', initials: 'MR' },
  community: { name: 'Julia Vance', slug: 'julia-vance', role: 'Managing Editor & Arts Lead', initials: 'JV' },
  arts: { name: 'Julia Vance', slug: 'julia-vance', role: 'Managing Editor & Arts Lead', initials: 'JV' },
  voices: { name: 'Julia Vance', slug: 'julia-vance', role: 'Managing Editor & Arts Lead', initials: 'JV' }
};

const DEFAULT_TOPIC_POOL = {
  news: 'Municipal Election Analysis: Candidate Platforms and Community Priorities for 2026',
  community: 'Annual Waterfront Heritage Festival Returns with Record Artisan Attendance',
  business: 'Main Street Commercial Revitalization: Small Businesses Thriving in 2026',
  arts: 'Spotlight on Independent Theater: Local Playwrights Take Center Stage',
  lifestyle: 'Energy-Efficient Home Modernization: Heat Pumps, Solar Arrays & Insulation',
  voices: 'The Power of Neighborly Connection in a Digital World: A Columnist Perspective'
};

/**
 * Downloads an image from a URL and saves it locally to assets/images/
 */
function downloadImageLocally(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const get = url.startsWith('https') ? https.get : http.get;

    get(url, (response) => {
      // Follow redirects (HTTP 301, 302, 307)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImageLocally(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download image: Status code ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destPath));
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * IMAGE ENGINE — 3-Layer Pipeline (best quality → reliable fallback)
 *
 * Layer 1: Gemini Imagen AI — generates a 100% unique, topic-specific AI image
 *          Requires: GEMINI_API_KEY  (same key used for article generation)
 *
 * Layer 2: Unsplash API — keyword-searched real photo, unique per topic
 *          Requires: UNSPLASH_ACCESS_KEY  (free at unsplash.com/developers)
 *
 * Layer 3: Curated direct Unsplash photo IDs — reliable offline fallback
 *          No API key required.
 */
async function fetchOrGenerateTopicImage(topic, category, slug) {
  const localImgFilename = `${slug}.jpg`;
  const localImgPath = path.join(ROOT_DIR, 'assets', 'images', localImgFilename);

  // Reuse existing valid image
  if (fs.existsSync(localImgPath) && fs.statSync(localImgPath).size > 10000) {
    console.log(`[INFO] Using existing image for: ${slug}`);
    return buildImageResult(localImgFilename, localImgPath, topic);
  }

  // Build keyword query from topic (first 5 meaningful words)
  const keywords = topic
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 5)
    .join(' ');

  // Unique numeric hash per slug
  const sig = Math.abs(slug.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0) & 0x7fffffff);

  // ─────────────────────────────────────────────────────────────
  // LAYER 1: Gemini Imagen — AI-generated topic-specific image
  // ─────────────────────────────────────────────────────────────
  if (GEMINI_API_KEY) {
    try {
      console.log(`[INFO] Layer 1: Generating AI image via Gemini Imagen for "${keywords}"...`);
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      const imgPrompt = `High-quality editorial photograph for a magazine article about: ${keywords}. 
        Professional photography style, well-lit, sharp focus, 16:9 landscape format. 
        No text, no watermarks, no people's faces. Photorealistic.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: imgPrompt,
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const imgBuffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(localImgPath, imgBuffer);
          if (fs.statSync(localImgPath).size > 10000) {
            console.log(`[SUCCESS] Layer 1: Gemini AI image saved: assets/images/${localImgFilename}`);
            return buildImageResult(localImgFilename, localImgPath, topic);
          }
        }
      }
      throw new Error('No inline image data in Gemini response');
    } catch (err) {
      console.warn(`[WARN] Layer 1 (Gemini Imagen) failed: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // LAYER 2: Unsplash API — real photo searched by topic keyword
  // ─────────────────────────────────────────────────────────────
  if (UNSPLASH_ACCESS_KEY) {
    try {
      console.log(`[INFO] Layer 2: Fetching Unsplash API photo for "${keywords}"...`);
      const unsplashApiUrl = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(keywords)}&orientation=landscape&client_id=${UNSPLASH_ACCESS_KEY}`;

      const photoData = await new Promise((resolve, reject) => {
        const get = https.get;
        get(unsplashApiUrl, { headers: { 'Accept-Version': 'v1', 'User-Agent': 'TechPulsePublisher/1.0', 'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}` } }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode !== 200) return reject(new Error(`Unsplash API status ${res.statusCode}: ${body.slice(0, 100)}`));
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
          });
        }).on('error', reject);
      });

      const photoUrl = photoData.urls && (photoData.urls.regular || photoData.urls.full);
      if (!photoUrl) throw new Error('No photo URL in Unsplash response');

      await downloadImageLocally(photoUrl, localImgPath);
      if (fs.existsSync(localImgPath) && fs.statSync(localImgPath).size > 10000) {
        console.log(`[SUCCESS] Layer 2: Unsplash API photo saved: assets/images/${localImgFilename}`);
        return buildImageResult(localImgFilename, localImgPath, topic);
      }
      throw new Error('Downloaded file too small');
    } catch (err) {
      console.warn(`[WARN] Layer 2 (Unsplash API) failed: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // LAYER 3: Curated direct Unsplash photo IDs — reliable fallback
  // ─────────────────────────────────────────────────────────────
  console.log(`[INFO] Layer 3: Using curated fallback photo...`);
  const FALLBACK_POOLS = {
    business: ['1486406146926-c627a92ad1ab', '1454165804606-c3d57bc86b40', '1556742049-0a67e557224f', '1507679799987-c73779587ccf', '1560472354-b33ff0ad5111'],
    news:     ['1540910419892-4a36d2c3266c', '1570125909232-eb263c188f7e', '1504711434969-e33886168f5c', '1585829365295-ab7cd400c167', '1434030216411-0b793f4b6db9'],
    community:['1511578314322-379afb476865', '1559027615-cd4628902d4a', '1529156069898-49953e39b3ac', '1475483768296-75f5e5f55b8a', '1522202176988-66273c2fd55f'],
    arts:     ['1507676184212-d03ab07a01bf', '1460661419201-fd4cecdf8a8b', '1578321272125-162a75be7e28', '1513364776144-60967b0f800f', '1520166012930-4b4ce4a6a59e'],
    lifestyle:['1513694203232-719a280e022f', '1500382017468-9049fed747ef', '1505691938895-1758d7feb511', '1496181133206-80ce9b88a853', '1484480974693-6ca0a78fb36b'],
    voices:   ['1529156069898-49953e39b3ac', '1455390582262-044cdead277a', '1504711434969-e33886168f5c', '1434030216411-0b793f4b6db9', '1507003211169-0a1dd7228f2d']
  };

  const pool = FALLBACK_POOLS[category] || FALLBACK_POOLS.business;
  const picId = pool[sig % pool.length];
  const fallbackUrl = `https://images.unsplash.com/photo-${picId}?auto=format&fit=crop&w=1200&h=600&q=80`;

  try {
    await downloadImageLocally(fallbackUrl, localImgPath);
    console.log(`[SUCCESS] Layer 3: Fallback image saved: assets/images/${localImgFilename}`);
  } catch (e3) {
    console.warn(`[WARN] Layer 3 also failed: ${e3.message} — using CDN URL directly`);
    return {
      relativeUrl: fallbackUrl, indexUrl: fallbackUrl,
      alt: `${topic}`, caption: `${topic}: practical guide.`
    };
  }

  return buildImageResult(localImgFilename, localImgPath, topic);
}

// Helper: build standard image result object
function buildImageResult(filename, localPath, topic) {
  const valid = fs.existsSync(localPath) && fs.statSync(localPath).size > 5000;
  return {
    relativeUrl: valid ? `../assets/images/${filename}` : '',
    indexUrl:    valid ? `./assets/images/${filename}`  : '',
    alt:     `${topic} — editorial photo`,
    caption: `${topic}: expert guide and practical insights.`
  };
}



const INTERNAL_LINK_MAP = [
  { keyword: 'municipal governance', url: '../articles/municipal-election-analysis-candidate-platforms.html' },
  { keyword: 'civic engagement', url: '../category-news.html' },
  { keyword: 'small business vitality', url: '../articles/main-street-commercial-revitalization.html' },
  { keyword: 'commercial revitalization', url: '../articles/main-street-commercial-revitalization.html' },
  { keyword: 'clean energy transition', url: '../articles/energy-efficient-home-modernization.html' },
  { keyword: 'infrastructure modernization', url: '../articles/energy-efficient-home-modernization.html' },
  { keyword: 'community cultural festival', url: '../articles/annual-waterfront-heritage-festival.html' },
  { keyword: 'neighborhood connections', url: '../articles/the-power-of-neighborly-connection-in-a-digital-world-a-columnist-perspective.html' },
  { keyword: 'arts and theater', url: '../articles/spotlight-on-independent-theater.html' },
  { keyword: 'Marcus Reid', url: '../author/marcus-reid.html' },
  { keyword: 'Julia Vance', url: '../author/julia-vance.html' },
  { keyword: 'News & Announcements', url: '../category-news.html' },
  { keyword: 'Community & Events', url: '../category-community.html' },
  { keyword: 'Business & Economy', url: '../category-business.html' },
  { keyword: 'Arts & Entertainment', url: '../category-arts.html' },
  { keyword: 'Lifestyle & Culture', url: '../category-lifestyle.html' },
  { keyword: 'Voices & Columnists', url: '../category-voices.html' },
  { keyword: 'Editorial Standards', url: '../pages/editorial-policy.html' }
];

function injectInternalLinks(htmlContent, currentSlug) {
  let processed = htmlContent;
  const linkedKeywords = new Set();

  INTERNAL_LINK_MAP.forEach(({ keyword, url }) => {
    if (url.includes(currentSlug)) return;
    if (linkedKeywords.has(keyword.toLowerCase())) return;

    const escaped = keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp('(\\b' + escaped + '\\b)(?![^<]*>|[^<>]*<\\/a>)', 'i');
    
    if (regex.test(processed)) {
      processed = processed.replace(regex, (match) => {
        linkedKeywords.add(keyword.toLowerCase());
        return `<a href="${url}" style="color: var(--primary); font-weight: 700; text-decoration: underline;" title="${keyword}">${match}</a>`;
      });
    }
  });

  return processed;
}

function callGoogleAIStudio(apiKey, prompt, systemInstruction) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.candidates[0].content.parts[0].text;
          resolve(JSON.parse(text));
        } catch (err) {
          reject(new Error('Failed to parse Gemini response: ' + err.message));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function generateDeepFallbackArticle(topic, category, author) {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const cleanTopic = topic.charAt(0).toUpperCase() + topic.slice(1);

  const title = `${cleanTopic}: A Complete Practical Guide for 2026`;
  const metaDescription = `Everything you need to know about ${topic} in 2026 — from the basics to expert tips, common questions answered, and practical advice you can use right away.`;

  return {
    title,
    slug,
    metaDescription,
    tableOfContents: [
      { id: 'what-is-overview', title: `About ${cleanTopic}` },
      { id: 'how-it-works', title: `How ${cleanTopic} Works` },
      { id: 'getting-started', title: 'Getting Started: Step-by-Step' },
      { id: 'tips-and-advice', title: 'Practical Tips and What to Expect' },
      { id: 'common-mistakes', title: 'Common Mistakes and How to Avoid Them' },
      { id: 'frequently-asked-questions', title: 'Frequently Asked Questions' }
    ],
    sections: [
      {
        id: 'what-is-overview',
        heading: `About ${cleanTopic}`,
        contentHtml: `<p>If you've been looking into <strong>${topic}</strong>, chances are you already have some questions — and possibly a few misconceptions picked up along the way. This guide is here to cut through the noise and give you a clear, practical picture of what ${topic} actually involves, what to expect, and how to make the most of it.</p>

        <p>${cleanTopic} is a topic that matters to a wide range of people, from beginners just getting started to experienced individuals looking to sharpen their approach. Whatever your reason for being here, the goal of this article is straightforward: give you the information you need to feel confident and prepared.</p>

        <h3>Why ${cleanTopic} Matters in 2026</h3>
        <p>In recent years, interest in ${topic} has grown considerably — and for good reason. Whether driven by practical necessity, personal interest, or broader industry trends, more people are seeking reliable, up-to-date guidance on this subject than ever before. This guide focuses on what's actually useful and accurate, not generic advice that could apply to anything.</p>`
      },
      {
        id: 'how-it-works',
        heading: `How ${cleanTopic} Works`,
        contentHtml: `<p>Understanding the mechanics behind ${topic} is the foundation for everything else. Before diving into specific steps or tips, it helps to have a clear mental model of how the whole thing fits together.</p>

        <h3>The Core Mechanism</h3>
        <p>At its core, ${topic} operates on a few fundamental principles that remain consistent regardless of your specific situation or goals. Getting familiar with these fundamentals early will save you time and prevent common missteps later on.</p>

        <ul style="margin: 1rem 0 1.5rem 1.5rem; line-height: 1.9;">
          <li><strong>Understanding the basics first:</strong> Before jumping to advanced strategies, make sure you have a solid grasp of the foundational concepts. Most problems people encounter with ${topic} trace back to skipping this step.</li>
          <li><strong>Knowing your specific situation:</strong> ${cleanTopic} is not a one-size-fits-all subject. What works well for one person may need adjustment for another depending on their specific circumstances, goals, and constraints.</li>
          <li><strong>Being realistic about timelines:</strong> Results and progress with ${topic} rarely happen overnight. Setting realistic expectations from the start leads to a much better experience.</li>
        </ul>

        <h3>Key Factors That Affect the Experience</h3>
        <p>Several factors can significantly influence how your experience with ${topic} plays out. Being aware of these ahead of time lets you plan more effectively and avoid surprises.</p>`
      },
      {
        id: 'getting-started',
        heading: 'Getting Started: Step-by-Step',
        contentHtml: `<p>Ready to move from reading to doing? Here's a straightforward approach to getting started with ${topic} that minimizes guesswork and sets you up for a smoother experience.</p>

        <h3>Step 1: Do Your Preparation</h3>
        <p>Before anything else, take stock of what you actually need and what you already have available. This includes understanding any requirements, gathering necessary information or materials, and identifying any potential complications before they become problems.</p>

        <h3>Step 2: Start with the Right Resources</h3>
        <p>The quality of the resources and information you rely on makes a significant difference with ${topic}. Look for sources that are current, specific to your situation, and come from people or organizations with genuine expertise in this area.</p>

        <h3>Step 3: Take It One Stage at a Time</h3>
        <p>Break the process down into manageable stages rather than trying to tackle everything at once. Progress with ${topic} tends to compound — getting each stage right makes the next one easier. A measured, sequential approach consistently outperforms rushing.</p>

        <ol style="margin: 1rem 0 1.5rem 1.5rem; line-height: 1.9;">
          <li>Identify your specific goal with ${topic} and write it down clearly</li>
          <li>Research the specific requirements or steps relevant to your situation</li>
          <li>Assemble any tools, information, or support you'll need in advance</li>
          <li>Work through each stage methodically, checking your progress as you go</li>
          <li>Adjust your approach based on what you learn along the way</li>
        </ol>`
      },
      {
        id: 'tips-and-advice',
        heading: 'Practical Tips and What to Expect',
        contentHtml: `<p>Beyond the basic steps, a few practical habits and mindset shifts can make a real difference in how smoothly your experience with ${topic} goes. These tips come from patterns that tend to separate people who get good results from those who struggle.</p>

        <h3>Tip 1: Build In More Time Than You Think You Need</h3>
        <p>${cleanTopic} almost always takes longer than anticipated — especially the first time. Whether it's gathering information, waiting for processes to complete, or troubleshooting unexpected issues, build buffer time into your plan. This is especially important if ${topic} is connected to a deadline or time-sensitive goal.</p>

        <h3>Tip 2: Don't Skip the Verification Steps</h3>
        <p>Whatever your process involves, the steps that feel tedious — double-checking details, confirming information, re-reading instructions — are often the ones that prevent costly mistakes. Resist the urge to skip these in the interest of speed.</p>

        <h3>Tip 3: Ask Questions Before You're Stuck</h3>
        <p>If something about ${topic} isn't clear, get clarity before you proceed rather than guessing and hoping for the best. Whether that means consulting a reliable source, reading official documentation, or reaching out to someone with direct experience, a few minutes of clarification upfront is almost always worth it.</p>

        <ul style="margin: 1rem 0 1.5rem 1.5rem; line-height: 1.9;">
          <li>Keep notes on what you did and what results it produced — useful if you need to repeat the process or troubleshoot later</li>
          <li>Pay attention to any official guidelines or requirements specific to your situation with ${topic}</li>
          <li>If using tools or platforms related to ${topic}, take time to understand the key features before diving in</li>
        </ul>`
      },
      {
        id: 'common-mistakes',
        heading: 'Common Mistakes and How to Avoid Them',
        contentHtml: `<p>Understanding what tends to go wrong with ${topic} is just as valuable as knowing what to do right. Here are the most common missteps — and how to sidestep them.</p>

        <h3>Rushing the Early Stages</h3>
        <p>One of the most consistent patterns with ${topic} is that problems later in the process usually trace back to something that wasn't done properly at the beginning. Taking the time to get the foundation right pays dividends throughout. If something feels uncertain early on, address it then — not after you've already committed to a direction.</p>

        <h3>Relying on Outdated Information</h3>
        <p>Guidance on ${topic} can change as circumstances, tools, and best practices evolve. Always check that the information you're working from is current and relevant to your specific situation in 2026. A tip that was accurate two or three years ago may no longer reflect how things actually work today.</p>

        <h3>Underestimating the Learning Curve</h3>
        <p>Even when ${topic} looks straightforward on paper, there's usually a learning curve involved in putting it into practice. Be patient with yourself, especially at the start. Most people who struggle significantly are simply trying to move too fast before they've built the necessary understanding. Slow down, get comfortable with each stage, and your confidence — and results — will follow naturally.</p>`
      },
      {
        id: 'frequently-asked-questions',
        heading: 'Frequently Asked Questions',
        contentHtml: `
          <div style="display: flex; flex-direction: column; gap: 1.25rem; margin-top: 1rem;">
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <h4 style="margin-top: 0; color: var(--primary); font-size: 1.05rem;">What is the best way to get started with ${topic}?</h4>
              <p style="margin-bottom: 0;">The best starting point is to clearly define your specific goal with ${topic}, then research the requirements or steps relevant to your situation. Starting with a clear objective and realistic expectations makes everything else more manageable.</p>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <h4 style="margin-top: 0; color: var(--primary); font-size: 1.05rem;">How long does it typically take to see results with ${topic}?</h4>
              <p style="margin-bottom: 0;">Timelines vary depending on your specific situation and goals. In most cases, building a solid foundation takes longer than expected at first but accelerates once the fundamentals are in place. Plan for more time than you think you'll need.</p>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <h4 style="margin-top: 0; color: var(--primary); font-size: 1.05rem;">What are the most important things to know about ${topic} before starting?</h4>
              <p style="margin-bottom: 0;">Understanding the core mechanism and having realistic expectations about timelines and effort are the two most important things. Most difficulties with ${topic} come from either a knowledge gap about how it works or expectations that don't match reality.</p>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <h4 style="margin-top: 0; color: var(--primary); font-size: 1.05rem;">Is ${topic} suitable for beginners?</h4>
              <p style="margin-bottom: 0;">Yes — with the right preparation and a willingness to learn as you go. Starting with a clear step-by-step plan and not skipping the foundational stages makes ${topic} accessible even if you're approaching it for the first time.</p>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
              <h4 style="margin-top: 0; color: var(--primary); font-size: 1.05rem;">Where can I find reliable, up-to-date information about ${topic}?</h4>
              <p style="margin-bottom: 0;">Look for official sources, expert publications, and well-regarded guides that are clearly dated and updated for current conditions. GenAlphaMagazines covers ${topic} and related subjects with regularly updated editorial coverage you can rely on.</p>
            </div>
          </div>

          <div style="background: var(--bg-subtle); border-left: 4px solid var(--primary); padding: 1.5rem; margin-top: 2rem; border-radius: var(--radius-sm);">
            <h3 style="margin-top: 0; color: var(--primary);">Final Thoughts</h3>
            <p style="margin-bottom: 0;">${cleanTopic} doesn't have to be complicated — but it does reward preparation and patience. Whether you're just getting started or looking to improve on a previous attempt, the key factors remain consistent: understand the basics thoroughly, set realistic expectations, build in enough time, and don't skip the verification steps. Most people who find ${topic} frustrating are simply trying to shortcut a process that benefits from a methodical approach. Take it one stage at a time, and the rest tends to follow.</p>
          </div>`
      }
    ],
    faqs: [
      {
        question: `What is the best way to get started with ${topic}?`,
        answer: `The best starting point is to clearly define your specific goal with ${topic}, then research the requirements or steps relevant to your situation. Starting with a clear objective and realistic expectations makes everything else more manageable.`
      },
      {
        question: `How long does it typically take to see results with ${topic}?`,
        answer: `Timelines vary depending on your specific situation and goals. Building a solid foundation usually takes longer than expected at first but accelerates once the fundamentals are in place. Plan for more time than you think you'll need.`
      },
      {
        question: `What are the most important things to know about ${topic} before starting?`,
        answer: `Understanding the core mechanism and having realistic expectations about timelines and effort are the two most important things. Most difficulties with ${topic} come from either a knowledge gap or expectations that don't match reality.`
      },
      {
        question: `Is ${topic} suitable for beginners?`,
        answer: `Yes — with the right preparation and willingness to learn as you go. Starting with a clear step-by-step plan and not skipping the foundational stages makes ${topic} accessible even for first-timers.`
      },
      {
        question: `Where can I find reliable, up-to-date information about ${topic}?`,
        answer: `Look for official sources, expert publications, and well-regarded guides that are clearly dated and current. GenAlphaMagazines covers ${topic} and related subjects with regularly updated editorial coverage.`
      }
    ]
  };
}



async function generateArticle(topicData) {
  const { topic, category, author } = topicData;
  console.log(`[INFO] Generating article on: "${topic}" (Category: ${category})`);

  const systemInstruction = `You are an expert writer for GenAlphaMagazines, producing practical, reader-first guides in the exact style of quartist.de.

WRITING STYLE RULES (follow strictly):
1. TONE: Conversational, helpful, direct. Write like you are explaining to a smart friend — not a bureaucrat writing a report. No corporate jargon, no civic boilerplate.
2. OPENING (Section 1): Start with a hook paragraph that immediately addresses WHY the reader is here and what they will learn. Acknowledge their situation. Then provide 1-2 short overview paragraphs before the first subheading.
3. STRUCTURE — provide exactly these 6 sections with the exact heading formats:
   - Section 1: A short introductory overview section (title = an "About [Topic]" or "What is [Topic]" style heading)
   - Sections 2-5: Each covers a distinct practical aspect. Use SPECIFIC descriptive subheadings (e.g. "How to Get Between Concourses", "TSA PreCheck and CLEAR Availability"), NOT generic labels like "Section 2".
   - Section 6: MUST be titled "Frequently Asked Questions" with 5 realistic Q&A pairs plus a "Final Thoughts" paragraph at the very end of section 6's contentHtml.
4. SUBHEADINGS: Within each section's contentHtml, use <h3> tags for sub-topics. Example: <h3>TSA PreCheck and CLEAR Availability</h3>
5. BULLETS & LISTS: Use <ul> or <ol> with <li> tags for lists of tips, steps, or options. Make them specific, not vague.
6. NO GENERIC PHRASES: Never write "across our regional communities", "municipal governance", "civic engagement", "stakeholder trust", "quarterly milestone phases". These are banned.
7. CONTENT DEPTH: Every paragraph must contain real, specific, practical information about the exact topic. Minimum 1,200 words total across all sections.
8. FAQS: Must be 5 specific, realistic questions a real reader would ask about this exact topic. Answers must be direct and informative (2-4 sentences each).
9. JSON ONLY: Return valid JSON with keys: "title", "slug", "metaDescription", "tableOfContents", "sections", "faqs".
   - "title": A clear, practical, SEO-friendly title (e.g. "Atlanta Airport (ATL) Guide: Terminals, Layovers, and Everything to Know")
   - "slug": lowercase hyphenated URL slug
   - "metaDescription": 150-160 character meta description
   - "tableOfContents": array of {id, title} — one entry per section
   - "sections": array of {id, heading, contentHtml} — full HTML content per section
   - "faqs": array of {question, answer} — 5 FAQ pairs for schema markup
10. NO markdown, NO code blocks in the JSON values. contentHtml must be valid HTML only.`;

  const userPrompt = `Write a complete, practical, in-depth guide article about: "${topic}"
Category: ${category}
Author: ${author.name} (${author.role})

Make the article topic-specific with real, accurate information about "${topic}". Do NOT write generic community reporting — write a practical reader guide like quartist.de would.`;

  if (GEMINI_API_KEY) {
    try {
      return await callGoogleAIStudio(GEMINI_API_KEY, userPrompt, systemInstruction);
    } catch (err) {
      console.warn('[WARN] Gemini API call fallback:', err.message);
    }
  }

  return generateDeepFallbackArticle(topic, category, author);
}


const VECTOR_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <defs>
    <radialGradient id="badgeRadialArt" cx="50%" cy="38%" r="62%">
      <stop offset="0%" stop-color="#ef233c" />
      <stop offset="60%" stop-color="#c1121e" />
      <stop offset="100%" stop-color="#780000" />
    </radialGradient>
    <linearGradient id="goldPageGradArt" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
    <linearGradient id="wingLeftArt" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="35%" stop-color="#ffccd5" />
      <stop offset="100%" stop-color="#c1121e" />
    </linearGradient>
    <linearGradient id="wingRightArt" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffccd5" />
      <stop offset="50%" stop-color="#e63946" />
      <stop offset="100%" stop-color="#590d22" />
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="48" fill="url(#goldPageGradArt)" />
  <circle cx="50" cy="50" r="45" fill="#111827" />
  <circle cx="50" cy="50" r="43" fill="url(#badgeRadialArt)" />
  <circle cx="50" cy="42" r="28" fill="#ffffff" opacity="0.12" />
  <g>
    <path d="M 50 78 L 22 68 L 22 55 L 50 64 Z" fill="url(#goldPageGradArt)" />
    <path d="M 50 78 L 24 70 L 24 58 L 50 66 Z" fill="#ffffff" opacity="0.85" />
    <path d="M 50 78 L 78 68 L 78 55 L 50 64 Z" fill="url(#goldPageGradArt)" />
    <path d="M 50 78 L 76 70 L 76 58 L 50 66 Z" fill="#ffffff" opacity="0.95" />
  </g>
  <g>
    <polygon points="50,44 24,24 38,40 50,47" fill="url(#wingLeftArt)" />
    <polygon points="24,24 16,34 32,44 38,40" fill="#e63946" />
    <polygon points="50,44 76,20 62,38 50,47" fill="url(#wingRightArt)" />
    <polygon points="76,20 84,30 68,42 62,38" fill="#d90429" />
    <polygon points="50,48 44,60 50,65 56,60" fill="#590d22" />
    <polygon points="50,30 46,38 50,48 54,38" fill="#ffffff" />
    <polygon points="50,24 53,28 50,32 47,28" fill="#fef08a" />
  </g>
</svg>`;

function renderArticleHtml(articleData, author, category, heroImage) {
  const currentDate = new Date().toISOString().split('T')[0];
  const dateFormatted = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const tocHtml = articleData.tableOfContents.map(item => {
    // Strip leading number if present to prevent double numbering (e.g., '1. 1. Title' -> '1. Title')
    const cleanItemTitle = item.title.replace(/^\d+\.\s*\d*\.?\s*/, '');
    return `<li><a href="#${item.id}">${cleanItemTitle}</a></li>`;
  }).join('\n            ');
  
  const sectionsHtml = articleData.sections.map((sec, idx) => {
    const enrichedContent = injectInternalLinks(sec.contentHtml, articleData.slug);
    let adBlock = '';
    if (idx === 1 || idx === 3) {
      adBlock = `
          <div class="ad-slot-wrap">
            <span class="ad-label">Advertisement</span>
            <div class="ad-placeholder ad-in-article">
              <span>Google AdSense In-Article Responsive Banner</span>
            </div>
          </div>`;
    }
    return `
          <section id="${sec.id}">
            <h2>${sec.heading}</h2>
            ${enrichedContent}
          </section>${adBlock}`;
  }).join('\n');

  let faqSchemaJson = '';
  if (articleData.faqs && articleData.faqs.length > 0) {
    const faqEntities = articleData.faqs.map(f => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": { "@type": "Answer", "text": f.answer }
    }));
    faqSchemaJson = `,
      {
        "@type": "FAQPage",
        "mainEntity": ${JSON.stringify(faqEntities)}
      }`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${articleData.title} | GenAlphaMagazines</title>
  <meta name="description" content="${articleData.metaDescription}">
  <link rel="canonical" href="https://www.genalphamagazines.com/articles/${articleData.slug}.html">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${articleData.title}">
  <meta property="og:description" content="${articleData.metaDescription}">
  <meta property="og:image" content="${heroImage.relativeUrl}">
  <meta property="og:url" content="https://www.genalphamagazines.com/articles/${articleData.slug}.html">
  <meta property="article:published_time" content="${currentDate}T08:00:00+00:00">
  <meta property="article:section" content="${category}">
  
  <link rel="icon" type="image/svg+xml" href="../assets/images/favicon.svg">
  <link rel="alternate icon" href="../favicon.ico">
  <link rel="manifest" href="../site.webmanifest">
  <meta name="theme-color" content="#c1121e">
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=ABeeZee:ital@0;1&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/css/style.css?v=final_stable_v1">
  
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.genalphamagazines.com/" },
          { "@type": "ListItem", "position": 2, "name": "Categories", "item": "https://www.genalphamagazines.com/categories.html" },
          { "@type": "ListItem", "position": 3, "name": "${articleData.title}", "item": "https://www.genalphamagazines.com/articles/${articleData.slug}.html" }
        ]
      },
      {
        "@type": "NewsArticle",
        "@id": "https://www.genalphamagazines.com/articles/${articleData.slug}.html#article",
        "headline": "${articleData.title}",
        "description": "${articleData.metaDescription}",
        "image": "${heroImage.relativeUrl}",
        "datePublished": "${currentDate}T08:00:00+00:00",
        "dateModified": "${currentDate}T08:00:00+00:00",
        "mainEntityOfPage": "https://www.genalphamagazines.com/articles/${articleData.slug}.html",
        "author": {
          "@type": "Person",
          "name": "${author.name}",
          "url": "https://www.genalphamagazines.com/author/${author.slug}.html",
          "jobTitle": "${author.role}"
        },
        "publisher": {
          "@type": "Organization",
          "name": "GenAlphaMagazines",
          "url": "https://www.genalphamagazines.com/"
        }
      }${faqSchemaJson}
    ]
  }
  </script>
</head>
<body>
  <!-- Top Utility Bar -->
  <div class="top-bar">
    <div class="container top-bar-inner">
      <div class="top-date">
        <span>📅 Wednesday, September 2, 2026</span>
        <span>&bull;</span>
        <span>Community Reporting & Regional News</span>
      </div>
      <nav class="top-nav" aria-label="Utility Navigation">
        <ul>
          <li><a href="../pages/about.html">About</a></li>
          <li><a href="../pages/editorial-policy.html">Editorial Standards</a></li>
          <li><a href="../pages/privacy-policy.html">Privacy</a></li>
          <li><a href="../pages/contact.html">Contact</a></li>
        </ul>
      </nav>
    </div>
  </div>

  <!-- Main Newspaper Header -->
  <header class="main-header">
    <div class="container header-inner">
      <a href="../index.html" class="brand-logo" aria-label="GenAlphaMagazines Homepage">
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
        <a href="../pages/contact.html" class="news-tip-btn">
          <span>✉️</span> News Tip?
        </a>
        <button id="theme-toggle" class="theme-btn" aria-label="Toggle Dark/Light Mode">
          <span class="theme-icon">🌙</span>
          <span class="theme-text">Dark</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Sticky Navigation Bar on Scroll -->
  <nav class="main-nav-wrapper">
      <div class="container" style="display: flex; justify-content: space-between; align-items: center;">
        <nav class="main-nav" aria-label="Main Navigation">
          <ul class="main-nav-links">
            <li><a href="../index.html">Home</a></li>
            <li><a href="../category-news.html" class="${category === 'news' ? 'active' : ''}">News</a></li>
            <li><a href="../category-community.html" class="${category === 'community' ? 'active' : ''}">Community & Events</a></li>
            <li><a href="../category-business.html" class="${category === 'business' ? 'active' : ''}">Business & Economy</a></li>
            <li><a href="../category-arts.html" class="${category === 'arts' ? 'active' : ''}">Arts & Entertainment</a></li>
            <li><a href="../category-lifestyle.html" class="${category === 'lifestyle' ? 'active' : ''}">Lifestyle</a></li>
            <li><a href="../category-voices.html" class="${category === 'voices' ? 'active' : ''}">Voices</a></li>
            <li><a href="../categories.html">All Topics</a></li>
          </ul>
        </nav>
      </div>
    </nav>

  <main class="container" style="margin-top: 1.5rem; margin-bottom: 4rem;">
    <div class="main-layout">
      <article class="article-container" style="padding: 0;">
        <header class="article-header">
          <span class="article-category-badge">${category.toUpperCase()} &bull; Editorial Feature</span>
          <h1 class="article-title">${articleData.title}</h1>
          
          <div class="article-meta-bar">
            <div class="author-meta">
              <div class="author-avatar">${author.initials}</div>
              <div>
                <div><a href="../author/${author.slug}.html" style="font-weight: 700; color: var(--text-main);">${author.name}</a></div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${author.role}</div>
              </div>
            </div>
            <span>Published: ${dateFormatted}</span>
          </div>
        </header>

        <figure class="featured-media" style="margin: 0; position: relative;">
          <div style="aspect-ratio: 16/9; overflow: hidden; border-radius: var(--radius-md);">
            <img src="${heroImage.relativeUrl}" alt="${articleData.title}" style="width: 100%; height: 100%; object-fit: cover;">
          </div>
          <figcaption style="font-size: 0.85rem; color: var(--text-muted); padding: 0.6rem 0.25rem 0.5rem; border-bottom: 1px solid var(--border-color);">${articleData.title}</figcaption>
        </figure>

        <div class="article-body">
          ${sectionsHtml}
        </div>

        <!-- Related Department Stories -->
        <div style="background: var(--bg-subtle); border-left: 4px solid var(--primary); padding: 1.25rem 1.5rem; margin: 2.5rem 0; border-radius: var(--radius-sm);">
          <h4 style="color: var(--primary); margin-top: 0; font-size: 1.1rem; text-transform: uppercase;">Related Investigative Reports & Department Features</h4>
          <p style="font-size: 0.95rem; line-height: 1.7; margin-bottom: 0.75rem;">
            Continue reading in-depth community coverage from GenAlphaMagazines:
          </p>
          <ul style="margin-left: 1.5rem; line-height: 1.8; font-size: 0.95rem;">
            <li><strong>Civic Affairs:</strong> <a href="./municipal-election-analysis-candidate-platforms.html" style="color: var(--primary); font-weight: 700; text-decoration: underline;">Municipal Election Analysis: Candidate Platforms & Community Priorities</a></li>
            <li><strong>Festivals & Culture:</strong> <a href="./annual-waterfront-heritage-festival.html" style="color: var(--primary); font-weight: 700; text-decoration: underline;">Annual Waterfront Heritage Festival Returns with Record Artisan Attendance</a></li>
            <li><strong>Downtown Growth:</strong> <a href="./main-street-commercial-revitalization.html" style="color: var(--primary); font-weight: 700; text-decoration: underline;">Main Street Commercial Revitalization: Small Businesses Thriving in 2026</a></li>
            <li><strong>Regional Arts:</strong> <a href="./spotlight-on-independent-theater.html" style="color: var(--primary); font-weight: 700; text-decoration: underline;">Spotlight on Independent Theater: Local Playwrights Take Center Stage</a></li>
            <li><strong>Home & Climate:</strong> <a href="./energy-efficient-home-modernization.html" style="color: var(--primary); font-weight: 700; text-decoration: underline;">Energy-Efficient Home Modernization: Heat Pumps, Solar Arrays & Insulation</a></li>
            <li><strong>Community Voices:</strong> <a href="./the-power-of-neighborly-connection-in-a-digital-world-a-columnist-perspective.html" style="color: var(--primary); font-weight: 700; text-decoration: underline;">The Power of Neighborly Connection in a Digital World: A Columnist Perspective</a></li>
          </ul>
        </div>

        <section class="author-box">
          <div class="author-avatar">${author.initials}</div>
          <div class="author-bio">
            <h4 style="margin: 0 0 0.4rem 0;"><a href="../author/${author.slug}.html">${author.name}</a></h4>
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">${author.role} at GenAlphaMagazines. Specializing in regional governance, independent investigations, and verified community journalism.</p>
          </div>
        </section>
      </article>

      <aside class="sidebar">
        <div class="newsletter-box">
          <h4>Subscribe to GenAlphaMagazines</h4>
          <p>Get the best of regional reporting and community stories delivered to your inbox twice a week.</p>
          <form onsubmit="event.preventDefault(); alert('Thank you for subscribing to GenAlphaMagazines!');">
            <input type="email" placeholder="Enter your email" required aria-label="Email address">
            <button type="submit">Join 35,000+ Readers</button>
          </form>
        </div>

        <div class="sidebar-widget">
          <h3 class="widget-title">Editorial Standards</h3>
          <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.8rem;">
            Every publication in GenAlphaMagazines adheres to strict EEAT guidelines, verified primary sources, and high-standard community journalism.
          </p>
          <a href="../pages/editorial-policy.html" style="font-weight: 700; color: var(--primary); font-size: 0.88rem;">Read Editorial Guidelines &rarr;</a>
        </div>

        <div class="ad-slot-wrap" aria-label="Sponsored Ad Unit">
          <span class="ad-label">Advertisement</span>
          <div class="ad-placeholder ad-sidebar">
            <span>Google AdSense Display Unit (300x250 / 300x600)</span>
          </div>
        </div>
      </aside>
    </div>
  </main>

  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <a href="../index.html" class="footer-logo" aria-label="GenAlphaMagazines Homepage">
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
          <li><a href="../category-news.html">News & Announcements</a></li>
          <li><a href="../category-community.html">Community & Events</a></li>
          <li><a href="../category-business.html">Business & Economy</a></li>
          <li><a href="../category-arts.html">Arts & Entertainment</a></li>
          <li><a href="../category-lifestyle.html">Lifestyle & Culture</a></li>
          <li><a href="../category-voices.html">Voices & Columnists</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Editorial</h5>
        <ul class="footer-links">
          <li><a href="../pages/about.html">About Us</a></li>
          <li><a href="../pages/editorial-policy.html">Editorial Standards</a></li>
          <li><a href="../pages/affiliate-disclosure.html">Affiliate Disclosure</a></li>
          <li><a href="../pages/contact.html">Contact Us</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Compliance</h5>
        <ul class="footer-links">
          <li><a href="../pages/privacy-policy.html">Privacy Policy</a></li>
          <li><a href="../pages/terms.html">Terms & Conditions</a></li>
          <li><a href="../pages/cookie-policy.html">Cookie Policy</a></li>
          <li><a href="../pages/disclaimer.html">Disclaimer</a></li>
        </ul>
      </div>
    </div>
    <div class="container footer-bottom">
      <p>&copy; 2026 GenAlphaMagazines. All rights reserved by nexweb</p>
    </div>
  </footer>
  <script src="../assets/js/main.js" defer></script>
</body>
</html>`;
}

function updateSiteIndex(articleData, author, category, heroImage) {
  const currentDate = new Date().toISOString().split('T')[0];
  const dateFormatted = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // 1. Sitemap update
  const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    let sitemap = fs.readFileSync(sitemapPath, 'utf8');
    const newUrl = `https://www.genalphamagazines.com/articles/${articleData.slug}.html`;
    if (!sitemap.includes(newUrl)) {
      const newUrlEntry = `  <url>\n    <loc>${newUrl}</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>\n</urlset>`;
      sitemap = sitemap.replace('</urlset>', newUrlEntry);
      fs.writeFileSync(sitemapPath, sitemap, 'utf8');
      console.log(`[INFO] Added ${articleData.slug}.html to sitemap.xml`);
    }
  }

  // 2. VIP Homepage Auto-Update (Section 1: Latest Stories + Corresponding Category Section on Homepage)
  const indexPath = path.join(ROOT_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    let indexHtml = fs.readFileSync(indexPath, 'utf8');

    // A. Section 1 Lead Main Card
    const newLeadMainCard = `<div class="pattern-a-main">
            <article class="card">
              <div class="card-img-wrap">
                <img src="${heroImage.indexUrl}" alt="${articleData.title}" loading="lazy">
              </div>
              <div class="card-content">
                <span class="card-tag">${category.toUpperCase()} &bull; Editorial Lead Feature</span>
                <h3 class="card-title">
                  <a href="./articles/${articleData.slug}.html">${articleData.title}</a>
                </h3>
                <p class="card-excerpt">${articleData.metaDescription}</p>
                <div class="card-meta">
                  <span>By <a href="./author/${author.slug}.html">${author.name}</a></span>
                  <span>${dateFormatted}</span>
                </div>
              </div>
            </article>
          </div>`;

    const mainStart = indexHtml.indexOf('<div class="pattern-a-main">');
    const sideStart = indexHtml.indexOf('<div class="pattern-a-side-list">');

    if (mainStart !== -1 && sideStart !== -1 && mainStart < sideStart) {
      indexHtml = indexHtml.slice(0, mainStart) + newLeadMainCard + '\n\n          ' + indexHtml.slice(sideStart);
      console.log(`[INFO] Successfully set ${articleData.title} as #1 Main Feature in Latest Stories on Homepage!`);
    }

    // B. Auto-update the specific Category section on Homepage
    const newCardSnippet = `
          <article class="card">
            <div class="card-img-wrap">
              <img src="${heroImage.indexUrl}" alt="${articleData.title}" loading="lazy">
            </div>
            <div class="card-content">
              <span class="card-tag">${category.toUpperCase()}</span>
              <h3 class="card-title"><a href="./articles/${articleData.slug}.html">${articleData.title}</a></h3>
              <p class="card-excerpt">${articleData.metaDescription}</p>
              <div class="card-meta"><span>By ${author.name}</span><span>${dateFormatted}</span></div>
            </div>
          </article>`;

    // Map categories to homepage section labels
    const categorySectionLabels = {
      'business': 'Business & Economy',
      'community': 'Community & Events',
      'arts': 'Arts & Entertainment',
      'lifestyle': 'Lifestyle & Culture',
      'news': 'Latest Stories',
      'voices': 'Arts & Entertainment'
    };

    const targetLabel = categorySectionLabels[category] || 'Business & Economy';
    const sectionIndex = indexHtml.indexOf(`<span class="section-box">${targetLabel}</span>`);

    if (sectionIndex !== -1) {
      // Check if it has a pattern-b-grid (Straight 4 cards) or pattern-a-grid
      const nextGridIndex = indexHtml.indexOf('<div class="pattern-b-grid">', sectionIndex);
      const nextPatternAIndex = indexHtml.indexOf('<div class="pattern-a-main">', sectionIndex);

      if (nextGridIndex !== -1 && (nextGridIndex - sectionIndex < 300)) {
        // Prepend into pattern-b-grid
        const gridInsertionPoint = nextGridIndex + '<div class="pattern-b-grid">'.length;
        indexHtml = indexHtml.slice(0, gridInsertionPoint) + '\n' + newCardSnippet + indexHtml.slice(gridInsertionPoint);
        console.log(`[INFO] Injected new card into ${targetLabel} grid on Homepage!`);
      } else if (nextPatternAIndex !== -1 && (nextPatternAIndex - sectionIndex < 300) && sectionIndex > 500) {
        // Update Pattern A main card for that category section
        const catSideStart = indexHtml.indexOf('<div class="pattern-a-side-list">', nextPatternAIndex);
        if (catSideStart !== -1) {
          indexHtml = indexHtml.slice(0, nextPatternAIndex) + newLeadMainCard + '\n\n          ' + indexHtml.slice(catSideStart);
          console.log(`[INFO] Updated main card in ${targetLabel} section on Homepage!`);
        }
      }
    }

    // C. Auto-prepend into Breaking News Marquee Ticker
    const tickerItem = `<a href="./articles/${articleData.slug}.html" class="breaking-ticker-item"><span class="ticker-bullet">&bull;</span> ${articleData.title}</a>\n          `;
    if (!indexHtml.includes(`href="./articles/${articleData.slug}.html"`)) {
      indexHtml = indexHtml.replace('<div class="breaking-ticker-track">', '<div class="breaking-ticker-track">\n          ' + tickerItem);
      console.log(`[INFO] Added headline to Breaking News Ticker in index.html`);
    }

    fs.writeFileSync(indexPath, indexHtml, 'utf8');
  }

  // 3. Category Department Page Auto-Update
  const categoryFile = `category-${category}.html`;
  const categoryPath = path.join(ROOT_DIR, categoryFile);
  if (fs.existsSync(categoryPath)) {
    let catHtml = fs.readFileSync(categoryPath, 'utf8');
    const catCardSnippet = `
          <!-- Article: ${articleData.slug}.html -->
          <article class="card">
            <div class="card-img-wrap">
              <img src="${heroImage.indexUrl}" alt="${articleData.title}" loading="lazy">
            </div>
            <div class="card-content">
              <span class="card-tag">${category.toUpperCase()} &bull; Feature</span>
              <h3 class="card-title">
                <a href="./articles/${articleData.slug}.html">${articleData.title}</a>
              </h3>
              <p class="card-excerpt">${articleData.metaDescription}</p>
              <div class="card-meta">
                <span>By <a href="./author/${author.slug}.html">${author.name}</a></span>
                <span>${dateFormatted}</span>
              </div>
            </div>
          </article>\n`;

    if (!catHtml.includes(articleData.slug)) {
      if (catHtml.includes('<div class="articles-grid">')) {
        catHtml = catHtml.replace('<div class="articles-grid">', '<div class="articles-grid">\n' + catCardSnippet);
      }
      fs.writeFileSync(categoryPath, catHtml, 'utf8');
      console.log(`[INFO] Added ${articleData.slug} to ${categoryFile}`);
    }
  }
}

async function main() {
  console.log('=== Starting GenAlphaMagazines Automated Content Pipeline ===');
  const cat = (TARGET_CATEGORY in AUTHORS) ? TARGET_CATEGORY : 'news';
  const author = AUTHORS[cat] || AUTHORS.news;
  const topic = CUSTOM_TOPIC.trim() || DEFAULT_TOPIC_POOL[cat] || DEFAULT_TOPIC_POOL.news;

  const topicData = {
    topic: topic,
    category: cat,
    author: author
  };

  const generatedArticle = await generateArticle(topicData);
  const heroImage = await fetchOrGenerateTopicImage(topic, cat, generatedArticle.slug);
  const fullHtml = renderArticleHtml(generatedArticle, topicData.author, topicData.category, heroImage);

  const outputPath = path.join(ROOT_DIR, 'articles', `${generatedArticle.slug}.html`);
  fs.writeFileSync(outputPath, fullHtml, 'utf8');
  console.log(`[SUCCESS] Article written to: ${outputPath}`);

  updateSiteIndex(generatedArticle, topicData.author, topicData.category, heroImage);
  console.log('=== Pipeline Execution Complete ===');
}

main().catch(err => {
  console.error('[FATAL] Pipeline failure:', err);
  process.exit(1);
});
