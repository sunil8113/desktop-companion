# Desk Companion

A tray app for Windows and macOS that reminds you to drink water, move, eat lunch and go home.
When a reminder fires, a character pops up at the bottom-right of your screen with a
speech bubble and **Done** / **Snooze** buttons.

Created by **Sunil**.

## Download

### Windows

1. Go to [Releases](https://github.com/sunil8113/desktop-companion/releases/latest) and download
   `Desk-Companion-Setup-x.x.x.exe`.
2. Run it. The app isn't code-signed, so Windows may show **"Windows protected your PC"**.
   Click **More info → Run anyway**.
3. Desk Companion starts in the system tray (check the **^** overflow area next to the clock).
   Left-click its icon to open Settings.

Updates install automatically. To uninstall, use **Windows Settings → Apps → Installed apps →
Desk Companion**.

### macOS

1. Go to [Releases](https://github.com/sunil8113/desktop-companion/releases/latest) and download
   `Desk-Companion-x.x.x-mac-arm64.dmg` for Apple Silicon Macs (M1 and later) or
   `Desk-Companion-x.x.x-mac-x64.dmg` for Intel Macs. (Apple menu → **About This Mac** shows which.)
2. Open the `.dmg` and drag **Desk Companion** into **Applications**.
3. The app isn't notarized by Apple, so the first time you open it macOS blocks it. Go to
   **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to
   Desk Companion. If macOS instead says the app "is damaged", run this in Terminal once:
   ```sh
   xattr -dr com.apple.quarantine "/Applications/Desk Companion.app"
   ```
4. Desk Companion appears in the menu bar at the top of the screen (no Dock icon).
   Click its icon to open Settings.

On a Mac the app tells you when a new version is out and opens the download page; download
the new `.dmg` and drag it into Applications to replace the old one. Your settings are kept.

The Mac installers are built by GitHub Actions (`.github/workflows/mac.yml`) and attached to
each release automatically, a few minutes after it's published.

## Run from source

```sh
npm install
npm start          # runs in the system tray
npm run demo       # same, plus a test reminder 1.5 s after launch
npx electron . --demo=lunch   # demo one reminder by id: water, stand, lunch, home
npx electron . --demo=greeting   # demo the morning hello (the day's quote)
npx electron . --demo=farewell   # demo the evening goodbye (shown after Done on "Go home")
```

- **Left-click** the tray icon to open Settings.
- **Right-click** for upcoming reminders, pause/resume, a test reminder and Quit.

## Defaults

| Reminder        | When              |
| --------------- | ----------------- |
| Water break     | every 45 minutes  |
| Stand up & walk | every 50 minutes  |
| Lunch time      | daily at 1:00 PM  |
| Go home         | daily at 6:00 PM  |

All of these can be edited, disabled, deleted or added to in Settings, along with the days of
the week, the snooze length, optional work hours for repeating reminders, and launch at login.

Settings are saved to `%APPDATA%\Desk Companion\settings.json`. You can open that folder from
the Settings footer. The file is validated on load, and if it's corrupt it's renamed to
`settings.corrupt-<timestamp>.json` and the defaults are used instead.

## Scheduling rules

- Repeating reminders count down from launch, and restart from when you click **Done**.
- **Snooze** brings the reminder back after the snooze length and holds off its regular cycle.
- After sleep, unlocking the PC or resuming from pause, repeating countdowns restart, so you
  don't get a backlog of reminders.
- A daily reminder fires at its time, or up to 5 minutes late if the PC was asleep. If it was
  missed by more than that, it's skipped for the day.
- Only one overlay shows at a time. Others queue, and the same reminder is never queued twice.

## Using your own character

Pick a companion in **Settings → Character**:
- **Thunder god** (default): arrives on a lightning strike with a screen flash and thunder,
  then leaps away when you click Done or Snooze.
- **Web-slinger:** swings in from the top of the screen on a web and hangs at the
  bottom-right, then swings back up when you're done.
- **Lightning speedster:** dashes in from the left on a crackling lightning trail, skids to a stop and
  turns to face you, then races off.
- **Iron-suit hero:** red and gold armor; flies down on jet boots and touches down in a thruster blast, then
  blasts off upwards.
- **Sky hero:** red suit and blue cape; swoops down from the top-left of the sky and lands, then flies up and away.
- **Night hero:** drops in on a grapple line and bounces to a stop, then is yanked back up.
- **Mystic wizard:** steps out of a swirling magic portal, then vanishes back into one.
- **Hooded archer:** purple and black; fires an arrow into the top of the screen trailing a line, drops onto it and
  zips down, then gets pulled back up it.
- **Ocean king:** rides a water spout up from the bottom of the screen, is lowered onto
  his spot as it drains away in a splash, then sinks back down into the water.
- **My own image:** any PNG, GIF, WebP or SVG, shown about 220px wide. You can give it any of
  the entrances above. For the web swing, grapple and zip line, the line attaches to the top
  centre of the image.

All the built-in companions are original artwork in `assets/character/`.

### Different companions per reminder

Each reminder card in Settings has a **Companion** field (default: the one chosen under
**Character**) and a **Holds** field: water bottle, lunch box (a steel tiffin), nothing, or
automatic. Automatic gives water reminders the bottle and lunch/food reminders the tiffin.
Whatever the companion holds is handed to you when you click **Done**.

### Adding your own companion to the list

Personal companions live in `local-characters/`, which is kept out of git. Put the image there
and describe it in `local-characters/characters.json`:

```json
[{ "id": "spiderman", "name": "Spider-Man (swings in on a web)", "file": "spiderman.png",
   "entrance": "swing", "grip": { "x": 0.5, "y": 0.01 }, "hold": { "x": 0.73, "y": 0.78 } }]
```

`grip` (where the web attaches) and `hold` (where the water bottle goes) are fractions of the
image's width and height. The companion then appears under **Settings → Character → Companion**.
If the image has a plain white background, run `npm run cutout -- input.png output.png` to remove
it and crop to the character.

For water reminders the companion holds out a water bottle, and hands it to you when you click
**Done**. The art is in `assets/character/` and `assets/props/`.

If your image or GIF has no transparent background, change **Background** under
**Settings → Character**:
- **Remove dark background:** for clips shot on black. Dark pixels become transparent, so only
  the bright parts (lightning, glowing weapons, highlights) float over the desktop.
- **Show in a glowing frame:** shows the image as a rounded card with a blue glow.

Reminders show on the main display by default. To show them on whichever display the mouse
is on instead, change **Settings → General → Show reminders on**.

## Animation and sound

**Lightning entrance** (thunder god):
1. A branching blue bolt strikes the spot where the character will land.
2. The screen flashes and the thunder sounds.
3. The character drops in on the bolt and lands with a squash, sparks and a shockwave.
4. The speech bubble pops in.

Clicking **Done** or **Snooze** makes the character crouch and leap off the top of the screen.

**Web swing entrance** (web-slinger, Spider-Man):
1. A web shoots in from off-screen ("thwip") and sticks to the top of the screen with a web
   splat and a comic "THWIP!" burst.
2. The character swings in on the web with a motion trail of faded after-images, then settles
   hanging at the bottom-right, swaying gently.
3. The speech bubble pops in.

Clicking **Done** or **Snooze** fires another "THWIP!" and the character swings back up off the
screen (with the motion trail) while the web splat fades. The code is in
`src/renderer/overlay/webfx.js`.

- The thunder is synthesized with Web Audio. To use a recording instead, put `thunder.mp3`,
  `thunder.ogg` or `thunder.wav` in `assets/sounds/`. To turn the sound off, use
  **Settings → General**.
- If Windows **Settings → Accessibility → Visual effects → Animation effects** is off, the
  bolt, flash and motion are skipped and the character and bubble simply fade in.
- The code is in `src/renderer/overlay/`: `lightning.js` (canvas effects), `thunder.js`
  (sound) and `overlay.js` (timeline).

## Project layout

```
src/main/        main process
  main.js          app lifecycle, IPC wiring
  config.js        defaults, validation, JSON persistence
  scheduler.js     due-time logic (interval, daily, snooze, pause)
  overlay-window.js  transparent full-screen reminder window + queue
  settings-window.js, tray.js, paths.js, harden.js
src/preload/     context-isolated bridges for each window
src/renderer/    settings/ and overlay/ pages (plain HTML/CSS/JS)
assets/          icons (regenerate with `npm run icons`) the companion characters, and props
```

## Roadmap

- [x] **Phase 1:** tray app, settings window, JSON config
- [x] **Phase 2:** scheduler, overlay with character, speech bubble, Done / Snooze
- [x] **Phase 3:** blue lightning strike on canvas, screen flash, thunder sound, character
      landing and leap-away animations
- [x] Packaging: Windows installer (`npm run dist`, output in `dist/`)
