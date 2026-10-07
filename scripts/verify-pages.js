const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
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

console.log('--- AUDITING PAGES CONTENT & WORD COUNT (TARGET: 1000 - 1500 WORDS) ---');
files.forEach(f => {
  const filePath = path.join(ROOT_DIR, 'pages', f);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${filePath}`);
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
  
  if (!inRange || !hasEmail) allValid = false;
  
  console.log(`${f.padEnd(25)} | Words: ${String(wordCount).padStart(4)} | In 1000-1500: ${inRange ? 'YES' : 'NO'} | Has Email: ${hasEmail ? 'YES' : 'NO'}`);
});

console.log('\nFinal Status:', allValid ? 'ALL 7 PAGES PERFECTLY COMPLIANT' : 'FAILURE DETECTED');
process.exit(allValid ? 0 : 1);
