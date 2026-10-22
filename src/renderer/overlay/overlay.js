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
const signature = $('signature');
const helloPhoto = $('hello-photo');

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
  signature.textContent = `— ${p.creator.name} ✨`;
  if (p.isGreeting) {
    // The creator's morning hello (a quote) or evening farewell (a fun line): no companion,
    // just their photo, the message and one button.
    stage.classList.add('hello');
    if (!p.isFarewell && !p.isUpdate) {
      const q = document.createElement('span');
      q.className = 'quote';
      q.textContent = p.reminder.message;
      message.replaceChildren(q);
    }
    if (p.creator.photo) {
      helloPhoto.src = p.creator.photo;
      helloPhoto.hidden = false;
    }
    if (p.isUpdate) {
      doneBtn.textContent = 'Restart now';
      snoozeBtn.textContent = 'Later';
    } else {
      doneBtn.textContent = p.isFarewell ? `Bye, ${p.creator.name}! 👋` : `Thanks, ${p.creator.name}!`;
      snoozeBtn.hidden = true;
    }
  }

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

const hero = window.HeroFx.create(fx);

// The character's grip point (p.grip, e.g. a raised hand), relative to #rig and on screen.
function gripPoint(p) {
  const box = character.getBoundingClientRect();
  const rigBox = rig.getBoundingClientRect();
  const gx = box.left - rigBox.left + box.width * p.grip.x;
  const gy = box.top - rigBox.top + box.height * p.grip.y;
  return { box, gx, gy, x: rigBox.left + gx, y: rigBox.top + gy };
}

// Turn from facing right (mirrored, as when running or flying in from the left) to facing
// the bubble, with a little squash.
function turnAround() {
  rig.style.transform = '';
  return rig.animate(
    [{ transform: 'scaleX(-1)' }, { transform: 'scale(-0.15, 1.06)', offset: 0.45 }, { transform: 'none' }],
    { duration: 240, easing: 'ease-out' },
  ).finished;
}

// ---------- speedster: dashes in on a lightning trail ----------

const SPEED_RGB = '255, 176, 20';
const DASH_IN_MS = 460;
const DASH_OUT_MS = 380;

async function dashIn(p) {
  const box = character.getBoundingClientRect();
  const run = box.right + 120; // start fully off the left edge
  const trailY = box.top + box.height * 0.55;
  const trail = hero.trail(SPEED_RGB);
  if (p.soundEnabled) {
    sfx.zap();
    sfx.whoosh(0.5, 0.6);
  }
  rig.style.opacity = '1';
  // Runs in facing right, leaning into it, and brakes hard...
  await frames(DASH_IN_MS, (t) => {
    const k = t / DASH_IN_MS;
    const dx = -run * (1 - k) ** 3;
    rig.style.transform = `translateX(${dx}px) scaleX(-1) skewX(${16 * (1 - k)}deg)`;
    trail.push(box.left + box.width / 2 + dx, trailY);
  });
  trail.stop();
  // ...skids to a stop in a shower of sparks and turns to face you.
  const at = feet();
  fx.sparks(at.x - 30, at.y, 26, SPEED_RGB);
  fx.ring(at.x, at.y, 110, 380, SPEED_RGB);
  await turnAround();
}

async function dashOut(p) {
  const box = character.getBoundingClientRect();
  const run = box.right + 120;
  const trailY = box.top + box.height * 0.55;
  const at = feet();
  fx.sparks(at.x + 30, at.y, 18, SPEED_RGB);
  if (p.soundEnabled) {
    sfx.zap();
    sfx.whoosh(0.45, 0.6);
  }
  const trail = hero.trail(SPEED_RGB);
  await frames(DASH_OUT_MS, (t) => {
    const k = t / DASH_OUT_MS;
    const dx = -run * k ** 3;
    rig.style.transform = `translateX(${dx}px) skewX(${16 * Math.min(1, k * 3)}deg)`;
    trail.push(box.left + box.width / 2 + dx, trailY);
  });
  trail.stop();
}

// ---------- armored hero: flies down on jet boots and lands on the thrusters ----------

const JET_RGB = '255, 170, 70';
const JET_IN_MS = 950;
const JET_OUT_MS = 620;

// Where the flames come out: under each boot.
const nozzles = (box, dy) => [0.43, 0.57].map((f) => ({ x: box.left + box.width * f, y: box.bottom - 10 + dy }));

async function jetIn(p) {
  const box = character.getBoundingClientRect();
  const drop = box.bottom + 80;
  let dy = -drop;
  const jets = hero.flames(() => nozzles(box, dy));
  if (p.soundEnabled) sfx.jet(1.4);
  rig.style.opacity = '1';
  // Descends fast, then brakes on full thrust...
  await frames(JET_IN_MS, (t) => {
    const k = t / JET_IN_MS;
    dy = -drop * (1 - k) ** 2.4;
    jets.power = 0.5 + 0.5 * k;
    rig.style.transform = `translateY(${dy}px)`;
  });
  rig.style.transform = '';
  dy = 0;
  // ...touches down in a blast, and throttles down.
  const at = feet();
  fx.ring(at.x, at.y, 150, 450, JET_RGB);
  fx.sparks(at.x, at.y, 26, JET_RGB);
  shake(stage, 4);
  rig.animate(
    [{ transform: 'none' }, { transform: 'scale(1.1, 0.88)', offset: 0.3 }, { transform: 'none' }],
    { duration: 380, easing: 'ease-out' },
  );
  await frames(300, (t) => {
    jets.power = 1 - t / 300;
  });
  jets.stop();
}

async function jetOut(p) {
  const box = character.getBoundingClientRect();
  const rise = box.bottom + 100;
  let dy = 0;
  const jets = hero.flames(() => nozzles(box, dy));
  if (p.soundEnabled) sfx.jet(1.0);
  // Spool up, then blast off.
  await frames(220, (t) => {
    jets.power = 0.2 + (0.8 * t) / 220;
  });
  const at = feet();
  fx.ring(at.x, at.y, 130, 400, JET_RGB);
  fx.sparks(at.x, at.y, 16, JET_RGB);
  await frames(JET_OUT_MS, (t) => {
    const k = t / JET_OUT_MS;
    dy = -rise * k * k;
    rig.style.transform = `translateY(${dy}px)`;
  });
  jets.stop();
}

// ---------- caped flyer: swoops down and lands ----------

const SWOOP_IN_MS = 1050;
const SWOOP_OUT_MS = 720;

const bezier = (a, b, c, k) => (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c;

async function swoopIn(p) {
  const box = character.getBoundingClientRect();
  // Dives from above the top-left of the screen and levels out just above the ground.
  const p0 = { x: -(box.right + 60), y: -(box.bottom + 60) };
  const p1 = { x: -box.width * 2.4, y: 0 };
  rig.style.transformOrigin = '50% 60%';
  rig.style.opacity = '1';
  if (p.soundEnabled) sfx.whoosh(1.1, 0.6);
  await frames(SWOOP_IN_MS, (t) => {
    const k = 1 - (1 - t / SWOOP_IN_MS) ** 2;
    const dx = bezier(p0.x, p1.x, 0, k);
    const dy = bezier(p0.y, p1.y, 0, k);
    const tilt = 55 * (1 - k) ** 1.5; // leaning into the flight, upright for the landing
    const flutter = 3 * Math.sin(t / 45);
    rig.style.transform = `translate(${dx}px, ${dy}px) rotate(${tilt}deg) scaleX(-1) skewY(${flutter}deg)`;
  });
  rig.style.transformOrigin = '';
  const at = feet();
  fx.ring(at.x, at.y, 120, 420, '255, 255, 255');
  await turnAround();
}

async function swoopOut(p) {
  const box = character.getBoundingClientRect();
  // Crouch, then take off up and away to the left.
  await rig.animate([{ transform: 'none' }, { transform: 'scale(1.1, 0.86)', offset: 0.7 }, { transform: 'none' }], { duration: 160, easing: 'ease-out' }).finished;
  const p1 = { x: -box.width * 1.5, y: 0 };
  const p2 = { x: -(box.right + 80), y: -(box.bottom + 160) };
  if (p.soundEnabled) sfx.whoosh(0.8, 0.6);
  rig.style.transformOrigin = '50% 60%';
  await frames(SWOOP_OUT_MS, (t) => {
    const k = (t / SWOOP_OUT_MS) ** 2;
    const dx = bezier(0, p1.x, p2.x, k);
    const dy = bezier(0, p1.y, p2.y, k);
    rig.style.transform = `translate(${dx}px, ${dy}px) rotate(${-50 * Math.sqrt(k)}deg) skewY(${3 * Math.sin(t / 45)}deg)`;
  });
}

// ---------- shadow hero: drops in on a grapple line ----------

const GRAPPLE_FALL_MS = 420;
const GRAPPLE_BOUNCE_MS = 800;
const GRAPPLE_OUT_MS = 560;

let grapple = null; // { length } while hanging from the line

function grapplePose(dy) {
  rig.style.transform = `translateY(${dy}px)`;
  rope.style.height = `${Math.max(0, grapple.length + dy)}px`;
}

async function grappleIn(p) {
  stage.classList.add('swing', 'grapple');
  const g = gripPoint(p);
  grapple = { length: g.y + 30 }; // line anchored 30px above the screen
  rig.style.transformOrigin = `${g.gx}px ${g.gy}px`;
  actor.style.transformOrigin = `${g.gx}px ${g.gy - grapple.length}px`;
  const drop = g.box.bottom + 40;

  // Free fall from above the screen...
  grapplePose(-drop);
  rig.style.opacity = '1';
  if (p.soundEnabled) sfx.whoosh(0.5, 0.5);
  await frames(GRAPPLE_FALL_MS, (t) => {
    const k = t / GRAPPLE_FALL_MS;
    grapplePose(-drop * (1 - k * k));
  });
  // ...until the line catches and bounces.
  if (p.soundEnabled) sfx.thunk(0.5);
  await frames(GRAPPLE_BOUNCE_MS, (t) => {
    const s = t / 1000;
    grapplePose(26 * Math.exp(-5 * s) * Math.sin(2 * Math.PI * 2.2 * s));
  });
  grapplePose(0);
  actor.classList.add('sway');
}

async function grappleOut(p) {
  const rise = character.getBoundingClientRect().bottom + 80;
  if (p.soundEnabled) setTimeout(() => sfx.whoosh(0.5, 0.5), 80);
  // A small dip, then yanked up by the line.
  await frames(GRAPPLE_OUT_MS, (t) => {
    const k = t / GRAPPLE_OUT_MS;
    grapplePose(k < 0.2 ? 12 * Math.sin((Math.PI * k) / 0.2) : -rise * ((k - 0.2) / 0.8) ** 2);
  });
}

// ---------- sorcerer: steps out of a magic portal ----------

function openPortal(p) {
  const box = character.getBoundingClientRect();
  rig.style.transformOrigin = '50% 55%';
  if (p.soundEnabled) sfx.chime();
  return hero.portal(box.left + box.width / 2, box.top + box.height * 0.55, box.width * 0.62, box.height * 0.56);
}

async function portalIn(p) {
  const gate = openPortal(p);
  await gate.opened;
  rig.style.opacity = '1';
  await rig.animate(
    [
      { transform: 'scale(0.2) rotate(-14deg)', opacity: 0, filter: 'brightness(2.5)' },
      { transform: 'none', opacity: 1, filter: 'none' },
    ],
    { duration: 520, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.15)', fill: 'backwards' },
  ).finished;
  await wait(200);
  gate.close();
}

async function portalOut(p) {
  const gate = openPortal(p);
  await gate.opened;
  await rig.animate(
    [
      { transform: 'none', opacity: 1, filter: 'none' },
      { transform: 'scale(0.15) rotate(16deg)', opacity: 0, filter: 'brightness(2.5)' },
    ],
    { duration: 420, easing: 'ease-in', fill: 'forwards' },
  ).finished;
  await gate.close();
}

// ---------- archer: shoots a line to the top of the screen and zips down it ----------
//
// The line runs from the ground beside the character, up through its grip point, to an
// arrow stuck in the top edge of the screen. The character drops onto the line at the
// arrow and slides down to its spot.

const ZIP_DROP_MS = 200;
const ZIP_SLIDE_MS = 720;

let zip = null;

function zipPose(x, y, tilt) {
  rig.style.transform = `translate(${x - zip.g.x}px, ${y - zip.g.y}px) rotate(${tilt}deg)`;
}

async function zipIn(p) {
  const g = gripPoint(p);
  rig.style.transformOrigin = `${g.gx}px ${g.gy}px`;
  const top = { x: clamp(g.x - 320, 40, g.x - 80), y: 14 };
  const dx = g.x - top.x;
  const dy = g.y - top.y;
  const ground = { x: g.x + (dx / dy) * (g.box.bottom - g.y), y: g.box.bottom }; // line extended to the floor
  zip = { g, top, ground };

  // Fire the arrow up from the ground, trailing the line.
  if (p.soundEnabled) sfx.whoosh(0.3, 0.4);
  zip.arrow = hero.arrow(ground, top);
  zip.line = hero.line(() => ground, () => zip.arrow.tip());
  await zip.arrow.hit;
  if (p.soundEnabled) sfx.thunk();

  // Drop onto the line from above the screen, then slide down it.
  const above = -(g.box.bottom - g.y) - 20;
  zipPose(top.x, above, 0);
  rig.style.opacity = '1';
  await frames(ZIP_DROP_MS, (t) => {
    const k = (t / ZIP_DROP_MS) ** 2;
    zipPose(top.x, above + (top.y - above) * k, 0);
  });
  if (p.soundEnabled) sfx.whoosh(0.8, 0.5);
  await frames(ZIP_SLIDE_MS, (t) => {
    const k = t / ZIP_SLIDE_MS;
    const e = k < 0.7 ? 0.85 * (k / 0.7) ** 2 : 1 - 0.15 * (1 - (k - 0.7) / 0.3) ** 2; // speed up, then brake
    zipPose(top.x + dx * e, top.y + dy * e, 16 * Math.sin(Math.PI * k));
  });
  rig.style.transform = '';
  const at = feet();
  fx.ring(at.x, at.y, 100, 380, '230, 210, 170');
}

async function zipOut(p) {
  const { g, top } = zip;
  const above = -(g.box.bottom - g.y) - 20;
  if (p.soundEnabled) sfx.whoosh(0.6, 0.5);
  // Pulled back up the line and off the top of the screen.
  await frames(520, (t) => {
    const k = (t / 520) ** 2;
    zipPose(g.x + (top.x - g.x) * k, g.y + (top.y - g.y) * k, -12 * Math.sin(Math.PI * k));
  });
  await frames(160, (t) => {
    const k = t / 160;
    zipPose(top.x, top.y + (above - top.y) * k, 0);
  });
  zip.arrow.remove();
  zip.line.remove();
}

// ---------- sea guardian: rises on a water spout ----------
//
// A spout of water shoots up from the bottom of the screen carrying the character above its
// spot, then lowers it down and drains away in a splash. The crest of the spout follows the
// character's feet while it rides.

const WATER_RGB = '120, 200, 255';
const SPOUT_LIFT = 150; // how far above its spot the spout carries the character
const SPOUT_RISE_MS = 720;
const SPOUT_LOWER_MS = 420;
const SPOUT_DRAIN_MS = 300;

async function spoutIn(p) {
  const box = character.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const below = window.innerHeight - box.top + 20; // fully below the screen
  let dy = below;
  let crest = () => box.bottom - 6 + dy;
  const water = hero.spout(x, box.width * 0.7, () => crest());
  if (p.soundEnabled) sfx.splash(1.3);
  hero.droplets(x, window.innerHeight, 18);
  rig.style.opacity = '1';
  // Shoots up from below the screen to above the character's spot...
  await frames(SPOUT_RISE_MS, (t) => {
    const k = 1 - (1 - t / SPOUT_RISE_MS) ** 3;
    dy = below + (-SPOUT_LIFT - below) * k;
    rig.style.transform = `translateY(${dy}px)`;
  });
  // ...lowers it onto the spot...
  await frames(SPOUT_LOWER_MS, (t) => {
    const k = t / SPOUT_LOWER_MS;
    dy = -SPOUT_LIFT * (1 - k * k * (3 - 2 * k));
    rig.style.transform = `translateY(${dy}px)`;
  });
  rig.style.transform = '';
  // ...and drains away in a splash.
  const at = feet();
  hero.droplets(at.x, at.y, 30, 1.4);
  fx.ring(at.x, at.y, 130, 450, WATER_RGB);
  if (p.soundEnabled) sfx.splash(0.6, 0.4);
  const from = box.bottom - 6;
  crest = () => from;
  await frames(SPOUT_DRAIN_MS, (t) => {
    const k = t / SPOUT_DRAIN_MS;
    const y = from + (window.innerHeight + 10 - from) * k * k;
    crest = () => y;
  });
  water.stop();
}

async function spoutOut(p) {
  const box = character.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const below = window.innerHeight - box.top + 20;
  const base = window.innerHeight + 10;
  let dy = 0;
  let crestY = base;
  const water = hero.spout(x, box.width * 0.7, () => crestY);
  if (p.soundEnabled) sfx.splash(1.1);
  // The spout surges up under the character's feet and lifts it...
  await frames(220, (t) => {
    crestY = base + (box.bottom - 6 - base) * (t / 220);
  });
  await frames(300, (t) => {
    const k = 1 - (1 - t / 300) ** 2;
    dy = -SPOUT_LIFT * 0.6 * k;
    crestY = box.bottom - 6 + dy;
    rig.style.transform = `translateY(${dy}px)`;
  });
  // ...then sinks back down below the screen with it.
  const top = dy;
  await frames(520, (t) => {
    const k = (t / 520) ** 2;
    dy = top + (below - top) * k;
    crestY = box.bottom - 6 + dy;
    rig.style.transform = `translateY(${dy}px)`;
  });
  hero.droplets(x, window.innerHeight, 24, 1.3);
  water.stop();
}

// ---------- entrance / exit ----------

// Each entrance and the exit that goes with it, by the companion's `entrance`.
const ENTRANCES = {
  lightning: { in: strikeIn, out: leapOut },
  swing: { in: swingIn, out: swingOut },
  dash: { in: dashIn, out: dashOut },
  jet: { in: jetIn, out: jetOut },
  swoop: { in: swoopIn, out: swoopOut },
  grapple: { in: grappleIn, out: grappleOut },
  portal: { in: portalIn, out: portalOut },
  zipline: { in: zipIn, out: zipOut },
  spout: { in: spoutIn, out: spoutOut },
};

const entranceFor = (p) => ENTRANCES[p.entrance] || ENTRANCES.lightning;

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
  } else if (p.isGreeting) {
    // No companion: the bubble rises into the corner on its own.
    bubble.style.opacity = '1';
    await bubble.animate(
      [
        { opacity: 0, transform: 'translateY(40px) scale(0.9)' },
        { opacity: 1, transform: 'translateY(-6px) scale(1.02)', offset: 0.7 },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 450, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'backwards' },
    ).finished;
  } else {
    await entranceFor(p).in(p);
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
  if (payload.isGreeting) {
    await bubble.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(30px) scale(0.9)' }], {
      duration: 260,
      easing: 'ease-in',
      fill: 'forwards',
    }).finished;
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
  await entranceFor(payload).out(payload);
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
