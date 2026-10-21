//! Which app is in front right now, and the title of its window.
//! Returns None when nothing can be read (a locked screen, or Wayland).

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sample {
    /// The program, e.g. "chrome" on Windows or "Google Chrome" on macOS.
    pub app: String,
    /// The window title. macOS doesn't share titles without a permission prompt,
    /// so there it is empty.
    pub title: String,
}

#[cfg(target_os = "windows")]
pub fn current() -> Option<Sample> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};
    // SAFETY: plain Win32 queries into buffers we own and size correctly.
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut buf = [0u16; 512];
        let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32).max(0) as usize;
        let title = String::from_utf16_lossy(&buf[..n]);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        let mut app = String::new();
        if !proc.is_null() {
            let mut path = [0u16; 1024];
            let mut len = path.len() as u32;
            if QueryFullProcessImageNameW(proc, 0, path.as_mut_ptr(), &mut len) != 0 {
                app = exe_stem(&String::from_utf16_lossy(&path[..len as usize]));
            }
            CloseHandle(proc);
        }
        if app.is_empty() && title.is_empty() {
            return None;
        }
        Some(Sample { app, title })
    }
}

#[cfg(target_os = "macos")]
pub fn current() -> Option<Sample> {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};
    use std::ffi::{c_char, CStr};
    // SAFETY: NSWorkspace queries are thread-safe; every pointer is null-checked.
    unsafe {
        let cls = AnyClass::get(c"NSWorkspace")?;
        let ws: *mut AnyObject = msg_send![cls, sharedWorkspace];
        let front: *mut AnyObject = msg_send![&*ws, frontmostApplication];
        if front.is_null() {
            return None;
        }
        let name: *mut AnyObject = msg_send![&*front, localizedName];
        if name.is_null() {
            return None;
        }
        let utf8: *const c_char = msg_send![&*name, UTF8String];
        if utf8.is_null() {
            return None;
        }
        let app = CStr::from_ptr(utf8).to_string_lossy().into_owned();
        Some(Sample { app, title: String::new() })
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn current() -> Option<Sample> {
    use std::sync::OnceLock;
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{Atom, AtomEnum, ConnectionExt, Window};
    use x11rb::rust_connection::RustConnection;

    struct X {
        conn: RustConnection,
        root: Window,
        active: Atom,
        name: Atom,
        utf8: Atom,
    }
    static X: OnceLock<Option<X>> = OnceLock::new();
    let x = X
        .get_or_init(|| {
            std::env::var_os("DISPLAY")?;
            let (conn, screen) = x11rb::connect(None).ok()?;
            let root = conn.setup().roots.get(screen)?.root;
            let atom = |n: &str| conn.intern_atom(false, n.as_bytes()).ok()?.reply().ok().map(|r| r.atom);
            let (active, name, utf8) = (atom("_NET_ACTIVE_WINDOW")?, atom("_NET_WM_NAME")?, atom("UTF8_STRING")?);
            Some(X { conn, root, active, name, utf8 })
        })
        .as_ref()?;
    let reply = x.conn.get_property(false, x.root, x.active, AtomEnum::ANY, 0, 1).ok()?.reply().ok()?;
    let win = reply.value32()?.next()?;
    if win == 0 {
        return None;
    }
    let text = |prop: Atom, ty: Atom| -> Option<Vec<u8>> { Some(x.conn.get_property(false, win, prop, ty, 0, 1024).ok()?.reply().ok()?.value) };
    let mut title = text(x.name, x.utf8).map(|v| String::from_utf8_lossy(&v).into_owned()).unwrap_or_default();
    if title.is_empty() {
        title = text(AtomEnum::WM_NAME.into(), AtomEnum::STRING.into()).map(|v| String::from_utf8_lossy(&v).into_owned()).unwrap_or_default();
    }
    // WM_CLASS holds "instance\0Class\0"; the class is the friendlier name.
    let class = text(AtomEnum::WM_CLASS.into(), AtomEnum::STRING.into()).unwrap_or_default();
    let app = class_name(&class);
    if app.is_empty() && title.is_empty() {
        return None;
    }
    Some(Sample { app, title })
}

#[cfg(not(any(unix, target_os = "windows")))]
pub fn current() -> Option<Sample> {
    None
}

/// "C:\\Program Files\\Google\\Chrome\\chrome.exe" -> "chrome"
#[cfg_attr(not(windows), allow(dead_code))]
pub fn exe_stem(path: &str) -> String {
    let file = path.rsplit(['\\', '/']).next().unwrap_or(path);
    let stem = file.strip_suffix(".exe").or_else(|| file.strip_suffix(".EXE")).unwrap_or(file);
    stem.to_string()
}

/// b"navigator\0Firefox\0" -> "Firefox"
#[cfg_attr(any(windows, target_os = "macos"), allow(dead_code))]
pub fn class_name(raw: &[u8]) -> String {
    let parts: Vec<&[u8]> = raw.split(|b| *b == 0).filter(|p| !p.is_empty()).collect();
    let pick = parts.get(1).or(parts.first()).copied().unwrap_or_default();
    String::from_utf8_lossy(pick).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exe_names() {
        assert_eq!(exe_stem(r"C:\Program Files\Google\Chrome\Application\chrome.exe"), "chrome");
        assert_eq!(exe_stem("/usr/bin/code"), "code");
        assert_eq!(exe_stem("Code.EXE"), "Code");
    }

    #[test]
    fn wm_class() {
        assert_eq!(class_name(b"navigator\0Firefox\0"), "Firefox");
        assert_eq!(class_name(b"xterm\0"), "xterm");
        assert_eq!(class_name(b""), "");
    }
}
