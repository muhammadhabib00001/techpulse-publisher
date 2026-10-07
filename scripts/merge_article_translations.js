const fs = require('fs');
const path = require('path');

const articlesPath = path.join(__dirname, '../data/articles.json');
const articlesDir = path.join(__dirname, '../data/articles_translations');

const raw = fs.readFileSync(articlesPath, 'utf8');
const articles = JSON.parse(raw);

const LANGUAGES = ['en', 'es', 'de', 'fr', 'pt', 'ar', 'hi', 'it'];

const loadedTranslations = {};

LANGUAGES.forEach(lang => {
  const filePath = path.join(articlesDir, `${lang}_articles.js`);
  if (fs.existsSync(filePath)) {
    try {
      loadedTranslations[lang] = require(filePath);
      console.log(`Loaded ${lang}_articles.js successfully.`);
    } catch (e) {
      console.error(`Error loading ${lang}_articles.js:`, e.message);
    }
  } else {
    console.warn(`File not found: ${lang}_articles.js`);
  }
});

let updatedCount = 0;

articles.forEach(art => {
  const slug = art.slug;
  art.translations = art.translations || {};

  LANGUAGES.forEach(lang => {
    if (loadedTranslations[lang] && loadedTranslations[lang][slug]) {
      const data = loadedTranslations[lang][slug];
      art.translations[lang] = {
        title: data.title,
        deck: data.deck,
        content: data.content,
        faqs: data.faqs || []
      };

      if (lang === 'en') {
        art.title = data.title;
        art.deck = data.deck;
        art.excerpt = data.deck;
        art.content = data.content;
        art.faqs = data.faqs || [];
      }
      updatedCount++;
    }
  });
});

fs.writeFileSync(articlesPath, JSON.stringify(articles, null, 2), 'utf8');
console.log(`Merged translations into data/articles.json. Total translation updates: ${updatedCount}`);
