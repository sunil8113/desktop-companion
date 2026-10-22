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
const { initUpdater, checkForUpdates } = require('./updater');

let scheduler;
let presenter;
let tray;

const fileUrl = (file) => pathToFileURL(file).href;

function characterUrl(imagePath) {
  return fileUrl(imagePath && fs.existsSync(imagePath) ? imagePath : findCompanion('thunder-god').file);
}

// Everything the overlay needs to show the chosen companion. An unknown companion, or a
// custom image whose file has gone missing, falls back to the thunder god.
function resolveCharacter(c) {
  const companion = c.character !== 'custom' && (findCompanion(c.character) || findCompanion('thunder-god'));
  if (companion) {
    return { characterSrc: fileUrl(companion.file), characterStyle: 'plain', characterData: null, entrance: companion.entrance, grip: companion.grip, hold: companion.hold };
  }
  if (!c.characterImage || !fs.existsSync(c.characterImage)) return resolveCharacter({ ...c, character: 'thunder-god' });
  return {
    characterSrc: fileUrl(c.characterImage),
    characterStyle: c.characterStyle,
    characterData: c.characterStyle === 'remove-dark' ? characterBytes(c.characterImage) : null,
    entrance: c.customEntrance,
    ...CUSTOM_DEFAULTS,
  };
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

function greetIfNewDay() {
  const text = takeDailyGreeting();
  if (text) showGreeting(text);
}

function showGreeting(text) {
  // Built directly rather than through normalizeReminder, whose length limits suit reminders
  // typed in Settings, not the longer quotes.
  const greeting = { id: GREETING_ID, type: 'greeting', title: text.title, message: text.message, companion: '', prop: 'none' };
  presenter.enqueue(greeting, { isGreeting: true });
}

function takeDailyGreeting() {
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    /* first run, or unreadable: greet */
  }
  if (state.lastGreeting === today) return null;
  try {
    fs.writeFileSync(statePath(), JSON.stringify({ ...state, lastGreeting: today }));
  } catch (err) {
    console.warn('[greeting] could not save state:', err.message);
  }
  return greetingText(now);
}

// A motivational quote for each day of the week (Date#getDay(): 0 = Sunday), with a fun line.
const GREETINGS = [
  {
    day: 'Sunday',
    emoji: '🧘',
    quote: 'Once every seven days, do something that frightens you. Every time we do something that we resist and is frightening, we actually grow in our power.',
    vibe: 'Use today to reset, breathe, and step just a tiny bit outside your comfort zone to prep for a fresh start.',
  },
  {
    day: 'Monday',
    emoji: '💪',
    quote: 'There are 7 days in a week, and SOMEDAY isn’t one of them.',
    vibe: 'Ditch the "I\'ll do it someday" excuse. Grab a big cup of coffee and treat today like the start of your next great adventure.',
  },
  {
    day: 'Tuesday',
    emoji: '🚀',
    quote: 'Do something today that your future self will thank you for.',
    vibe: 'Your future self is basically a time traveler judging your current laziness. Make them proud (or at least give them a neat desk or a finished task).',
  },
  {
    day: 'Wednesday',
    emoji: '😂',
    quote: 'Seven days without laughter makes one weak.',
    vibe: "You're officially halfway through the week. If things get stressful, take a quick break, laugh at a silly video, and recharge.",
  },
  {
    day: 'Thursday',
    emoji: '🎈',
    quote: "If you're not having fun, you're doing something wrong.",
    vibe: 'Thursday is the sneak peek of the weekend. Find a tiny bit of joy or playfulness in whatever project is on your plate right now.',
  },
  {
    day: 'Friday',
    emoji: '🎉',
    quote: 'My mission in life is not merely to survive, but to thrive; and to do so with some passion, some compassion, some humor, and some style.',
    vibe: 'Friday calls for high energy, good music, and wrapping up your goals with a smile.',
  },
  {
    day: 'Saturday',
    emoji: '🌈',
    quote: "It's kind of fun to do the impossible.",
    vibe: 'Saturday is your playground. Tackle a passion project, go on an adventure, or do absolutely nothing guilt-free.',
  },
];

function greetingText(now = new Date()) {
  const g = GREETINGS[now.getDay()];
  const title = now.getHours() < 12 ? `Good morning! Happy ${g.day} ${g.emoji}` : `Happy ${g.day}! ${g.emoji}`;
  return { title, message: `“${g.quote}”\n\n${g.vibe}` };
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

  ipcMain.handle('settings:pick-image', fromSettings(async () => {
    const result = await dialog.showOpenDialog(settingsWindow.windowFor(), {
      title: 'Choose a character image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'gif', 'webp', 'svg', 'jpg', 'jpeg', 'apng'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return { path: result.filePaths[0], url: characterUrl(result.filePaths[0]) };
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
      const look = reminder.companion ? { ...c, character: reminder.companion } : c;
      return {
        snoozeMinutes: c.snoozeMinutes,
        soundEnabled: c.soundEnabled,
        thunderSrc: thunderUrl(),
        prop: propFor(reminder),
        creator: creator(),
        ...resolveCharacter(look),
      };
    },
  });

  scheduler.on('due', (reminder, meta) => {
    greetIfNewDay(); // not greeted yet today (e.g. the PC stayed unlocked overnight): hello first
    presenter.enqueue(reminder, meta);
  });
  presenter.on('done', ({ reminder, meta }) => {
    if (!meta.isTest && !meta.isGreeting) scheduler.acknowledge(reminder.id);
  });
  presenter.on('snooze', ({ reminder, meta }) => {
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
  initUpdater();

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
  // and --demo=greeting the creator's hello.
  const demo = process.argv.find((a) => a === '--demo' || a.startsWith('--demo='));
  if (demo) {
    const id = demo.split('=')[1];
    if (id === 'greeting') setTimeout(() => showGreeting(greetingText()), 1500);
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
