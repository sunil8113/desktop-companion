const api = window.settingsApi;

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const DAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const $ = (sel) => document.querySelector(sel);
const els = {
  list: $('#reminders'),
  empty: $('#empty'),
  tpl: $('#reminder-tpl'),
  addInterval: $('#add-interval'),
  addDaily: $('#add-daily'),
  snooze: $('#snooze-minutes'),
  whEnabled: $('#wh-enabled'),
  whStart: $('#wh-start'),
  whEnd: $('#wh-end'),
  sound: $('#sound'),
  login: $('#login'),
  display: $('#display'),
  charPreview: $('#char-preview'),
  charChoice: $('#char-choice'),
  customOptions: $('#custom-options'),
  charPath: $('#char-path'),
  charEntrance: $('#char-entrance'),
  charStyle: $('#char-style'),
  pickChar: $('#pick-char'),
  status: $('#status'),
  openFolder: $('#open-folder'),
  resetDefaults: $('#reset-defaults'),
  revert: $('#revert'),
  save: $('#save'),
};

let saved = null; // last config persisted to disk
let state = null; // working copy being edited
let defaults = null;
let companions = []; // [{ id, name, url }]

const clone = (o) => JSON.parse(JSON.stringify(o));
const isDirty = () => JSON.stringify(state) !== JSON.stringify(saved);
const findReminder = (id) => state.reminders.find((r) => r.id === id);

function setStatus(text, kind = '') {
  els.status.textContent = text;
  els.status.className = kind;
}

function markChanged() {
  const dirty = isDirty();
  els.save.disabled = !dirty;
  els.revert.disabled = !dirty;
  setStatus(dirty ? 'Unsaved changes' : '');
}

// ---------- rendering ----------

function buildCard(r) {
  const card = els.tpl.content.firstElementChild.cloneNode(true);
  card.dataset.id = r.id;
  card.classList.add(`type-${r.type}`);
  card.classList.toggle('disabled', !r.enabled);
  card.querySelector('[data-role="companion"]').replaceChildren(
    new Option('Default (from Character below)', ''),
    ...companions.map((c) => new Option(c.name, c.id)),
    new Option('My own image', 'custom'),
  );

  for (const input of card.querySelectorAll('[data-field]')) {
    const field = input.dataset.field;
    if (input.type === 'checkbox') input.checked = Boolean(r[field]);
    else input.value = r[field] ?? '';
  }
  card.querySelector('[data-role="badge"]').textContent = r.type === 'interval' ? 'Repeating' : 'Daily';

  const days = card.querySelector('[data-role="days"]');
  for (const d of DAY_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'day';
    b.dataset.day = String(d);
    b.textContent = DAY_SHORT[d];
    b.title = DAY_NAMES[d];
    b.setAttribute('aria-label', DAY_NAMES[d]);
    b.setAttribute('aria-pressed', String(r.days.includes(d)));
    days.append(b);
  }
  return card;
}

function renderReminders() {
  els.list.replaceChildren(...state.reminders.map(buildCard));
  els.empty.hidden = state.reminders.length > 0;
}

function renderGeneral() {
  els.snooze.value = state.snoozeMinutes;
  els.whEnabled.checked = state.workHours.enabled;
  els.whStart.value = state.workHours.start;
  els.whEnd.value = state.workHours.end;
  els.whStart.disabled = els.whEnd.disabled = !state.workHours.enabled;
  els.sound.checked = state.soundEnabled;
  els.login.checked = state.launchAtLogin;
  els.display.value = state.overlayDisplay;
}

async function renderCharacter() {
  const custom = state.character === 'custom';
  const p = state.characterImage;
  els.charChoice.value = state.character;
  els.customOptions.hidden = !custom;
  els.charPath.textContent = p || 'No image chosen yet. Until you choose one, the thunder god is used.';
  els.charEntrance.value = state.customEntrance;
  els.charStyle.value = state.characterStyle;
  const style = custom ? state.characterStyle : 'plain';
  els.charPreview.classList.toggle('framed', style === 'frame');
  els.charPreview.classList.toggle('keyed', style === 'remove-dark');
  const companion = companions.find((c) => c.id === state.character) || companions[0];
  els.charPreview.src = custom && p ? await api.resolveImage(p) : companion.url;
}

function render() {
  renderReminders();
  renderGeneral();
  renderCharacter();
  markChanged();
}

// ---------- reminder editing ----------

els.list.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  if (!field) return;
  const card = e.target.closest('.card');
  const r = findReminder(card.dataset.id);
  if (e.target.type === 'checkbox') {
    r[field] = e.target.checked;
    card.classList.toggle('disabled', !r.enabled);
  } else if (e.target.type === 'number') {
    r[field] = e.target.valueAsNumber;
  } else {
    r[field] = e.target.value;
  }
  e.target.classList.remove('invalid');
  markChanged();
});

els.list.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const r = findReminder(card.dataset.id);

  const day = e.target.closest('.day');
  if (day) {
    const d = Number(day.dataset.day);
    r.days = r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d].sort();
    day.setAttribute('aria-pressed', String(r.days.includes(d)));
    markChanged();
    return;
  }

  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'delete') {
    state.reminders = state.reminders.filter((x) => x !== r);
    renderReminders();
    markChanged();
  } else if (action === 'test') {
    api.test(r);
  }
});

function addReminder(type) {
  const r = {
    id: `r-${Date.now().toString(36)}`,
    enabled: true,
    type,
    title: type === 'interval' ? 'New repeating reminder' : 'New daily reminder',
    message: '',
    days: [0, 1, 2, 3, 4, 5, 6],
    companion: '',
    prop: 'auto',
    ...(type === 'interval' ? { intervalMinutes: 30 } : { time: '15:00' }),
  };
  state.reminders.push(r);
  renderReminders();
  markChanged();
  const input = els.list.lastElementChild.querySelector('.title-input');
  input.focus();
  input.select();
}

els.addInterval.addEventListener('click', () => addReminder('interval'));
els.addDaily.addEventListener('click', () => addReminder('daily'));

// ---------- general settings ----------

els.snooze.addEventListener('input', () => {
  state.snoozeMinutes = els.snooze.valueAsNumber;
  els.snooze.classList.remove('invalid');
  markChanged();
});
els.whEnabled.addEventListener('change', () => {
  state.workHours.enabled = els.whEnabled.checked;
  renderGeneral();
  markChanged();
});
els.whStart.addEventListener('input', () => {
  state.workHours.start = els.whStart.value;
  markChanged();
});
els.whEnd.addEventListener('input', () => {
  state.workHours.end = els.whEnd.value;
  markChanged();
});
els.sound.addEventListener('change', () => {
  state.soundEnabled = els.sound.checked;
  markChanged();
});
els.display.addEventListener('change', () => {
  state.overlayDisplay = els.display.value;
  markChanged();
});
els.login.addEventListener('change', () => {
  state.launchAtLogin = els.login.checked;
  markChanged();
});

// ---------- character ----------

els.charChoice.addEventListener('change', () => {
  state.character = els.charChoice.value;
  renderCharacter();
  markChanged();
});
els.charEntrance.addEventListener('change', () => {
  state.customEntrance = els.charEntrance.value;
  markChanged();
});
els.pickChar.addEventListener('click', async () => {
  const picked = await api.pickImage();
  if (!picked) return;
  state.character = 'custom';
  state.characterImage = picked.path;
  renderCharacter();
  markChanged();
});
els.charStyle.addEventListener('change', () => {
  state.characterStyle = els.charStyle.value;
  renderCharacter();
  markChanged();
});

// ---------- save / revert ----------

// Returns the first invalid input (and marks it), or null if everything is valid.
function validate() {
  let firstInvalid = null;
  const flag = (input) => {
    input.classList.add('invalid');
    firstInvalid ??= input;
  };
  for (const card of els.list.children) {
    const r = findReminder(card.dataset.id);
    if (r.type === 'interval' && !(Number.isInteger(r.intervalMinutes) && r.intervalMinutes >= 1 && r.intervalMinutes <= 1440)) {
      flag(card.querySelector('[data-field="intervalMinutes"]'));
    }
    if (r.type === 'daily' && !TIME_RE.test(r.time)) flag(card.querySelector('[data-field="time"]'));
  }
  if (!(Number.isInteger(state.snoozeMinutes) && state.snoozeMinutes >= 1 && state.snoozeMinutes <= 240)) flag(els.snooze);
  if (state.workHours.enabled) {
    if (!TIME_RE.test(state.workHours.start)) flag(els.whStart);
    if (!TIME_RE.test(state.workHours.end)) flag(els.whEnd);
  }
  return firstInvalid;
}

async function save() {
  if (!isDirty()) return;
  const invalid = validate();
  if (invalid) {
    invalid.focus();
    setStatus('Please fix the highlighted fields (intervals 1–1440 min, snooze 1–240 min).', 'error');
    return;
  }
  try {
    const result = await api.save(state);
    saved = clone(result);
    state = clone(result);
    render();
    setStatus('Saved', 'ok');
  } catch (err) {
    setStatus(`Could not save: ${err.message}`, 'error');
  }
}

els.save.addEventListener('click', save);
els.revert.addEventListener('click', () => {
  state = clone(saved);
  render();
});
els.resetDefaults.addEventListener('click', () => {
  state = clone(defaults);
  render();
  setStatus('Defaults restored. Click Save to keep them.');
});
els.openFolder.addEventListener('click', () => api.openFolder());

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
});

// ---------- boot ----------

(async () => {
  const data = await api.load();
  defaults = data.defaults;
  companions = data.companions;
  els.charChoice.replaceChildren(
    ...companions.map((c) => new Option(c.name, c.id)),
    new Option('My own image', 'custom'),
  );
  saved = clone(data.config);
  state = clone(data.config);
  render();
})();
