const fs = require('fs');
const path = require('path');
const https = require('https');

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || 'rug2wxB71o1mh5kYy_K6kJVLxXZ6CA2apSHUrGqZYLk';
const AUTHORS_DIR = path.join(__dirname, '..', 'assets', 'images', 'authors');
const IMAGES_DIR = path.join(__dirname, '..', 'assets', 'images');

if (!fs.existsSync(AUTHORS_DIR)) {
  fs.mkdirSync(AUTHORS_DIR, { recursive: true });
}

const authors = [
  {
    id: 'elena-vance',
    name: 'Dr. Elena Vance',
    file: 'elena-vance.jpg',
    query: 'confident woman scientist portrait headshot professional'
  },
  {
    id: 'marcus-reid',
    name: 'Marcus Reid',
    file: 'marcus-reid.jpg',
    query: 'professional businessman financial economist portrait headshot'
  },
  {
    id: 'julia-vance',
    name: 'Julia Vance',
    file: 'julia-vance.jpg',
    query: 'female journalist diplomat foreign correspondent portrait headshot'
  },
  {
    id: 'tariq-mansoor',
    name: 'Tariq Mansoor',
    file: 'tariq-mansoor.jpg',
    query: 'middle eastern man professional corporate journalist portrait'
  }
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NewsroomBot/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const getWithRedirects = (currentUrl, count = 0) => {
      if (count > 5) return reject(new Error('Too many redirects'));
      https.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return getWithRedirects(res.headers.location, count + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download image: HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve());
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    };
    getWithRedirects(url);
  });
}

async function run() {
  console.log('Downloading high quality editorial author portraits...');
  for (const author of authors) {
    const destPath = path.join(AUTHORS_DIR, author.file);
    console.log(`\nSearching Unsplash for ${author.name} (${author.query})...`);
    const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(author.query)}&orientation=squarish&per_page=10&client_id=${UNSPLASH_KEY}`;
    
    try {
      const data = await fetchJson(searchUrl);
      if (!data.results || data.results.length === 0) {
        console.error(`No results for ${author.name}`);
        continue;
      }
      
      // Pick first result with valid small or regular url
      const photo = data.results[0];
      const imgUrl = photo.urls.small || photo.urls.regular;
      console.log(`Downloading ${author.file} from: ${imgUrl}`);
      await downloadImage(imgUrl, destPath);
      console.log(`Successfully saved ${author.file} (${fs.statSync(destPath).size} bytes)`);
    } catch (err) {
      console.error(`Error fetching portrait for ${author.name}:`, err.message);
    }
  }

  // Also create placeholder image
  const placeholderPath = path.join(IMAGES_DIR, 'author-placeholder.jpg');
  if (!fs.existsSync(placeholderPath) && fs.existsSync(path.join(AUTHORS_DIR, 'julia-vance.jpg'))) {
    fs.copyFileSync(path.join(AUTHORS_DIR, 'julia-vance.jpg'), placeholderPath);
    console.log('Created author-placeholder.jpg');
  }

  console.log('\nAuthor image download completed.');
}

run();
