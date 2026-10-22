// The creator's daily lines: a quote for the morning hello and a fun line for the evening
// farewell, one pair per date, plus special-day messages (festivals, the app's birthday...).
//
// They live in assets/quotes.json. The app also downloads that same file from the GitHub repo
// (at most once an hour), so quotes and special days can be changed by editing it on GitHub,
// without a new release. If it can't be downloaded it uses the last downloaded copy, and
// failing that the copy bundled with the app.
//
// quotes.json: {
//   "days":     { "MM-DD": { "morning": "...", "evening": "..." }, ... },
//   "specials": { "MM-DD" or "YYYY-MM-DD": { "title": "...", "morning": "...", "evening": "..." } }
// }
// A special for an exact date wins over a yearly one; any field it leaves out comes from "days".
const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const REMOTE_URL = 'https://raw.githubusercontent.com/sunil8113/desktop-companion/main/assets/quotes.json';
const REFRESH_EVERY = 60 * 60 * 1000;
const FETCH_TIMEOUT = 6000;
const FALLBACK = {
  morning: 'Do something today that your future self will thank you for.',
  evening: 'Great work today. Now go home, eat well and recharge!',
};

const cachePath = () => path.join(app.getPath('userData'), 'quotes-cache.json');

let quotes = null;
let fetchedAt = 0;

const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '');

// Validates and tidies a quotes file; throws if it isn't usable.
function parse(raw) {
  const data = JSON.parse(raw.replace(/^﻿/, '')); // some editors add a byte-order mark
  const days = {};
  const specials = {};
  for (const [key, v] of Object.entries(data?.days || {})) {
    if (/^\d\d-\d\d$/.test(key) && v && typeof v === 'object') days[key] = { morning: text(v.morning, 300), evening: text(v.evening, 300) };
  }
  for (const [key, v] of Object.entries(data?.specials || {})) {
    if (/^(\d{4}-)?\d\d-\d\d$/.test(key) && v && typeof v === 'object') {
      specials[key] = { title: text(v.title, 60), morning: text(v.morning, 300), evening: text(v.evening, 300) };
    }
  }
  if (Object.keys(days).length < 300) throw new Error(`only ${Object.keys(days).length} days`);
  return { days, specials };
}

function loadLocal() {
  for (const file of [cachePath(), paths.quotes]) {
    try {
      return parse(fs.readFileSync(file, 'utf8'));
    } catch {
      /* try the next one */
    }
  }
  return { days: {}, specials: {} };
}

async function refresh() {
  fetchedAt = Date.now();
  try {
    const res = await net.fetch(REMOTE_URL, { cache: 'no-cache', signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const body = await res.text();
    quotes = parse(body);
    fs.writeFileSync(cachePath(), body);
  } catch (err) {
    console.warn('[quotes] using the saved copy:', err.message);
  }
}

const pad = (n) => String(n).padStart(2, '0');

// { title, morning, evening } for a date. title is '' unless it's a special day.
async function forDate(date = new Date()) {
  quotes ??= loadLocal();
  if (Date.now() - fetchedAt > REFRESH_EVERY) await refresh();
  const md = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const special = quotes.specials[`${date.getFullYear()}-${md}`] || quotes.specials[md] || {};
  const day = quotes.days[md] || {};
  return {
    title: special.title || '',
    morning: special.morning || day.morning || FALLBACK.morning,
    evening: special.evening || day.evening || FALLBACK.evening,
  };
}

module.exports = { forDate };
