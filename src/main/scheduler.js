// Decides when reminders are due. Emits:
//   'due'     (reminder, meta)  a reminder should be shown now
//   'changed' ()                upcoming times / pause state changed (for the tray)
//
// Uses a short polling tick rather than long setTimeouts, so it stays correct
// across sleep/resume and system clock changes.
const { EventEmitter } = require('events');

const TICK_MS = 5000;
const MINUTE = 60 * 1000;
const DAILY_GRACE_MS = 5 * MINUTE; // a daily reminder missed by more than this is skipped for the day

const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const dateKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

function atTime(hhmm, base, addDays = 0) {
  const d = new Date(base);
  d.setDate(d.getDate() + addDays);
  d.setHours(0, minutesOf(hhmm), 0, 0);
  return d.getTime();
}

class Scheduler extends EventEmitter {
  constructor() {
    super();
    this.config = null;
    this.state = new Map(); // id -> { intervalMinutes, nextDue } | { time, lastFiredKey }
    this.snoozes = []; // { id, dueAt }
    this.pausedUntil = 0; // epoch ms, or Infinity for "until resumed"
    this.timer = null;
  }

  start(config) {
    this.reload(config);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  // Applies a new config, keeping countdowns for reminders whose timing didn't change.
  reload(config) {
    const now = Date.now();
    const next = new Map();
    for (const r of config.reminders) {
      const prev = this.state.get(r.id);
      if (r.type === 'interval') {
        const keep = prev && prev.intervalMinutes === r.intervalMinutes;
        next.set(r.id, {
          intervalMinutes: r.intervalMinutes,
          nextDue: keep ? prev.nextDue : now + r.intervalMinutes * MINUTE,
        });
      } else {
        const keep = prev && prev.time === r.time;
        next.set(r.id, { time: r.time, lastFiredKey: keep ? prev.lastFiredKey : null });
      }
    }
    this.state = next;
    this.snoozes = this.snoozes.filter((s) => next.has(s.id));
    this.config = config;
    this.emit('changed');
  }

  tick() {
    const now = Date.now();
    if (this.pausedUntil) {
      if (now < this.pausedUntil) return;
      this.resume();
    }

    for (const r of this.config.reminders) {
      if (!r.enabled) continue;
      const st = this.state.get(r.id);
      if (r.type === 'interval') {
        if (now < st.nextDue) continue;
        st.nextDue = now + r.intervalMinutes * MINUTE;
        if (this.isActiveDay(r, now) && this.inWorkHours(now)) this.fire(r);
        else this.emit('changed');
      } else {
        const key = dateKey(new Date(now));
        const target = atTime(r.time, now);
        if (st.lastFiredKey === key || now < target || now - target > DAILY_GRACE_MS) continue;
        st.lastFiredKey = key;
        if (this.isActiveDay(r, now)) this.fire(r);
      }
    }

    const due = this.snoozes.filter((s) => now >= s.dueAt);
    if (due.length) {
      this.snoozes = this.snoozes.filter((s) => now < s.dueAt);
      for (const s of due) {
        const r = this.find(s.id);
        if (r && r.enabled) this.fire(r, { snoozed: true });
      }
    }
  }

  fire(reminder, meta = {}) {
    this.emit('due', reminder, meta);
    this.emit('changed');
  }

  // User clicked Done: repeating reminders count down again from now.
  acknowledge(id) {
    const r = this.find(id);
    if (r && r.type === 'interval') this.state.get(id).nextDue = Date.now() + r.intervalMinutes * MINUTE;
    this.emit('changed');
  }

  snooze(id, minutes) {
    const r = this.find(id);
    if (!r) return;
    const dueAt = Date.now() + minutes * MINUTE;
    this.snoozes = this.snoozes.filter((s) => s.id !== id);
    this.snoozes.push({ id, dueAt });
    // Don't let the regular cycle fire again while it's snoozed.
    if (r.type === 'interval') this.state.get(id).nextDue = dueAt + r.intervalMinutes * MINUTE;
    this.emit('changed');
  }

  pause(ms) {
    this.pausedUntil = ms === Infinity ? Infinity : Date.now() + ms;
    this.emit('changed');
  }

  resume() {
    this.pausedUntil = 0;
    this.resetIntervals();
  }

  isPaused() {
    return this.pausedUntil > Date.now();
  }

  // After sleep, lock or pause the user has been away, so restart repeating countdowns
  // instead of firing everything that "expired" meanwhile.
  resetIntervals() {
    const now = Date.now();
    for (const r of this.config.reminders) {
      if (r.type === 'interval') this.state.get(r.id).nextDue = now + r.intervalMinutes * MINUTE;
    }
    this.emit('changed');
  }

  find(id) {
    return this.config.reminders.find((r) => r.id === id);
  }

  isActiveDay(reminder, ts) {
    return reminder.days.includes(new Date(ts).getDay());
  }

  inWorkHours(ts) {
    const wh = this.config.workHours;
    if (!wh.enabled) return true;
    const d = new Date(ts);
    const m = d.getHours() * 60 + d.getMinutes();
    const start = minutesOf(wh.start);
    const end = minutesOf(wh.end);
    return start <= end ? m >= start && m < end : m >= start || m < end; // supports overnight shifts
  }

  nextDailyOccurrence(r, now) {
    const st = this.state.get(r.id);
    for (let d = 0; d <= 7; d++) {
      const t = atTime(r.time, now, d);
      if (t <= now && !(d === 0 && st.lastFiredKey !== dateKey(new Date(now)) && now - t <= DAILY_GRACE_MS)) continue;
      if (this.isActiveDay(r, t)) return t;
    }
    return null;
  }

  // Upcoming reminders, soonest first: [{ reminder, dueAt, snoozed }]
  upcoming() {
    const now = Date.now();
    const list = [];
    for (const r of this.config.reminders) {
      if (!r.enabled || r.days.length === 0) continue;
      const dueAt = r.type === 'interval' ? this.state.get(r.id).nextDue : this.nextDailyOccurrence(r, now);
      if (dueAt) list.push({ reminder: r, dueAt, snoozed: false });
    }
    for (const s of this.snoozes) {
      const r = this.find(s.id);
      if (r && r.enabled) list.push({ reminder: r, dueAt: s.dueAt, snoozed: true });
    }
    return list.sort((a, b) => a.dueAt - b.dueAt);
  }
}

module.exports = { Scheduler };
