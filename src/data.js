/* ============================================================================
 * data.js — Geological time scale, per-interval facts, and colours.
 * Boundary ages: ICS International Chronostratigraphic Chart (2023/24).
 * Facts distilled from Torsvik & Cocks (2017), Scotese PALEOMAP, ICS, USGS.
 * ==========================================================================*/
const INTERVALS = [
  { id:'hadean', name:'Hadean', kind:'Eon', start:4540, end:4031, color:'#8f2d2d',
    tagline:'A hellish, molten young world',
    facts:[
      'Earth accreted ~4.54 billion years ago; within ~100 Myr a Mars-sized body, Theia, struck it and the debris formed the Moon.',
      'The Moon orbited 10–20× closer, looming huge in the sky and raising colossal tides — a day may have lasted only ~6 hours.',
      'The air was a scorching, oxygen-free brew of CO₂, nitrogen, water vapour and sulphur, under a Sun ~25–30% fainter than today.',
      '4.4-billion-year-old zircon crystals from Jack Hills, Australia hint that liquid water — and maybe the first oceans — existed surprisingly early.',
      'The surface was repeatedly resurfaced by magma oceans and giant impacts.'
    ]},
  { id:'archean', name:'Archean', kind:'Eon', start:4031, end:2500, color:'#7d3e8f',
    tagline:'First continents, first life',
    facts:[
      'The oldest intact rocks (Acasta Gneiss, ~4.03 Ga) and oldest fossils — microbial stromatolites ~3.5 Ga — both date from this eon.',
      'There was essentially no free oxygen; a methane haze likely tinted the sky orange over mostly CO₂–nitrogen air.',
      'Cyanobacteria evolved oxygen-producing photosynthesis by ~2.7–3.0 Ga, quietly arming the planet’s first great chemical revolution.',
      'The Sun was ~20–25% dimmer, yet Earth stayed warm — the “faint young Sun paradox” — thanks to strong greenhouse gases.',
      'A hotter mantle erupted distinctive komatiite lavas that essentially never form today; days were perhaps only ~18 hours long.'
    ]},
  { id:'paleoproterozoic', name:'Paleoproterozoic', kind:'Era', start:2500, end:1600, color:'#b0417f',
    tagline:'The Great Oxidation',
    facts:[
      'The Great Oxidation Event (~2.4 Ga) permanently injected free oxygen into the air — catastrophe for anaerobes, the making of the modern world.',
      'Collapsing methane helped trigger the Huronian glaciation (~2.4–2.1 Ga), possibly the first Snowball Earth and one of the longest ice ages ever.',
      'Banded iron formations — Earth’s main iron ore — precipitated as oxygen reacted with iron dissolved in the seas.',
      'The first eukaryotic (complex, nucleated) cells appear around this era.',
      'The first well-documented supercontinent, Columbia (Nuna), assembled by ~1.8–1.6 Ga.'
    ]},
  { id:'mesoproterozoic', name:'Mesoproterozoic', kind:'Era', start:1600, end:1000, color:'#c65f96',
    tagline:'The “Boring Billion”',
    facts:[
      'Nicknamed the “Boring Billion” — an interval of unusually stable climate, low oxygen and few dramatic events.',
      'Earth’s day appears to have been stuck near ~19 hours for hundreds of millions of years, held there by an atmospheric-tidal resonance.',
      'Sexual reproduction is first documented in the ~1.05-billion-year-old red alga Bangiomorpha.',
      'The supercontinent Rodinia assembled through the Grenville-age mountain-building events at the era’s end (~1.1–1.0 Ga).',
      'Low oxygen and nutrients kept life microbial and small, delaying the rise of animals.'
    ]},
  { id:'tonian', name:'Tonian', kind:'Period', start:1000, end:720, color:'#e06b6b',
    tagline:'Rodinia begins to rift',
    facts:[
      'The supercontinent Rodinia straddled the tropics, ringed by the world-ocean Mirovia, with Laurentia at its core.',
      'Plume-driven rifting began to tear Rodinia apart (~825–750 Ma).',
      'Eukaryotic life diversified, including the first testate amoebae and early multicellular algae.',
      'Oxygen and climate remained relatively stable — the calm before the Cryogenian storm.'
    ]},
  { id:'cryogenian', name:'Cryogenian', kind:'Period', start:720, end:635, color:'#5bb8d4',
    tagline:'Snowball Earth',
    facts:[
      'Home to the most extreme ice ages ever: the Sturtian (717–660 Ma) and Marinoan (~650–635 Ma) “Snowball Earth” glaciations.',
      'Glacial deposits from this time sit at tropical paleolatitudes — the key evidence that ice reached the equator and the planet nearly froze solid.',
      'Ice may have blanketed the oceans for millions of years, with life clinging on at volcanic vents and in meltwater oases.',
      'Rodinia continued breaking apart as the cratons that would form Gondwana began to gather.'
    ]},
  { id:'ediacaran', name:'Ediacaran', kind:'Period', start:635, end:538.8, color:'#d98a4e',
    tagline:'The first large animals',
    facts:[
      'The soft-bodied Ediacaran biota (from ~575 Ma) are the first large, complex organisms — bizarre fronds and discs unlike anything alive today.',
      'A second great rise in oxygen (the Neoproterozoic Oxygenation Event) helped pave the way for animal life.',
      'The transient supercontinent Pannotia coalesced around ~600 Ma as Gondwana entered its final assembly.',
      'The Gaskiers glaciation (~580 Ma) was a briefer cold snap after the Snowball Earths.'
    ]},
  { id:'cambrian', name:'Cambrian', kind:'Period', start:538.8, end:486.85, color:'#8ab353',
    tagline:'The Cambrian Explosion',
    facts:[
      'The Cambrian Explosion: nearly all modern animal body plans (phyla) appear in the fossil record within a few tens of millions of years.',
      'The first animals with shells, eyes and mineralised skeletons evolved; trilobites thrived and the metre-long Anomalocaris was an apex predator.',
      'The exquisite Burgess Shale captures the soft-bodied weirdness of this evolutionary burst.',
      'Life was almost entirely marine — the land was barren rock under thin microbial crusts.',
      'Days lasted only ~21 hours and a year held 400+ days, because Earth spun faster and the Moon was closer.'
    ]},
  { id:'ordovician', name:'Ordovician', kind:'Period', start:486.85, end:443.1, color:'#1a9e8f',
    tagline:'Seas teeming with life',
    facts:[
      'The Great Ordovician Biodiversification Event tripled marine diversity, filling the seas with corals, brachiopods, cephalopods and the first true reefs.',
      'The first land plants — simple, moss-like forms — began greening the continents.',
      'Giant straight-shelled nautiloids, some several metres long, were top ocean predators.',
      'It ended in the end-Ordovician mass extinction (~445–443 Ma), the first of the “Big Five,” as Gondwana drifted over the South Pole and glaciers spread.'
    ]},
  { id:'silurian', name:'Silurian', kind:'Period', start:443.1, end:419.62, color:'#b3d94d',
    tagline:'Life conquers the land',
    facts:[
      'The first vascular land plants (like Cooksonia) took root, and millipedes and early arachnids became the first land animals.',
      'The first jawed fish and the first bony fish appeared — a milestone for all later vertebrates.',
      'Extensive coral–stromatoporoid reefs flourished in warm, stable greenhouse seas.',
      'A thickening ozone layer increasingly shielded the land, helping life move ashore.'
    ]},
  { id:'devonian', name:'Devonian', kind:'Period', start:419.62, end:358.86, color:'#cf8a3a',
    tagline:'The Age of Fishes',
    facts:[
      'The “Age of Fishes” — armoured placoderms like Dunkleosteus ruled, and lobe-finned fish gave rise to the first four-limbed vertebrates.',
      'The first true forests appeared; trees like Archaeopteris and the first seeds transformed the land and drew down CO₂.',
      'The first amphibians crawled ashore as tetrapods took their first steps (Tiktaalik, Acanthostega).',
      'The Late Devonian mass extinction devastated reef and marine ecosystems.',
      'Fossil corals confirm days were ~22 hours long with ~400 days per year.'
    ]},
  { id:'carboniferous', name:'Carboniferous', kind:'Period', start:358.86, end:298.9, color:'#5da05a',
    tagline:'Coal swamps & giant insects',
    facts:[
      'Vast tropical swamp forests of giant lycopod trees laid down the coal that later powered the Industrial Revolution.',
      'Oxygen peaked near ~35% (vs 21% today), enabling giant insects — dragonfly-like Meganeura had 70 cm wingspans and Arthropleura grew over 2 m long.',
      'The first fully terrestrial vertebrates — amniotes with shelled eggs — freed vertebrate life from the water.',
      'Gondwana lay over the South Pole and grew huge ice sheets (the Late Paleozoic Ice Age).',
      'Colliding continents built the supercontinent Pangea and raised great mountain belts.'
    ]},
  { id:'permian', name:'Permian', kind:'Period', start:298.9, end:251.902, color:'#e8593a',
    tagline:'Pangea & the Great Dying',
    facts:[
      'All major landmasses were fused into the single supercontinent Pangea, ringed by the world-ocean Panthalassa, with vast arid interior deserts.',
      'Sail-backed synapsids (mammal ancestors like Dimetrodon, then therapsids) dominated the land alongside the first conifers.',
      'It ended in the end-Permian “Great Dying” (~251.9 Ma), the worst extinction ever — up to ~90% of marine species vanished.',
      'The catastrophe was driven by the enormous Siberian Traps eruptions, which spiked CO₂, warmed and acidified the oceans, and stripped their oxygen.'
    ]},
  { id:'triassic', name:'Triassic', kind:'Period', start:251.902, end:201.4, color:'#7e4f9e',
    tagline:'Dawn of the dinosaurs',
    facts:[
      'Life rebuilt from the Great Dying; the first dinosaurs, first mammals, first pterosaurs and first turtles all appeared.',
      'Pangea was still whole, giving a hot, dry, strongly seasonal “megamonsoon” climate with no polar ice.',
      'Marine reptiles such as ichthyosaurs returned to the seas as ecosystems recovered.',
      'It closed with the end-Triassic extinction (~201 Ma), linked to eruptions as Pangea began to rift — clearing the way for the dinosaurs.'
    ]},
  { id:'jurassic', name:'Jurassic', kind:'Period', start:201.4, end:143.1, color:'#38b0d4',
    tagline:'Giants & the first birds',
    facts:[
      'The classic Age of Dinosaurs: giant long-necked sauropods were the largest land animals ever, alongside Allosaurus and Stegosaurus.',
      'The first birds evolved from feathered dinosaurs — Archaeopteryx (~150 Ma) is the famous transitional fossil.',
      'Pangea broke apart: the Central Atlantic opened (~180 Ma), splitting the world into Laurasia (north) and Gondwana (south).',
      'A warm, humid greenhouse world with high seas and no polar ice; ammonites and marine reptiles thrived.'
    ]},
  { id:'cretaceous', name:'Cretaceous', kind:'Period', start:143.1, end:66.0, color:'#7fb942',
    tagline:'Flowers, T. rex & the asteroid',
    facts:[
      'Flowering plants appeared and diversified rapidly, co-evolving with bees and other pollinators.',
      'Iconic dinosaurs including Tyrannosaurus rex and Triceratops lived at the very end of this period.',
      'An intense greenhouse kept poles ice-free and seas among the highest ever; chalk from tiny algae gives the period its name.',
      'The South Atlantic opened (~130 Ma) as South America and Africa split, and India began its high-speed journey north.',
      'It ended at the K–Pg boundary (66 Ma) when the ~10 km Chicxulub asteroid struck Mexico, wiping out all non-avian dinosaurs.'
    ]},
  { id:'paleocene', name:'Paleocene', kind:'Epoch', start:66.0, end:56.0, color:'#f2a03f',
    tagline:'After the dinosaurs',
    facts:[
      'With the dinosaurs gone, surviving mammals rapidly diversified and grew larger to fill empty niches.',
      'The earliest primates and many modern mammal groups first appear.',
      'Climate was warm and largely ice-free, with lush forests reaching into polar regions.',
      'The Atlantic kept widening while India raced north across the shrinking Tethys.'
    ]},
  { id:'eocene', name:'Eocene', kind:'Epoch', start:56.0, end:33.9, color:'#f4b74a',
    tagline:'Hothouse Earth',
    facts:[
      'It opened with the PETM (~56 Ma), a rapid 5–8 °C global-warming spike — a key analogue for modern climate change.',
      'The hottest sustained interval of the Cenozoic: crocodiles and palms lived near the poles and there was no permanent ice.',
      'The first whales, horses, bats and modern primates appear; India collided with Asia (~50 Ma), beginning to raise the Himalayas.',
      'At the epoch’s end (~34 Ma) the first permanent Antarctic ice sheet formed as the world abruptly cooled.'
    ]},
  { id:'oligocene', name:'Oligocene', kind:'Epoch', start:33.9, end:23.03, color:'#f6cf5a',
    tagline:'The world cools',
    facts:[
      'Global cooling took hold and the Antarctic ice sheet became a permanent fixture as the Southern Ocean encircled the continent.',
      'Grasslands spread widely for the first time, reshaping ecosystems and favouring grazing mammals.',
      'Mammal faunas modernised in the European “Grande Coupure” turnover.',
      'Sea levels fell as water locked up in growing ice.'
    ]},
  { id:'miocene', name:'Miocene', kind:'Epoch', start:23.03, end:5.333, color:'#eddc3c',
    tagline:'Apes & grasslands',
    facts:[
      'Grasslands and savannas expanded worldwide, driving the evolution of grazing horses, antelope and elephants.',
      'Apes diversified, including the lineages leading toward modern great apes and, ultimately, humans.',
      'The Messinian Salinity Crisis (~6 Ma) saw the Mediterranean nearly dry out into a giant salt basin.',
      'Kelp forests and modern marine ecosystems flourished, including the giant shark Megalodon.'
    ]},
  { id:'pliocene', name:'Pliocene', kind:'Epoch', start:5.333, end:2.58, color:'#f0ea6b',
    tagline:'The Americas join',
    facts:[
      'The Isthmus of Panama closed (~3 Ma), joining the Americas, rerouting ocean currents and triggering a great animal interchange.',
      'Early human relatives (Australopithecus, including “Lucy”) walked upright in Africa.',
      'Warm early on, the climate then cooled as Northern Hemisphere ice sheets began to build.',
      'Continents and oceans reached nearly their modern positions.'
    ]},
  { id:'pleistocene', name:'Pleistocene', kind:'Epoch', start:2.58, end:0.0117, color:'#dfe0e2',
    tagline:'The Ice Age',
    facts:[
      'The classic Ice Age: dozens of glacial–interglacial cycles paced by Earth’s orbital (Milankovitch) rhythms.',
      'Megafauna — woolly mammoths, mastodons, sabre-toothed cats, giant ground sloths — roamed, then largely vanished at the epoch’s end.',
      'The genus Homo evolved and spread; Homo sapiens arose in Africa (~300,000 years ago) and colonised the globe.',
      'Sea levels dropped over 100 m at glacial maxima, exposing land bridges like Beringia.'
    ]},
  { id:'holocene', name:'Holocene', kind:'Epoch', start:0.0117, end:0, color:'#cfe6ef',
    tagline:'The age of humans',
    facts:[
      'The current warm interglacial, beginning ~11,700 years ago as the last great ice sheets retreated.',
      'Human agriculture, cities and civilisation all arose within this brief, unusually stable climatic window.',
      'Sea levels rose ~120 m since the last glacial maximum, flooding coastlines and separating islands from the mainland.',
      'Rapid human-driven change has prompted the proposed “Anthropocene” interval.'
    ]},
];

// Convenience: interval containing a given age (Ma).
function intervalAt(ma){
  for(const iv of INTERVALS){ if(ma <= iv.start && ma >= iv.end) return iv; }
  return ma > INTERVALS[0].start ? INTERVALS[0] : INTERVALS[INTERVALS.length-1];
}
