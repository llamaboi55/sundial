//! How long since you last touched the keyboard or mouse, from the system itself.
//! Returns None where the system won't say (Wayland), and the caller falls back to
//! watching the mouse.

#[cfg(target_os = "windows")]
pub fn idle_ms() -> Option<u64> {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    // SAFETY: plain Win32 calls with a correctly sized struct.
    unsafe {
        if GetLastInputInfo(&mut info) == 0 {
            return None;
        }
        Some(GetTickCount().wrapping_sub(info.dwTime) as u64)
    }
}

#[cfg(target_os = "macos")]
pub fn idle_ms() -> Option<u64> {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }
    // 0 = combined session state, u32::MAX = any input event.
    // SAFETY: a pure query with no pointers.
    let s = unsafe { CGEventSourceSecondsSinceLastEventType(0, u32::MAX) };
    (s.is_finite() && s >= 0.0).then(|| (s * 1000.0) as u64)
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn idle_ms() -> Option<u64> {
    use std::sync::OnceLock;
    use x11rb::connection::Connection;
    use x11rb::protocol::screensaver::ConnectionExt;
    use x11rb::rust_connection::RustConnection;

    static X: OnceLock<Option<(RustConnection, u32)>> = OnceLock::new();
    let (conn, root) = X
        .get_or_init(|| {
            if std::env::var_os("DISPLAY").is_none() {
                return None;
            }
            let (conn, screen) = x11rb::connect(None).ok()?;
            let root = conn.setup().roots.get(screen)?.root;
            Some((conn, root))
        })
        .as_ref()?;
    let info = conn.screensaver_query_info(*root).ok()?.reply().ok()?;
    Some(info.ms_since_user_input as u64)
}

#[cfg(not(any(unix, target_os = "windows")))]
pub fn idle_ms() -> Option<u64> {
    None
}
