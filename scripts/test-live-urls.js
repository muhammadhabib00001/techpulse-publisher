const https = require('https');

const sampleUrls = [
  // English Core 7
  'https://www.genalphamagazines.com/pages/privacy-policy',
  'https://www.genalphamagazines.com/pages/terms',
  'https://www.genalphamagazines.com/pages/contact',
  'https://www.genalphamagazines.com/pages/editorial-policy',
  'https://www.genalphamagazines.com/pages/fact-checking',
  'https://www.genalphamagazines.com/pages/corrections',
  'https://www.genalphamagazines.com/pages/about',

  // Multilingual Samples
  'https://www.genalphamagazines.com/es/pages/privacy-policy',
  'https://www.genalphamagazines.com/de/pages/privacy-policy',
  'https://www.genalphamagazines.com/fr/pages/privacy-policy',
  'https://www.genalphamagazines.com/pt/pages/privacy-policy',
  'https://www.genalphamagazines.com/ar/pages/privacy-policy',
  'https://www.genalphamagazines.com/hi/pages/privacy-policy',
  'https://www.genalphamagazines.com/it/pages/privacy-policy'
];

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
