const fs = require('fs');
const path = require('path');

console.log('Starting SEO Audit Issue Fixes...');

// 1. Fix Broken & Blocked External Links map
const externalUrlReplacements = {
  'https://www.niddk.nih.gov/health-information/weight-management/losing-weight': 'https://www.cdc.gov/healthyweight/losing_weight/index.html',
  'https://en.wikipedia.org/wiki/Software_development_tool': 'https://www.gnu.org/software/software.html',
  'https://en.wikipedia.org/wiki/Online_gambling': 'https://www.britannica.com/topic/gambling',
  'https://www.theasc.com/': 'https://en.wikipedia.org/wiki/American_Society_of_Cinematographers',
  'https://www.theasc.com': 'https://en.wikipedia.org/wiki/American_Society_of_Cinematographers',
  'https://www.cisa.gov/news-events/news/cisa-releases-secure-our-school-recommendations': 'https://www.cisa.gov/topics/cybersecurity-best-practices'
};

// 2. Fix 308 Redirect Category Links
const categoryRedirectReplacements = {
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
let fixedLinksCount = 0;
let fixedHeadingsCount = 0;

allHtmlFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // A. Replace broken / 403 / 429 external links
  for (const [badUrl, goodUrl] of Object.entries(externalUrlReplacements)) {
    if (content.includes(badUrl)) {
      content = content.replaceAll(badUrl, goodUrl);
      fixedLinksCount++;
    }
  }

  // B. Replace 308 redirected internal links
  for (const [badCat, goodCat] of Object.entries(categoryRedirectReplacements)) {
    if (content.includes(badCat)) {
      content = content.replaceAll(badCat, goodCat);
      fixedLinksCount++;
    }
  }

  // C. Fix Heading Hierarchy inside article-body container
  // Standardize: First level headings inside .article-body MUST be <h2>, not <h3>!
  if (content.includes('<div class="article-body">')) {
    const bodyStart = content.indexOf('<div class="article-body">');
    const bodyEnd = content.indexOf('</div>', bodyStart + 500); // or bottom section

    let articleBody = content.substring(bodyStart);
    let originalBody = articleBody;

    // Fix H1 -> H3 skipping by ensuring top level section headings in body are <h2>
    // If an <h3> appears before any <h2> in article-body, change top level <h3> to <h2>
    let hasH2 = articleBody.includes('<h2>');
    if (!hasH2) {
      articleBody = articleBody.replace(/<h3([^>]*)>/gi, '<h2$1>').replace(/<\/h3>/gi, '</h2>');
    }

    if (articleBody !== originalBody) {
      content = content.substring(0, bodyStart) + articleBody;
      fixedHeadingsCount++;
    }
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
  }
});

console.log(`SEO Issue Fix Completed! Links fixed: ${fixedLinksCount}, Heading hierarchies fixed: ${fixedHeadingsCount}`);
