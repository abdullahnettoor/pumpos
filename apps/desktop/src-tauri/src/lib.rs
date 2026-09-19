#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init());

  // In-app updates are a desktop-only concern: macOS and Windows installs are
  // the ones PumpOS distributes itself. Mobile builds get their updates from
  // the stores, so the updater/process/os plugins are not compiled in at all.
  #[cfg(desktop)]
  let builder = builder
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_os::init());

  builder
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
