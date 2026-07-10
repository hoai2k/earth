# Chrono·Earth — a 3D deep-time globe

An interactive 3D viewer of Earth from space that lets you scrub through **4.5 billion
years** of geological history and watch the continents drift into place — from the
present day back through **Pangea**, **Gondwana**, and the early water-worlds of the
Precambrian. Each geological era comes with a panel of fascinating, sourced facts.

**▶ Live demo:** **https://hoai2k.github.io/earth/**
(or open `index.html` in any modern browser — it is fully self-contained).

## Features

- **Real Earth imagery** — continents carry per-vertex colour from NASA Blue Marble and
  real elevation from a topography map, so present-day regions are recognisable (the
  Sahara, Himalayas, Andes, Amazon…) with genuine mountain relief. Ocean has sun-glint
  and a fresnel limb, plus atmospheric glow, drifting clouds and a starfield.
- **Climate that follows the plates** — as a landmass drifts far from its present
  latitude in deep time, its colours blend to a latitude-driven climate palette, so ice
  caps appear on continents that wander over a pole (watch Gondwana freeze!) instead of
  carrying the modern Sahara to the South Pole.
- **Plate-tectonic reconstruction** — every landmass is a rigid tectonic plate that
  rotates to its paleo-position. Move the slider and the continents animate smoothly
  between reconstructions, and the **camera tracks the land** so the continents stay in
  view (the empty ocean hemisphere drifts to the back).
- **Time controls** — a non-linear slider (recent time is expanded), a numeric age box,
  a geological-period dropdown, a colour-coded timeline strip, and a *Play through time*
  button that sweeps across all of Earth history.
- **Facts for every interval** — climate, atmosphere, life, mass extinctions, day-length,
  and more, for each eon / era / period / epoch.
- **Works on mobile and desktop** — orbit + pinch-to-zoom, responsive layout (info panel
  moves below the globe in portrait).

## How it works

| Piece | File |
|---|---|
| Geological time scale, per-era facts & colours | `src/data.js` |
| Plate reconstruction model (paleo-position keyframes + quaternion math) | `src/recon.js` |
| Three.js scene, shaders (ocean / continents / clouds / atmosphere) | `src/globe.js` |
| UI controller (slider, dropdown, timeline, playback) | `src/app.js` |
| Styles | `src/styles.css` |

### Build pipeline (`build/`)

1. `process-geo.js` — turns Natural Earth 110m country polygons into per-plate,
   watertight triangle meshes. Land is grouped into 11 tectonic blocks (India, Arabia,
   Siberia, etc. split out from the modern plates), rasterised on a 0.5° grid, and the
   coastlines are Laplacian-smoothed in 3D. → `data/plates-mesh.json`
2. `bake-appearance.js` — samples NASA Blue Marble colour and a topography map into each
   mesh vertex (coastal vertices search a small neighbourhood so shores aren't ocean-blue;
   elevation is smoothed to avoid faceting).
3. `encode-mesh.js` — packs verts + colour + elevation into a compact base64 blob. → `data/mesh-embed.js`
3. `assemble.js` — inlines Three.js, the mesh, and all source into a single
   self-contained `index.html`.
4. `assemble-artifact.js` — a content-only variant for embedded hosting.

Rebuild everything:

```bash
npm install
node build/process-geo.js && node build/encode-mesh.js && node build/assemble.js
```

`tools/preview.html` renders a flat equirectangular map of the plates at any age — handy
for tuning the reconstruction.

## Data & accuracy

- **Coastlines:** [Natural Earth](https://www.naturalearthdata.com/) (public domain).
- **Geological time scale:** current ICS International Chronostratigraphic Chart.
- **Paleogeography:** the reconstruction is grounded in published paleolatitudes
  (Torsvik & Cocks, *Earth History and Palaeogeography*, 2017; Scotese/PALEOMAP) and
  reproduces the accepted assemblies (Pangea, Gondwana, Rodinia) and well-dated events
  (opening of the Atlantic, India's collision with Asia ~50 Ma).

It is a **simplified educational model**, not a research-grade plate circuit — paleo-
*longitude* is poorly constrained in deep time, and continental positions before ~1 Ga
are largely unknown (the globe shows early Earth's changing surface instead).

## Credits

Built with [Three.js](https://threejs.org/). Continental outlines © Natural Earth.
Surface colour © NASA Blue Marble; topography from public elevation imagery.
