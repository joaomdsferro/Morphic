use morphic_core_native::{convert_file, ConvertRequest};

/// Tauri command: convert a file on disk using the native Rust core.
#[tauri::command]
async fn convert(
    input_path: String,
    output_path: String,
    quality: u8,
) -> Result<serde_json::Value, String> {
    let req = ConvertRequest {
        input_path: input_path.into(),
        output_path: output_path.into(),
        quality,
    };

    convert_file(req)
        .map(|result| serde_json::to_value(result).unwrap())
        .map_err(|e| e.to_string())
}

/// Tauri command: return the list of supported output formats.
#[tauri::command]
fn supported_formats() -> Vec<String> {
    vec![
        "jpeg".into(),
        "png".into(),
        "webp".into(),
        "avif".into(),
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![convert, supported_formats])
        .run(tauri::generate_context!())
        .expect("error while running Morphic");
}
