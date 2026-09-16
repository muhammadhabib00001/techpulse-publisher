const fs = require('fs');
const path = require('path');

const indexHtml = fs.readFileSync('index.html', 'utf8');

// Extract footer grid HTML from index.html
const fGridMatch = indexHtml.match(/(<div class="container footer-grid">[\s\S]*?<\/div>\s*<\/div>\s*<div class="container footer-bottom">)/i);
if (!fGridMatch) {
  console.error('Could not extract footer grid from index.html');
  process.exit(1);
}

const footerGridHtml = fGridMatch[1];

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
let updatedCount = 0;

allHtmlFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace footer grid
  const fRegex = /(<div class="container footer-grid">[\s\S]*?<\/div>\s*<\/div>\s*<div class="container footer-bottom">)/gi;
  if (fRegex.test(content)) {
    content = content.replace(fRegex, footerGridHtml);
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    updatedCount++;
  }
});

console.log(`Updated Footer with Feeds & Sitemaps links across ${updatedCount} HTML files!`);
