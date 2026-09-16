const fs = require('fs');
const path = require('path');

console.log('--- STARTING COMPREHENSIVE SEO AUDIT REPAIR ---');

// 1. Broken / 403 / 429 External Link Replacements
const brokenExternalLinks = {
  'https://www.niddk.nih.gov/health-information/weight-management/losing-weight': 'https://www.cdc.gov/healthyweight/losing_weight/index.html',
  'https://en.wikipedia.org/wiki/Software_development_tool': 'https://www.gnu.org/software/software.html',
  'https://en.wikipedia.org/wiki/Online_gambling': 'https://www.britannica.com/topic/gambling',
  'https://www.theasc.com/': 'https://en.wikipedia.org/wiki/American_Society_of_Cinematographers',
  'https://www.theasc.com': 'https://en.wikipedia.org/wiki/American_Society_of_Cinematographers',
  'https://www.cisa.gov/news-events/news/cisa-releases-secure-our-school-recommendations': 'https://www.cisa.gov/topics/cybersecurity-best-practices'
};

// 2. 308 Redirect Category Links
const redirectCategoryLinks = {
  '/category-ai': '/category-technology',
  '/category-cloud': '/category-technology',
  '/category-security': '/category-technology',
  'href="/category-ai"': 'href="/category-technology"',
  'href="/category-cloud"': 'href="/category-technology"',
  'href="/category-security"': 'href="/category-technology"'
};

function getAllHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === 'brain') continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllHtmlFiles(filePath, fileList);
    } else if (file.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const allHtmlFiles = getAllHtmlFiles('.');
let totalBrokenLinksFixed = 0;
let totalRedirectsFixed = 0;
let totalHeadingHierarchyFixed = 0;

allHtmlFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // A. Fix broken / 403 / 429 external links
  for (const [badUrl, goodUrl] of Object.entries(brokenExternalLinks)) {
    if (content.includes(badUrl)) {
      content = content.replaceAll(badUrl, goodUrl);
      totalBrokenLinksFixed++;
    }
  }

  // B. Fix 308 permanent redirect category links
  for (const [badCat, goodCat] of Object.entries(redirectCategoryLinks)) {
    if (content.includes(badCat)) {
      content = content.replaceAll(badCat, goodCat);
      totalRedirectsFixed++;
    }
  }

  // C. Standardize Heading Hierarchy (flatten h4 / h5 inside article body to clean h3 / strong tags)
  if (content.includes('<div class="article-body">')) {
    const bodyStart = content.indexOf('<div class="article-body">');
    const bodyEnd = content.indexOf('</div>', bodyStart + 500);

    let articleBody = content.substring(bodyStart);
    let originalBody = articleBody;

    // Convert h5 to h3 or strong label for clean structure
    articleBody = articleBody.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '<p style="font-weight: 700; color: var(--primary); margin-top: 1rem; margin-bottom: 0.4rem;">$1</p>');
    // Convert deep h4 to h3 to eliminate level-skipping warning
    articleBody = articleBody.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '<h3>$1</h3>');

    if (articleBody !== originalBody) {
      content = content.substring(0, bodyStart) + articleBody;
      totalHeadingHierarchyFixed++;
    }
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
  }
});

console.log(`Summary of Repairs:
- Broken / 403 / 429 Links Fixed: ${totalBrokenLinksFixed}
- 308 Permanent Redirects Fixed: ${totalRedirectsFixed}
- Heading Hierarchy & Readability Fixed: ${totalHeadingHierarchyFixed} pages
`);
