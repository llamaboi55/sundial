// The dashboard: where the day (or week) went.
import { native, call, listen, autostart } from './api.js';
import { CATEGORIES, categoryById, kindOf } from './categories.js';
import { prepare, summarize, hourly, daily, blocks, dayRange, weekRange, formatDuration, toCSV, HOUR, MIN } from './stats.js';
import { activityOf } from './names.js';
import { load, save, KEY, NUDGE_CHOICES } from './prefs.js';
import { sampleSessions, sampleNow } from './sample.js';

const $ = (id) => document.getElementById(id);
const now = () => (native ? Date.now() : sampleNow());
let prefs = load();
let mode = 'day';
let anchor = now();
let paused = false;
let showAll = false;
let open = new Set();

const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const fmtShort = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fmtWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtHour = (h) => new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2026, 0, 1, h));

async function fetchSessions(from, to) {
  if (!native) return sampleSessions(from, to);
  return (await call('sessions', { from, to })) || [];
}

function range() {
  return mode === 'day' ? dayRange(anchor) : weekRange(anchor);
}

const isCurrent = () => range().end > now() && range().start <= now();

// ---------- rendering ----------
async function render() {
  const r = range();
  const raw = await fetchSessions(r.start, r.end);
  const list = prepare(raw, r.start, r.end, prefs.overrides);
  const sum = summarize(list);
  const empty = list.length === 0;
  $('main').classList.toggle('blank', empty);
  $('empty').hidden = !empty;

  $('dateLabel').textContent = mode === 'day'
    ? (isCurrent() ? `Today, ${fmtShort.format(r.start)}` : fmtDay.format(r.start))
    : `${fmtShort.format(r.start)} – ${fmtShort.format(r.end - 1)}`;
  $('next').disabled = isCurrent();
  $('today').disabled = isCurrent();
  $('chartTitle').textContent = mode === 'day' ? 'Your day' : 'Your week';

  // Stats
  const days = mode === 'day' ? 1 : Math.max(1, Math.ceil((Math.min(now(), r.end) - r.start) / (24 * HOUR)));
  $('sTotal').textContent = formatDuration(sum.total);
  $('sTotalSub').textContent = mode === 'day'
    ? (list.length ? `${fmtTime.format(list[0].start)} – ${fmtTime.format(list[list.length - 1].end)}` : 'Nothing yet')
    : `${formatDuration(sum.total / days)} a day on average`;
  $('sScore').textContent = sum.score === null ? '–' : `${sum.score}`;
  const ring = $('ring');
  ring.style.strokeDashoffset = String(169.6 * (1 - (sum.score ?? 0) / 100));
  ring.style.stroke = sum.score === null ? 'var(--line2)' : sum.score >= 70 ? 'var(--good)' : sum.score >= 45 ? 'var(--accent)' : '#ff6b81';
  $('sFocus').textContent = formatDuration(sum.focus);
  const goal = prefs.goal * HOUR * days;
  $('goalBar').style.width = `${Math.min(100, (sum.focus / goal) * 100)}%`;
  $('sGoal').textContent = sum.focus >= goal ? 'Goal reached' : `${formatDuration(goal - sum.focus)} to your ${prefs.goal}h${mode === 'week' ? '/day' : ''} goal`;
  $('sStreak').textContent = formatDuration(sum.longestFocus.ms);
  $('sStreakSub').textContent = sum.longestFocus.start ? `${mode === 'week' ? fmtWeekday.format(sum.longestFocus.start) + ' ' : ''}${fmtTime.format(sum.longestFocus.start)} – ${fmtTime.format(sum.longestFocus.end)}` : 'No focused stretch yet';

  drawChart(list, r);
  drawCategories(sum);
  drawActivities(sum);
}

function legendMini(used) {
  $('legendMini').replaceChildren(...CATEGORIES.filter((c) => used.has(c.id)).map((c) => {
    const s = document.createElement('span');
    s.innerHTML = `<i style="background:${c.color}"></i>`;
    s.append(c.name);
    return s;
  }));
}

function stackCol(cats, max, label, isToday) {
  const col = document.createElement('div');
  col.className = 'col' + (isToday ? ' today' : '');
  const order = CATEGORIES.map((c) => c.id).filter((id) => cats[id]);
  order.forEach((id, i) => {
    const seg = document.createElement('i');
    seg.style.height = `${(cats[id] / max) * 100}%`;
    seg.style.background = categoryById(id).color;
    seg.style.animationDelay = `${i * 40}ms`;
    col.append(seg);
  });
  col.addEventListener('mousemove', (e) => tip(e, label, cats));
  col.addEventListener('mouseleave', hideTip);
  return col;
}

function drawChart(list, r) {
  const plot = $('plot'), axis = $('axis'), ribbon = $('ribbon');
  const used = new Set(list.map((s) => s.category));
  legendMini(used);
  plot.replaceChildren(); axis.replaceChildren(); ribbon.replaceChildren();
  if (mode === 'day') {
    const hours = hourly(list, r.start);
    // Show the active part of the day, at least 9am to 6pm.
    const active = hours.map((h, i) => (Object.keys(h).length ? i : null)).filter((i) => i !== null);
    let a = Math.min(8, ...active), b = Math.max(18, ...active.map((i) => i + 1));
    a = Math.max(0, a); b = Math.min(24, b);
    const max = HOUR;
    for (const g of [0.5, 1]) {
      const line = document.createElement('div');
      line.className = 'grid';
      line.style.bottom = `${g * 100}%`;
      line.innerHTML = `<span>${g * 60}m</span>`;
      plot.append(line);
    }
    const nowHour = isCurrent() ? Math.floor((now() - r.start) / HOUR) : -1;
    for (let h = a; h < b; h++) {
      plot.append(stackCol(hours[h], max, `${fmtHour(h)} – ${fmtHour((h + 1) % 24)}`, h === nowHour));
      const s = document.createElement('span');
      s.textContent = (h - a) % 2 === 0 ? fmtHour(h) : '';
      axis.append(s);
    }
    const from = r.start + a * HOUR, span = (b - a) * HOUR;
    for (const bl of blocks(list)) {
      const i = document.createElement('i');
      i.style.left = `${((bl.start - from) / span) * 100}%`;
      i.style.width = `${((bl.end - bl.start) / span) * 100}%`;
      i.style.background = categoryById(bl.category).color;
      i.addEventListener('mousemove', (e) => tip(e, `${bl.activity}`, null, `${fmtTime.format(bl.start)} – ${fmtTime.format(bl.end)} · ${formatDuration(bl.end - bl.start)}`));
      i.addEventListener('mouseleave', hideTip);
      ribbon.append(i);
    }
    ribbon.hidden = false;
  } else {
    const days = daily(list, r.days);
    const max = Math.max(4 * HOUR, ...days.map((d) => d.total)) * 1.08;
    const step = max > 10 * HOUR ? 4 : 2;
    for (let hh = step; hh * HOUR < max; hh += step) {
      const line = document.createElement('div');
      line.className = 'grid';
      line.style.bottom = `${((hh * HOUR) / max) * 100}%`;
      line.innerHTML = `<span>${hh}h</span>`;
      plot.append(line);
    }
    const t = now();
    for (const d of days) {
      plot.append(stackCol(d.cats, max, fmtDay.format(d.start), t >= d.start && t < d.start + 24 * HOUR));
      const s = document.createElement('span');
      s.textContent = fmtWeekday.format(d.start);
      axis.append(s);
    }
    ribbon.hidden = true;
  }
}

function tip(e, title, cats, line) {
  const t = $('tip');
  t.replaceChildren();
  const b = document.createElement('b'); b.textContent = title; t.append(b);
  if (line) { const d = document.createElement('div'); d.textContent = line; t.append(d); }
  if (cats) {
    const ids = CATEGORIES.map((c) => c.id).filter((id) => cats[id]);
    if (!ids.length) { const d = document.createElement('div'); d.textContent = 'Nothing tracked'; t.append(d); }
    for (const id of ids) {
      const c = categoryById(id);
      const d = document.createElement('div');
      d.innerHTML = `<i style="background:${c.color}"></i><span></span><span></span>`;
      d.children[1].textContent = c.name;
      d.children[2].textContent = formatDuration(cats[id]);
      t.append(d);
    }
  }
  t.hidden = false;
  const x = Math.min(innerWidth - t.offsetWidth - 10, e.clientX + 14);
  const y = Math.max(10, e.clientY - t.offsetHeight - 12);
  t.style.left = `${x}px`; t.style.top = `${y}px`;
}
function hideTip() { $('tip').hidden = true; }

function drawCategories(sum) {
  const svg = $('donut');
  const total = sum.total || 1;
  const C = 2 * Math.PI * 46;
  let offset = 0;
  const parts = [`<circle cx="60" cy="60" r="46" stroke="var(--line)"/>`];
  for (const c of sum.byCategory) {
    const len = (c.ms / total) * C;
    const gap = sum.byCategory.length > 1 ? Math.min(2, len / 3) : 0;
    parts.push(`<circle cx="60" cy="60" r="46" stroke="${categoryById(c.id).color}" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)" stroke-linecap="butt"/>`);
    offset += len;
  }
  parts.push(`<text x="60" y="61">${formatDuration(sum.total)}</text><text x="60" y="75" class="small">tracked</text>`);
  svg.innerHTML = parts.join('');
  $('catList').replaceChildren(...sum.byCategory.map((c) => {
    const cat = categoryById(c.id);
    const li = document.createElement('li');
    li.innerHTML = `<i style="background:${cat.color}"></i><span></span><span class="n"></span><span class="p"></span>`;
    li.children[1].textContent = cat.name;
    li.children[2].textContent = formatDuration(c.ms);
    li.children[3].textContent = `${Math.round((c.ms / total) * 100)}%`;
    return li;
  }));
}

function drawActivities(sum) {
  const ul = $('acts');
  const top = sum.byActivity[0]?.ms || 1;
  const list = showAll ? sum.byActivity : sum.byActivity.slice(0, 8);
  ul.replaceChildren(...list.map((a) => {
    const cat = categoryById(a.category);
    const li = document.createElement('li');
    li.innerHTML = `<div class="avatar"></div><div><div class="name"></div><div class="bar"><i></i></div></div><select class="chip"></select><div class="t"></div>`;
    const av = li.querySelector('.avatar');
    av.textContent = a.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase() || '•';
    av.style.background = `linear-gradient(135deg, ${cat.color}, color-mix(in srgb, ${cat.color} 60%, #000))`;
    li.querySelector('.name').textContent = a.name;
    li.querySelector('.name').title = a.app !== a.name ? `${a.name} in ${a.app}` : a.name;
    const bar = li.querySelector('.bar i');
    bar.style.background = cat.color;
    bar.style.width = `${(a.ms / top) * 100}%`;
    li.querySelector('.t').textContent = formatDuration(a.ms);
    const sel = li.querySelector('select');
    for (const c of CATEGORIES) sel.add(new Option(c.name, c.id, false, c.id === a.category));
    sel.addEventListener('change', () => {
      prefs = save({ ...prefs, overrides: { ...prefs.overrides, [a.name]: sel.value } });
      toast(`${a.name} now counts as ${categoryById(sel.value).name}`);
      render();
    });
    if (a.titles.length) {
      li.style.cursor = 'pointer';
      li.addEventListener('click', (e) => {
        if (e.target === sel) return;
        open.has(a.name) ? open.delete(a.name) : open.add(a.name);
        render();
      });
      if (open.has(a.name)) {
        const t = document.createElement('ul');
        t.className = 'titles';
        for (const x of a.titles) {
          const row = document.createElement('li');
          row.innerHTML = '<span></span><span></span>';
          row.children[0].textContent = x.title;
          row.children[1].textContent = formatDuration(x.ms);
          t.append(row);
        }
        li.append(t);
      }
    }
    return li;
  }));
  if (sum.byActivity.length > 8) {
    const more = document.createElement('button');
    more.className = 'more';
    more.textContent = showAll ? 'Show fewer' : `Show all ${sum.byActivity.length}`;
    more.addEventListener('click', () => { showAll = !showAll; render(); });
    const li = document.createElement('li');
    li.style.display = 'block';
    li.append(more);
    ul.append(li);
  }
}

// ---------- header: now playing and pause ----------
function showStatus(st) {
  if (!st) return;
  paused = st.paused_until !== null && st.paused_until !== undefined;
  $('pause').classList.toggle('paused', paused);
  $('pauseText').textContent = paused
    ? (st.paused_until > 4e15 ? 'Paused' : `Paused until ${fmtTime.format(st.paused_until)}`)
    : 'Tracking';
  const cur = st.current;
  $('now').hidden = !cur || paused;
  if (cur) {
    const { activity } = activityOf(cur);
    $('nowText').innerHTML = '<b></b> · <span></span>';
    $('nowText').children[0].textContent = activity;
    $('nowText').children[1].textContent = formatDuration(cur.end - cur.start);
  }
}

$('pause').addEventListener('click', async () => {
  if (!native) { paused = !paused; showStatus({ paused_until: paused ? 9e15 : null, current: null }); return; }
  await call('pause', { minutes: paused ? 0 : null });
  showStatus(await call('status'));
});

// ---------- navigation ----------
function shift(dir) {
  const d = new Date(anchor);
  d.setDate(d.getDate() + dir * (mode === 'day' ? 1 : 7));
  anchor = Math.min(d.getTime(), now());
  open.clear(); showAll = false;
  render();
}
$('prev').addEventListener('click', () => shift(-1));
$('next').addEventListener('click', () => shift(1));
$('today').addEventListener('click', () => { anchor = now(); render(); });
for (const b of $('mode').children) b.addEventListener('click', () => {
  mode = b.dataset.v;
  for (const x of $('mode').children) x.classList.toggle('on', x === b);
  render();
});
addEventListener('keydown', (e) => {
  if (e.target.closest('select, input')) return;
  if (e.key === 'ArrowLeft') shift(-1);
  if (e.key === 'ArrowRight' && !isCurrent()) shift(1);
  if (e.key === 'Escape') closeSheet();
});

// ---------- settings ----------
function openSheet() { $('sheet').classList.add('open'); $('sheet').setAttribute('aria-hidden', 'false'); $('scrim').hidden = false; }
function closeSheet() { $('sheet').classList.remove('open'); $('sheet').setAttribute('aria-hidden', 'true'); $('scrim').hidden = true; disarm(); }
$('openSettings').addEventListener('click', openSheet);
$('closeSettings').addEventListener('click', closeSheet);
$('scrim').addEventListener('click', closeSheet);

for (const m of NUDGE_CHOICES) $('nudgeAfter').add(new Option(m ? `${m} minutes` : 'Never', String(m)));
for (let h = 1; h <= 10; h++) $('goal').add(new Option(`${h} hour${h > 1 ? 's' : ''} focused`, String(h)));

function fillSettings() {
  $('nudgeAfter').value = String(prefs.nudgeAfter);
  $('goal').value = String(prefs.goal);
  $('idleMinutes').value = String(prefs.idleMinutes);
  $('titles').checked = prefs.titles;
}
function applyOptions() {
  call('set_options', { idleMinutes: prefs.idleMinutes, titles: prefs.titles });
}
$('nudgeAfter').addEventListener('change', (e) => { prefs = save({ ...prefs, nudgeAfter: Number(e.target.value) }); });
$('goal').addEventListener('change', (e) => { prefs = save({ ...prefs, goal: Number(e.target.value) }); render(); });
$('idleMinutes').addEventListener('change', (e) => { prefs = save({ ...prefs, idleMinutes: Number(e.target.value) }); applyOptions(); });
$('titles').addEventListener('change', (e) => { prefs = save({ ...prefs, titles: e.target.checked }); applyOptions(); });
$('autostart').addEventListener('change', (e) => autostart.set(e.target.checked));
$('testNudge').addEventListener('click', () => {
  if (native) { localStorage.setItem('sundial.testNudge', String(Date.now())); call('show_nudge'); }
  else window.open('nudge.html?demo', 'nudge', 'width=420,height=180');
});
$('export').addEventListener('click', async () => {
  const r = range();
  const list = prepare(await fetchSessions(r.start, r.end), r.start, r.end, prefs.overrides);
  const name = `sundial-${new Date(r.start).toISOString().slice(0, 10)}${mode === 'week' ? '-week' : ''}.csv`;
  const csv = toCSV(list);
  if (native) { if (await call('export', { name, text: csv })) toast('Saved'); }
  else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = name; a.click();
  }
});
let armed = 0;
function disarm() { armed = 0; $('clear').classList.remove('armed'); $('clear').textContent = 'Delete all tracked time'; }
$('clear').addEventListener('click', async () => {
  if (!armed) {
    armed = setTimeout(disarm, 4000);
    $('clear').classList.add('armed');
    $('clear').textContent = 'Click again to delete everything';
    return;
  }
  clearTimeout(armed); disarm();
  await call('clear_data');
  toast('All tracked time deleted');
  render();
});

let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

addEventListener('storage', (e) => { if (e.key === KEY) { prefs = load(); fillSettings(); render(); } });

// ---------- live ----------
let lastRender = 0;
let lastKey = '';
listen('sundial://tick', (st) => {
  showStatus(st);
  // Redraw when you switch to something else (a session just ended) or every half minute.
  const key = st.current ? `${st.current.app}\n${st.current.title}` : '';
  const switched = key !== lastKey;
  lastKey = key;
  if (isCurrent() && document.visibilityState === 'visible' && (switched || Date.now() - lastRender > 30_000) && Date.now() - lastRender > 3000) {
    lastRender = Date.now();
    render();
  }
});

(async () => {
  fillSettings();
  if (native) {
    applyOptions();
    $('autostart').checked = await autostart.isEnabled();
    showStatus(await call('status'));
  } else {
    showStatus({ paused_until: null, current: { app: 'Code', title: 'app.js — sundial', start: now() - 23 * MIN, end: now() } });
  }
  lastRender = Date.now();
  render();
})();
