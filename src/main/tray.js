const { Tray, Menu, nativeImage } = require('electron');
const paths = require('./paths');

const MINUTE = 60 * 1000;

function formatDue(dueAt) {
  const mins = Math.max(0, Math.ceil((dueAt - Date.now()) / MINUTE));
  if (mins < 1) return 'now';
  if (mins < 60) return `in ${mins} min`;
  const d = new Date(dueAt);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `at ${time}` : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

function createTray({ scheduler, onOpenSettings, onTest, onCheckUpdates, onQuit }) {
  const tray = new Tray(nativeImage.createFromPath(paths.trayIcon));

  function pausedLabel() {
    if (scheduler.pausedUntil === Infinity) return 'Paused until resumed';
    return `Paused until ${new Date(scheduler.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }

  function buildMenu() {
    const paused = scheduler.isPaused();
    const upcoming = scheduler.upcoming().slice(0, 5);
    const upcomingItems = paused
      ? [{ label: pausedLabel(), enabled: false }]
      : upcoming.length
        ? upcoming.map(({ reminder, dueAt, snoozed }) => ({
            label: `${reminder.title}${snoozed ? ' (snoozed)' : ''}: ${formatDue(dueAt)}`,
            enabled: false,
          }))
        : [{ label: 'No reminders scheduled', enabled: false }];

    return Menu.buildFromTemplate([
      { label: 'Desk Companion', enabled: false },
      { type: 'separator' },
      ...upcomingItems,
      { type: 'separator' },
      paused
        ? { label: 'Resume reminders', click: () => scheduler.resume() }
        : {
            label: 'Pause reminders',
            submenu: [
              { label: 'For 30 minutes', click: () => scheduler.pause(30 * MINUTE) },
              { label: 'For 1 hour', click: () => scheduler.pause(60 * MINUTE) },
              { label: 'For 2 hours', click: () => scheduler.pause(120 * MINUTE) },
              { label: 'Until I resume', click: () => scheduler.pause(Infinity) },
            ],
          },
      { label: 'Show a test reminder', click: onTest },
      { label: 'Settings…', click: onOpenSettings },
      { label: 'Check for updates…', click: onCheckUpdates },
      { type: 'separator' },
      { label: 'Quit', click: onQuit },
    ]);
  }

  function refreshTooltip() {
    if (tray.isDestroyed()) return;
    if (scheduler.isPaused()) return tray.setToolTip(`Desk Companion: ${pausedLabel().toLowerCase()}`);
    const next = scheduler.upcoming()[0];
    tray.setToolTip(next ? `Desk Companion\nNext: ${next.reminder.title} ${formatDue(next.dueAt)}` : 'Desk Companion');
  }

  // Build the menu on demand so the countdowns are always fresh.
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  tray.on('click', onOpenSettings);

  scheduler.on('changed', refreshTooltip);
  const timer = setInterval(refreshTooltip, 30 * 1000);
  tray.on('destroyed', () => clearInterval(timer));
  refreshTooltip();

  return tray;
}

module.exports = { createTray };
