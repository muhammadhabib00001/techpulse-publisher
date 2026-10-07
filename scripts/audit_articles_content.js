const fs = require('fs');
const path = require('path');

const articlesPath = path.join(__dirname, '../data/articles.json');
const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));

// Dynamically target every single article published in articles.json to ensure 100% policy enforcement
const TARGET_SLUGS = articles.map(a => a.slug);

const LANGUAGES = ['en', 'es', 'de', 'fr', 'pt', 'ar', 'hi', 'it'];

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

let errors = 0;
let checkedCount = 0;

TARGET_SLUGS.forEach(slug => {
  const art = articles.find(a => a.slug === slug);
  if (!art) {
    console.error(`ERROR: Target article with slug "${slug}" not found in articles.json!`);
    errors++;
    return;
  }

  LANGUAGES.forEach(lang => {
    checkedCount++;
    const trans = (art.translations && art.translations[lang]) || (lang === 'en' ? art : null);
    if (!trans) {
      console.error(`[${slug}] [${lang}]: MISSING translation object!`);
      errors++;
      return;
    }

    const { title, deck, content, faqs } = trans;

    if (!title || title.trim().length === 0) {
      console.error(`[${slug}] [${lang}]: Empty title!`);
      errors++;
    }

    if (!deck || deck.trim().length === 0) {
      console.error(`[${slug}] [${lang}]: Empty deck/excerpt!`);
      errors++;
    }

    if (!content || content.trim().length === 0) {
      console.error(`[${slug}] [${lang}]: Empty content!`);
      errors++;
      return;
    }

    // Word count calculation
    const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = plainText.split(/\s+/).filter(Boolean).length;
    if (words < 800) {
      console.error(`[${slug}] [${lang}]: Word count is ${words} (< 800 required)!`);
      errors++;
    }

    // FAQs check
    if (!faqs || !Array.isArray(faqs)) {
      console.error(`[${slug}] [${lang}]: FAQs is not an array!`);
      errors++;
    } else if (faqs.length < 3) {
      console.error(`[${slug}] [${lang}]: FAQs count is ${faqs.length} (< 3 required)!`);
      errors++;
    } else {
      faqs.forEach((faq, idx) => {
        if (!faq.question || !faq.question.trim()) {
          console.error(`[${slug}] [${lang}]: FAQ ${idx + 1} has empty question!`);
          errors++;
        }
        if (!faq.answer || !faq.answer.trim()) {
          console.error(`[${slug}] [${lang}]: FAQ ${idx + 1} has empty answer!`);
          errors++;
        }
      });
    }

    // Em dash check
    const fullText = `${title} ${deck} ${content} ${JSON.stringify(faqs || [])}`;
    if (fullText.includes('—')) {
      console.error(`[${slug}] [${lang}]: Contains forbidden em dash (—)!`);
      errors++;
    }

    // Banned words & phrases check
    const lower = fullText.toLowerCase();
    BANNED_PHRASES.forEach(phrase => {
      if (lower.includes(phrase)) {
        console.error(`[${slug}] [${lang}]: Banned phrase found: "${phrase}"`);
        errors++;
      }
    });

    BANNED_WORDS.forEach(word => {
      const reg = new RegExp(`\\b${word}\\b`, 'i');
      if (reg.test(fullText)) {
        console.error(`[${slug}] [${lang}]: Banned word found: "${word}"`);
        errors++;
      }
    });

    console.log(`[PASS] ${slug} [${lang}]: ${words} words, ${(faqs||[]).length} FAQs`);
  });
});

console.log(`\n================================`);
console.log(`Audited ${checkedCount} target articles across languages.`);
if (errors > 0) {
  console.error(`FAILED with ${errors} error(s)!`);
  process.exit(1);
} else {
  console.log(`ALL 48 ARTICLES PASSED WITH 100% COMPLIANCE!`);
  process.exit(0);
}
