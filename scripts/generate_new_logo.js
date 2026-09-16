const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Professional SVG Badge template function with unique prefix to avoid gradient collisions
function getSvgContent(prefix) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <defs>
    <radialGradient id="${prefix}_bg" cx="50%" cy="32%" r="68%">
      <stop offset="0%" stop-color="#ef4444" />
      <stop offset="55%" stop-color="#dc2626" />
      <stop offset="100%" stop-color="#7f1d1d" />
    </radialGradient>
    <linearGradient id="${prefix}_gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
    <linearGradient id="${prefix}_silver" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="60%" stop-color="#f1f5f9" />
      <stop offset="100%" stop-color="#cbd5e1" />
    </linearGradient>
    <filter id="${prefix}_glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Outer Shield / Hex Ring -->
  <rect x="6" y="6" width="88" height="88" rx="22" fill="url(#${prefix}_gold)" />
  <rect x="9" y="9" width="82" height="82" rx="19" fill="#0f172a" />
  <rect x="11" y="11" width="78" height="78" rx="17" fill="url(#${prefix}_bg)" />
  
  <!-- Subtle High-tech Grid / Glass Highlight -->
  <path d="M 11 28 Q 50 12 89 28 L 89 11 L 11 11 Z" fill="#ffffff" opacity="0.12" />

  <!-- Stylized Alpha Emblem 'α' + Crest -->
  <g transform="translate(0, 1)">
    <!-- Back Wing / G Loop -->
    <path d="M 50 22 C 34 22 24 34 24 50 C 24 66 35 76 50 76 C 64 76 74 66 74 52 C 74 42 67 36 58 36 C 50 36 44 42 44 50 C 44 57 49 61 56 61 L 56 52 L 64 52" 
          fill="none" stroke="url(#${prefix}_gold)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />

    <!-- Core Dynamic Alpha Swash -->
    <path d="M 32 68 Q 50 24 68 68" 
          fill="none" stroke="url(#${prefix}_silver)" stroke-width="7" stroke-linecap="round" filter="url(#${prefix}_glow)" />

    <!-- Center Crest Star Emblem -->
    <polygon points="50,27 53,35 61,35 55,40 57,48 50,43 43,48 45,40 39,35 47,35" fill="url(#${prefix}_gold)" />
  </g>
</svg>`;
}

async function generateAssets() {
  console.log('Generating SVG logos and favicons...');
  
  const headerSvg = getSvgContent('hdrLogo');
  const footerSvg = getSvgContent('ftrLogo');
  const faviconSvg = getSvgContent('favLogo');

  // Write SVGs to disk
  fs.writeFileSync('assets/images/logo.svg', headerSvg, 'utf8');
  fs.writeFileSync('assets/images/favicon.svg', faviconSvg, 'utf8');

  // Convert favicon SVG to PNG sizes using sharp
  const buffer = Buffer.from(faviconSvg);

  await sharp(buffer).resize(16, 16).png().toFile('assets/images/favicon-16x16.png');
  await sharp(buffer).resize(32, 32).png().toFile('assets/images/favicon-32x32.png');
  await sharp(buffer).resize(48, 48).png().toFile('assets/images/favicon-48x48.png');
  await sharp(buffer).resize(180, 180).png().toFile('assets/images/apple-touch-icon.png');
  await sharp(buffer).resize(32, 32).toFile('favicon.ico');

  console.log('Favicon PNG assets generated cleanly (16x16, 32x32, 48x48, 180x180, favicon.ico)');

  // Now replace inline SVGs in index.html & scripts/sync_articles.js
  let indexHtml = fs.readFileSync('index.html', 'utf8');

  // Replace header badge SVG
  const headerBadgeRegex = /(<div class="creative-logo-badge">\s*)(<svg[\s\S]*?<\/svg>)(\s*<\/div>)/i;
  if (headerBadgeRegex.test(indexHtml)) {
    indexHtml = indexHtml.replace(headerBadgeRegex, `$1${headerSvg}$3`);
  }

  // Replace footer badge SVG
  const footerBadgeRegex = /(<a href="\/" class="footer-logo"[\s\S]*?<div class="creative-logo-badge">\s*)(<svg[\s\S]*?<\/svg>)(\s*<\/div>)/i;
  if (footerBadgeRegex.test(indexHtml)) {
    indexHtml = indexHtml.replace(footerBadgeRegex, `$1${footerSvg}$3`);
  }

  fs.writeFileSync('index.html', indexHtml, 'utf8');
  console.log('Updated index.html with new SVG logo badge!');

  // Also update sync_articles.js if it contains badge SVGs
  let syncScript = fs.readFileSync('scripts/sync_articles.js', 'utf8');
  if (headerBadgeRegex.test(syncScript)) {
    syncScript = syncScript.replace(headerBadgeRegex, `$1${headerSvg}$3`);
    fs.writeFileSync('scripts/sync_articles.js', syncScript, 'utf8');
    console.log('Updated scripts/sync_articles.js with new SVG logo!');
  }
}

generateAssets().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
