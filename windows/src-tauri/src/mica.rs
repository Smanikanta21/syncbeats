use tauri::WebviewWindow;

#[tauri::command]
pub fn apply_mica_effect(window: WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Gdi::DwmSetWindowAttribute;
        
        let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
        
        // DWMWA_MICA_EFFECT = 1029, DWMWA_SYSTEMBACKDROP_TYPE = 38 (3 = Mica, 4 = Acrylic)
        let backdrop_type: u32 = 3; 
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd,
                windows::Win32::Graphics::Gdi::DWMWINDOWATTRIBUTE(38),
                &backdrop_type as *const _ as _,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
    let _ = window;
    Ok(())
}
