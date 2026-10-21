// Shows reminders one at a time in a transparent, frameless, always-on-top window
// covering the whole display. Emits 'done' / 'snooze' with the { reminder, meta } item.
const { BrowserWindow, screen } = require('electron');
const { EventEmitter } = require('events');
const paths = require('./paths');
const { harden } = require('./harden');

const GAP_BETWEEN_REMINDERS_MS = 400;

class OverlayPresenter extends EventEmitter {
  constructor({ getExtras, getDisplayMode }) {
    super();
    this.getExtras = getExtras; // (reminder) => { snoozeMinutes, soundEnabled, character..., prop, ... }
    this.getDisplayMode = getDisplayMode; // () => 'primary' | 'cursor'
    this.queue = [];
    this.current = null;
    this.win = null;
  }

  enqueue(reminder, meta = {}) {
    const id = reminder.id;
    if (this.current?.reminder.id === id || this.queue.some((q) => q.reminder.id === id)) return;
    this.queue.push({ reminder, meta });
    this.showNext();
  }

  showNext() {
    if (this.current || this.queue.length === 0) return;
    this.current = this.queue.shift();
    this.open(this.current);
  }

  open(item) {
    const display = this.getDisplayMode() === 'cursor'
      ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      : screen.getPrimaryDisplay();
    const { bounds, workArea } = display;

    const win = new BrowserWindow({
      ...bounds,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: paths.overlayPreload,
        autoplayPolicy: 'no-user-gesture-required', // thunder plays without a click
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    this.win = win;
    harden(win);
    win.setAlwaysOnTop(true, 'screen-saver');
    // On a Mac, also show over full-screen apps and on whichever Space is active.
    if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Clicks pass through to the desktop except over the character/bubble (renderer toggles this).
    win.setIgnoreMouseEvents(true, { forward: true });

    const payload = {
      reminder: { id: item.reminder.id, type: item.reminder.type, title: item.reminder.title, message: item.reminder.message },
      isTest: Boolean(item.meta.isTest),
      snoozed: Boolean(item.meta.snoozed),
      // Space the taskbar takes up, so the character stands on top of it.
      insets: {
        bottom: bounds.y + bounds.height - (workArea.y + workArea.height),
        right: bounds.x + bounds.width - (workArea.x + workArea.width),
      },
      ...this.getExtras(item.reminder),
    };

    win.webContents.once('did-finish-load', () => {
      if (win.isDestroyed()) return;
      win.webContents.send('overlay:show', payload);
      win.showInactive(); // don't steal keyboard focus from whatever the user is typing in
    });
    win.on('closed', () => {
      if (this.win === win) this.win = null;
      if (this.current === item) this.finish('done');
    });
    win.loadFile(paths.overlayHtml);
  }

  finish(action) {
    const item = this.current;
    if (!item) return;
    this.current = null;
    const win = this.win;
    this.win = null;
    if (win && !win.isDestroyed()) win.destroy();
    this.emit(action, item);
    setTimeout(() => this.showNext(), GAP_BETWEEN_REMINDERS_MS);
  }

  setInteractive(on) {
    if (!this.win || this.win.isDestroyed()) return;
    if (on) this.win.setIgnoreMouseEvents(false);
    else this.win.setIgnoreMouseEvents(true, { forward: true });
  }

  owns(webContents) {
    return Boolean(this.win && !this.win.isDestroyed() && this.win.webContents === webContents);
  }
}

module.exports = { OverlayPresenter };
