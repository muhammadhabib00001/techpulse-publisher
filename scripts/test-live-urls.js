const https = require('https');

const urls = [
  'https://www.genalphamagazines.com/pages/privacy-policy',
  'https://www.genalphamagazines.com/pages/terms',
  'https://www.genalphamagazines.com/pages/contact',
  'https://www.genalphamagazines.com/pages/editorial-policy',
  'https://www.genalphamagazines.com/pages/fact-checking',
  'https://www.genalphamagazines.com/pages/corrections',
  'https://www.genalphamagazines.com/pages/about'
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
  console.log('Testing Live Production URLs on https://www.genalphamagazines.com:');
  for (const u of urls) {
    const res = await fetchUrl(u);
    console.log(`${res.url} -> Status: ${res.status} | HasEmail: ${res.hasEmail} | Size: ${res.length} bytes`);
  }
}

run();
