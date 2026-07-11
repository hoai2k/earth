#!/usr/bin/env node
/*
 * bake-field.js
 * Represent each tectonic plate's LAND as an implicit signed-distance field
 * (negative inside land, positive over ocean, 0 at the coastline) baked into a
 * stereographic tile centred on the plate. All tiles are packed into one
 * grayscale atlas. At run time the globe shader rotates each plate's field by
 * its reconstruction quaternion and takes a smooth-min union of them, so the
 * coastline is the level-set of a single moving field: continents that meet
 * fuse (land bridges), continents that separate pinch apart (rifts), and
 * overlaps raise mountains. No per-plate mesh, no vertex correspondence.
 *
 * Also downsizes the NASA Blue Marble colour + topography into small textures
 * (sampled in each plate's PRESENT-day frame, which is real geography) and
 * embeds everything as data URIs in data/field-embed.js.
 */
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const bboxClip = require('@turf/bbox-clip').default;
const RECON = require(path.join(__dirname, '..', 'src', 'recon.js'));

const DATA = path.join(__dirname, '..', 'data');
const src = JSON.parse(fs.readFileSync(path.join(DATA, 'ne_110m_countries.json'), 'utf8'));
const D2R = Math.PI / 180;

// ---- Plate assignment (mirrors build/process-geo.js) ---------------------
const ARABIA = new Set(['Saudi Arabia','Yemen','Oman','United Arab Emirates','Qatar','Kuwait','Bahrain','Jordan','Israel','Palestine','Lebanon','Syria','Iraq']);
const INDIA  = new Set(['India','Pakistan','Bangladesh','Nepal','Bhutan','Sri Lanka']);
const EASTASIA = new Set(['China','North Korea','South Korea','Japan','Taiwan','Myanmar','Thailand','Laos','Vietnam','Cambodia','Malaysia','Brunei','Indonesia','Philippines','East Timor']);
const SIBERIA_C = new Set(['Kazakhstan','Mongolia','Uzbekistan','Turkmenistan','Kyrgyzstan','Tajikistan','Afghanistan']);
const EUR_EXTRA = new Set(['Turkey','Cyprus','Northern Cyprus','Georgia','Armenia','Azerbaijan','Iran']);
const PLATE_ORDER = ['NAM','GRN','SAM','AFR','ARB','IND','EUR','SIB','CHN','AUS','ANT'];
const PLATE_NAMES = {
  NAM:'North America (Laurentia)', GRN:'Greenland', SAM:'South America (Amazonia)',
  AFR:'Africa', ARB:'Arabia', IND:'India', EUR:'Europe (Baltica)',
  SIB:'Siberia & Central Asia', CHN:'East Asia (Cathaysia)', AUS:'Australia', ANT:'Antarctica',
};
function plateFor(props) {
  const admin = props.ADMIN, cont = props.CONTINENT;
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
const platePolys = {};
for (const id of PLATE_ORDER) platePolys[id] = [];
function addGeom(geom, plate) {
  if (!geom) return;
  if (geom.type === 'Polygon') platePolys[plate].push(geom.coordinates);
  else if (geom.type === 'MultiPolygon') for (const poly of geom.coordinates) platePolys[plate].push(poly);
}
for (const feat of src.features) {
  const plate = plateFor(feat.properties);
  if (!plate) continue;
  if (plate === 'RUSSIA_SPLIT') {
    addGeom(bboxClip(feat, [19, 40, 61, 83]).geometry, 'EUR');
    addGeom(bboxClip(feat, [61, 40, 180, 83]).geometry, 'SIB');
    addGeom(bboxClip(feat, [-180, 55, -165, 73]).geometry, 'SIB');
  } else if (feat.properties.ADMIN === 'France') {
    addGeom(bboxClip(feat, [-10, 41, 20, 52]).geometry, 'EUR');
  } else {
    addGeom(feat.geometry, plate);
  }
}

// ---- geometry helpers ----------------------------------------------------
const sph = RECON.sph, vecToLL = RECON.vecToLL;
function dot(a, b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a, b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function norm(a){ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; }

// point-in-polygon (even-odd) over a plate's polygon list: land iff inside an
// outer ring and not inside one of its holes, for any polygon.
function inRing(ring, lon, lat){
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1], yj = ring[j][1], xi = ring[i][0], xj = ring[j][0];
    if ((yi > lat) !== (yj > lat)) {
      const xc = xi + (lat - yi) / (yj - yi) * (xj - xi);
      if (lon < xc) inside = !inside;
    }
  }
  return inside;
}
function inPolys(polys, lon, lat){
  for (const poly of polys) {
    if (!inRing(poly[0], lon, lat)) continue;
    let hole = false;
    for (let h = 1; h < poly.length; h++) if (inRing(poly[h], lon, lat)) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}

// Felzenszwalb 1D squared distance transform.
function edt1d(f, n){
  const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q*q) - (f[v[k]] + v[k]*v[k])) / (2*q - 2*v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q*q) - (f[v[k]] + v[k]*v[k])) / (2*q - 2*v[k]); }
    k++; v[k] = q; z[k] = s; z[k+1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k+1] < q) k++;
    d[q] = (q - v[k])*(q - v[k]) + f[v[k]];
  }
  return d;
}
// 2D squared EDT of a binary mask (feature = true). Returns px distance.
function edt2d(mask, w, h){
  const INF = 1e12;
  const g = new Float64Array(w * h);
  for (let i = 0; i < w*h; i++) g[i] = mask[i] ? 0 : INF;
  const col = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = g[y*w + x];
    const d = edt1d(col, h);
    for (let y = 0; y < h; y++) g[y*w + x] = d[y];
  }
  const row = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) row[x] = g[y*w + x];
    const d = edt1d(row, w);
    for (let x = 0; x < w; x++) g[y*w + x] = Math.sqrt(d[x]);
  }
  return g; // px distance to nearest feature pixel
}

// ---- bake per-plate tiles into the atlas ---------------------------------
const TILE = 320;               // tile resolution
const ATLAS_COLS = 4, ATLAS_ROWS = 3;
const ATLAS_W = ATLAS_COLS * TILE, ATLAS_H = ATLAS_ROWS * TILE;
const MARGIN = 15 * D2R;        // ocean margin beyond the coast (radians)
const DRANGE = 16;              // encode signed distance over +/- this many degrees
const atlas = new Uint8Array(ATLAS_W * ATLAS_H).fill(Math.round((DRANGE + DRANGE) / (2*DRANGE) * 255)); // = +DRANGE (all ocean)

const meta = [];
PLATE_ORDER.forEach((id, pi) => {
  const polys = platePolys[id].filter(p => Array.isArray(p) && Array.isArray(p[0]) && p[0].length > 3);
  // centroid direction of all coastline points
  let cx = 0, cy = 0, cz = 0, np = 0;
  for (const poly of polys) for (const pt of poly[0]) { const s = sph(pt[0], pt[1]); cx += s[0]; cy += s[1]; cz += s[2]; np++; }
  let c = norm([cx, cy, cz]);
  // stereographic basis (choose an up not parallel to c)
  let up = Math.abs(c[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0];
  const e1 = norm(cross(up, c)), e2 = cross(c, e1);
  // angular radius to the farthest land point
  let thetaMax = 0;
  for (const poly of polys) for (const pt of poly[0]) { const th = Math.acos(Math.max(-1, Math.min(1, dot(sph(pt[0], pt[1]), c)))); if (th > thetaMax) thetaMax = th; }
  const thetaSpan = thetaMax + MARGIN;
  const Rs = 2 * Math.tan(thetaSpan / 2);                 // stereographic radius of the tile
  const scaleCos = Math.cos(thetaMax / 2) ** 2;           // px->deg correction near the coast
  const degPerPx = (2 * Rs / TILE) * scaleCos / D2R;

  // rasterize inside/outside per tile pixel (unproject stereographic -> lon/lat)
  const inside = new Uint8Array(TILE * TILE);
  for (let py = 0; py < TILE; py++) {
    const v = ((py + 0.5) / TILE * 2 - 1) * Rs;
    for (let px = 0; px < TILE; px++) {
      const u = ((px + 0.5) / TILE * 2 - 1) * Rs;
      const rho = Math.hypot(u, v);
      let L;
      if (rho < 1e-9) L = c;
      else { const th = 2 * Math.atan(rho / 2), ct = Math.cos(th), st = Math.sin(th); const du = u/rho, dv = v/rho;
        L = [c[0]*ct + (du*e1[0]+dv*e2[0])*st, c[1]*ct + (du*e1[1]+dv*e2[1])*st, c[2]*ct + (du*e1[2]+dv*e2[2])*st]; }
      const ll = vecToLL(L);
      inside[py*TILE + px] = inPolys(polys, ll[0], ll[1]) ? 1 : 0;
    }
  }
  // signed distance (px): -dist_to_ocean inside land, +dist_to_land in ocean
  const outMask = new Uint8Array(TILE*TILE), inMask = new Uint8Array(TILE*TILE);
  for (let i = 0; i < TILE*TILE; i++) { outMask[i] = inside[i] ? 1 : 0; inMask[i] = inside[i] ? 0 : 1; }
  const dOut = edt2d(outMask, TILE, TILE);  // ocean px -> nearest land
  const dIn  = edt2d(inMask, TILE, TILE);   // land px -> nearest ocean
  const col0 = (pi % ATLAS_COLS) * TILE, row0 = Math.floor(pi / ATLAS_COLS) * TILE;
  for (let py = 0; py < TILE; py++) for (let px = 0; px < TILE; px++) {
    const i = py*TILE + px;
    const dpx = inside[i] ? -dIn[i] : dOut[i];
    let dd = dpx * degPerPx;                 // signed degrees
    dd = Math.max(-DRANGE, Math.min(DRANGE, dd));
    const byte = Math.round((dd + DRANGE) / (2*DRANGE) * 255);
    atlas[(row0 + py) * ATLAS_W + (col0 + px)] = byte;
  }
  meta.push({
    id, name: PLATE_NAMES[id],
    c: c.map(r => +r.toFixed(6)), e1: e1.map(r => +r.toFixed(6)), e2: e2.map(r => +r.toFixed(6)),
    Rs: +Rs.toFixed(6),
    rect: [col0/ATLAS_W, row0/ATLAS_H, TILE/ATLAS_W, TILE/ATLAS_H].map(r => +r.toFixed(6)),
    mass: +(thetaSpan*thetaSpan).toFixed(4),
  });
  console.log(`${id.padEnd(4)} thetaMax=${(thetaMax/D2R).toFixed(1)}deg degPerPx=${degPerPx.toFixed(3)} slot=${pi}`);
});

// grayscale value buffer -> RGBA PNG data URI (sampled as .r in the shader)
function grayPNG(buf, w, h){
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w*h; i++) { const v = buf[i]; const o = i*4; png.data[o]=v; png.data[o+1]=v; png.data[o+2]=v; png.data[o+3]=255; }
  return PNG.sync.write(png);
}

// ---- downsize colour + topo ----------------------------------------------
function boxDownColor(img, ow, oh){
  const iw = img.width, ih = img.height, sx = iw/ow, sy = ih/oh;
  const out = Buffer.alloc(ow*oh*4);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    let r=0,g=0,b=0,n=0;
    const x0=(x*sx)|0, x1=Math.max(x0+1,((x+1)*sx)|0), y0=(y*sy)|0, y1=Math.max(y0+1,((y+1)*sy)|0);
    for (let yy=y0; yy<y1; yy++) for (let xx=x0; xx<x1; xx++){ const i=(yy*iw+xx)*4; r+=img.data[i]; g+=img.data[i+1]; b+=img.data[i+2]; n++; }
    const o=(y*ow+x)*4; out[o]=r/n; out[o+1]=g/n; out[o+2]=b/n; out[o+3]=255;
  }
  return { width: ow, height: oh, data: out };
}
function boxDownGray(png, ow, oh){
  const iw=png.width, ih=png.height, sx=iw/ow, sy=ih/oh;
  const out = new Uint8Array(ow*oh);
  for (let y=0;y<oh;y++) for (let x=0;x<ow;x++){
    let s=0,n=0; const x0=(x*sx)|0,x1=Math.max(x0+1,((x+1)*sx)|0),y0=(y*sy)|0,y1=Math.max(y0+1,((y+1)*sy)|0);
    for (let yy=y0;yy<y1;yy++) for (let xx=x0;xx<x1;xx++){ s+=png.data[(yy*iw+xx)*4]; n++; }
    out[y*ow+x]=s/n;
  }
  return out;
}
const colorImg = jpeg.decode(fs.readFileSync(path.join(DATA,'earth-color.jpg')), { useTArray: true, maxMemoryUsageInMB: 1024 });
const colorSmall = boxDownColor(colorImg, 2048, 1024);
const colorJpg = jpeg.encode(colorSmall, 82).data;
const topoImg = PNG.sync.read(fs.readFileSync(path.join(DATA,'earth-topo.png')));
let topoSmall = boxDownGray(topoImg, 1024, 512);
// Blur the topography so the per-fragment relief gradient is smooth (the old
// per-vertex path Laplacian-smoothed elevation; here we pre-smooth instead of
// letting raw texel steps produce blocky shading). Large ranges survive.
function blurGray(buf, w, h, r){
  const tmp = new Float32Array(w*h), out = new Uint8Array(w*h), norm = 1/(2*r+1);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){ let s=0; for(let d=-r;d<=r;d++){ let xx=x+d; if(xx<0)xx+=w; else if(xx>=w)xx-=w; s+=buf[y*w+xx]; } tmp[y*w+x]=s*norm; }
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){ let s=0; for(let d=-r;d<=r;d++){ const yy=Math.max(0,Math.min(h-1,y+d)); s+=tmp[yy*w+x]; } out[y*w+x]=s*norm; }
  return out;
}
topoSmall = blurGray(topoSmall, 1024, 512, 2);
const atlasPNG = grayPNG(atlas, ATLAS_W, ATLAS_H);
const topoPNG = grayPNG(topoSmall, 1024, 512);

const b64 = (buf, mime) => `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
const FIELD = {
  atlasW: ATLAS_W, atlasH: ATLAS_H, drange: DRANGE,
  plates: meta,
  atlas: b64(atlasPNG, 'image/png'),
  color: b64(colorJpg, 'image/jpeg'),
  topo: b64(topoPNG, 'image/png'),
};
const out = `/* auto-generated by build/bake-field.js — plate distance-field atlas + textures */\nwindow.FIELD=${JSON.stringify(FIELD)};\n`;
fs.writeFileSync(path.join(DATA, 'field-embed.js'), out);
console.log('wrote data/field-embed.js', (fs.statSync(path.join(DATA,'field-embed.js')).size/1024).toFixed(0), 'KB',
  `(atlas ${(atlasPNG.length/1024)|0}KB, color ${(colorJpg.length/1024)|0}KB, topo ${(topoPNG.length/1024)|0}KB)`);
