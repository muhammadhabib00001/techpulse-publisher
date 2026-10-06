const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const BANNED_WORDS = [
  'delve', 'tapestry', 'multifaceted', 'nuanced', 'landscape',
  'pivotal', 'crucial', 'leverage', 'robust', 'streamline',
  'utilize', 'facilitate', 'endeavor', 'paramount', 'foster',
  'harness', 'embark', 'unveil', 'elevate', 'enhance', 'unlock',
  'unleash', 'revolutionize', 'resonate', 'tailored', 'cutting-edge',
  'game changer', 'transformative', 'seamless', 'invaluable',
  'cornerstone', 'showcase', 'illuminate', 'underscore'
];

const BANNED_PHRASES = [
  "it's worth noting that",
  "it's important to note",
  "it is important to understand",
  "in today's digital age",
  "in today's world",
  "in the era of",
  "in the realm of",
  "when it comes to",
  "at the end of the day",
  "one might argue",
  "it goes without saying",
  "needless to say",
  "that being said",
  "with that in mind",
  "in light of this",
  "as mentioned earlier",
  "this highlights the importance",
  "this underscores",
  "a testament to",
  "plays a crucial role",
  "everything you need to know"
];

let totalViolations = 0;

function scanText(filePath, text) {
  const lower = text.toLowerCase();
  const fileErrs = [];

  // Check em dash
  if (text.includes('—')) {
    fileErrs.push(`Forbidden em dash (—) found!`);
  }

  // Check banned phrases
  BANNED_PHRASES.forEach(phrase => {
    if (lower.includes(phrase)) {
      fileErrs.push(`Banned phrase found: "${phrase}"`);
    }
  });

  // Check banned words
  BANNED_WORDS.forEach(word => {
    const reg = new RegExp(`\\b${word}\\b`, 'i');
    if (reg.test(lower)) {
      fileErrs.push(`Banned AI word found: "${word}"`);
    }
  });

  if (fileErrs.length > 0) {
    console.error(`\n❌ Violations in ${path.relative(ROOT_DIR, filePath)}:`);
    fileErrs.forEach(err => console.error(`   - ${err}`));
    totalViolations += fileErrs.length;
  }
}

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.github'].includes(entry.name)) continue;
      scanDir(full);
    } else if (entry.isFile()) {
      if (['.html', '.json', '.js', '.txt', '.xml'].includes(path.extname(entry.name))) {
        // Skip prompt reference files and audit scripts
        if (entry.name.includes('prompt') || entry.name.includes('audit-newsroom')) continue;
        const content = fs.readFileSync(full, 'utf8');
        scanText(full, content);
      }
    }
  }
}

console.log('Running Newsroom Quality & Blacklist Audit...');
scanDir(path.join(ROOT_DIR, 'data'));
scanDir(path.join(ROOT_DIR, 'articles'));
scanDir(path.join(ROOT_DIR, 'categories'));
scanDir(path.join(ROOT_DIR, 'author'));
scanDir(path.join(ROOT_DIR, 'pages'));
scanDir(path.join(ROOT_DIR, 'en'));
scanDir(path.join(ROOT_DIR, 'es'));
scanDir(path.join(ROOT_DIR, 'de'));
scanDir(path.join(ROOT_DIR, 'fr'));
scanDir(path.join(ROOT_DIR, 'pt'));
scanDir(path.join(ROOT_DIR, 'ar'));
scanDir(path.join(ROOT_DIR, 'hi'));
scanDir(path.join(ROOT_DIR, 'it'));

if (totalViolations === 0) {
  console.log('\n✅ AUDIT PASSED 100%! Zero banned words and zero em dashes detected across all files.');
} else {
  console.error(`\n❌ AUDIT FAILED with ${totalViolations} violations.`);
  process.exit(1);
}
