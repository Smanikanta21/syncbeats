use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaMetaData {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover_url: Option<String>,
}

pub struct SmtcState {
    pub current_meta: Mutex<Option<MediaMetaData>>,
    pub is_playing: Mutex<bool>,
}

impl Default for SmtcState {
    fn default() -> Self {
        Self {
            current_meta: Mutex::new(None),
            is_playing: Mutex::new(false),
        }
    }
}

#[tauri::command]
pub fn update_smtc_metadata(
    state: tauri::State<'_, SmtcState>,
    title: String,
    artist: String,
    album: String,
    cover_url: Option<String>,
) -> Result<(), String> {
    let meta = MediaMetaData {
        title,
        artist,
        album,
        cover_url,
    };
    if let Ok(mut current) = state.current_meta.lock() {
        *current = Some(meta);
    }
    Ok(())
}

#[tauri::command]
pub fn update_smtc_playback(
    state: tauri::State<'_, SmtcState>,
    is_playing: bool,
) -> Result<(), String> {
    if let Ok(mut playing) = state.is_playing.lock() {
        *playing = is_playing;
    }
    Ok(())
}

/// Helper function to emit media key actions back to the frontend
pub fn emit_media_key_event(app: &AppHandle, action: &str) {
    let _ = app.emit("windows-media-key", action);
}
