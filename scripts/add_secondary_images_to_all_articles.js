/**
 * GenAlphaMagazines - Secondary In-Article Visual Generator
 * 
 * Fetches and embeds a 100% unique, topic-relevant secondary image for all 84 published articles.
 * Enforces:
 * 1. ZERO repeat images: MD5 hash uniqueness check against all existing images on site.
 * 2. SEO-rich Alt text: specific to the section topic and main article keyword.
 * 3. Mid-article placement: positioned right before the 2nd H2 section in the article body.
 * 4. Dual-mirroring: updates both articles/<slug>.html and root <slug>.html.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const articlesDir = path.join(ROOT_DIR, 'articles');
const imgDir = path.join(ROOT_DIR, 'assets', 'images');
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || 'rug2wxB71o1mh5kYy_K6kJVLxXZ6CA2apSHUrGqZYLk';

if (!fs.existsSync(imgDir)) {
  fs.mkdirSync(imgDir, { recursive: true });
}

// Compute MD5 hash of buffer or file
function computeHash(bufOrPath) {
  try {
    const buf = Buffer.isBuffer(bufOrPath) ? bufOrPath : fs.readFileSync(bufOrPath);
    return crypto.createHash('md5').update(buf).digest('hex');
  } catch (e) {
    return null;
  }
}

// Stream download helper
function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(destPath); } catch(e) {}
        return downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch(e) {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destPath));
      });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch(e) {}
      reject(err);
    });
  });
}

// Unsplash search helper
function searchUnsplash(query, perPage = 30) {
  return new Promise((resolve) => {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${perPage}&client_id=${UNSPLASH_ACCESS_KEY}`;
    https.get(url, { headers: { 'Accept-Version': 'v1', 'User-Agent': 'TechPulse/1.0' } }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.warn(`[WARN] Unsplash API returned status ${res.statusCode} for query "${query}"`);
          return resolve([]);
        }
        try {
          const json = JSON.parse(body);
          resolve(json.results || []);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', (err) => {
      console.warn(`[WARN] Unsplash API network error: ${err.message}`);
      resolve([]);
    });
  });
}

// Load all existing image hashes
const existingHashes = new Set();
const usedPhotoIds = new Set();

const existingFiles = fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp'));
for (const f of existingFiles) {
  const h = computeHash(path.join(imgDir, f));
  if (h) existingHashes.add(h);
}
console.log(`[INIT] Loaded ${existingHashes.size} unique existing image hashes.`);

// Curated high-res Unsplash backup photo pools (for reliable zero-collision fallback)
const BACKUP_POOLS = {
  business: [
    '1486406146926-c627a92ad1ab', '1454165804606-c3d57bc86b40', '1556742049-0a67e557224f',
    '1590283603385-17ffb3a7f29f', '1444653614773-995bc3a45f94', '1507679799987-c73779587ccf',
    '1553877522-43269d4ea984', '1460925895917-afdab827c52f', '1520607164069-c5b042583650',
    '1551836022-d5d88e9218df', '1542744173-8e7e53415bb0', '1519389950473-47ba0277781c'
  ],
  health: [
    '1571019613454-1cb2f99b2d8b', '1506126613408-eca07ce68773', '1559757148-5c350d0d3c56',
    '1584438784894-089d6a62b8fa', '1505751172876-fa1923c5c528', '1532938911079-1b06ac7ceec7',
    '1576091160399-112ba8d25d1d', '1511688878353-3a2f5be94cd7', '1584515979956-d9f6e5d09982',
    '1512069772995-ec65ed45afd6', '1579684385127-1ef15d508118', '1527613426441-4da17471b66d'
  ],
  technology: [
    '1531297484001-80022131f5a1', '1518770660439-4636190af475', '1602524811496-36a7f65c7ac5',
    '1451187580459-43490279c0fa', '1526374965328-7f61d4dc18c5', '1550751827-4bd374c3f58b',
    '1519389950473-47ba0277781c', '1525547719571-a2d4ac8945e2', '1488590528505-98d2b5aba04b',
    '1535223289827-42f1e9919769', '1517430816045-df4b7de01a5a', '1563770660941-20978e870e26'
  ],
  games: [
    '1511512578047-7bde2e3cd15e', '1493711662062-fa541adb3fc8', '1550745165-9bc0b252726f',
    '1612287606636-b3d2ce0c3748', '1538481199705-c710c4e965fc', '1542751371-adc38448a05e',
    '1592478411213-6153e4ebc07d', '1607604276583-eef5d076aa5f', '1566577739112-5180d4bf9390',
    '1580234811497-9df7fd2f357e', '1579373903781-fd5c0c30c4cd', '1585620385456-4759f9b5c7d6'
  ],
  entertainment: [
    '1489599849927-2ee91cede3ba', '1478720568477-152d9b164e26', '1517604931442-7e0c8ed2963c',
    '1460661419201-fd4cecdf8a8b', '1499364615650-ec38552f4f34', '1514306191717-452ec28c7814',
    '1524712245354-2c4e5e7121c0', '1485846234645-a62644f84728', '1518929458119-e5bf404ecb0f',
    '1574267432553-4b4628081c31', '1536440136628-849c177e76a1', '1470225620780-dba8ba36b745'
  ],
  celebrity: [
    '1516450360452-9312f5e86fc7', '1489599849927-2ee91cede3ba', '1485846234645-a62644f84728',
    '1478720568477-152d9b164e26', '1514306191717-452ec28c7814', '1501281668745-f7f57925c3b4',
    '1469488865564-c2de10f69f96', '1534528741775-53994a69daeb', '1507003211169-0a1dd7228f2d',
    '1492562080023-ab3db95bfbce', '1529626455594-4ff0802cfb7e', '1508214751196-bcfd4ca60f91'
  ],
  news: [
    '1504711434969-e33886168f5c', '1585829365295-ab7cd400c167', '1526470608268-f674ce90ebd4',
    '1495020689067-958852a7765e', '1586339949916-3e945abeb610', '1504465039710-0f4999a4bc13',
    '1523995462485-3d171b5c8fa9', '1457369804613-52c61a468e7d', '1572949645841-094f3a9c4c94',
    '1508780709619-79562169bc64', '1451187580459-43490279c0fa', '1505373877841-8d25f7d46678'
  ],
  others: [
    '1500382017468-9049fed747ef', '1505691938895-1758d7feb511', '1496181133206-80ce9b88a853',
    '1484480974693-6ca0a78fb36b', '1513151233558-d860c5398176', '1513694203232-719a280e022f',
    '1497366216548-37526070297c', '1519671482749-fd09be7ccebf', '1501785888041-af3ef285b470',
    '1507525428034-b723cf961d3e', '1476514525535-07fb3b4ae5f1', '1533105079780-92b9be482077'
  ]
};

async function main() {
  const files = fs.readdirSync(articlesDir).filter(f => f.endsWith('.html'));
  console.log(`Auditing ${files.length} articles for secondary visual integration...`);

  // Pre-load category candidate pools to minimize API calls
  const categoryPools = {};
  const categories = ['business', 'health', 'technology', 'games', 'entertainment', 'celebrity', 'news', 'others'];

  console.log('Pre-fetching diverse category photo batches from Unsplash...');
  for (const cat of categories) {
    let query = cat;
    if (cat === 'business') query = 'business finance investment office';
    else if (cat === 'health') query = 'health wellness nutrition medical';
    else if (cat === 'technology') query = 'modern technology computer gadgets';
    else if (cat === 'games') query = 'video gaming setup console esports';
    else if (cat === 'entertainment') query = 'cinema film entertainment production';
    else if (cat === 'celebrity') query = 'celebrity event spotlight red carpet';
    else if (cat === 'news') query = 'journalism media news press report';
    else if (cat === 'others') query = 'lifestyle architecture travel home';

    const results = await searchUnsplash(query, 30);
    categoryPools[cat] = results;
    console.log(`- Category [${cat}]: loaded ${results.length} photos.`);
    // Gentle pause
    await new Promise(r => setTimeout(r, 400));
  }

  let processedCount = 0;
  let alreadyHadCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const slug = file.replace('.html', '');
    const filePath = path.join(articlesDir, file);
    const rootPath = path.join(ROOT_DIR, file);
    let html = fs.readFileSync(filePath, 'utf8');

    // Check if secondary figure is already present in html
    if (html.includes('class="article-mid-media"') || html.includes(`${slug}-2.jpg`)) {
      alreadyHadCount++;
      continue;
    }

    // Extract title
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s*\|\s*GenAlpha.*$/, '').trim() : slug.replace(/-/g, ' ');

    // Extract category
    const catMatch = html.match(/class="article-category-badge">([A-Z\s]+)/i) || html.match(/<meta property="article:section" content="([^"]+)"/i);
    let category = 'others';
    if (catMatch) {
      const rawCat = catMatch[1].replace(/•[\s\S]*$/, '').trim().toLowerCase();
      if (categories.includes(rawCat)) category = rawCat;
    }

    // Extract all H2 headings in the body (excluding FAQ and Final Thoughts)
    const h2Matches = Array.from(html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi))
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(h => !/Frequently Asked Questions|FAQ|Final Thoughts/i.test(h));

    // Target section for mid-image placement: 2nd H2 heading (or 1st if only 1 exists)
    const targetH2 = h2Matches.length >= 2 ? h2Matches[1] : (h2Matches[0] || rawTitle);

    // Target filename & path
    const targetImgFilename = `${slug}-2.jpg`;
    const targetImgPath = path.join(imgDir, targetImgFilename);
    const tempDest = `${targetImgPath}.tmp`;

    let imageAcquired = false;

    // 1. If file already exists locally and is valid & unique
    if (fs.existsSync(targetImgPath) && fs.statSync(targetImgPath).size > 10000) {
      const h = computeHash(targetImgPath);
      if (h) existingHashes.add(h);
      imageAcquired = true;
    }

    // 2. Try to get a photo from category pre-fetched pool
    if (!imageAcquired && categoryPools[category] && categoryPools[category].length > 0) {
      const pool = categoryPools[category];
      for (const item of pool) {
        if (!item || !item.id || usedPhotoIds.has(item.id.toLowerCase())) continue;
        const photoUrl = item.urls && (item.urls.regular || item.urls.small || item.urls.raw);
        if (!photoUrl) continue;

        const downloadUrl = `${photoUrl.split('?')[0]}?auto=format&fit=crop&w=1200&h=675&q=80`;
        try {
          await downloadImage(downloadUrl, tempDest);
          if (fs.existsSync(tempDest) && fs.statSync(tempDest).size > 10000) {
            const h = computeHash(tempDest);
            if (h && !existingHashes.has(h)) {
              existingHashes.add(h);
              usedPhotoIds.add(item.id.toLowerCase());
              fs.renameSync(tempDest, targetImgPath);
              imageAcquired = true;
              break;
            } else {
              try { fs.unlinkSync(tempDest); } catch(e) {}
            }
          }
        } catch (e) {
          try { if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest); } catch(e) {}
        }
      }
    }

    // 2b. If category pool was exhausted, search Unsplash specifically for this topic
    if (!imageAcquired) {
      const topicKeywords = rawTitle.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 3).join(' ');
      if (topicKeywords) {
        const directResults = await searchUnsplash(topicKeywords, 10);
        for (const item of directResults) {
          if (!item || !item.id || usedPhotoIds.has(item.id.toLowerCase())) continue;
          const photoUrl = item.urls && (item.urls.regular || item.urls.small || item.urls.raw);
          if (!photoUrl) continue;
          const downloadUrl = `${photoUrl.split('?')[0]}?auto=format&fit=crop&w=1200&h=675&q=80`;
          try {
            await downloadImage(downloadUrl, tempDest);
            if (fs.existsSync(tempDest) && fs.statSync(tempDest).size > 10000) {
              const h = computeHash(tempDest);
              if (h && !existingHashes.has(h)) {
                existingHashes.add(h);
                usedPhotoIds.add(item.id.toLowerCase());
                fs.renameSync(tempDest, targetImgPath);
                imageAcquired = true;
                break;
              } else {
                try { fs.unlinkSync(tempDest); } catch(e) {}
              }
            }
          } catch (e) {
            try { if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest); } catch(e) {}
          }
        }
      }
    }

    // 3. Fallback to curated backup pools
    if (!imageAcquired) {
      const backupList = BACKUP_POOLS[category] || BACKUP_POOLS.others;
      for (const picId of backupList) {
        if (usedPhotoIds.has(picId.toLowerCase())) continue;
        const photoUrl = `https://images.unsplash.com/photo-${picId}?auto=format&fit=crop&w=1200&h=675&q=80`;
        try {
          await downloadImage(photoUrl, tempDest);
          if (fs.existsSync(tempDest) && fs.statSync(tempDest).size > 8000) {
            const h = computeHash(tempDest);
            if (h && !existingHashes.has(h)) {
              existingHashes.add(h);
              usedPhotoIds.add(picId.toLowerCase());
              fs.renameSync(tempDest, targetImgPath);
              imageAcquired = true;
              break;
            } else {
              try { fs.unlinkSync(tempDest); } catch(e) {}
            }
          }
        } catch (e) {
          try { if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest); } catch(e) {}
        }
      }
    }

    if (!imageAcquired) {
      console.warn(`[WARN] Could not acquire unique image for: ${slug}`);
      continue;
    }

    // SEO-Optimized Alt text and Captions
    const cleanH2Text = targetH2.replace(/[:—–].*$/, '').trim();
    const altText = `Detailed visual breakdown of ${cleanH2Text} - ${rawTitle}`;
    const captionText = `${cleanH2Text}: Key insights and practical application.`;

    // Mid-Article Figure for articles/<slug>.html (using relative path ../assets/images/)
    const articleMidFigureHtml = `
        <figure class="article-mid-media" style="margin: 2.5rem 0; position: relative;">
          <div style="aspect-ratio: 16/9; overflow: hidden; border-radius: var(--radius-md);">
            <img src="../assets/images/${targetImgFilename}" alt="${altText}" width="1200" height="675" loading="lazy" decoding="async" style="width: 100%; height: 100%; object-fit: cover;">
          </div>
          <figcaption style="font-size: 0.85rem; color: var(--text-muted); padding: 0.6rem 0.25rem 0.5rem; border-bottom: 1px solid var(--border-color);">${captionText}</figcaption>
        </figure>\n`;

    // Mid-Article Figure for root <slug>.html (using relative path ./assets/images/)
    const rootMidFigureHtml = `
        <figure class="article-mid-media" style="margin: 2.5rem 0; position: relative;">
          <div style="aspect-ratio: 16/9; overflow: hidden; border-radius: var(--radius-md);">
            <img src="./assets/images/${targetImgFilename}" alt="${altText}" width="1200" height="675" loading="lazy" decoding="async" style="width: 100%; height: 100%; object-fit: cover;">
          </div>
          <figcaption style="font-size: 0.85rem; color: var(--text-muted); padding: 0.6rem 0.25rem 0.5rem; border-bottom: 1px solid var(--border-color);">${captionText}</figcaption>
        </figure>\n`;

    // Placement: Find target H2 heading tag
    // Search for the 2nd H2 heading in the HTML
    const allH2Tags = Array.from(html.matchAll(/<h2[^>]*>[\s\S]*?<\/h2>/gi));
    let insertionTarget = null;
    if (allH2Tags.length >= 3) {
      // Insertion before 2nd or 3rd H2 heading
      insertionTarget = allH2Tags[1][0];
    } else if (allH2Tags.length >= 2) {
      insertionTarget = allH2Tags[0][0];
    }

    if (insertionTarget && html.includes(insertionTarget)) {
      html = html.replace(insertionTarget, `${articleMidFigureHtml}\n        ${insertionTarget}`);
    } else {
      // Fallback: before author box
      html = html.replace('<section class="author-box">', `${articleMidFigureHtml}\n        <section class="author-box">`);
    }

    // Write updated articles/<slug>.html
    fs.writeFileSync(filePath, html, 'utf8');

    // Build root mirror version (replace ../assets/ with ./assets/)
    let rootHtml = html.replace(`../assets/images/${targetImgFilename}`, `./assets/images/${targetImgFilename}`);
    fs.writeFileSync(rootPath, rootHtml, 'utf8');

    processedCount++;
    console.log(`[${processedCount}/${files.length}] Added secondary image to: ${slug}`);
  }

  console.log(`\n=== Secondary Image Processing Complete ===`);
  console.log(`- Newly added: ${processedCount}`);
  console.log(`- Already had secondary visual: ${alreadyHadCount}`);
  console.log(`- Total unique image hashes on site: ${existingHashes.size}`);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
