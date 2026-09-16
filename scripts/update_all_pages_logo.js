const fs = require('fs');
const path = require('path');

// Extract SVG logo from index.html
const indexHtml = fs.readFileSync('index.html', 'utf8');

// Match header SVG
const headerMatch = indexHtml.match(/(<a href="\/" class="brand-logo"[\s\S]*?<div class="creative-logo-badge">\s*)(<svg[\s\S]*?<\/svg>)(\s*<\/div>)/i);
// Match footer SVG
const footerMatch = indexHtml.match(/(<a href="\/" class="footer-logo"[\s\S]*?<div class="creative-logo-badge">\s*)(<svg[\s\S]*?<\/svg>)(\s*<\/div>)/i);

if (!headerMatch || !footerMatch) {
  console.error('Could not extract header or footer SVG from index.html');
  process.exit(1);
}

const headerSvg = headerMatch[2];
const footerSvg = footerMatch[2];

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
  let modified = false;

  // Replace header logo SVG inside .brand-logo .creative-logo-badge
  const hRegex = /(<a href="[^"]*" class="brand-logo"[\s\S]*?<div class="creative-logo-badge">\s*)(<svg[\s\S]*?<\/svg>)(\s*<\/div>)/gi;
  if (hRegex.test(content)) {
    content = content.replace(hRegex, `$1${headerSvg}$3`);
    modified = true;
  }

  // Replace footer logo SVG inside .footer-logo .creative-logo-badge
  const fRegex = /(<a href="[^"]*" class="footer-logo"[\s\S]*?<div class="creative-logo-badge">\s*)(<svg[\s\S]*?<\/svg>)(\s*<\/div>)/gi;
  if (fRegex.test(content)) {
    content = content.replace(fRegex, `$1${footerSvg}$3`);
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(file, content, 'utf8');
    updatedCount++;
  }
});

console.log(`Updated new SVG logo in ${updatedCount} HTML files across all pages and categories!`);
