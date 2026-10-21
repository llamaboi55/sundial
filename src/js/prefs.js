// Settings, saved in localStorage and shared by the dashboard and the nudge card.
export const KEY = 'sundial.prefs.v1';

export const DEFAULTS = {
  nudgeAfter: 15,   // minutes of distraction before the cat speaks up; 0 = never
  idleMinutes: 3,   // away from the keyboard after this long
  titles: true,     // keep window titles (needed to tell websites apart)
  overrides: {},    // activity -> category id
  goal: 4,          // hours of focused time a day to aim for
};

const NUDGE = [0, 5, 10, 15, 20, 30, 45, 60];

export function clean(p = {}) {
  const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
  return {
    nudgeAfter: NUDGE.includes(+p.nudgeAfter) ? +p.nudgeAfter : DEFAULTS.nudgeAfter,
    idleMinutes: num(p.idleMinutes, 1, 60, DEFAULTS.idleMinutes),
    titles: p.titles !== undefined ? Boolean(p.titles) : DEFAULTS.titles,
    overrides: p.overrides && typeof p.overrides === 'object'
      ? Object.fromEntries(Object.entries(p.overrides).filter(([k, v]) => typeof k === 'string' && typeof v === 'string'))
      : {},
    goal: num(p.goal, 1, 12, DEFAULTS.goal),
  };
}

export function load(store = globalThis.localStorage) {
  try { return clean(JSON.parse(store.getItem(KEY) || '{}')); } catch { return clean(); }
}

export function save(p, store = globalThis.localStorage) {
  const c = clean(p);
  try { store.setItem(KEY, JSON.stringify(c)); } catch {}
  return c;
}

export const NUDGE_CHOICES = NUDGE;
