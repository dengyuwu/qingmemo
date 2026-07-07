use std::{
    error::Error,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration as StdDuration,
};

use chrono::Utc;
use parking_lot::{Condvar, Mutex};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    plugin::PermissionState,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, State,
};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_notification::NotificationExt;

use crate::{
    ai::{self, AiKeyStatus, GeneratedText, GeneratedTitle},
    reminder::{Reminder, ReminderPriority, SchedulerPolicy},
    store::{Note, NoteInput, NoteLayoutPatch, ReminderEvent, ReminderInput, ReminderStore},
};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderNotificationPayload {
    id: i64,
    title: String,
    body: String,
    priority: ReminderPriority,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileBrowserEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileBrowserDirectory {
    current_path: String,
    parent_path: Option<String>,
    entries: Vec<FileBrowserEntry>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderDiagnostics {
    notification_permission: String,
    scheduler_paused: bool,
    focus_mode: bool,
    autostart_enabled: Option<bool>,
    next_due_at: Option<String>,
    database_path: String,
    checked_at: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    path: String,
    notes: usize,
    reminders: usize,
}

#[derive(Clone)]
pub struct AppState {
    core: Arc<AppCore>,
}

struct AppCore {
    store: Mutex<ReminderStore>,
    focus_mode: AtomicBool,
    paused: AtomicBool,
    exiting: AtomicBool,
    wake: SchedulerWake,
}

struct SchedulerWake {
    lock: Mutex<()>,
    condvar: Condvar,
}

impl AppState {
    fn new(store: ReminderStore, focus_mode: bool) -> Self {
        Self {
            core: Arc::new(AppCore {
                store: Mutex::new(store),
                focus_mode: AtomicBool::new(focus_mode),
                paused: AtomicBool::new(false),
                exiting: AtomicBool::new(false),
                wake: SchedulerWake { lock: Mutex::new(()), condvar: Condvar::new() },
            }),
        }
    }

    pub fn is_exiting(&self) -> bool {
        self.core.exiting.load(Ordering::Relaxed)
    }

    fn set_exiting(&self) {
        self.core.exiting.store(true, Ordering::Relaxed);
        self.core.wake.notify();
    }

    fn wake_scheduler(&self) {
        self.core.wake.notify();
    }
}

impl SchedulerWake {
    fn notify(&self) {
        self.condvar.notify_all();
    }

    fn wait(&self, duration: StdDuration) {
        let mut guard = self.lock.lock();
        self.condvar.wait_for(&mut guard, duration);
    }
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn Error>> {
    let db_path = app.path().app_data_dir()?.join("qingmemo.sqlite3");
    let store = ReminderStore::open(db_path)?;
    let focus_mode = store.get_focus_mode()?;
    let state = AppState::new(store, focus_mode);
    let scheduler_core = state.core.clone();

    app.manage(state);
    ensure_notification_permission(app);
    build_tray(app)?;
    start_scheduler(app.handle().clone(), scheduler_core);

    Ok(())
}

#[tauri::command]
pub fn list_reminders(
    state: State<'_, AppState>,
    query: Option<String>,
) -> Result<Vec<Reminder>, String> {
    let store = state.core.store.lock();
    store.list_active(query.as_deref()).map_err(to_command_error)
}

#[tauri::command]
pub fn list_recent_reminders(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<Reminder>, String> {
    state
        .core
        .store
        .lock()
        .list_recent(limit.unwrap_or(8))
        .map_err(to_command_error)
}

#[tauri::command]
pub fn create_reminder(
    state: State<'_, AppState>,
    input: ReminderInput,
) -> Result<Reminder, String> {
    let reminder = state.core.store.lock().create(input).map_err(to_command_error)?;
    state.wake_scheduler();
    Ok(reminder)
}

#[tauri::command]
pub fn update_reminder(
    state: State<'_, AppState>,
    id: i64,
    input: ReminderInput,
) -> Result<Reminder, String> {
    let reminder = {
        let store = state.core.store.lock();
        store.update(id, input).map_err(to_command_error)?;
        store
            .get(id)
            .map_err(to_command_error)?
            .ok_or_else(|| format!("未找到提醒：{}", id))?
    };
    state.wake_scheduler();
    Ok(reminder)
}

#[tauri::command]
pub fn complete_reminder(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.core.store.lock().complete(id).map_err(to_command_error)?;
    state.wake_scheduler();
    Ok(())
}

#[tauri::command]
pub fn archive_reminder(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.core.store.lock().archive(id).map_err(to_command_error)?;
    state.wake_scheduler();
    Ok(())
}

#[tauri::command]
pub fn restore_reminder(state: State<'_, AppState>, id: i64) -> Result<Reminder, String> {
    let reminder = state.core.store.lock().restore_reminder(id).map_err(to_command_error)?;
    state.wake_scheduler();
    Ok(reminder)
}

#[tauri::command]
pub fn list_reminder_events(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<ReminderEvent>, String> {
    state
        .core
        .store
        .lock()
        .list_reminder_events(limit.unwrap_or(30))
        .map_err(to_command_error)
}

#[tauri::command]
pub fn test_reminder(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let title = "轻备忘测试提醒";
    let body = "如果你看到这条提醒，说明本小姐还能正常盯时间。";
    state
        .core
        .store
        .lock()
        .record_reminder_event(None, "test", title, body)
        .map_err(to_command_error)?;
    let payload = ReminderNotificationPayload {
        id: 0,
        title: title.to_string(),
        body: body.to_string(),
        priority: ReminderPriority::High,
    };
    show_main_window(&app);
    let _ = app.emit("reminder-fired", payload);
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(to_display_error)
}

#[tauri::command]
pub fn list_notes(state: State<'_, AppState>, query: Option<String>) -> Result<Vec<Note>, String> {
    state.core.store.lock().list_notes(query.as_deref()).map_err(to_command_error)
}

#[tauri::command]
pub fn create_note(state: State<'_, AppState>, input: NoteInput) -> Result<Note, String> {
    state.core.store.lock().create_note(input).map_err(to_command_error)
}

#[tauri::command]
pub fn update_note(
    state: State<'_, AppState>,
    id: i64,
    input: NoteInput,
) -> Result<Note, String> {
    state.core.store.lock().update_note(id, input).map_err(to_command_error)
}

#[tauri::command]
pub fn toggle_note_pin(
    state: State<'_, AppState>,
    id: i64,
    pinned: bool,
) -> Result<Note, String> {
    state.core.store.lock().toggle_note_pin(id, pinned).map_err(to_command_error)
}

#[tauri::command]
pub fn archive_note(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    state.core.store.lock().archive_note(id).map_err(to_command_error)
}

#[tauri::command]
pub fn restore_note(state: State<'_, AppState>, id: i64) -> Result<Note, String> {
    state.core.store.lock().restore_note(id).map_err(to_command_error)
}

#[tauri::command]
pub fn list_local_files(app: AppHandle, path: Option<String>) -> Result<FileBrowserDirectory, String> {
    let directory = match path.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) {
        Some(path) => PathBuf::from(path),
        None => app
            .path()
            .desktop_dir()
            .or_else(|_| app.path().home_dir())
            .map_err(to_display_error)?,
    };
    read_file_browser_directory(&directory).map_err(to_display_error)
}

#[tauri::command]
pub fn update_note_layout(
    state: State<'_, AppState>,
    layout: NoteLayoutPatch,
) -> Result<(), String> {
    state.core.store.lock().update_note_layouts(vec![layout]).map_err(to_command_error)
}

#[tauri::command]
pub fn update_many_note_layouts(
    state: State<'_, AppState>,
    layouts: Vec<NoteLayoutPatch>,
) -> Result<(), String> {
    state.core.store.lock().update_note_layouts(layouts).map_err(to_command_error)
}

#[tauri::command]
pub fn set_focus_mode(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    state.core.store.lock().set_focus_mode(enabled).map_err(to_command_error)?;
    state.core.focus_mode.store(enabled, Ordering::Relaxed);
    state.wake_scheduler();
    let _ = app.emit("focus-mode-changed", enabled);
    Ok(())
}

#[tauri::command]
pub fn get_focus_mode(state: State<'_, AppState>) -> bool {
    state.core.focus_mode.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn set_reminders_paused(
    app: AppHandle,
    state: State<'_, AppState>,
    paused: bool,
) -> Result<(), String> {
    state.core.paused.store(paused, Ordering::Relaxed);
    state.wake_scheduler();
    let _ = app.emit("paused-changed", paused);
    Ok(())
}

#[tauri::command]
pub fn get_reminders_paused(state: State<'_, AppState>) -> bool {
    state.core.paused.load(Ordering::Relaxed)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(to_display_error)
    } else {
        autostart.disable().map_err(to_display_error)
    }
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(to_display_error)
}

#[tauri::command]
pub fn get_reminder_diagnostics(app: AppHandle, state: State<'_, AppState>) -> Result<ReminderDiagnostics, String> {
    let notification_permission = app
        .notification()
        .permission_state()
        .map(|state| format!("{state:?}"))
        .unwrap_or_else(|_| "Unknown".to_string());
    let autostart_enabled = app.autolaunch().is_enabled().ok();
    let next_due_at = state
        .core
        .store
        .lock()
        .next_due()
        .map_err(to_command_error)?
        .map(|value| value.to_rfc3339());
    let database_path = app
        .path()
        .app_data_dir()
        .map_err(to_display_error)?
        .join("qingmemo.sqlite3")
        .to_string_lossy()
        .replace('\\', "/");

    Ok(ReminderDiagnostics {
        notification_permission,
        scheduler_paused: state.core.paused.load(Ordering::Relaxed),
        focus_mode: state.core.focus_mode.load(Ordering::Relaxed),
        autostart_enabled,
        next_due_at,
        database_path,
        checked_at: Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn export_backup(app: AppHandle, state: State<'_, AppState>) -> Result<BackupResult, String> {
    let (notes, reminders, events) = {
        let store = state.core.store.lock();
        (
            store.list_notes(None).map_err(to_command_error)?,
            store.list_recent(50).map_err(to_command_error)?,
            store.list_reminder_events(100).map_err(to_command_error)?,
        )
    };
    let backup_dir = app.path().app_data_dir().map_err(to_display_error)?.join("backups");
    fs::create_dir_all(&backup_dir).map_err(to_display_error)?;
    let path = backup_dir.join(format!("qingmemo-backup-{}.json", Utc::now().format("%Y%m%d-%H%M%S")));
    let content = serde_json::to_string_pretty(&serde_json::json!({
        "version": 1,
        "created_at": Utc::now().to_rfc3339(),
        "notes": notes,
        "reminders": reminders,
        "reminder_events": events,
    }))
    .map_err(to_display_error)?;
    fs::write(&path, content).map_err(to_display_error)?;
    Ok(BackupResult {
        path: path.to_string_lossy().replace('\\', "/"),
        notes: notes.len(),
        reminders: reminders.len(),
    })
}

#[tauri::command]
pub async fn generate_ai_title(kind: String, content: String) -> Result<GeneratedTitle, String> {
    Ok(ai::generate_title(&kind, &content).await)
}

#[tauri::command]
pub async fn generate_ai_assist(mode: String, content: String) -> Result<GeneratedText, String> {
    Ok(ai::generate_assist(&mode, &content).await)
}

#[tauri::command]
pub fn get_ai_key_status() -> Result<AiKeyStatus, String> {
    Ok(ai::api_key_status())
}

#[tauri::command]
pub fn save_ai_key(key: String) -> Result<AiKeyStatus, String> {
    ai::save_api_key(key).map_err(to_display_error)
}

fn build_tray(app: &mut App) -> tauri::Result<()> {
    let open = MenuItemBuilder::with_id("open", "打开轻备忘").build(app)?;
    let quick_add = MenuItemBuilder::with_id("quick_add", "快速新增").build(app)?;
    let toggle_pause = MenuItemBuilder::with_id("toggle_pause", "暂停/恢复提醒").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&open, &quick_add, &toggle_pause, &quit]).build()?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("轻备忘")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "quick_add" => {
                show_main_window(app);
                let _ = app.emit("quick-add", ());
            }
            "toggle_pause" => {
                let state = app.state::<AppState>();
                let paused = !state.core.paused.load(Ordering::Relaxed);
                state.core.paused.store(paused, Ordering::Relaxed);
                state.wake_scheduler();
                let _ = app.emit("paused-changed", paused);
            }
            "quit" => {
                let state = app.state::<AppState>();
                state.set_exiting();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn start_scheduler(app: AppHandle, core: Arc<AppCore>) {
    let _ = thread::Builder::new()
        .name("qingmemo-reminder-scheduler".to_string())
        .spawn(move || scheduler_loop(app, core));
}

fn scheduler_loop(app: AppHandle, core: Arc<AppCore>) {
    while !core.exiting.load(Ordering::Relaxed) {
        let wait_for = if core.paused.load(Ordering::Relaxed) {
            StdDuration::from_secs(30)
        } else {
            process_due_reminders(&app, &core).unwrap_or_else(|error| {
                eprintln!("qingmemo scheduler error: {error}");
                StdDuration::from_secs(30)
            })
        };
        core.wake.wait(wait_for);
    }
}

fn process_due_reminders(app: &AppHandle, core: &AppCore) -> anyhow::Result<StdDuration> {
    let now = Utc::now();
    let due = { core.store.lock().due_until(now)? };
    let due_count = due.len();
    let policy = SchedulerPolicy { focus_mode: core.focus_mode.load(Ordering::Relaxed) };
    let reminders_to_fire = policy.filter_due(due, now);
    let fired_count = reminders_to_fire.len();

    for reminder in reminders_to_fire {
        let payload = reminder_notification_payload(&reminder);
        show_main_window(app);
        let _ = app.emit("reminder-fired", payload.clone());
        if let Err(error) = app
            .notification()
            .builder()
            .title(reminder.title.clone())
            .body(notification_body(&reminder))
            .show()
        {
            eprintln!("qingmemo notification error: {error}");
        }
        core.store.lock().mark_after_fire(reminder.advance_after_fire(now))?;
    }

    if fired_count > 0 {
        return Ok(StdDuration::from_secs(1));
    }
    if due_count > 0 {
        return Ok(StdDuration::from_secs(30));
    }

    Ok(next_scheduler_wait(core)?)
}

fn ensure_notification_permission(app: &App) {
    let Ok(state) = app.notification().permission_state() else {
        return;
    };
    if matches!(state, PermissionState::Prompt | PermissionState::PromptWithRationale) {
        let _ = app.notification().request_permission();
    }
}

fn reminder_notification_payload(reminder: &Reminder) -> ReminderNotificationPayload {
    ReminderNotificationPayload {
        id: reminder.id,
        title: reminder.title.clone(),
        body: notification_body(reminder),
        priority: reminder.priority,
    }
}

fn read_file_browser_directory(path: &Path) -> anyhow::Result<FileBrowserDirectory> {
    let canonical = path.canonicalize()?;
    if !canonical.is_dir() {
        anyhow::bail!("不是文件夹：{}", canonical.display());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&canonical)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let is_dir = file_type.is_dir();
        if !is_dir && !file_type.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        entries.push(FileBrowserEntry {
            name,
            path: entry.path().to_string_lossy().replace('\\', "/"),
            is_dir,
        });
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));

    Ok(FileBrowserDirectory {
        current_path: canonical.to_string_lossy().replace('\\', "/"),
        parent_path: canonical.parent().map(|parent| parent.to_string_lossy().replace('\\', "/")),
        entries,
    })
}

fn next_scheduler_wait(core: &AppCore) -> anyhow::Result<StdDuration> {
    let Some(next_due) = core.store.lock().next_due()? else {
        return Ok(StdDuration::from_secs(30));
    };

    let delta = next_due.signed_duration_since(Utc::now());
    if delta.num_milliseconds() <= 0 {
        return Ok(StdDuration::from_secs(1));
    }

    Ok(delta.to_std()?.min(StdDuration::from_secs(30 * 60)))
}

fn notification_body(reminder: &Reminder) -> String {
    if reminder.notes.trim().is_empty() {
        "到时间啦，别忘了处理这条备忘。".to_string()
    } else {
        reminder.notes.clone()
    }
}

fn to_command_error(error: anyhow::Error) -> String {
    error.to_string()
}

fn to_display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use chrono::{Duration, Utc};

    use crate::{
        app::{notification_body, read_file_browser_directory, reminder_notification_payload},
        reminder::{Reminder, ReminderPriority},
    };

    #[test]
    fn reminder_notification_payload_uses_notes_as_body() {
        let due = Utc::now() - Duration::minutes(1);
        let mut reminder = Reminder::new_for_test(9, "发布版本", due, ReminderPriority::High);
        reminder.notes = "修完 bug 后发布".to_string();

        let payload = reminder_notification_payload(&reminder);

        assert_eq!(payload.id, 9);
        assert_eq!(payload.title, "发布版本");
        assert_eq!(payload.body, "修完 bug 后发布");
        assert_eq!(payload.priority, ReminderPriority::High);
    }

    #[test]
    fn notification_body_has_default_copy_for_blank_notes() {
        let reminder = Reminder::new_for_test(10, "喝水", Utc::now(), ReminderPriority::Normal);

        assert_eq!(notification_body(&reminder), "到时间啦，别忘了处理这条备忘。");
    }

    #[test]
    fn file_browser_lists_directories_before_files() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join("folder")).unwrap();
        fs::write(temp.path().join("note.txt"), "hello").unwrap();

        let listed = read_file_browser_directory(Path::new(temp.path())).unwrap();

        assert_eq!(listed.entries.len(), 2);
        assert!(listed.entries[0].is_dir);
        assert_eq!(listed.entries[0].name, "folder");
        assert_eq!(listed.entries[1].name, "note.txt");
    }
}
