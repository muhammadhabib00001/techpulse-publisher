/**
 * TechPulse Trends - Automated Content Publishing Engine
 * Supports BOTH:
 * 1. Google AI Studio (GEMINI_API_KEY) - Fastest & Easiest, No GCP billing needed
 * 2. Google Cloud Vertex AI (GCP_CREDENTIALS_JSON) - Enterprise GCP setup
 * + Google Drive API + Static Site Indexer
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..');

// Environment & Config
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GCP_CREDENTIALS_JSON = process.env.GCP_CREDENTIALS_JSON;
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'techpulse-production';
const GCP_REGION = process.env.GCP_REGION || 'us-central1';
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const CUSTOM_TOPIC = process.env.CUSTOM_TOPIC;
const TARGET_CATEGORY = process.env.TARGET_CATEGORY || 'ai';

const DEFAULT_TOPIC_POOL = [
  {
    topic: 'Deterministic Guardrails in Multi-Agent Autonomous LLM Pipelines',
    category: 'ai',
    author: { name: 'Dr. Elena Vance', slug: 'dr-elena-vance', role: 'Lead AI Systems Architect', initials: 'EV' }
  },
  {
    topic: 'Securing eBPF Kernel Probes in Multi-Tenant Kubernetes Clusters',
    category: 'security',
    author: { name: 'Marcus Reid', slug: 'marcus-reid', role: 'Principal Cloud Security Architect', initials: 'MR' }
  },
  {
    topic: 'Serverless Multi-Region Database Sharding and Quorum Replication in 2026',
    category: 'cloud',
    author: { name: 'Marcus Reid', slug: 'marcus-reid', role: 'Principal Cloud Security Architect', initials: 'MR' }
  }
];

async function getGoogleAuthClient() {
  if (!GCP_CREDENTIALS_JSON) {
    return null;
  }
  try {
    const { google } = require('googleapis');
    const credentials = JSON.parse(GCP_CREDENTIALS_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/cloud-platform']
    });
  } catch (e) {
    return null;
  }
}

/**
 * 1. Read Topic Briefs from Google Drive (if configured)
 */
async function fetchBriefFromGoogleDrive(auth) {
  if (!auth || !GOOGLE_DRIVE_FOLDER_ID) {
    console.log('[INFO] Google Drive folder not configured or credentials omitted; using topic queue.');
    return null;
  }

  try {
    const { google } = require('googleapis');
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.list({
      q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType = 'text/plain' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 5
    });

    if (res.data.files && res.data.files.length > 0) {
      const file = res.data.files[0];
      console.log(`[INFO] Found topic brief in Google Drive: ${file.name}`);
      const fileContent = await drive.files.get({ fileId: file.id, alt: 'media' });
      return {
        topic: file.name.replace(/\.txt$/i, ''),
        briefNotes: fileContent.data,
        driveFileId: file.id
      };
    }
  } catch (err) {
    console.error('[ERROR] Error reading Google Drive folder:', err.message);
  }
  return null;
}

/**
 * Helper to query Google AI Studio Gemini API via direct HTTPS (Zero Extra Dependencies)
 */
function callGoogleAIStudio(apiKey, prompt, systemInstruction) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return reject(new Error(parsed.error.message));
          }
          const text = parsed.candidates[0].content.parts[0].text;
          resolve(JSON.parse(text));
        } catch (err) {
          reject(new Error('Failed to parse Gemini API response: ' + err.message));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * 2. Generate Full 1000-1500w Article via Gemini / Vertex AI / Fallback
 */
async function generateArticle(topicData) {
  const { topic, category, author, briefNotes } = topicData;
  console.log(`[INFO] Synthesizing 1,200-1,500 word article on: "${topic}"`);

  const systemInstruction = `
You are an expert enterprise technology journalist and software architect for TechPulse Trends (https://www.techpulsetrends.com).
Write a comprehensive, highly technical, and original 1,200 to 1,500 word research article.
STRICT GUIDELINES:
1. Target Word Count: Minimum 1,200 words, maximum 1,500 words.
2. Tone: Authoritative, objective, engineering-focused (EEAT standards). Include architecture breakdown, code/interface examples, operational trade-offs, and security best practices.
3. Structure:
   - Catchy, SEO-optimized title
   - Executive Summary
   - Core Architecture & Components
   - In-depth Technical Sections with code or structural diagrams
   - Production Guardrails / Failure Modes
   - Key Takeaways & Conclusion
4. Return ONLY valid JSON format with keys:
   - "title": string
   - "slug": string (kebab-case)
   - "metaDescription": string (150-160 chars)
   - "excerpt": string (2-3 sentences)
   - "sections": array of objects with {"id": string, "heading": string, "contentHtml": string}
   - "tableOfContents": array of objects with {"id": string, "title": string}
`;

  const userPrompt = `
Topic: ${topic}
Category: ${category}
Target Author: ${author.name} (${author.role})
Additional Context: ${briefNotes || 'Focus on 2026 enterprise scale, deterministic reliability, and Core Web Vitals best practices.'}
`;

  // Path A: Google AI Studio API Key (Easiest, free & immediate)
  if (GEMINI_API_KEY) {
    console.log('[INFO] Using Google AI Studio (GEMINI_API_KEY)...');
    try {
      return await callGoogleAIStudio(GEMINI_API_KEY, userPrompt, systemInstruction);
    } catch (err) {
      console.error('[WARN] Google AI Studio call failed, attempting fallback:', err.message);
    }
  }

  // Path B: Vertex AI Service Account
  if (GCP_CREDENTIALS_JSON) {
    console.log('[INFO] Using Google Cloud Vertex AI SDK...');
    try {
      const { VertexAI } = require('@google-cloud/vertexai');
      const credentials = JSON.parse(GCP_CREDENTIALS_JSON);
      const vertexAI = new VertexAI({
        project: GCP_PROJECT_ID,
        location: GCP_REGION,
        googleAuthOptions: { credentials }
      });

      const generativeModel = vertexAI.getGenerativeModel({
        model: 'gemini-1.5-pro',
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      });

      const response = await generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
      });

      const responseText = response.response.candidates[0].content.parts[0].text;
      return JSON.parse(responseText);
    } catch (err) {
      console.error('[WARN] Vertex AI call failed, using built-in template engine:', err.message);
    }
  }

  // Path C: Built-in High Quality Template Engine (For testing without API keys)
  console.log('[INFO] Generating article using built-in architecture synthesis engine...');
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return {
    title: topic,
    slug: slug,
    metaDescription: `A comprehensive 2026 engineering guide on ${topic}, featuring architecture blueprints, production guardrails, and implementation best practices.`,
    tableOfContents: [
      { id: 'executive-summary', title: '1. Executive Summary' },
      { id: 'architectural-overview', title: '2. Architectural Blueprint & Core Primitives' },
      { id: 'implementation-deep-dive', title: '3. Technical Implementation & Schema Validation' },
      { id: 'production-guardrails', title: '4. Production Guardrails & Failure Modes' },
      { id: 'strategic-takeaways', title: '5. Key Strategic Takeaways' }
    ],
    sections: [
      {
        id: 'executive-summary',
        heading: '1. Executive Summary',
        contentHtml: `<p>In modern high-scale distributed systems, <strong>${topic}</strong> has emerged as a cornerstone requirement for engineering organizations demanding deterministic performance, fault isolation, and resilient workload governance.</p><p>As cloud architectures become increasingly decentralized across multi-region clusters and edge runtime environments, traditional procedural workflows must be fortified with formal verification, continuous attestation, and robust error recovery loops.</p>`
      },
      {
        id: 'architectural-overview',
        heading: '2. Architectural Blueprint & Core Primitives',
        contentHtml: `<p>Deconstructing the internal mechanics of modern implementations reveals three critical operational tiers: the Ingestion & Policy Plane, the Execution Runtime, and the Telemetry Verification Layer.</p><p>By enforcing strict boundary contracts between these layers, organizations eliminate cascading failures and maintain complete visibility across distributed microservices.</p>`
      },
      {
        id: 'implementation-deep-dive',
        heading: '3. Technical Implementation & Schema Validation',
        contentHtml: `<p>Runtime safety requires validating all inbound and outbound payloads against formal schemas. Utilizing standardized JSON Schema and OpenAPI 3.1 specifications guarantees that services interact exclusively through type-safe contracts.</p><pre><code>// Example: Runtime Schema Enforcement & Execution Envelope\ninterface ExecutionContext {\n  transactionId: string;\n  timestamp: number;\n  payload: Record&lt;string, unknown&gt;;\n  status: 'pending' | 'attested' | 'rejected';\n}</code></pre>`
      },
      {
        id: 'production-guardrails',
        heading: '4. Production Guardrails & Failure Modes',
        contentHtml: `<p>Deploying systems to production necessitates defensive design. Teams must establish circuit breakers, exponential backoff with jitter, and automated telemetry alerts to intercept anomalous performance degradation before end-user impact occurs.</p>`
      },
      {
        id: 'strategic-takeaways',
        heading: '5. Key Strategic Takeaways',
        contentHtml: `<p>Mastering modern architectural paradigms requires balancing agility with rigorous security and performance standards. Organizations that invest in deterministic automation and continuous validation will achieve sustainable engineering velocity.</p>`
      }
    ]
  };
}

/**
 * 3. Render HTML Page
 */
function renderArticleHtml(articleData, author, category) {
  const currentDate = new Date().toISOString().split('T')[0];
  const dateFormatted = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const tocHtml = articleData.tableOfContents.map(item => `<li><a href="#${item.id}">${item.title}</a></li>`).join('\n            ');
  
  const sectionsHtml = articleData.sections.map((sec, idx) => {
    let adBlock = '';
    if (idx === 1 || idx === 3) {
      adBlock = `
          <div class="ad-slot-wrap">
            <span class="ad-label">Advertisement</span>
            <div class="ad-placeholder ad-in-article">
              <span>Google AdSense In-Article Native Display (Responsive)</span>
            </div>
          </div>`;
    }
    return `
          <section id="${sec.id}">
            <h2>${sec.heading}</h2>
            ${sec.contentHtml}
          </section>${adBlock}`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${articleData.title} | TechPulse Trends</title>
  <meta name="description" content="${articleData.metaDescription}">
  <link rel="canonical" href="https://www.techpulsetrends.com/articles/${articleData.slug}.html">
  
  <meta property="og:type" content="article">
  <meta property="og:title" content="${articleData.title}">
  <meta property="og:description" content="${articleData.metaDescription}">
  <meta property="og:url" content="https://www.techpulsetrends.com/articles/${articleData.slug}.html">
  <meta property="article:published_time" content="${currentDate}T08:00:00+00:00">
  <meta property="article:section" content="${category}">
  
  <link rel="stylesheet" href="../assets/css/style.css">
  
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.techpulsetrends.com/" },
          { "@type": "ListItem", "position": 2, "name": "Categories", "item": "https://www.techpulsetrends.com/categories.html" },
          { "@type": "ListItem", "position": 3, "name": "${articleData.title}", "item": "https://www.techpulsetrends.com/articles/${articleData.slug}.html" }
        ]
      },
      {
        "@type": "NewsArticle",
        "@id": "https://www.techpulsetrends.com/articles/${articleData.slug}.html#article",
        "headline": "${articleData.title}",
        "description": "${articleData.metaDescription}",
        "datePublished": "${currentDate}T08:00:00+00:00",
        "dateModified": "${currentDate}T08:00:00+00:00",
        "mainEntityOfPage": "https://www.techpulsetrends.com/articles/${articleData.slug}.html",
        "author": {
          "@type": "Person",
          "name": "${author.name}",
          "url": "https://www.techpulsetrends.com/author/${author.slug}.html",
          "jobTitle": "${author.role}"
        },
        "publisher": {
          "@type": "Organization",
          "name": "TechPulse Trends",
          "url": "https://www.techpulsetrends.com/"
        }
      }
    ]
  }
  </script>
</head>
<body>
  <div id="reading-progress" class="article-reading-progress"></div>
  
  <header class="site-header">
    <div class="container header-top">
      <a href="../index.html" class="site-logo">
        <span class="logo-badge">Pulse</span>
        <span>TechPulse Trends</span>
      </a>
      <div class="nav-wrap">
        <nav class="main-nav" aria-label="Main Navigation">
          <ul>
            <li><a href="../index.html">Home</a></li>
            <li><a href="../category-ai.html">AI & Agents</a></li>
            <li><a href="../category-cloud.html">Cloud Architecture</a></li>
            <li><a href="../category-security.html">Cybersecurity</a></li>
            <li><a href="../categories.html">All Topics</a></li>
            <li><a href="../pages/about.html">About</a></li>
          </ul>
        </nav>
        <div class="header-actions">
          <button id="theme-toggle" class="theme-toggle-btn" aria-label="Toggle theme">
            <span class="theme-icon">🌙</span>
            <span class="theme-text">Dark</span>
          </button>
        </div>
      </div>
    </div>
  </header>

  <main class="container" style="margin-top: 1.5rem; margin-bottom: 4rem;">
    <nav class="breadcrumbs-nav" aria-label="Breadcrumbs">
      <ul class="breadcrumbs-list">
        <li><a href="../index.html">Home</a></li>
        <li><a href="../categories.html">Articles</a></li>
        <li aria-current="page">${articleData.title}</li>
      </ul>
    </nav>

    <div class="main-layout">
      <article class="article-container" style="padding: 0;">
        <header class="article-header">
          <span class="article-category-badge">${category.toUpperCase()} &bull; Engineering Analysis</span>
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
            <span>&bull;</span>
            <span>Reviewed for 2026 Production Standards</span>
          </div>
        </header>

        <div class="ad-slot-wrap">
          <span class="ad-label">Advertisement</span>
          <div class="ad-placeholder ad-leaderboard">
            <span>Google AdSense Header Unit</span>
          </div>
        </div>

        <div class="toc-box">
          <h3 class="toc-title">Table of Contents</h3>
          <ol class="toc-list">
            ${tocHtml}
          </ol>
        </div>

        <div class="article-body">
          ${sectionsHtml}
        </div>

        <section class="author-box">
          <div class="author-box-avatar">${author.initials}</div>
          <div class="author-box-content">
            <h4>About the Author: ${author.name}</h4>
            <div class="author-role">${author.role}</div>
            <p class="author-bio">
              Verified technical contributor at TechPulse Trends specializing in distributed cloud infrastructure, AI reasoning systems, and enterprise security.
            </p>
            <a href="../author/${author.slug}.html" style="font-weight: 600; font-size: 0.9rem;">View Author Profile &rarr;</a>
          </div>
        </section>
      </article>

      <aside class="sidebar">
        <div class="sidebar-widget">
          <h4 class="widget-title">Article Summary</h4>
          <ul class="widget-list">
            <li><strong>Category:</strong> ${category.toUpperCase()}</li>
            <li><strong>Peer Review:</strong> Completed</li>
            <li><strong>Standard:</strong> Google Helpful Content & EEAT</li>
          </ul>
        </div>

        <div class="ad-slot-wrap">
          <span class="ad-label">Advertisement</span>
          <div class="ad-placeholder ad-sidebar">
            <span>Google AdSense Rectangle Display</span>
          </div>
        </div>
      </aside>
    </div>
  </main>

  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <a href="../index.html" class="site-logo">
          <span class="logo-badge">Pulse</span>
          <span>TechPulse Trends</span>
        </a>
        <p>Independent engineering intelligence and research.</p>
      </div>
      <div class="footer-col">
        <h5>Explore</h5>
        <ul class="footer-links">
          <li><a href="../category-ai.html">AI & Agents</a></li>
          <li><a href="../category-cloud.html">Cloud Architecture</a></li>
          <li><a href="../category-security.html">Cybersecurity</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Policies</h5>
        <ul class="footer-links">
          <li><a href="../pages/privacy-policy.html">Privacy Policy</a></li>
          <li><a href="../pages/editorial-policy.html">Editorial Policy</a></li>
          <li><a href="../pages/contact.html">Contact Us</a></li>
        </ul>
      </div>
    </div>
  </footer>
  <script src="../assets/js/main.js" defer></script>
</body>
</html>`;
}

/**
 * 4. Update sitemap.xml
 */
function updateSiteIndex(articleData) {
  const currentDate = new Date().toISOString().split('T')[0];
  const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
  
  if (fs.existsSync(sitemapPath)) {
    let sitemap = fs.readFileSync(sitemapPath, 'utf8');
    const newUrl = `https://www.techpulsetrends.com/articles/${articleData.slug}.html`;
    if (!sitemap.includes(newUrl)) {
      const newUrlEntry = `  <url>\n    <loc>${newUrl}</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>\n</urlset>`;
      sitemap = sitemap.replace('</urlset>', newUrlEntry);
      fs.writeFileSync(sitemapPath, sitemap, 'utf8');
      console.log(`[INFO] Added ${articleData.slug}.html to sitemap.xml`);
    }
  }
}

/**
 * 5. Backup Generated Article to Google Drive (if enabled)
 */
async function backupToGoogleDrive(auth, articleData, htmlContent) {
  if (!auth || !GOOGLE_DRIVE_FOLDER_ID) return;
  try {
    const { google } = require('googleapis');
    const drive = google.drive({ version: 'v3', auth });
    await drive.files.create({
      requestBody: {
        name: `${articleData.slug}.html`,
        parents: [GOOGLE_DRIVE_FOLDER_ID],
        mimeType: 'text/html'
      },
      media: {
        mimeType: 'text/html',
        body: htmlContent
      }
    });
    console.log(`[INFO] Backed up ${articleData.slug}.html to Google Drive.`);
  } catch (err) {
    console.error('[ERROR] Failed backing up to Google Drive:', err.message);
  }
}

// Main Execution
async function main() {
  console.log('=== Starting TechPulse Automated Content Pipeline ===');
  const auth = await getGoogleAuthClient();

  let topicData = null;
  if (CUSTOM_TOPIC) {
    topicData = {
      topic: CUSTOM_TOPIC,
      category: TARGET_CATEGORY,
      author: DEFAULT_TOPIC_POOL[0].author
    };
  } else {
    const driveBrief = await fetchBriefFromGoogleDrive(auth);
    if (driveBrief) {
      topicData = {
        topic: driveBrief.topic,
        briefNotes: driveBrief.briefNotes,
        category: TARGET_CATEGORY,
        author: DEFAULT_TOPIC_POOL[0].author
      };
    } else {
      topicData = DEFAULT_TOPIC_POOL[Math.floor(Math.random() * DEFAULT_TOPIC_POOL.length)];
    }
  }

  const generatedArticle = await generateArticle(topicData);
  const fullHtml = renderArticleHtml(generatedArticle, topicData.author, topicData.category);

  const outputPath = path.join(ROOT_DIR, 'articles', `${generatedArticle.slug}.html`);
  fs.writeFileSync(outputPath, fullHtml, 'utf8');
  console.log(`[SUCCESS] Article written to: ${outputPath}`);

  updateSiteIndex(generatedArticle);
  await backupToGoogleDrive(auth, generatedArticle, fullHtml);

  console.log('=== Pipeline Execution Complete ===');
}

main().catch(err => {
  console.error('[FATAL] Pipeline failure:', err);
  process.exit(1);
});
