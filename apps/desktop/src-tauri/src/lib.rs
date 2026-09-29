#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    // Opens a report PDF in the system viewer for printing (#309).
    .plugin(tauri_plugin_opener::init());

  // In-app updates are a desktop-only concern: macOS and Windows installs are
  // the ones PumpOS distributes itself. Mobile builds get their updates from
  // the stores, so the updater/process/os plugins are not compiled in at all.
  #[cfg(desktop)]
  let builder = builder
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_os::init());

  #[cfg(desktop)]
  let builder = builder.setup(|app| {
    size_main_window(app);
    Ok(())
  });

  builder
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

/// Opens the main window at ~85% of the current monitor's work area, centred
/// (#326). The config's 1024x768 + `center` is the fallback when the monitor
/// can't be read; `minWidth`/`minHeight` keep it usable either way.
#[cfg(desktop)]
fn size_main_window(app: &tauri::App) {
  use tauri::{Manager, PhysicalPosition, PhysicalSize};

  let Some(window) = app.get_webview_window("main") else { return };
  let Ok(Some(monitor)) = window.current_monitor() else { return };
  let area = monitor.work_area();
  let width = (area.size.width as f64 * 0.85) as u32;
  let height = (area.size.height as f64 * 0.85) as u32;
  let x = area.position.x + ((area.size.width - width) / 2) as i32;
  let y = area.position.y + ((area.size.height - height) / 2) as i32;
  let _ = window.set_size(PhysicalSize::new(width, height));
  let _ = window.set_position(PhysicalPosition::new(x, y));
}
