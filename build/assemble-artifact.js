#!/usr/bin/env node
/* Build a content-only HTML fragment for the Artifact host (which supplies its
 * own <!doctype>/<html>/<head>/<body>). Includes <title>, inline <style>,
 * the page markup, and all inline scripts — but no document wrapper. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const dev = read('index.dev.html');
// page markup between <body> and the first <script>
const body = dev.slice(dev.indexOf('<body>') + 6, dev.indexOf('<script'));

const inlineOrder = [
  'vendor/three.min.js', 'vendor/OrbitControls.js', 'data/field-embed.js',
  'src/data.js', 'src/recon.js', 'src/globe.js', 'src/app.js',
];
const scripts = inlineOrder.map(f => `<script>\n${read(f)}\n</script>`).join('\n');
const css = read('src/styles.css');

const out = `<title>Chrono·Earth — 3D Deep Time Globe</title>
<style>
${css}
</style>
${body.trim()}
${scripts}
`;
fs.writeFileSync(path.join(ROOT, 'build', 'artifact.html'), out);
console.log('wrote build/artifact.html', (fs.statSync(path.join(ROOT, 'build', 'artifact.html')).size / 1024 / 1024).toFixed(2), 'MB');
