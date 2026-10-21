//! Turns a stream of "what's in front" samples into sessions: one app and window
//! title from a start time to an end time. Time away from the keyboard isn't counted.

use crate::active::Sample;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Session {
    /// Start and end in milliseconds since 1970 (UTC).
    pub start: u64,
    pub end: u64,
    pub app: String,
    pub title: String,
}

pub struct Tracker {
    pub current: Option<Session>,
    /// Away after this long without keyboard or mouse input.
    pub idle_limit_ms: u64,
    /// Keep window titles, or record the app alone.
    pub titles: bool,
}

/// A gap longer than this between samples (sleep, a frozen system) ends the session.
const MAX_GAP_MS: u64 = 15_000;
/// Long sessions are saved every this often.
const CHECKPOINT_MS: u64 = 5 * 60_000;

impl Tracker {
    pub fn new() -> Self {
        Tracker { current: None, idle_limit_ms: 3 * 60_000, titles: true }
    }

    /// Feeds one sample taken at `now`. Returns the session that just ended, if any.
    pub fn observe(&mut self, now: u64, sample: Option<Sample>, idle_ms: Option<u64>) -> Option<Session> {
        let idle = idle_ms.unwrap_or(0);
        let away = idle >= self.idle_limit_ms;
        let sample = sample.filter(|_| !away).map(|mut s| {
            if !self.titles {
                s.title.clear();
            }
            s.title = s.title.trim().chars().take(300).collect();
            s
        });

        if let Some(cur) = &mut self.current {
            let gap = now.saturating_sub(cur.end) > MAX_GAP_MS;
            let same = sample.as_ref().is_some_and(|s| s.app == cur.app && s.title == cur.title);
            if same && !gap {
                cur.end = now;
                // Save long sessions in pieces so a crash or power cut loses little.
                if cur.end - cur.start >= CHECKPOINT_MS && idle < 30_000 {
                    let piece = cur.clone();
                    cur.start = cur.end;
                    return Some(piece);
                }
                return None;
            }
            let mut done = self.current.take().unwrap();
            if away && !gap {
                // Count up to the last input, not the moment we noticed.
                done.end = now.saturating_sub(idle).clamp(done.start, done.end);
            }
            self.current = sample.map(|s| Session { start: now, end: now, app: s.app, title: s.title });
            return (done.end > done.start).then_some(done);
        }
        self.current = sample.map(|s| Session { start: now, end: now, app: s.app, title: s.title });
        None
    }

    /// Ends the current session now (pausing, quitting).
    pub fn flush(&mut self) -> Option<Session> {
        self.current.take().filter(|s| s.end > s.start)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(app: &str, title: &str) -> Option<Sample> {
        Some(Sample { app: app.into(), title: title.into() })
    }

    #[test]
    fn same_window_extends_a_session() {
        let mut t = Tracker::new();
        assert!(t.observe(0, s("code", "main.rs"), Some(0)).is_none());
        assert!(t.observe(2000, s("code", "main.rs"), Some(0)).is_none());
        assert!(t.observe(4000, s("code", "main.rs"), Some(0)).is_none());
        assert_eq!(t.current.as_ref().unwrap().end, 4000);
    }

    #[test]
    fn switching_ends_the_session() {
        let mut t = Tracker::new();
        t.observe(0, s("code", "a"), Some(0));
        t.observe(2000, s("code", "a"), Some(0));
        let done = t.observe(4000, s("firefox", "News"), Some(0)).unwrap();
        assert_eq!((done.start, done.end, done.app.as_str()), (0, 2000, "code"));
        assert_eq!(t.current.as_ref().unwrap().app, "firefox");
    }

    #[test]
    fn going_idle_ends_at_the_last_input() {
        // Last input at 190 s; the limit is 3 minutes, so at 370 s the session ends back at 190 s.
        let mut t = Tracker::new();
        let mut ended = Vec::new();
        for ms in (0..=372_000u64).step_by(2000) {
            let idle = ms.saturating_sub(190_000);
            ended.extend(t.observe(ms, s("code", "a"), Some(idle)));
        }
        // Saved in checkpoint pieces that join up from 0 to the last input.
        assert_eq!(ended.first().unwrap().start, 0);
        assert_eq!(ended.last().unwrap().end, 190_000);
        assert!(ended.windows(2).all(|w| w[0].end == w[1].start));
        assert!(t.current.is_none());
        // Coming back starts fresh.
        assert!(t.observe(400_000, s("code", "a"), Some(0)).is_none());
        assert_eq!(t.current.as_ref().unwrap().start, 400_000);
    }

    #[test]
    fn a_long_gap_splits_sessions() {
        let mut t = Tracker::new();
        t.observe(0, s("code", "a"), Some(0));
        t.observe(2000, s("code", "a"), Some(0));
        let done = t.observe(600_000, s("code", "a"), Some(0)).unwrap();
        assert_eq!(done.end, 2000);
        assert_eq!(t.current.as_ref().unwrap().start, 600_000);
    }

    #[test]
    fn long_sessions_are_saved_in_pieces() {
        let mut t = Tracker::new();
        let mut pieces = Vec::new();
        for ms in (0..=12 * 60_000u64).step_by(2000) {
            pieces.extend(t.observe(ms, s("code", "a"), Some(0)));
        }
        assert_eq!(pieces.len(), 2);
        assert_eq!((pieces[0].start, pieces[0].end), (0, 300_000));
        assert_eq!(pieces[1].start, 300_000);
        assert_eq!(t.current.as_ref().unwrap().start, 600_000);
    }

    #[test]
    fn titles_can_be_left_out() {
        let mut t = Tracker::new();
        t.titles = false;
        t.observe(0, s("firefox", "Secret - Mozilla Firefox"), Some(0));
        assert_eq!(t.current.as_ref().unwrap().title, "");
    }

    #[test]
    fn flush_drops_empty_sessions() {
        let mut t = Tracker::new();
        t.observe(0, s("code", "a"), Some(0));
        assert!(t.flush().is_none());
        t.observe(0, s("code", "a"), Some(0));
        t.observe(2000, s("code", "a"), Some(0));
        assert_eq!(t.flush().unwrap().end, 2000);
    }
}
