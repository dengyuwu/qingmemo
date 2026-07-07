use tauri::Manager;

pub mod ai;
pub mod app;
pub mod reminder;
pub mod store;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(app::setup)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<app::AppState>();
                if !state.is_exiting() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            app::list_reminders,
            app::list_recent_reminders,
            app::create_reminder,
            app::update_reminder,
            app::complete_reminder,
            app::archive_reminder,
            app::restore_reminder,
            app::list_reminder_events,
            app::test_reminder,
            app::list_notes,
            app::create_note,
            app::update_note,
            app::toggle_note_pin,
            app::archive_note,
            app::restore_note,
            app::list_local_files,
            app::update_note_layout,
            app::update_many_note_layouts,
            app::set_focus_mode,
            app::get_focus_mode,
            app::set_reminders_paused,
            app::get_reminders_paused,
            app::set_autostart,
            app::get_autostart,
            app::get_reminder_diagnostics,
            app::export_backup,
            app::generate_ai_title,
            app::generate_ai_assist,
            app::get_ai_key_status,
            app::save_ai_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running qingmemo");
}

