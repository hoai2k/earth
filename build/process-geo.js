#!/usr/bin/env node
/*
 * process-geo.js
 * Turn Natural Earth 110m country polygons into per-tectonic-plate triangle
 * meshes suitable for draping over a sphere. Output is a compact JSON of
 * { plates: { ID: { name, verts:[lon,lat,...], idx:[...] } } } where each plate
 * is a rigid block that the app rotates as a whole to reconstruct paleo-positions.
 */
const fs = require('fs');
const path = require('path');
const earcut = require('earcut');
const bboxClip = require('@turf/bbox-clip').default;
const simplify = require('@turf/simplify').default;

const DATA = path.join(__dirname, '..', 'data');
const src = JSON.parse(fs.readFileSync(path.join(DATA, 'ne_110m_countries.json'), 'utf8'));

// ---- Plate assignment ----------------------------------------------------
const ARABIA = new Set(['Saudi Arabia','Yemen','Oman','United Arab Emirates','Qatar','Kuwait','Bahrain','Jordan','Israel','Palestine','Lebanon','Syria','Iraq']);
const INDIA  = new Set(['India','Pakistan','Bangladesh','Nepal','Bhutan','Sri Lanka']);
const EASTASIA = new Set(['China','North Korea','South Korea','Japan','Taiwan','Myanmar','Thailand','Laos','Vietnam','Cambodia','Malaysia','Brunei','Indonesia','Philippines','East Timor']);
const SIBERIA_C = new Set(['Kazakhstan','Mongolia','Uzbekistan','Turkmenistan','Kyrgyzstan','Tajikistan','Afghanistan']);
const EUR_EXTRA = new Set(['Turkey','Cyprus','Northern Cyprus','Georgia','Armenia','Azerbaijan','Iran']);

const PLATE_NAMES = {
  NAM: 'North America (Laurentia)',
  GRN: 'Greenland',
  SAM: 'South America (Amazonia)',
  AFR: 'Africa',
  ARB: 'Arabia',
  IND: 'India',
  EUR: 'Europe (Baltica)',
  SIB: 'Siberia & Central Asia',
  CHN: 'East Asia (Cathaysia)',
  AUS: 'Australia',
  ANT: 'Antarctica',
};

function plateFor(props) {
  const admin = props.ADMIN;
  const cont = props.CONTINENT;
  if (cont === 'Antarctica') return 'ANT';
  if (admin === 'Greenland') return 'GRN';
  if (cont === 'North America') return 'NAM';
  if (cont === 'South America') return 'SAM';
  if (cont === 'Africa') return 'AFR';
  if (cont === 'Oceania') return 'AUS';
  if (ARABIA.has(admin)) return 'ARB';
  if (INDIA.has(admin)) return 'IND';
  if (EASTASIA.has(admin)) return 'CHN';
  if (SIBERIA_C.has(admin)) return 'SIB';
  if (admin === 'Russia') return 'RUSSIA_SPLIT';
  if (cont === 'Europe' || EUR_EXTRA.has(admin)) return 'EUR';
  return null;
}

// ---- Collect polygons per plate -----------------------------------------
const platePolys = {}; // id -> array of polygons; polygon = [outerRing, hole, ...]; ring=[[lon,lat],...]
for (const id of Object.keys(PLATE_NAMES)) platePolys[id] = [];

function addGeometry(geom, plate) {
  if (!geom) return;
  if (geom.type === 'Polygon') platePolys[plate].push(geom.coordinates);
  else if (geom.type === 'MultiPolygon') for (const poly of geom.coordinates) platePolys[plate].push(poly);
}

for (const feat of src.features) {
  // Rasterize from native geometry: the grid itself is the simplification, and
  // native Natural Earth borders tile exactly (per-feature simplify would open
  // gaps between neighbours -> speckle holes).
  const simp = feat;
  const plate = plateFor(feat.properties);
  if (!plate) continue;
  if (plate === 'RUSSIA_SPLIT') {
    // Europe/Baltica part west of the Urals; Siberia part to the east.
    const west = bboxClip(simp, [19, 40, 61, 83]);
    addGeometry(west.geometry, 'EUR');
    const east1 = bboxClip(simp, [61, 40, 180, 83]);
    addGeometry(east1.geometry, 'SIB');
    const east2 = bboxClip(simp, [-180, 55, -165, 73]); // Chukotka across the dateline
    addGeometry(east2.geometry, 'SIB');
  } else if (feat.properties.ADMIN === 'France') {
    // France's polygon includes French Guiana + Indian Ocean isles; keep Europe only.
    addGeometry(bboxClip(simp, [-10, 41, 20, 52]).geometry, 'EUR');
  } else {
    addGeometry(simp.geometry, plate);
  }
}

// ---- Densify + triangulate + subdivide -----------------------------------
const MAX_SEG = 3.0;     // max boundary segment length in degrees
const MAX_EDGE = 4.0;    // subdivide interior triangles longer than this
const RAD = Math.PI / 180;

// South-polar azimuthal projection so Antarctica has no pole/dateline seam.
const toPolar = ([lon, lat]) => {
  const r = 90 + lat; // 0 at south pole
  return [r * Math.cos(lon * RAD), r * Math.sin(lon * RAD)];
};
const fromPolar = ([x, y]) => {
  const r = Math.hypot(x, y);
  return [Math.atan2(y, x) / RAD, r - 90];
};

function densify(ring) {
  const out = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    out.push(a);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.floor(d / MAX_SEG);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  out.push(ring[ring.length - 1]);
  return out;
}

const GRID = 0.5;   // rasterization grid in degrees

// Crossings of horizontal line y=yc with one ring's edges.
function rowCrossings(ring, yc) {
  const xs = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const y1 = ring[i][1], y2 = ring[i+1][1];
    if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) {
      const t = (yc - y1) / (y2 - y1);
      xs.push(ring[i][0] + t * (ring[i+1][0] - ring[i][0]));
    }
  }
  xs.sort((a, b) => a - b);
  return xs;
}
function oddCount(xs, x) { let c = 0; for (let k = 0; k < xs.length; k++) if (xs[k] < x) c++; return c & 1; }

// Watertight scanline rasterizer. Each polygon is filled independently
// (outer ring minus holes) and UNION-ed, so shared country borders don't
// cancel. Quads share corner vertices -> no cracks; hugs the sphere.
function buildPlateMesh(polysIn) {
  const polys = polysIn.filter(p => Array.isArray(p) && Array.isArray(p[0]) && Array.isArray(p[0][0]) && p[0].length > 3);
  let latMin = 90, latMax = -90;
  for (const poly of polys) for (const pt of poly[0]) { latMin = Math.min(latMin, pt[1]); latMax = Math.max(latMax, pt[1]); }
  const j0 = Math.floor((latMin + 90) / GRID) - 1;
  const j1 = Math.ceil((latMax + 90) / GRID) + 1;
  const NI = Math.round(360 / GRID);
  const land = new Set();
  for (let j = j0; j < j1; j++) {
    const yc = -90 + (j + 0.5) * GRID;
    for (const poly of polys) {
      const outer = rowCrossings(poly[0], yc);
      if (outer.length < 2) continue;
      const holes = [];
      for (let h = 1; h < poly.length; h++) holes.push(rowCrossings(poly[h], yc));
      for (let i = 0; i < NI; i++) {
        const xc = -180 + (i + 0.5) * GRID;
        if (!oddCount(outer, xc)) continue;
        let inHole = false;
        for (const hx of holes) if (oddCount(hx, xc)) { inHole = true; break; }
        if (!inHole) land.add(i + ':' + j);
      }
    }
  }
  const vmap = new Map(), verts = [], idx = [];
  function vid(i, j) {
    const k = i + ':' + j; let v = vmap.get(k);
    if (v === undefined) { v = verts.length / 2; verts.push(-180 + i * GRID, -90 + j * GRID); vmap.set(k, v); }
    return v;
  }
  for (const key of land) {
    const [i, j] = key.split(':').map(Number);
    const a = vid(i, j), b = vid(i + 1, j), c = vid(i + 1, j + 1), d = vid(i, j + 1);
    idx.push(a, b, c, a, c, d);
  }
  return { verts, idx };
}

// Antarctica: rasterize in a south-polar plane for even coverage (no pole
// oversampling). Grid units are "degrees of colatitude"; r = 90 + lat.
function buildAntCap(polys) {
  const PG = 0.7;
  const edges = []; let rMax = 0;
  for (const poly of polys) for (const ring of poly) {
    const p = ring.map(toPolar);
    for (let i = 0; i < p.length - 1; i++) {
      edges.push([p[i][0], p[i][1], p[i+1][0], p[i+1][1]]);
      rMax = Math.max(rMax, Math.hypot(p[i][0], p[i][1]));
    }
  }
  const N = Math.ceil(rMax / PG) + 1;
  function inside(x, y) { // even-odd ray to +x
    let c = false;
    for (const e of edges) {
      const y1 = e[1], y2 = e[3];
      if ((y1 > y) !== (y2 > y)) {
        const xi = e[0] + (y - y1) / (y2 - y1) * (e[2] - e[0]);
        if (x < xi) c = !c;
      }
    }
    return c;
  }
  const vmap = new Map(), verts = [], idx = [];
  function vid(i, j) {
    const k = i + ':' + j; let v = vmap.get(k);
    if (v === undefined) { v = verts.length / 2; const ll = fromPolar([i * PG, j * PG]); verts.push(ll[0], ll[1]); vmap.set(k, v); }
    return v;
  }
  for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
    const x = (i + 0.5) * PG, y = (j + 0.5) * PG;
    if (inside(x, y)) { const a=vid(i,j),b=vid(i+1,j),c=vid(i+1,j+1),d=vid(i,j+1); idx.push(a,b,c,a,c,d); }
  }
  return { verts, idx };
}

// Laplacian smoothing in 3D (dateline/pole-safe): rounds the rasterized
// stair-steps into smooth coastlines without changing topology (watertight).
function smoothMesh(verts, idx, iters, lambda) {
  const n = verts.length / 2;
  // adjacency
  const adj = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t+1], c = idx[t+2];
    adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
  }
  // to 3D unit vectors
  let P = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { const s = RECON.sph(verts[i*2], verts[i*2+1]); P[i*3]=s[0]; P[i*3+1]=s[1]; P[i*3+2]=s[2]; }
  for (let it = 0; it < iters; it++) {
    const Q = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      let ax=0,ay=0,az=0,cnt=0;
      for (const j of adj[i]) { ax+=P[j*3]; ay+=P[j*3+1]; az+=P[j*3+2]; cnt++; }
      if (!cnt) { Q[i*3]=P[i*3]; Q[i*3+1]=P[i*3+1]; Q[i*3+2]=P[i*3+2]; continue; }
      ax/=cnt; ay/=cnt; az/=cnt;
      let x=P[i*3]+(ax-P[i*3])*lambda, y=P[i*3+1]+(ay-P[i*3+1])*lambda, z=P[i*3+2]+(az-P[i*3+2])*lambda;
      const l=Math.hypot(x,y,z)||1; Q[i*3]=x/l; Q[i*3+1]=y/l; Q[i*3+2]=z/l;
    }
    P = Q;
  }
  const out = new Array(n * 2);
  for (let i = 0; i < n; i++) { const ll = RECON.vecToLL([P[i*3],P[i*3+1],P[i*3+2]]); out[i*2]=ll[0]; out[i*2+1]=ll[1]; }
  return out;
}

const RECON = require(path.join(__dirname, '..', 'src', 'recon.js'));
const out = { plates: {} };
let totalV = 0, totalT = 0;
for (const id of Object.keys(PLATE_NAMES)) {
  if (!platePolys[id].length) { console.warn('no polys for', id); continue; }
  const m0 = id === 'ANT' ? buildAntCap(platePolys[id]) : buildPlateMesh(platePolys[id]);
  const m = { verts: smoothMesh(m0.verts, m0.idx, 3, 0.5), idx: m0.idx };
  // round to reduce size
  const verts = m.verts.map(v => Math.round(v * 100) / 100);
  out.plates[id] = { name: PLATE_NAMES[id], verts, idx: m.idx };
  totalV += verts.length / 2;
  totalT += m.idx.length / 3;
  console.log(`${id.padEnd(4)} ${PLATE_NAMES[id].padEnd(28)} verts=${(verts.length/2).toString().padStart(6)} tris=${(m.idx.length/3).toString().padStart(6)}`);
}
console.log(`TOTAL verts=${totalV} tris=${totalT}`);

fs.writeFileSync(path.join(DATA, 'plates-mesh.json'), JSON.stringify(out));
console.log('wrote data/plates-mesh.json', (fs.statSync(path.join(DATA,'plates-mesh.json')).size/1024).toFixed(0), 'KB');
