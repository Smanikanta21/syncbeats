mod clock;
mod local_media;
mod mica;
mod smtc;
mod tray;

use smtc::SmtcState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SmtcState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            clock::get_hardware_timestamp,
            local_media::scan_local_folder,
            smtc::update_smtc_metadata,
            smtc::update_smtc_playback,
            mica::apply_mica_effect
        ])
        .setup(|app| {
            let handle = app.handle();
            let _ = tray::setup_tray(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
