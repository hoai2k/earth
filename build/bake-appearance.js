#!/usr/bin/env node
/* bake-appearance.js
 * Sample real Earth appearance into the plate meshes:
 *  - per-vertex RGB from NASA Blue Marble (real deserts/forests/ice)
 *  - per-vertex elevation from a topography map (real mountain ranges)
 * Coastal vertices search a small neighbourhood for the most land-like pixel
 * so shorelines don't inherit ocean blue. Writes cols/elev arrays into
 * data/plates-mesh.json (consumed by encode-mesh.js and the dev fetch path).
 */
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const DATA = path.join(__dirname, '..', 'data');
const mesh = JSON.parse(fs.readFileSync(path.join(DATA, 'plates-mesh.json'), 'utf8'));
const col = jpeg.decode(fs.readFileSync(path.join(DATA, 'earth-color.jpg')), { useTArray: true, maxMemoryUsageInMB: 1024 });
const topo = PNG.sync.read(fs.readFileSync(path.join(DATA, 'earth-topo.png')));

function pixel(img, x, y) {
  x = Math.max(0, Math.min(img.width - 1, x | 0));
  y = Math.max(0, Math.min(img.height - 1, y | 0));
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
const toXY = (img, lon, lat) => [ (lon + 180) / 360 * img.width, (90 - lat) / 180 * img.height ];

// land-likeness score: high for green/tan/white, low for ocean blue
const landScore = ([r, g, b]) => (r + g) - 1.35 * b;

function sampleLand(lon, lat, coast) {
  const [cx, cy] = toXY(col, lon, lat);
  let best = null, bestScore = -1e9, bestOff = [0, 0];
  // Offshore feather vertices (low coverage) sit up to ~2deg out to sea, so
  // widen the search there to pull in the nearest land colour instead of blue.
  const maxR = coast < 0.7 ? 28 : 3;  // 28px @4096w ~ 2.5 deg
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const p = pixel(col, cx + dx, cy + dy);
      const s = landScore(p);
      if (s > bestScore) { bestScore = s; best = p; bestOff = [dx, dy]; }
    }
    if (bestScore > 30 && r >= 1) break; // found solid land nearby
  }
  // elevation from topo at (proportionally) the same offset
  const [tx, ty] = toXY(topo, lon, lat);
  const scale = topo.width / col.width;
  const e = pixel(topo, tx + bestOff[0] * scale, ty + bestOff[1] * scale)[0];
  return { rgb: best, elev: e };
}

let oceanish = 0, total = 0, eMin = 255, eMax = 0;
for (const id of Object.keys(mesh.plates)) {
  const p = mesh.plates[id];
  const n = p.verts.length / 2;
  const cols = new Array(n * 3);
  const elev = new Array(n);
  const pCoast = p.coast || [];
  for (let i = 0; i < n; i++) {
    const coast = (pCoast[i] != null ? pCoast[i] : 255) / 255;
    const { rgb, elev: e } = sampleLand(p.verts[i * 2], p.verts[i * 2 + 1], coast);
    cols[i * 3] = rgb[0]; cols[i * 3 + 1] = rgb[1]; cols[i * 3 + 2] = rgb[2];
    elev[i] = e;
    total++;
    if (landScore(rgb) < 0) oceanish++;
    eMin = Math.min(eMin, e); eMax = Math.max(eMax, e);
  }
  // smooth elevation over the triangle graph so relief isn't blocky/faceted
  const adj = Array.from({ length: n }, () => []);
  for (let t = 0; t < p.idx.length; t += 3) {
    const a = p.idx[t], b = p.idx[t + 1], c = p.idx[t + 2];
    adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b);
  }
  let E = elev.slice();
  for (let it = 0; it < 4; it++) {
    const Q = E.slice();
    for (let i = 0; i < n; i++) {
      if (!adj[i].length) continue;
      let s = 0; for (const j of adj[i]) s += E[j];
      Q[i] = E[i] * 0.35 + (s / adj[i].length) * 0.65;
    }
    E = Q;
  }
  p.cols = cols; p.elev = E.map(v => Math.round(v));
  console.log(id.padEnd(4), 'baked', n, 'verts');
}
console.log(`ocean-ish verts after search: ${oceanish}/${total} (${(100 * oceanish / total).toFixed(1)}%)  elev range ${eMin}-${eMax}`);
fs.writeFileSync(path.join(DATA, 'plates-mesh.json'), JSON.stringify(mesh));
console.log('wrote plates-mesh.json', (fs.statSync(path.join(DATA, 'plates-mesh.json')).size / 1024 / 1024).toFixed(2), 'MB');
