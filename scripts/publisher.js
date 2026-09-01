/**
 * 4. Update sitemap.xml, index.html, and category pages
 */
function updateSiteIndex(articleData, author, category) {
  const currentDate = new Date().toISOString().split('T')[0];
  const dateFormatted = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // A. Update sitemap.xml
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

  // B. Article Card HTML snippet for index.html
  const cardSnippet = `
          <!-- Auto-Published Article -->
          <article class="card">
            <div class="card-content">
              <span class="card-tag">${category.toUpperCase()} &bull; Latest Analysis</span>
              <h3 class="card-title">
                <a href="./articles/${articleData.slug}.html">${articleData.title}</a>
              </h3>
              <p class="card-excerpt">${articleData.metaDescription || articleData.excerpt || 'Comprehensive 2026 engineering analysis and architecture guide.'}</p>
              <div class="card-meta">
                <span>By <a href="./author/${author.slug}.html">${author.name}</a></span>
                <span>${dateFormatted}</span>
              </div>
            </div>
          </article>`;

  // C. Ingest into index.html
  const indexPath = path.join(ROOT_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    if (!indexHtml.includes(articleData.slug)) {
      indexHtml = indexHtml.replace('<div class="articles-grid">', '<div class="articles-grid">' + cardSnippet);
      fs.writeFileSync(indexPath, indexHtml, 'utf8');
      console.log(`[INFO] Inserted article card into index.html homepage`);
    }
  }

  // D. Ingest into category page
  const categoryFile = `category-${category}.html`;
  const categoryPath = path.join(ROOT_DIR, categoryFile);
  if (fs.existsSync(categoryPath)) {
    let catHtml = fs.readFileSync(categoryPath, 'utf8');
    if (!catHtml.includes(articleData.slug)) {
      catHtml = catHtml.replace('<div class="articles-grid">', '<div class="articles-grid">' + cardSnippet);
      fs.writeFileSync(categoryPath, catHtml, 'utf8');
      console.log(`[INFO] Inserted article card into ${categoryFile}`);
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

  updateSiteIndex(generatedArticle, topicData.author, topicData.category);
  await backupToGoogleDrive(auth, generatedArticle, fullHtml);

  console.log('=== Pipeline Execution Complete ===');
}

main().catch(err => {
  console.error('[FATAL] Pipeline failure:', err);
  process.exit(1);
});
