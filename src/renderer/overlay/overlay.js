const api = window.overlay;
const sfx = window.Sfx;

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const actor = $('actor');
const rig = $('rig');
const rope = $('rope');
const flash = $('flash');
const tag = $('tag');
const title = $('title');
const message = $('message');
const characterImg = $('character');
const characterKeyed = $('character-keyed');
const prop = $('prop');
const bubble = $('bubble');
const doneBtn = $('done');
const snoozeBtn = $('snooze');

const fx = window.Lightning.createFx($('fx'));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let payload = null;
let character = characterImg; // whichever element is showing the character
let swing = null; // { length } while hanging from a web
let interactive = false;
let leaving = false;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const deg = (d) => (d * Math.PI) / 180;

// Calls step(elapsedMs) every animation frame for `duration` ms (including t = duration).
function frames(duration, step) {
  return new Promise((resolve) => {
    const start = performance.now();
    (function tick(now) {
      const t = clamp(now - start, 0, duration);
      step(t);
      if (t >= duration) resolve();
      else requestAnimationFrame(tick);
    })(start);
  });
}

// The window ignores the mouse (clicks fall through to the desktop) until the
// pointer is over the bubble or the character. Mouse moves are still forwarded to us.
function setInteractive(on) {
  if (on === interactive) return;
  interactive = on;
  api.setInteractive(on);
}

window.addEventListener('mousemove', (e) => setInteractive(Boolean(e.target.closest('.interactive'))));
document.documentElement.addEventListener('mouseleave', () => setInteractive(false));

function render(p) {
  const root = document.documentElement.style;
  root.setProperty('--inset-bottom', `${p.insets.bottom}px`);
  root.setProperty('--inset-right', `${p.insets.right}px`);

  const tagText = p.isTest ? 'Preview' : p.snoozed ? 'Snoozed' : '';
  tag.hidden = !tagText;
  tag.textContent = tagText;
  title.textContent = p.reminder.title;
  message.textContent = p.reminder.message;
  snoozeBtn.textContent = `Snooze ${p.snoozeMinutes} min`;

  characterImg.src = p.characterSrc;
  stage.classList.toggle('framed', p.characterStyle === 'frame');
  rig.style.setProperty('--grip-x', `${p.grip.x * 100}%`);
  rig.style.setProperty('--grip-y', `${p.grip.y * 100}%`);
  rig.style.setProperty('--hold-x', `${p.hold.x * 100}%`);
  rig.style.setProperty('--hold-y', `${p.hold.y * 100}%`);
  if (p.prop) {
    prop.src = p.prop.src;
    prop.style.width = `${p.prop.width}px`;
    rig.style.setProperty('--prop-anchor', p.prop.anchorY);
    prop.hidden = false;
  }
}

// For 'remove-dark', play the keyed animation on a canvas instead of the <img>.
async function useKeyedCharacter(p) {
  if (p.characterStyle !== 'remove-dark' || !p.characterData) return;
  try {
    if (!(await window.Keyer.start(characterKeyed, p.characterData))) return;
  } catch (err) {
    console.warn('Could not remove the background, showing the image as is:', err);
    return;
  }
  characterImg.hidden = true;
  characterKeyed.hidden = false;
  character = characterKeyed;
}

// ---------- shared effects ----------

function screenFlash() {
  // Bright hit, quick dip, a re-strike flicker, then fade. Mirrors the bolt's timeline.
  flash.animate(
    [
      { opacity: 0 },
      { opacity: 0.72, offset: 0.06 },
      { opacity: 0.1, offset: 0.24 },
      { opacity: 0.45, offset: 0.36 },
      { opacity: 0 },
    ],
    { duration: 620, easing: 'ease-out' },
  );
}

function shake(el, strength = 6) {
  const s = strength;
  el.animate(
    [
      { transform: 'none' },
      { transform: `translate(${-s}px, ${s / 2}px)` },
      { transform: `translate(${s}px, ${-s / 2}px)` },
      { transform: `translate(${-s / 2}px, ${s / 3}px)` },
      { transform: `translate(${s / 3}px, 0)` },
      { transform: 'none' },
    ],
    { duration: 280, easing: 'ease-out' },
  );
}

function popBubble() {
  bubble.style.opacity = '1';
  return bubble.animate(
    [
      { opacity: 0, transform: 'scale(0.6)' },
      { opacity: 1, transform: 'scale(1.04)', offset: 0.7 },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 320, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'backwards' },
  ).finished;
}

function feet() {
  const box = character.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.bottom - 8 };
}

// ---------- lightning entrance / exit ----------

async function strikeIn(p) {
  const box = character.getBoundingClientRect();
  const impact = feet();
  const from = { x: clamp(impact.x + rand(-0.35, 0.05) * window.innerWidth, 40, window.innerWidth - 40), y: -20 };

  fx.strike(from, impact);
  await wait(fx.GROW_MS); // bolt reaches the ground

  screenFlash();
  if (p.soundEnabled) sfx.thunder(p.thunderSrc);

  // Character rides the bolt down...
  rig.style.opacity = '1';
  await rig.animate(
    [{ transform: `translateY(${-(box.bottom + 60)}px) scale(0.85, 1.25)` }, { transform: 'none' }],
    { duration: 240, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'backwards' },
  ).finished;

  // ...and lands with squash & stretch, sparks and a shockwave.
  fx.sparks(impact.x, impact.y);
  fx.ring(impact.x, impact.y);
  shake(stage);
  rig.animate(
    [
      { transform: 'none' },
      { transform: 'scale(1.2, 0.78)', offset: 0.25 },
      { transform: 'scale(0.94, 1.07)', offset: 0.6 },
      { transform: 'none' },
    ],
    { duration: 460, easing: 'ease-out' },
  );
}

async function leapOut() {
  const box = character.getBoundingClientRect();
  const at = feet();
  // Crouch, then leap off the top of the screen.
  const leap = rig.animate(
    [
      { transform: 'none' },
      { transform: 'scale(1.14, 0.84)', offset: 0.28 },
      { transform: `translateY(${-(box.bottom + 80)}px) scale(0.85, 1.25)` },
    ],
    { duration: 520, easing: 'cubic-bezier(0.5, 0, 0.9, 0.4)', fill: 'forwards' },
  );
  await wait(150);
  fx.sparks(at.x, at.y, 18);
  fx.ring(at.x, at.y, 100, 350);
  await leap.finished;
}

// ---------- web swing entrance / exit ----------
//
// The character hangs from a web anchored just above the top of the screen, directly
// above its final grip point. theta is the web's angle from vertical (positive = the
// character is to the right of the anchor) and len its length.

const SWING_IN_MS = 1700;
const SWING_OUT_MS = 760;

const web = window.WebFx.create(fx);

function swingPose(theta, len) {
  const dx = len * Math.sin(theta);
  const dy = len * Math.cos(theta) - swing.length;
  rig.style.transform = `translate(${dx}px, ${dy}px) rotate(${-theta}rad)`;
  rope.style.height = `${len}px`;
  if (swing.trail?.active) swing.trail.push(dx, dy, theta);
}

// Faded after-images of the character following it through the swing (comic speed lines).
// Drawn on the canvas with the same transform as #rig: rotate around the grip point.
function startTrail() {
  const TTL = 190;
  const ghosts = [];
  let n = 0;
  const trail = {
    active: true,
    push: (dx, dy, theta) => {
      if (n++ % 3 === 0) ghosts.push({ dx, dy, theta, at: performance.now() });
    },
  };
  swing.trail = trail;
  fx.add((c) => {
    const now = performance.now();
    while (ghosts.length && now - ghosts[0].at > TTL) ghosts.shift();
    if (!trail.active && ghosts.length === 0) return false;
    c.globalCompositeOperation = 'source-over';
    for (const g of ghosts) {
      c.globalAlpha = 0.3 * (1 - (now - g.at) / TTL);
      c.save();
      c.translate(swing.gripX + g.dx, swing.gripY + g.dy);
      c.rotate(-g.theta);
      c.drawImage(character, swing.offX - swing.gx, swing.offY - swing.gy, swing.w, swing.h);
      c.restore();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'lighter';
    return true;
  });
  return trail;
}

async function swingIn(p) {
  stage.classList.add('swing');
  const box = character.getBoundingClientRect();
  const rigBox = rig.getBoundingClientRect();
  const gx = box.left - rigBox.left + box.width * p.grip.x;
  const gy = box.top - rigBox.top + box.height * p.grip.y;
  const length = box.top + box.height * p.grip.y + 30; // anchor 30px above the screen
  swing = {
    length,
    gx,
    gy,
    gripX: rigBox.left + gx, // grip point on screen when hanging at rest
    gripY: rigBox.top + gy,
    offX: box.left - rigBox.left,
    offY: box.top - rigBox.top,
    w: box.width,
    h: box.height,
  };
  rig.style.transformOrigin = `${gx}px ${gy}px`; // body pivots around its grip...
  actor.style.transformOrigin = `${gx}px ${gy - length}px`; // ...and idles around the anchor

  // Fire a web from off-screen (where the swing starts) up to the anchor; it sticks there
  // with a splat and a comic "THWIP!".
  const theta0 = deg(75);
  const anchor = { x: swing.gripX, y: swing.gripY - length };
  const start = { x: anchor.x + length * Math.sin(theta0), y: anchor.y + length * Math.cos(theta0) };
  if (p.soundEnabled) sfx.thwip();
  await web.shoot(start, anchor);
  swing.splat = web.splat(anchor.x, 0);
  web.burst('THWIP!', clamp(anchor.x - 110, 80, window.innerWidth - 80), 64, -12);

  // Then swing in from far up and off to the right as a damped pendulum.
  swingPose(theta0, length);
  rig.style.opacity = '1';
  if (p.soundEnabled) sfx.whoosh(1.1);
  const trail = startTrail();
  await frames(SWING_IN_MS, (t) => {
    const s = t / 1000;
    swingPose(theta0 * Math.exp(-2.6 * s) * Math.cos(2 * Math.PI * 0.75 * s), length);
  });
  trail.active = false;
  swingPose(0, length);
  actor.classList.add('sway');
}

async function swingOut(p) {
  if (p.soundEnabled) {
    sfx.thwip();
    setTimeout(() => sfx.whoosh(0.7), 60);
  }
  web.burst('THWIP!', clamp(swing.gripX - 90, 80, window.innerWidth - 80), clamp(swing.gripY - 40, 60, window.innerHeight - 60), 10);
  setTimeout(() => swing.splat?.remove(), SWING_OUT_MS * 0.6);
  // Small wind-up to the left, then swing up and out to the right while the web reels in.
  const windUp = deg(16);
  const out = deg(88);
  const trail = startTrail();
  await frames(SWING_OUT_MS, (t) => {
    const k = t / SWING_OUT_MS;
    const theta = out * k * k - windUp * Math.sin(Math.PI * Math.min(k / 0.35, 1));
    swingPose(theta, swing.length * (1 - 0.4 * k * k));
  });
  trail.active = false;
}

// ---------- entrance / exit ----------

async function playEntrance(p) {
  await useKeyedCharacter(p);
  if (character === characterImg) {
    try {
      await characterImg.decode(); // need its real size to aim the bolt / web
    } catch {
      /* broken image: still show the bubble */
    }
  }
  stage.classList.add('ready');

  if (reducedMotion) {
    for (const el of [rig, bubble]) {
      el.style.opacity = '1';
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
    }
  } else {
    if (p.entrance === 'swing') await swingIn(p);
    else await strikeIn(p);
    await wait(120);
    await popBubble();
  }
  stage.classList.add('live');
  if (!prop.hidden) prop.classList.add('offer');
}

// "Done": the held prop (water bottle, lunch box) is handed over to you.
function handOverProp() {
  prop.classList.remove('offer');
  const anchor = payload.prop.anchorY;
  return prop.animate(
    [
      { transform: `translate(-50%, ${anchor}) rotate(-6deg) scale(1)`, opacity: 1 },
      { transform: `translate(-50%, ${anchor}) translate(-60px, 14px) rotate(-14deg) scale(1.7)`, opacity: 0 },
    ],
    { duration: 380, easing: 'ease-in', fill: 'forwards' },
  ).finished;
}

async function playExit(action) {
  if (reducedMotion) {
    await stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished;
    return;
  }
  bubble.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.8)' }], {
    duration: 160,
    easing: 'ease-in',
    fill: 'forwards',
  });
  if (action === 'done' && !prop.hidden) {
    handOverProp();
    await wait(260);
  }
  if (swing) await swingOut(payload);
  else await leapOut();
}

async function leave(action) {
  if (leaving) return;
  leaving = true;
  doneBtn.disabled = true;
  snoozeBtn.disabled = true;
  stage.classList.remove('live');
  await playExit(action);
  api[action]();
}

doneBtn.addEventListener('click', () => leave('done'));
snoozeBtn.addEventListener('click', () => leave('snooze'));

api.onShow((p) => {
  payload = p;
  render(p);
  playEntrance(p);
});
