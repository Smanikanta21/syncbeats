use lofty::file::AudioFile;
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct TrackMetadata {
    pub file_path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_seconds: f64,
    pub cover_art_base64: Option<String>,
}

#[tauri::command]
pub fn scan_local_folder(folder_path: String) -> Result<Vec<TrackMetadata>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Err("Directory does not exist".to_string());
    }

    let mut tracks = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_file() {
            if let Some(ext) = entry_path.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ext_lower == "mp3" || ext_lower == "flac" || ext_lower == "wav" || ext_lower == "m4a" {
                    if let Ok(meta) = extract_metadata(&entry_path) {
                        tracks.push(meta);
                    }
                }
            }
        }
    }

    Ok(tracks)
}

fn extract_metadata(file_path: &Path) -> Result<TrackMetadata, String> {
    let tagged_file = Probe::open(file_path)
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;

    let properties = tagged_file.properties();
    let duration_seconds = properties.duration().as_secs_f64();

    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());
    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown Track")
        .to_string();

    let (title, artist, album, cover_art_base64) = if let Some(t) = tag {
        let title = t.title().map(|s| s.to_string()).unwrap_or_else(|| file_name.clone());
        let artist = t.artist().map(|s| s.to_string()).unwrap_or_else(|| "Unknown Artist".to_string());
        let album = t.album().map(|s| s.to_string()).unwrap_or_else(|| "Unknown Album".to_string());

        let picture = t.pictures().first();
        let cover_base64 = picture.map(|pic| {
            use lofty::picture::Picture;
            let mime = pic.mime_type().as_str();
            let base64_str = base64_encode(pic.data());
            format!("data:{};base64,{}", mime, base64_str)
        });

        (title, artist, album, cover_base64)
    } else {
        (file_name, "Unknown Artist".to_string(), "Unknown Album".to_string(), None)
    };

    Ok(TrackMetadata {
        file_path: file_path.to_string_lossy().to_string(),
        title,
        artist,
        album,
        duration_seconds,
        cover_art_base64,
    })
}

fn base64_encode(data: &[u8]) -> String {
    use std::fmt::Write;
    let mut s = String::with_capacity(data.len() * 4 / 3 + 4);
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
        let b2 = chunk.get(2).copied().unwrap_or(0) as usize;

        let tri = (b0 << 16) | (b1 << 8) | b2;
        let _ = write!(s, "{}", CHARS[(tri >> 18) & 63] as char);
        let _ = write!(s, "{}", CHARS[(tri >> 12) & 63] as char);
        if chunk.len() > 1 {
            let _ = write!(s, "{}", CHARS[(tri >> 6) & 63] as char);
        } else {
            s.push('=');
        }
        if chunk.len() > 2 {
            let _ = write!(s, "{}", CHARS[tri & 63] as char);
        } else {
            s.push('=');
        }
    }
    s
}
