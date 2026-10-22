// Edit the daily quotes. They ship scrambled (see src/main/scramble.js), so:
//
//   node scripts/quotes.js decode
//       assets/quotes.json -> quotes-private/quotes.json, readable and git-ignored. Edit that.
//   node scripts/quotes.js encode
//       quotes-private/quotes.json -> assets/quotes.json (bundled with the app) and
//       quotes-private/gist-quotes.json (paste it over quotes.json in the secret Gist).
//
// "specials" stay readable in both, so special-day messages can be edited straight in the Gist.
const fs = require('fs');
const path = require('path');
const { scramble, unscramble } = require('../src/main/scramble');

const ROOT = path.join(__dirname, '..');
const BUNDLED = path.join(ROOT, 'assets', 'quotes.json');
const PRIVATE_DIR = path.join(ROOT, 'quotes-private');
const PRIVATE = path.join(PRIVATE_DIR, 'quotes.json');
const GIST = path.join(PRIVATE_DIR, 'gist-quotes.json');

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const write = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

const command = process.argv[2];
if (command === 'decode') {
  const data = read(BUNDLED);
  const days = typeof data.days === 'string' ? JSON.parse(unscramble(data.days)) : data.days;
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  write(PRIVATE, { specials: data.specials || {}, days });
  console.log(`wrote ${path.relative(ROOT, PRIVATE)} (${Object.keys(days).length} days)`);
} else if (command === 'encode') {
  const data = read(PRIVATE);
  const scrambled = { specials: data.specials || {}, days: scramble(JSON.stringify(data.days)) };
  write(BUNDLED, scrambled);
  write(GIST, scrambled);
  console.log(`wrote ${path.relative(ROOT, BUNDLED)} and ${path.relative(ROOT, GIST)} (${Object.keys(data.days).length} days)`);
} else {
  console.log('usage: node scripts/quotes.js decode|encode');
  process.exit(1);
}
