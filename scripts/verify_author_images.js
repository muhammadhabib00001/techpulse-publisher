const fs = require('fs');
const path = require('path');

const authors = JSON.parse(fs.readFileSync('data/authors.json', 'utf8'));

console.log('--- CHECKING AUTHOR IMAGES ON DISK ---');
let allExist = true;
authors.forEach(a => {
  const rel = a.avatar.replace(/^\//, '');
  const exists = fs.existsSync(rel);
  const size = exists ? fs.statSync(rel).size : 0;
  console.log(`Author: ${a.name.padEnd(20)} | File: ${rel.padEnd(35)} | Exists: ${exists} (${size} bytes)`);
  if (!exists) allExist = false;
});

const placeholder = 'assets/images/author-placeholder.jpg';
console.log(`Placeholder: ${placeholder.padEnd(28)} | Exists: ${fs.existsSync(placeholder)} (${fs.existsSync(placeholder) ? fs.statSync(placeholder).size : 0} bytes)`);

console.log('\n--- CHECKING AUTHOR PROFILE PAGES HTML ---');
authors.forEach(a => {
  const p = path.join('author', `${a.slug}.html`);
  if (!fs.existsSync(p)) {
    console.log(`MISSING PAGE: ${p}`);
    return;
  }
  const content = fs.readFileSync(p, 'utf8');
  const hasAvatar = content.includes(a.avatar);
  console.log(`Page: ${p.padEnd(30)} | References ${a.avatar}: ${hasAvatar}`);
});
