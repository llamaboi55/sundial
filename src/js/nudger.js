// Decides when the cat should speak up: after a stretch of distraction that hasn't
// been broken by real work, and not again right after you said "5 more minutes".
const GRACE = 45_000; // a short hop away from the distraction doesn't reset the clock

export function createNudger() {
  let since = null;     // when the current distracted stretch began
  let goodSince = null; // when the current spell of non-distraction began
  let quietUntil = 0;   // snoozed or just nudged
  return {
    /** Feed what's in front now. Returns true when it's time to nudge. */
    update(now, distracting, afterMinutes) {
      if (!afterMinutes) { since = null; return false; }
      if (distracting) {
        if (since === null || (goodSince !== null && now - goodSince > GRACE)) since = now;
        goodSince = null;
      } else {
        if (goodSince === null) goodSince = now;
        if (now - goodSince > GRACE) since = null;
      }
      if (since === null || now < quietUntil) return false;
      return now - since >= afterMinutes * 60_000;
    },
    /** How long the current stretch has lasted. */
    stretch(now) { return since === null ? 0 : now - since; },
    snooze(now, minutes) { quietUntil = now + minutes * 60_000; },
    /** Back to work: start counting from scratch. */
    reset(now, minutes) { since = null; goodSince = null; quietUntil = now + minutes * 60_000; },
  };
}
