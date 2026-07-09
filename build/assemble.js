#!/usr/bin/env node
/* Inline all assets into a single self-contained index.html. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('index.dev.html');
const css = read('src/styles.css');
html = html.replace('<link rel="stylesheet" href="./src/styles.css">', `<style>\n${css}\n</style>`);

const scriptsBlock = `<script src="./vendor/three.min.js"></script>
<script src="./vendor/OrbitControls.js"></script>
<script src="./src/data.js"></script>
<script src="./src/recon.js"></script>
<script src="./src/globe.js"></script>
<script src="./src/app.js"></script>`;

const inlineOrder = [
  'vendor/three.min.js',
  'vendor/OrbitControls.js',
  'data/mesh-embed.js',
  'src/data.js',
  'src/recon.js',
  'src/globe.js',
  'src/app.js',
];
const inlined = inlineOrder.map(f => `<script>\n${read(f)}\n</script>`).join('\n');
html = html.replace(scriptsBlock, inlined);

fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('wrote index.html', (fs.statSync(path.join(ROOT, 'index.html')).size / 1024 / 1024).toFixed(2), 'MB');
