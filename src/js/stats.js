// Turning sessions into the numbers and shapes the dashboard draws.
import { activityOf } from './names.js';
import { categorize, kindOf, CATEGORIES } from './categories.js';

export const MIN = 60_000;
export const HOUR = 60 * MIN;

/** Sessions cut to [from, to), labelled with activity and category, oldest first. */
export function prepare(sessions, from, to, overrides = {}) {
  return sessions
    .filter((s) => s.end > from && s.start < to && s.end > s.start)
    .map((s) => {
      const { activity, app } = activityOf(s);
      const category = categorize(activity, overrides);
      return { ...s, start: Math.max(s.start, from), end: Math.min(s.end, to), activity, appName: app, category };
    })
    .sort((a, b) => a.start - b.start);
}

const dur = (s) => s.end - s.start;

export function summarize(list) {
  const total = list.reduce((n, s) => n + dur(s), 0);
  const cat = new Map(CATEGORIES.map((c) => [c.id, 0]));
  const act = new Map();
  let focus = 0, distract = 0;
  for (const s of list) {
    const d = dur(s);
    cat.set(s.category, (cat.get(s.category) || 0) + d);
    const a = act.get(s.activity) || { name: s.activity, app: s.appName, category: s.category, ms: 0, titles: new Map() };
    a.ms += d;
    if (s.title) a.titles.set(s.title, (a.titles.get(s.title) || 0) + d);
    act.set(s.activity, a);
    const kind = kindOf(s.category);
    if (kind === 'focus') focus += d;
    if (kind === 'distraction') distract += d;
  }
  const byActivity = [...act.values()]
    .map((a) => ({ ...a, titles: [...a.titles.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([t, ms]) => ({ title: t, ms })) }))
    .sort((a, b) => b.ms - a.ms);
  return {
    total,
    focus,
    distract,
    score: focus + distract > 0 ? Math.round((focus / (focus + distract)) * 100) : null,
    byCategory: [...cat.entries()].map(([id, ms]) => ({ id, ms })).filter((c) => c.ms > 0).sort((a, b) => b.ms - a.ms),
    byActivity,
    longestFocus: longestFocus(list),
    switches: Math.max(0, list.length - 1),
  };
}

/**
 * The longest stretch of focused work. Short detours (under two minutes, like a quick
 * look at chat) don't break a stretch; anything longer does.
 */
export function longestFocus(list, allowance = 2 * MIN) {
  let best = { ms: 0, start: null, end: null };
  let start = null, end = null, ms = 0, away = 0;
  for (const s of list) {
    const focus = kindOf(s.category) === 'focus';
    if (focus) {
      if (start === null || s.start - end > allowance || away > allowance) { start = s.start; ms = 0; }
      ms += dur(s);
      end = s.end;
      away = 0;
      if (ms > best.ms) best = { ms, start, end };
    } else if (start !== null) {
      away += dur(s);
    }
  }
  return best;
}

/** Minutes per category for each hour of a day starting at dayStart. */
export function hourly(list, dayStart) {
  const hours = Array.from({ length: 24 }, () => ({}));
  for (const s of list) {
    let t = s.start;
    while (t < s.end) {
      const h = Math.floor((t - dayStart) / HOUR);
      const edge = Math.min(s.end, dayStart + (h + 1) * HOUR);
      if (h >= 0 && h < 24) hours[h][s.category] = (hours[h][s.category] || 0) + (edge - t);
      t = edge;
    }
  }
  return hours;
}

/** Totals per category for each day. days = [{ start, end }]. */
export function daily(list, days) {
  return days.map((d) => {
    const out = { start: d.start, total: 0, focus: 0, distract: 0, cats: {} };
    for (const s of list) {
      const a = Math.max(s.start, d.start), b = Math.min(s.end, d.end);
      if (b <= a) continue;
      out.total += b - a;
      out.cats[s.category] = (out.cats[s.category] || 0) + (b - a);
      const kind = kindOf(s.category);
      if (kind === 'focus') out.focus += b - a;
      if (kind === 'distraction') out.distract += b - a;
    }
    return out;
  });
}

/** Joins neighbouring sessions of the same activity for a cleaner timeline. */
export function blocks(list, joinGap = MIN) {
  const out = [];
  for (const s of list) {
    const last = out[out.length - 1];
    if (last && last.activity === s.activity && s.start - last.end <= joinGap) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end, activity: s.activity, category: s.category });
  }
  return out;
}

/** Local midnight for a date, and the day after. */
export function dayRange(date) {
  const a = new Date(date); a.setHours(0, 0, 0, 0);
  const b = new Date(a); b.setDate(b.getDate() + 1);
  return { start: a.getTime(), end: b.getTime() };
}

/** Monday to Sunday around a date. */
export function weekRange(date) {
  const a = new Date(date); a.setHours(0, 0, 0, 0);
  a.setDate(a.getDate() - ((a.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const s = new Date(a); s.setDate(a.getDate() + i);
    const e = new Date(s); e.setDate(s.getDate() + 1);
    days.push({ start: s.getTime(), end: e.getTime() });
  }
  return { start: days[0].start, end: days[6].end, days };
}

export function formatDuration(ms) {
  const m = Math.round(ms / MIN);
  if (m < 1) return ms > 0 ? '<1m' : '0m';
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function toCSV(list) {
  const iso = (ms) => new Date(ms).toISOString();
  const rows = [['start', 'end', 'minutes', 'app', 'activity', 'category', 'title']];
  for (const s of list) rows.push([iso(s.start), iso(s.end), ((s.end - s.start) / MIN).toFixed(2), s.appName, s.activity, s.category, s.title || '']);
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
