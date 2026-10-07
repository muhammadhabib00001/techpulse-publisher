const https = require('https');

const langs = [
  { code: 'en', prefix: '' },
  { code: 'es', prefix: '/es' },
  { code: 'de', prefix: '/de' },
  { code: 'fr', prefix: '/fr' },
  { code: 'pt', prefix: '/pt' },
  { code: 'ar', prefix: '/ar' },
  { code: 'hi', prefix: '/hi' },
  { code: 'it', prefix: '/it' }
];

const slugs = ['privacy-policy', 'terms', 'contact', 'editorial-policy', 'fact-checking', 'corrections', 'about'];

const sampleUrls = [];
langs.forEach(lang => {
  slugs.forEach(slug => {
    sampleUrls.push(`https://www.genalphamagazines.com${lang.prefix}/pages/${slug}`);
  });
});

async function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const hasEmail = body.includes('intouchmagazines@gmail.com');
        resolve({ url, status: res.statusCode, hasEmail, length: body.length });
      });
    }).on('error', (err) => {
      resolve({ url, status: 'ERROR', error: err.message });
    });
  });
}

async function run() {
  console.log('Testing Live Production URLs across all editions on https://www.genalphamagazines.com:');
  for (const u of sampleUrls) {
    const res = await fetchUrl(u);
    console.log(`${res.url} -> Status: ${res.status} | HasEmail: ${res.hasEmail} | Size: ${res.length} bytes`);
  }
}

run();
