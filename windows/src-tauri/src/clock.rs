use std::sync::OnceLock;
use std::time::Instant;

static START_INSTANT: OnceLock<Instant> = OnceLock::new();

/// Returns a high-precision microsecond hardware timestamp.
/// Uses Rust's Instant (backed by Windows QueryPerformanceCounter on MSVC)
/// to achieve sub-microsecond timing accuracy for SyncBeats NTP calculation.
#[tauri::command]
pub fn get_hardware_timestamp() -> f64 {
    let start = START_INSTANT.get_or_init(Instant::now);
    let elapsed = start.elapsed();
    elapsed.as_secs_f64() * 1000.0
}
