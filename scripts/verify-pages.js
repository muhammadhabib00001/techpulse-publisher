const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const languages = ['en', 'es', 'de', 'fr', 'pt', 'ar', 'hi', 'it'];
const files = [
  'privacy-policy.html',
  'terms.html',
  'contact.html',
  'editorial-policy.html',
  'fact-checking.html',
  'corrections.html',
  'about.html'
];

let allValid = true;
let totalChecked = 0;

console.log('--- AUDITING MULTILINGUAL POLICY PAGES (8 LANGUAGES x 7 PAGES = 56 PAGES) ---');

languages.forEach(lang => {
  console.log(`\nEdition [${lang.toUpperCase()}]:`);
  files.forEach(f => {
    totalChecked++;
    const filePath = lang === 'en'
      ? path.join(ROOT_DIR, 'pages', f)
      : path.join(ROOT_DIR, lang, 'pages', f);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ Missing file: ${filePath}`);
      allValid = false;
      return;
    }
    const html = fs.readFileSync(filePath, 'utf8');
    
    // Extract body content inside <div class="article-body">
    const bodyMatch = html.match(/<div class="article-body">([\s\S]*?)<\/div>\s*<\/div>\s*<\/main>/i);
    const articleBody = bodyMatch ? bodyMatch[1] : html;
    const cleanText = articleBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = cleanText.split(' ').filter(Boolean).length;
    
    const hasEmail = html.includes('intouchmagazines@gmail.com');
    const inRange = wordCount >= 1000 && wordCount <= 1500;
    const hasEmDash = html.includes('—');
    
    if (!inRange || !hasEmail || hasEmDash) {
      allValid = false;
      console.error(`❌ ${f.padEnd(25)} | Words: ${String(wordCount).padStart(4)} | In 1000-1500: ${inRange ? 'YES' : 'NO'} | Has Email: ${hasEmail ? 'YES' : 'NO'} | EmDash: ${hasEmDash ? 'FOUND' : 'CLEAN'}`);
    } else {
      console.log(`✅ ${f.padEnd(25)} | Words: ${String(wordCount).padStart(4)} | Range: OK | Email: OK`);
    }
  });
});

console.log(`\nAudit Complete: ${totalChecked} pages checked across 8 editions.`);
console.log('Final Status:', allValid ? 'ALL 56 PAGES 100% COMPLIANT' : 'FAILURE DETECTED');
process.exit(allValid ? 0 : 1);
