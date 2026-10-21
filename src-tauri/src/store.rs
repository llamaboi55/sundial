//! Sessions on disk: one JSON line per session, one file per UTC day, in the app's
//! data folder. Plain text, so it's easy to back up, read or delete.

use crate::tracker::Session;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

const DAY_MS: u64 = 86_400_000;

pub struct Store {
    pub dir: PathBuf,
}

impl Store {
    pub fn new(dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&dir);
        Store { dir }
    }

    fn file(&self, day: u64) -> PathBuf {
        self.dir.join(format!("{day}.jsonl"))
    }

    /// Saves a session, split at UTC midnight so each file holds one day.
    pub fn append(&self, s: &Session) -> std::io::Result<()> {
        let mut start = s.start;
        while start < s.end {
            let day = start / DAY_MS;
            let end = s.end.min((day + 1) * DAY_MS);
            let part = Session { start, end, ..s.clone() };
            let mut f = OpenOptions::new().create(true).append(true).open(self.file(day))?;
            writeln!(f, "{}", serde_json::to_string(&part)?)?;
            start = end;
        }
        Ok(())
    }

    /// Every saved session that overlaps [from, to).
    pub fn range(&self, from: u64, to: u64) -> Vec<Session> {
        let mut out = Vec::new();
        if to <= from {
            return out;
        }
        for day in from / DAY_MS..=(to - 1) / DAY_MS {
            out.extend(read(&self.file(day)).into_iter().filter(|s| s.end > from && s.start < to));
        }
        out
    }

    /// Deletes everything.
    pub fn clear(&self) {
        if let Ok(entries) = fs::read_dir(&self.dir) {
            for e in entries.flatten() {
                if e.path().extension().is_some_and(|x| x == "jsonl") {
                    let _ = fs::remove_file(e.path());
                }
            }
        }
    }
}

fn read(path: &Path) -> Vec<Session> {
    let Ok(f) = fs::File::open(path) else { return Vec::new() };
    // A half-written last line (power cut) is skipped rather than failing the day.
    BufReader::new(f).lines().map_while(Result::ok).filter_map(|l| serde_json::from_str(&l).ok()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sess(start: u64, end: u64, app: &str) -> Session {
        Session { start, end, app: app.into(), title: String::new() }
    }

    #[test]
    fn round_trip_and_range() {
        let dir = tempfile::tempdir().unwrap();
        let st = Store::new(dir.path().to_path_buf());
        st.append(&sess(1000, 5000, "a")).unwrap();
        st.append(&sess(6000, 9000, "b")).unwrap();
        assert_eq!(st.range(0, DAY_MS).len(), 2);
        assert_eq!(st.range(5500, DAY_MS)[0].app, "b");
        assert!(st.range(9000, 9500).is_empty());
    }

    #[test]
    fn splits_at_midnight() {
        let dir = tempfile::tempdir().unwrap();
        let st = Store::new(dir.path().to_path_buf());
        st.append(&sess(DAY_MS - 1000, DAY_MS + 2000, "late")).unwrap();
        let first = st.range(0, DAY_MS);
        let second = st.range(DAY_MS, 2 * DAY_MS);
        assert_eq!((first[0].start, first[0].end), (DAY_MS - 1000, DAY_MS));
        assert_eq!((second[0].start, second[0].end), (DAY_MS, DAY_MS + 2000));
    }

    #[test]
    fn skips_broken_lines_and_clears() {
        let dir = tempfile::tempdir().unwrap();
        let st = Store::new(dir.path().to_path_buf());
        st.append(&sess(10, 20, "a")).unwrap();
        let mut f = OpenOptions::new().append(true).open(st.file(0)).unwrap();
        write!(f, "{{\"start\":3").unwrap();
        assert_eq!(st.range(0, 100).len(), 1);
        st.clear();
        assert!(st.range(0, 100).is_empty());
    }
}
