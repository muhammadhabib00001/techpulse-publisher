const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.genalphamagazines.com';
const articles = JSON.parse(fs.readFileSync('data/articles.json', 'utf8'));

// 1. Generate Google News Sitemap (news-sitemap.xml)
let newsXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
`;

articles.forEach(art => {
  const pubDate = art.publishedAt || (art.date ? `${art.date}T08:00:00Z` : new Date().toISOString());
  const titleEsc = (art.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  newsXml += `  <url>
    <loc>${BASE_URL}/${art.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>GenAlphaMagazines</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${titleEsc}</news:title>
    </news:news>
  </url>
`;
});

newsXml += `</urlset>\n`;

fs.writeFileSync('news-sitemap.xml', newsXml, 'utf8');
console.log(`Generated news-sitemap.xml with ${articles.length} news entries.`);

// 2. Generate RSS 2.0 Feed (rss.xml / feed.xml)
let rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>GenAlphaMagazines - Positively Local Community News</title>
    <link>${BASE_URL}/</link>
    <description>Positively local community news, regional arts, small business profiles, lifestyle guides, and thoughtful columnist perspectives.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml" />
`;

articles.slice(0, 30).forEach(art => {
  const titleEsc = (art.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const descEsc = (art.excerpt || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pubDate = art.publishedAt ? new Date(art.publishedAt).toUTCString() : (art.date ? new Date(art.date).toUTCString() : new Date().toUTCString());

  rssXml += `    <item>
      <title>${titleEsc}</title>
      <link>${BASE_URL}/${art.slug}</link>
      <guid isPermaLink="true">${BASE_URL}/${art.slug}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${descEsc}</description>
      <category>${(art.category || 'News').toUpperCase()}</category>
    </item>
`;
});

rssXml += `  </channel>
</rss>\n`;

fs.writeFileSync('rss.xml', rssXml, 'utf8');
fs.writeFileSync('feed.xml', rssXml, 'utf8');
console.log('Generated rss.xml and feed.xml RSS feeds.');
