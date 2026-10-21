const { app, ipcMain, dialog, shell, powerMonitor } = require('electron');
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
  app.setAppUserModelId('com.descomp.deskcompanion');
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
        ...resolveCharacter(look),
      };
    },
  });

  scheduler.on('due', (reminder, meta) => presenter.enqueue(reminder, meta));
  presenter.on('done', ({ reminder, meta }) => {
    if (!meta.isTest) scheduler.acknowledge(reminder.id);
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
    onQuit: () => app.quit(),
  });

  powerMonitor.on('resume', () => scheduler.resetIntervals());
  powerMonitor.on('unlock-screen', () => scheduler.resetIntervals());

  applyLoginItem(cfg);
  if (config.isFirstRun()) settingsWindow.open();
  // --demo shows the first reminder, --demo=<reminder id> (e.g. --demo=lunch) a specific one.
  const demo = process.argv.find((a) => a === '--demo' || a.startsWith('--demo='));
  if (demo) {
    const id = demo.split('=')[1];
    setTimeout(() => showTestReminder(id && config.get().reminders.find((r) => r.id === id)), 1500);
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
