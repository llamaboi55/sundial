// Pretend data for `npm run preview`, so the dashboard can be seen without the app.
const MIN = 60_000;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; s = (s ^ (s >>> 13)) >>> 0; return s / 4294967296; };
}

const WORK = [
  ['Code', ['stats.js — sundial', 'app.css — sundial', 'tracker.rs — sundial', 'README.md — sundial']],
  ['WindowsTerminal', ['npm test', 'cargo build']],
  ['chrome', ['Pull request #42 · llamaboi55/sundial · GitHub - Google Chrome', 'javascript - Sorting by two keys - Stack Overflow - Google Chrome', 'Array.prototype.toSorted() - JavaScript | MDN - Google Chrome']],
  ['Figma', ['Dashboard v3 – Figma']],
  ['Notion', ['Weekly plan']],
  ['chrome', ['Q4 roadmap - Google Docs - Google Chrome']],
];
const TALK = [['slack', ['#design', '#general']], ['chrome', ['Inbox (4) - me@example.com - Gmail - Google Chrome']], ['Zoom', ['Zoom Meeting']]];
const FUN = [
  ['chrome', ['Lofi hip hop radio - YouTube - Google Chrome', 'How keyboards are made - YouTube - Google Chrome']],
  ['chrome', ['r/battlestations - Reddit - Google Chrome']],
  ['chrome', ['Home / X - Google Chrome']],
  ['chrome', ['Instagram - Google Chrome']],
];

const pick = (r, list) => list[Math.floor(r() * list.length)];

function day(start, r, until) {
  const out = [];
  let t = start + (9 * 60 + Math.floor(r() * 30)) * MIN;
  const end = start + (17 * 60 + 30 + Math.floor(r() * 60)) * MIN;
  const lunch = start + (12 * 60 + 30) * MIN;
  let lunched = false;
  while (t < end && t < until) {
    if (!lunched && t >= lunch) { t += 45 * MIN; lunched = true; continue; }
    const x = r();
    const [set, len] = x < 0.62 ? [WORK, 8 + r() * 40] : x < 0.82 ? [TALK, 2 + r() * 12] : [FUN, 3 + r() * 16];
    const [app, titles] = pick(r, set);
    const e = Math.min(t + len * MIN, until);
    out.push({ start: t, end: e, app, title: pick(r, titles) });
    t = e + r() * 1.5 * MIN;
  }
  // A little evening video.
  const eve = start + (20 * 60 + Math.floor(r() * 60)) * MIN;
  if (eve < until && r() < 0.7) out.push({ start: eve, end: Math.min(eve + (20 + r() * 50) * MIN, until), app: 'chrome', title: 'Netflix - Google Chrome' });
  return out;
}

/** The pretend "now": late afternoon today. */
export function sampleNow() {
  const d = new Date(); d.setHours(17, 40, 0, 0);
  return d.getTime();
}

export function sampleSessions(from, to) {
  const now = sampleNow();
  const out = [];
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  for (; d.getTime() < to; d.setDate(d.getDate() + 1)) {
    const start = d.getTime();
    if (start > now) break;
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const r = rng(Math.floor(start / 86_400_000) * 7919);
    if (weekend) {
      if (r() < 0.5) out.push({ start: start + 11 * 60 * MIN, end: start + (12 * 60 + 20) * MIN, app: 'chrome', title: 'Video - YouTube - Google Chrome' });
      continue;
    }
    out.push(...day(start, r, now));
  }
  return out.filter((s) => s.end > from && s.start < to);
}
