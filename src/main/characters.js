// Companions and how they make their entrance.
//   entrance: one of ENTRANCES: 'lightning' (bolt strike + landing), 'swing' (swings in on
//             a web), 'dash' (runs in on a speed trail), 'jet' (flies down on jet boots),
//             'swoop' (flies in and lands), 'grapple' (drops in on a line), 'portal'
//             (steps out of a magic portal), 'zipline' (slides down a line from an arrow)
//             or 'spout' (rises on a water spout)
//   grip:     where the web / line attaches, as a fraction of the image (swing, grapple, zipline)
//   hold:     where a held prop (e.g. the water bottle) goes, as a fraction of the image
//
// Besides the built-in ones, personal companions can be added in local-characters/
// (kept out of git): put the image there and describe it in local-characters/characters.json:
//   [{ "id": "my-hero", "name": "My hero", "file": "my-hero.png", "entrance": "swing",
//      "grip": { "x": 0.5, "y": 0 }, "hold": { "x": 0.2, "y": 0.6 } }]
const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const BUILT_IN = [
  {
    id: 'thunder-god',
    name: 'Thunder god (arrives on a lightning strike)',
    file: path.join(paths.characters, 'thunder-god.svg'),
    entrance: 'lightning',
    grip: { x: 0.5, y: 0.02 },
    hold: { x: 0.263, y: 0.8 },
  },
  {
    id: 'web-slinger',
    name: 'Web-slinger (swings in on a web)',
    file: path.join(paths.characters, 'web-slinger.svg'),
    entrance: 'swing',
    grip: { x: 0.5, y: 0.03 },
    hold: { x: 0.125, y: 0.5 },
  },
  {
    id: 'speedster',
    name: 'Speedster (dashes in on a lightning trail)',
    file: path.join(paths.characters, 'speedster.svg'),
    entrance: 'dash',
    grip: { x: 0.5, y: 0.02 },
    hold: { x: 0.217, y: 0.58 },
  },
  {
    id: 'armored-hero',
    name: 'Armored hero (flies down on jet boots)',
    file: path.join(paths.characters, 'armored-hero.svg'),
    entrance: 'jet',
    grip: { x: 0.5, y: 0.02 },
    hold: { x: 0.167, y: 0.6 },
  },
  {
    id: 'caped-flyer',
    name: 'Caped flyer (swoops down from the sky)',
    file: path.join(paths.characters, 'caped-flyer.svg'),
    entrance: 'swoop',
    grip: { x: 0.5, y: 0.02 },
    hold: { x: 0.175, y: 0.553 },
  },
  {
    id: 'shadow-hero',
    name: 'Shadow hero (drops in on a grapple line)',
    file: path.join(paths.characters, 'shadow-hero.svg'),
    entrance: 'grapple',
    grip: { x: 0.5, y: 0.03 },
    hold: { x: 0.158, y: 0.507 },
  },
  {
    id: 'sorcerer',
    name: 'Star wizard (steps out of a magic portal)',
    file: path.join(paths.characters, 'sorcerer.svg'),
    entrance: 'portal',
    grip: { x: 0.5, y: 0.02 },
    hold: { x: 0.183, y: 0.62 },
  },
  {
    id: 'archer',
    name: 'Archer (zips down a line from an arrow)',
    file: path.join(paths.characters, 'archer.svg'),
    entrance: 'zipline',
    grip: { x: 0.508, y: 0.04 },
    hold: { x: 0.183, y: 0.56 },
  },
  {
    id: 'sea-guardian',
    name: 'Sea guardian (rises on a water spout)',
    file: path.join(paths.characters, 'sea-guardian.svg'),
    entrance: 'spout',
    grip: { x: 0.5, y: 0.02 },
    hold: { x: 0.183, y: 0.553 },
  },
];

const ENTRANCES = ['lightning', 'swing', 'dash', 'jet', 'swoop', 'grapple', 'portal', 'zipline', 'spout'];

// Best guesses for an image we know nothing about: hang it from the top centre and
// put a prop at its left side, next to the speech bubble.
const CUSTOM_DEFAULTS = { grip: { x: 0.5, y: 0.02 }, hold: { x: 0.1, y: 0.55 } };

const fraction = (v, fallback) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
const point = (p, fallback) => ({ x: fraction(p?.x, fallback.x), y: fraction(p?.y, fallback.y) });

function loadLocal() {
  const file = path.join(paths.localCharacters, 'characters.json');
  let list;
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[characters] could not read ${file}:`, err.message);
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && typeof c.id === 'string' && /^[\w-]{1,64}$/.test(c.id) && typeof c.file === 'string')
    .map((c) => ({
      id: c.id,
      name: typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 80) : c.id,
      file: path.resolve(paths.localCharacters, c.file),
      entrance: ENTRANCES.includes(c.entrance) ? c.entrance : 'lightning',
      grip: point(c.grip, CUSTOM_DEFAULTS.grip),
      hold: point(c.hold, CUSTOM_DEFAULTS.hold),
    }))
    .filter((c) => fs.existsSync(c.file));
}

// Built-in companions plus any local ones, re-read each time so edits to
// characters.json show up without restarting the app.
function companions() {
  const seen = new Set(BUILT_IN.map((c) => c.id).concat('custom'));
  return BUILT_IN.concat(loadLocal().filter((c) => !seen.has(c.id) && seen.add(c.id)));
}

const findCompanion = (id) => companions().find((c) => c.id === id);

module.exports = { companions, findCompanion, CUSTOM_DEFAULTS, ENTRANCES };
