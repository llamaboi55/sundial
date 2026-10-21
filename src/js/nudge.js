// The nudge card. It runs all the time in a hidden window, watches what's in front,
// and when you've drifted for too long it slides in from the corner.
import { native, call, listen } from './api.js';
import { activityOf } from './names.js';
import { categorize, kindOf } from './categories.js';
import { createNudger } from './nudger.js';
import { load, KEY } from './prefs.js';
import { catSVG } from './cat.js';

const $ = (id) => document.getElementById(id);
let prefs = load();
const nudger = createNudger();
let showing = false;
let lastActivity = '';

const LINES = [
  (a, t) => [`That's ${t} on ${a}.`, 'Back to what you were doing?'],
  (a, t) => [`Mrrp. ${t} of ${a}.`, "I'll keep your seat warm. Ready to go back?"],
  (a, t) => [`Still on ${a}?`, `It's been ${t}. One more and then back to it?`],
];

function words(ms) {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} minute${m > 1 ? 's' : ''}`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hour${h > 1 ? 's' : ''}${r ? ` ${r} min` : ''}`;
}

function show(activity, ms) {
  const line = LINES[Math.floor(Math.random() * LINES.length)](activity, words(ms));
  $('msg').textContent = line[0];
  $('sub').textContent = line[1];
  $('cat').innerHTML = catSVG('stern');
  showing = true;
  call('show_nudge');
  requestAnimationFrame(() => $('card').classList.add('in'));
}

function hide(happy) {
  if (happy) {
    $('cat').innerHTML = catSVG('happy');
    $('msg').textContent = 'Good human.';
    $('sub').textContent = "I'll be here.";
    setTimeout(() => hide(false), 1100);
    return;
  }
  $('card').classList.remove('in');
  showing = false;
  setTimeout(() => { if (!showing) call('hide_nudge'); }, 350);
}

$('back').addEventListener('click', () => { nudger.reset(Date.now(), 2); hide(true); });
$('more').addEventListener('click', () => { nudger.snooze(Date.now(), 5); hide(false); });

listen('sundial://tick', (st) => {
  if (st.paused_until) return;
  const cur = st.current;
  const activity = cur ? activityOf(cur).activity : '';
  const distracting = cur ? kindOf(categorize(activity, prefs.overrides)) === 'distraction' : false;
  if (distracting) lastActivity = activity;
  const due = nudger.update(st.now, distracting, prefs.nudgeAfter);
  if (due && !showing) show(lastActivity, nudger.stretch(st.now));
});

addEventListener('storage', (e) => {
  if (e.key === KEY) prefs = load();
  if (e.key === 'sundial.testNudge') show('YouTube', 15 * 60_000);
});

(async () => {
  $('cat').innerHTML = catSVG('stern');
  if (native) {
    await call('set_options', { idleMinutes: prefs.idleMinutes, titles: prefs.titles });
  } else {
    // Preview: show the card straight away.
    show('YouTube', 15 * 60_000);
  }
})();
