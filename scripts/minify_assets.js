const fs = require('fs');
const path = require('path');
const CleanCSS = require('clean-css');
const { minify } = require('terser');

const rootDir = 'C:\\Users\\NDCOM\\.gemini\\antigravity\\scratch\\techpulse-publisher';
const cssPath = path.join(rootDir, 'assets', 'css', 'style.css');
const minCssPath = path.join(rootDir, 'assets', 'css', 'style.min.css');

const jsPath = path.join(rootDir, 'assets', 'js', 'main.js');
const minJsPath = path.join(rootDir, 'assets', 'js', 'main.min.js');

async function build() {
  console.log('Minifying CSS...');
  const rawCss = fs.readFileSync(cssPath, 'utf8');
  const cssResult = new CleanCSS({ level: 2 }).minify(rawCss);
  fs.writeFileSync(minCssPath, cssResult.styles, 'utf8');
  console.log(`CSS minified: ${(rawCss.length / 1024).toFixed(1)} KB -> ${(cssResult.styles.length / 1024).toFixed(1)} KB`);

  console.log('Minifying JS...');
  const rawJs = fs.readFileSync(jsPath, 'utf8');
  const jsResult = await minify(rawJs, { compress: true, mangle: true });
  fs.writeFileSync(minJsPath, jsResult.code, 'utf8');
  console.log(`JS minified: ${(rawJs.length / 1024).toFixed(1)} KB -> ${(jsResult.code.length / 1024).toFixed(1)} KB`);
}

build().catch(err => {
  console.error('Minification failed:', err);
  process.exit(1);
});
