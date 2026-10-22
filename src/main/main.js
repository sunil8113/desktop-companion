const { app, ipcMain, dialog, shell, powerMonitor, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const config = require('./config');
const paths = require('./paths');
const { companions, findCompanion, CUSTOM_DEFAULTS } = require('./characters');
const { Scheduler } = require('./scheduler');
const { OverlayPresenter } = require('./overlay-window');
const { createTray } = require('./tray');
const settingsWindow = require('./settings-window');
const { initUpdater, restartToUpdate, checkForUpdates } = require('./updater');
const quotes = require('./quotes');

let scheduler;
let presenter;
let tray;

const fileUrl = (file) => pathToFileURL(file).href;

function characterUrl(imagePath) {
  return fileUrl(imagePath && fs.existsSync(imagePath) ? imagePath : findCompanion('thunder-god').file);
}

// Everything the overlay needs to show a companion: a built-in one or one of the user's
// images, by id. An unknown id, or an image whose file has gone missing, falls back to the
// thunder god.
function resolveCharacter(id, cfg) {
  const image = cfg.myImages.find((i) => i.id === id);
  if (image && fs.existsSync(image.path)) {
    return {
      characterSrc: fileUrl(image.path),
      characterStyle: image.style,
      characterData: image.style === 'remove-dark' ? characterBytes(image.path) : null,
      entrance: image.entrance,
      ...CUSTOM_DEFAULTS,
    };
  }
  const companion = (!image && findCompanion(id)) || findCompanion('thunder-god');
  return { characterSrc: fileUrl(companion.file), characterStyle: 'plain', characterData: null, entrance: companion.entrance, grip: companion.grip, hold: companion.hold };
}

// The app's creator, who signs every reminder and says hello once a day.
const CREATOR_NAME = 'Sunil';

function creator() {
  return { name: CREATOR_NAME, photo: fs.existsSync(paths.creatorPhoto) ? fileUrl(paths.creatorPhoto) : '' };
}

// Once a day the creator says hello: when the app starts (usually at sign-in), when the PC is
// unlocked or wakes up, or just before the day's first reminder, whichever comes first.
// The day it was last shown is kept in <userData>/state.json.
const statePath = () => path.join(app.getPath('userData'), 'state.json');
const GREETING_ID = 'creator-greeting';

let greeting = null; // the hello being prepared (the day's quote may be downloading)

// Resolves once today's hello, if it's due, is queued, so reminders can queue after it.
function greetIfNewDay() {
  if (!greeting && takeDailyGreeting()) {
    greeting = greetingText()
      .then(showGreeting)
      .finally(() => (greeting = null));
  }
  return greeting || Promise.resolve();
}

function showGreeting(text) {
  // Built directly rather than through normalizeReminder, whose length limits suit reminders
  // typed in Settings, not quotes.
  const greeting = { id: GREETING_ID, type: 'greeting', title: text.title, message: text.message, companion: '', prop: 'none' };
  presenter.enqueue(greeting, { isGreeting: true });
}

// Whether to greet now (not greeted yet today); records that we did.
function takeDailyGreeting() {
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    /* first run, or unreadable: greet */
  }
  if (state.lastGreeting === today) return false;
  try {
    fs.writeFileSync(statePath(), JSON.stringify({ ...state, lastGreeting: today }));
  } catch (err) {
    console.warn('[greeting] could not save state:', err.message);
  }
  return true;
}

// The day's lines come from quotes.js (a different pair for every date of the year); the
// titles name the weekday, unless it's a special day with a title of its own.
const WEEKDAYS = [
  ['Sunday', '🧘'],
  ['Monday', '💪'],
  ['Tuesday', '🚀'],
  ['Wednesday', '😂'],
  ['Thursday', '🎈'],
  ['Friday', '🎉'],
  ['Saturday', '🌈'],
];

async function greetingText(now = new Date()) {
  const lines = await quotes.forDate(now);
  const [day, emoji] = WEEKDAYS[now.getDay()];
  const title = lines.title || (now.getHours() < 12 ? `Good morning! Happy ${day} ${emoji}` : `Happy ${day}! ${emoji}`);
  return { title, message: `“${lines.morning}”` };
}

// When an update has downloaded, a bubble like the hello offers to restart into it.
function showUpdateReady(version, extraMeta = {}) {
  const ready = {
    id: 'creator-update',
    type: 'greeting',
    title: 'New update ready! 🚀',
    message: `Desk Companion ${version} is downloaded. Restart now to get the latest features.`,
    companion: '',
    prop: 'none',
  };
  presenter.enqueue(ready, { isGreeting: true, isUpdate: true, ...extraMeta });
}

// Clicking Done on the "Go home" reminder brings the creator's farewell for the day.
const FAREWELL_AFTER_ID = 'home';

async function showFarewell(now = new Date()) {
  const lines = await quotes.forDate(now);
  const title = lines.title || `That's a wrap on ${WEEKDAYS[now.getDay()][0]}! 🌙`;
  const bye = { id: 'creator-farewell', type: 'greeting', title, message: lines.evening, companion: '', prop: 'none' };
  presenter.enqueue(bye, { isGreeting: true, isFarewell: true });
}

// Optional custom thunder: assets/sounds/thunder.(mp3|ogg|wav). Otherwise the overlay synthesises one.
function thunderUrl() {
  for (const ext of ['mp3', 'ogg', 'wav']) {
    const file = path.join(paths.sounds, `thunder.${ext}`);
    if (fs.existsSync(file)) return pathToFileURL(file).href;
  }
  return '';
}

const IMAGE_TYPES = { '.gif': 'image/gif', '.png': 'image/png', '.apng': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const MAX_KEYED_BYTES = 20 * 1024 * 1024;

// Raw bytes for the overlay to decode and key frame by frame (a file:// image can't be read back from a canvas).
function characterBytes(imagePath) {
  const type = IMAGE_TYPES[path.extname(imagePath || '').toLowerCase()];
  try {
    if (!type || fs.statSync(imagePath).size > MAX_KEYED_BYTES) return null;
    return { bytes: fs.readFileSync(imagePath), type };
  } catch {
    return null;
  }
}

// Props the companion can hold out. anchorY: where the hand grips it, as a CSS translate
// (-62% = around the middle of the bottle, -8% = the tiffin's handle).
const PROPS = {
  'water-bottle': { file: 'water-bottle.svg', width: 30, anchorY: '-62%' },
  'lunch-box': { file: 'lunch-box.svg', width: 40, anchorY: '-8%' },
};

function propFor(reminder) {
  let kind = reminder.prop;
  if (kind === 'auto' || !kind) {
    const text = `${reminder.id} ${reminder.title}`;
    kind = /water|hydrat|drink/i.test(text) ? 'water-bottle' : /lunch|dinner|breakfast|snack|food|eat/i.test(text) ? 'lunch-box' : 'none';
  }
  const prop = PROPS[kind];
  return prop ? { src: fileUrl(path.join(paths.props, prop.file)), width: prop.width, anchorY: prop.anchorY } : null;
}

function applyLoginItem(cfg) {
  // In development, register electron.exe with this app's folder so it launches the right thing.
  app.setLoginItemSettings({
    openAtLogin: cfg.launchAtLogin,
    path: process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()],
  });
}

// Copy companions bundled into this build into the user's companions folder, without
// overwriting files that are already there. Updates replace the app but not that folder.
function seedCompanions() {
  if (paths.localCharacters === paths.bundledCharacters) return;
  try {
    fs.mkdirSync(paths.localCharacters, { recursive: true });
    if (!fs.existsSync(paths.bundledCharacters)) return;
    for (const name of fs.readdirSync(paths.bundledCharacters)) {
      const target = path.join(paths.localCharacters, name);
      if (!fs.existsSync(target)) fs.writeFileSync(target, fs.readFileSync(path.join(paths.bundledCharacters, name)));
    }
  } catch (err) {
    console.warn('[characters] could not set up companions folder:', err.message);
  }
}

function showTestReminder(reminder) {
  const r = reminder || config.get().reminders.find((x) => x.enabled) || config.normalizeReminder({ title: 'Hello!', message: 'This is a test reminder.' });
  presenter.enqueue(r, { isTest: true });
}

function registerIpc() {
  const fromSettings = (handler) => (event, ...args) => {
    if (!settingsWindow.owns(event.sender)) throw new Error('Unexpected sender');
    return handler(event, ...args);
  };
  const fromOverlay = (handler) => (event, ...args) => {
    if (presenter.owns(event.sender)) handler(...args);
  };

  ipcMain.handle('settings:load', fromSettings(() => ({
    config: config.get(),
    defaults: config.normalize(config.DEFAULTS),
    companions: companions().map((c) => ({ id: c.id, name: c.name, url: fileUrl(c.file) })),
    configPath: config.filePath(),
  })));

  ipcMain.handle('settings:save', fromSettings((_e, next) => {
    const saved = config.save(next);
    scheduler.reload(saved);
    applyLoginItem(saved);
    return saved;
  }));

  ipcMain.handle('settings:pick-images', fromSettings(async () => {
    const result = await dialog.showOpenDialog(settingsWindow.windowFor(), {
      title: 'Add your own companion images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'gif', 'webp', 'svg', 'jpg', 'jpeg', 'apng'] }],
    });
    if (result.canceled) return [];
    return result.filePaths.map((p) => ({ path: p, url: characterUrl(p) }));
  }));

  ipcMain.handle('settings:resolve-image', fromSettings((_e, imagePath) => characterUrl(imagePath)));

  ipcMain.handle('settings:test', fromSettings((_e, reminder) => showTestReminder(config.normalizeReminder(reminder))));

  ipcMain.handle('settings:open-folder', fromSettings(() => shell.showItemInFolder(config.filePath())));

  ipcMain.on('overlay:set-interactive', fromOverlay((on) => presenter.setInteractive(Boolean(on))));
  ipcMain.on('overlay:done', fromOverlay(() => presenter.finish('done')));
  ipcMain.on('overlay:snooze', fromOverlay(() => presenter.finish('snooze')));
}

function init() {
  if (process.platform === 'win32') {
    // Must match build.appId so Windows notifications (including update notices) show.
    app.setAppUserModelId('com.sunil8113.desktopcompanion');
  }
  if (process.platform === 'darwin') {
    // A menu-bar app: no Dock icon (the installed app also sets LSUIElement). The menu is
    // never shown, but without its Edit roles copy and paste don't work in Settings.
    app.dock?.hide();
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
  }
  seedCompanions();
  const cfg = config.load();

  scheduler = new Scheduler();
  presenter = new OverlayPresenter({
    getDisplayMode: () => config.get().overlayDisplay,
    getExtras: (reminder) => {
      const c = config.get();
      return {
        snoozeMinutes: c.snoozeMinutes,
        soundEnabled: c.soundEnabled,
        thunderSrc: thunderUrl(),
        prop: propFor(reminder),
        creator: creator(),
        ...resolveCharacter(reminder.companion || c.character, c),
      };
    },
  });

  scheduler.on('due', async (reminder, meta) => {
    await greetIfNewDay(); // not greeted yet today (e.g. the PC stayed unlocked overnight): hello first
    presenter.enqueue(reminder, meta);
  });
  presenter.on('done', ({ reminder, meta }) => {
    if (meta.isUpdate && !meta.isTest) restartToUpdate();
    if (meta.isGreeting) return;
    if (!meta.isTest) scheduler.acknowledge(reminder.id);
    if (reminder.id === FAREWELL_AFTER_ID) showFarewell();
  });
  presenter.on('snooze', ({ reminder, meta }) => {
    if (meta.isGreeting) return; // "Later" on the update bubble: it installs when the app quits
    if (!meta.isTest) scheduler.snooze(reminder.id, config.get().snoozeMinutes);
  });

  registerIpc();
  scheduler.start(cfg);

  tray = createTray({
    scheduler,
    onOpenSettings: () => settingsWindow.open(),
    onTest: () => showTestReminder(),
    onCheckUpdates: checkForUpdates,
    onQuit: () => app.quit(),
  });
  initUpdater({ onReady: showUpdateReady });

  powerMonitor.on('resume', () => {
    scheduler.resetIntervals();
    greetIfNewDay();
  });
  powerMonitor.on('unlock-screen', () => {
    scheduler.resetIntervals();
    greetIfNewDay();
  });

  applyLoginItem(cfg);
  if (config.isFirstRun()) settingsWindow.open();
  // --demo shows the first reminder, --demo=<reminder id> (e.g. --demo=lunch) a specific one,
  // --demo=greeting the creator's morning hello, --demo=farewell the evening one and
  // --demo=update the "update ready" bubble.
  const demo = process.argv.find((a) => a === '--demo' || a.startsWith('--demo='));
  if (demo) {
    const id = demo.split('=')[1];
    if (id === 'greeting') setTimeout(async () => showGreeting(await greetingText()), 1500);
    else if (id === 'farewell') setTimeout(() => showFarewell(), 1500);
    else if (id === 'update') setTimeout(() => showUpdateReady(app.getVersion(), { isTest: true }), 1500);
    else setTimeout(() => showTestReminder(id && config.get().reminders.find((r) => r.id === id)), 1500);
  } else {
    // Started at sign-in (or by hand): say hello once the desktop has settled.
    setTimeout(greetIfNewDay, 4000);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => settingsWindow.open());
  app.on('window-all-closed', () => {
    /* keep running in the tray */
  });
  app.on('before-quit', () => {
    scheduler?.stop();
    tray?.destroy();
  });
  app.whenReady().then(init);
}
