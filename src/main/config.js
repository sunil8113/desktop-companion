// Loads, validates and persists settings to <userData>/settings.json.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { ENTRANCES } = require('./characters');

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]; // Date#getDay(): 0 = Sunday
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[\w-]{1,64}$/;
const CHARACTER_STYLES = ['plain', 'remove-dark', 'frame'];
const PROPS = ['auto', 'none', 'water-bottle', 'lunch-box'];

const DEFAULTS = {
  version: 1,
  reminders: [
    {
      id: 'water',
      enabled: true,
      type: 'interval',
      title: 'Water break',
      message: 'Time for a glass of water! Stay hydrated.',
      intervalMinutes: 45,
      days: ALL_DAYS,
    },
    {
      id: 'stand',
      enabled: true,
      type: 'interval',
      title: 'Stand up & walk',
      message: "You've been sitting a while. Stand up, stretch and take a short walk.",
      intervalMinutes: 50,
      days: ALL_DAYS,
    },
    {
      id: 'lunch',
      enabled: true,
      type: 'daily',
      title: 'Lunch time',
      message: "It's 1 PM. Step away from the screen and grab some lunch.",
      time: '13:00',
      days: ALL_DAYS,
    },
    {
      id: 'home',
      enabled: true,
      type: 'daily',
      title: 'Go home',
      message: "It's 6 PM. Wrap up and head home!",
      time: '18:00',
      days: ALL_DAYS,
    },
  ],
  snoozeMinutes: 10,
  // When enabled, repeating reminders only fire between start and end. Daily reminders ignore this.
  workHours: { enabled: false, start: '09:00', end: '18:00' },
  character: 'thunder-god', // a companion id (see characters.js) or the id of one of myImages
  // The user's own pictures, any number: { id: 'img-…', name, path, entrance, style }.
  //   entrance: one of ENTRANCES (characters.js)
  //   style:    'plain' (image as is), 'remove-dark' (key out a dark background, for clips
  //             shot on black) or 'frame' (rounded card with a glow)
  myImages: [],
  soundEnabled: true,
  launchAtLogin: true, // so reminders (and the daily hello) start with Windows / macOS
  overlayDisplay: 'primary', // 'primary' or 'cursor' (the display the mouse is on)
};

let current = null;
let firstRun = false;

const filePath = () => path.join(app.getPath('userData'), 'settings.json');

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const str = (value, fallback, max) => (typeof value === 'string' ? value.slice(0, max) : fallback);
const time = (value, fallback) => (typeof value === 'string' && TIME_RE.test(value) ? value : fallback);

function normalizeReminder(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'daily' ? 'daily' : 'interval';
  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : ALL_DAYS.slice();
  const reminder = {
    id: typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : `r-${Date.now().toString(36)}-${index}`,
    enabled: raw.enabled !== false,
    type,
    title: str(raw.title, '', 60).trim() || 'Reminder',
    message: str(raw.message, '', 280),
    days,
    // '' = the companion chosen under Settings > Character; otherwise a companion id or the
    // id of one of myImages
    companion: typeof raw.companion === 'string' && ID_RE.test(raw.companion) ? raw.companion : '',
    // what the companion holds out; 'auto' picks from the title (water -> bottle, lunch -> tiffin)
    prop: PROPS.includes(raw.prop) ? raw.prop : 'auto',
  };
  if (type === 'interval') reminder.intervalMinutes = clampInt(raw.intervalMinutes, 1, 1440, 45);
  else reminder.time = time(raw.time, '12:00');
  return reminder;
}

const IMAGE_ID_RE = /^img-[\w-]{1,60}$/;

function normalizeImage(raw, index = 0) {
  if (!raw || typeof raw !== 'object' || typeof raw.path !== 'string' || !raw.path) return null;
  return {
    id: typeof raw.id === 'string' && IMAGE_ID_RE.test(raw.id) ? raw.id : `img-${Date.now().toString(36)}-${index}`,
    name: str(raw.name, '', 40).trim() || `My image ${index + 1}`,
    path: str(raw.path, '', 1024),
    entrance: ENTRANCES.includes(raw.entrance) ? raw.entrance : 'lightning',
    style: CHARACTER_STYLES.includes(raw.style) ? raw.style : 'plain',
  };
}

// Unique ids: the second "x" becomes "x-2", and so on.
function dedupe(items) {
  const seen = new Set();
  return items.map((item) => {
    let id = item.id;
    for (let i = 2; seen.has(id); i++) id = `${item.id}-${i}`;
    seen.add(id);
    return { ...item, id };
  });
}

function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};

  // Settings from before "My images" had one custom image (character 'custom' plus
  // characterImage, characterStyle, customEntrance): it becomes the first of myImages.
  const legacy = !Array.isArray(src.myImages) && typeof src.characterImage === 'string' && src.characterImage
    ? {
        id: 'img-1',
        name: 'My image',
        path: src.characterImage,
        entrance: src.customEntrance,
        style: src.characterStyle || (src.characterFrame === true ? 'frame' : 'plain'),
      }
    : null;
  const myImages = dedupe((legacy ? [legacy] : Array.isArray(src.myImages) ? src.myImages : []).map(normalizeImage).filter(Boolean));
  const imageIds = new Set(myImages.map((i) => i.id));
  // A companion id as stored: 'custom' means the legacy image; a deleted image falls back.
  const companionId = (id, fallback) => {
    if (id === 'custom') return legacy ? legacy.id : fallback;
    if (typeof id !== 'string' || !ID_RE.test(id)) return fallback;
    return id.startsWith('img-') && !imageIds.has(id) ? fallback : id;
  };

  const reminders = dedupe(
    (Array.isArray(src.reminders) ? src.reminders : DEFAULTS.reminders).map(normalizeReminder).filter(Boolean),
  ).map((r) => ({ ...r, companion: companionId(r.companion, '') }));
  const wh = src.workHours && typeof src.workHours === 'object' ? src.workHours : {};
  return {
    version: 1,
    reminders,
    snoozeMinutes: clampInt(src.snoozeMinutes, 1, 240, DEFAULTS.snoozeMinutes),
    workHours: {
      enabled: wh.enabled === true,
      start: time(wh.start, DEFAULTS.workHours.start),
      end: time(wh.end, DEFAULTS.workHours.end),
    },
    character: companionId(src.character, 'thunder-god'),
    myImages,
    soundEnabled: src.soundEnabled !== false,
    launchAtLogin: src.launchAtLogin === true,
    overlayDisplay: src.overlayDisplay === 'cursor' ? 'cursor' : 'primary',
  };
}

function write(cfg) {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
  fs.renameSync(tmp, file); // atomic replace, so a crash never leaves a half-written file
}

function load() {
  const file = filePath();
  try {
    current = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    if (err.code === 'ENOENT') {
      firstRun = true;
    } else {
      console.warn(`[config] could not read ${file}, falling back to defaults:`, err.message);
      try {
        fs.renameSync(file, file.replace(/\.json$/, `.corrupt-${Date.now()}.json`));
      } catch {
        /* keep going with defaults */
      }
    }
    current = normalize(DEFAULTS);
    write(current);
  }
  return current;
}

function save(next) {
  current = normalize(next);
  write(current);
  return current;
}

module.exports = {
  DEFAULTS,
  load,
  save,
  get: () => current,
  normalize,
  normalizeReminder,
  filePath,
  isFirstRun: () => firstRun,
};
