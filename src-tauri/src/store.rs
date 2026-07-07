use std::path::Path;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::reminder::{Reminder, ReminderPriority, RepeatRule, ReminderUpdateAfterFire};

pub struct ReminderStore {
    conn: Connection,
}

impl ReminderStore {
    pub fn open(path: impl AsRef<Path>) -> anyhow::Result<Self> {
        if let Some(parent) = path.as_ref().parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        let store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    pub fn in_memory() -> anyhow::Result<Self> {
        let store = Self { conn: Connection::open_in_memory()? };
        store.migrate()?;
        Ok(store)
    }

    fn migrate(&self) -> anyhow::Result<()> {
        self.conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                due_at TEXT NOT NULL,
                next_due_at TEXT,
                repeat_rule TEXT NOT NULL,
                priority TEXT NOT NULL DEFAULT 'normal',
                completed INTEGER NOT NULL DEFAULT 0,
                archived INTEGER NOT NULL DEFAULT 0,
                fired_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_reminders_next_due_at
                ON reminders(next_due_at)
                WHERE completed = 0 AND archived = 0;
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                color TEXT NOT NULL DEFAULT 'blue',
                pinned INTEGER NOT NULL DEFAULT 0,
                archived INTEGER NOT NULL DEFAULT 0,
                x REAL NOT NULL DEFAULT 72,
                y REAL NOT NULL DEFAULT 72,
                width REAL NOT NULL DEFAULT 260,
                height REAL NOT NULL DEFAULT 190,
                rotation REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_notes_active
                ON notes(pinned DESC, updated_at DESC)
                WHERE archived = 0;
            CREATE TABLE IF NOT EXISTS note_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_note_attachments_note_id
                ON note_attachments(note_id, id);
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reminder_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reminder_id INTEGER,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_reminder_events_created_at
                ON reminder_events(created_at DESC);
            "#,
        )?;
        self.ensure_note_layout_columns()?;
        self.ensure_note_attachment_columns()?;
        Ok(())
    }

    fn ensure_note_layout_columns(&self) -> anyhow::Result<()> {
        let mut stmt = self.conn.prepare("PRAGMA table_info(notes)")?;
        let columns = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        let has_column = |name: &str| columns.iter().any(|column| column == name);
        for (name, definition) in [
            ("x", "REAL NOT NULL DEFAULT 72"),
            ("y", "REAL NOT NULL DEFAULT 72"),
            ("width", "REAL NOT NULL DEFAULT 260"),
            ("height", "REAL NOT NULL DEFAULT 190"),
            ("rotation", "REAL NOT NULL DEFAULT 0"),
        ] {
            if !has_column(name) {
                self.conn.execute(&format!("ALTER TABLE notes ADD COLUMN {name} {definition}"), [])?;
            }
        }
        Ok(())
    }

    pub fn create(&self, input: ReminderInput) -> anyhow::Result<Reminder> {
        input.validate()?;
        let now = Utc::now();
        self.conn.execute(
            r#"INSERT INTO reminders
            (title, notes, due_at, next_due_at, repeat_rule, priority, completed, archived, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, ?7, ?7)"#,
            params![
                input.title.trim(),
                input.notes.trim(),
                input.due_at.to_rfc3339(),
                input.due_at.to_rfc3339(),
                serde_json::to_string(&input.repeat_rule)?,
                priority_to_str(input.priority),
                now.to_rfc3339(),
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        let reminder = self.get(id)?.ok_or_else(|| anyhow::anyhow!("reminder not found after insert"))?;
        self.record_reminder_event(Some(reminder.id), "created", &reminder.title, &reminder.notes)?;
        Ok(reminder)
    }

    pub fn update(&self, id: i64, input: ReminderInput) -> anyhow::Result<()> {
        input.validate()?;
        let changed = self.conn.execute(
            r#"UPDATE reminders
               SET title = ?1, notes = ?2, due_at = ?3, next_due_at = ?4,
                   repeat_rule = ?5, priority = ?6, updated_at = ?7
               WHERE id = ?8"#,
            params![
                input.title.trim(),
                input.notes.trim(),
                input.due_at.to_rfc3339(),
                input.due_at.to_rfc3339(),
                serde_json::to_string(&input.repeat_rule)?,
                priority_to_str(input.priority),
                Utc::now().to_rfc3339(),
                id,
            ],
        )?;
        ensure_changed(changed, id)?;
        Ok(())
    }

    pub fn list_active(&self, query: Option<&str>) -> anyhow::Result<Vec<Reminder>> {
        let mut reminders = self.query_active()?;
        if let Some(query) = query.map(str::trim).filter(|q| !q.is_empty()) {
            let q = query.to_lowercase();
            reminders.retain(|r| r.title.to_lowercase().contains(&q) || r.notes.to_lowercase().contains(&q));
        }
        reminders.sort_by(|a, b| a.next_due_at.cmp(&b.next_due_at).then_with(|| b.created_at.cmp(&a.created_at)));
        Ok(reminders)
    }

    pub fn list_recent(&self, limit: usize) -> anyhow::Result<Vec<Reminder>> {
        let safe_limit = limit.clamp(1, 50) as i64;
        let mut stmt = self.conn.prepare(
            r#"SELECT * FROM reminders
               WHERE archived = 0
               ORDER BY datetime(COALESCE(fired_at, next_due_at, due_at)) DESC, updated_at DESC
               LIMIT ?1"#,
        )?;
        let rows = stmt.query(params![safe_limit])?;
        rows_to_reminders(rows)
    }

    pub fn due_until(&self, now: DateTime<Utc>) -> anyhow::Result<Vec<Reminder>> {
        let mut stmt = self.conn.prepare(
            r#"SELECT * FROM reminders
               WHERE completed = 0 AND archived = 0 AND next_due_at IS NOT NULL AND next_due_at <= ?1
               ORDER BY next_due_at ASC"#,
        )?;
        let rows = stmt.query(params![now.to_rfc3339()])?;
        rows_to_reminders(rows)
    }

    pub fn next_due(&self) -> anyhow::Result<Option<DateTime<Utc>>> {
        let value: Option<String> = self.conn.query_row(
            r#"SELECT next_due_at FROM reminders
               WHERE completed = 0 AND archived = 0 AND next_due_at IS NOT NULL
               ORDER BY next_due_at ASC LIMIT 1"#,
            [],
            |row| row.get(0),
        ).optional()?;
        value.map(|v| parse_dt(&v)).transpose()
    }

    pub fn mark_after_fire(&self, update: ReminderUpdateAfterFire) -> anyhow::Result<()> {
        if let Some(reminder) = self.get(update.id)? {
            self.record_reminder_event(Some(reminder.id), "fired", &reminder.title, &reminder.notes)?;
        }
        self.conn.execute(
            r#"UPDATE reminders
               SET fired_at = ?1, next_due_at = ?2, completed = ?3, updated_at = ?4
               WHERE id = ?5"#,
            params![
                update.fired_at.to_rfc3339(),
                update.next_due_at.map(|dt| dt.to_rfc3339()),
                if update.completed { 1 } else { 0 },
                Utc::now().to_rfc3339(),
                update.id,
            ],
        )?;
        Ok(())
    }

    pub fn complete(&self, id: i64) -> anyhow::Result<()> {
        if let Some(reminder) = self.get(id)? {
            self.record_reminder_event(Some(reminder.id), "completed", &reminder.title, &reminder.notes)?;
        }
        let changed = self.conn.execute(
            "UPDATE reminders SET completed = 1, next_due_at = NULL, updated_at = ?1 WHERE id = ?2",
            params![Utc::now().to_rfc3339(), id],
        )?;
        ensure_changed(changed, id)?;
        Ok(())
    }

    pub fn archive(&self, id: i64) -> anyhow::Result<()> {
        if let Some(reminder) = self.get(id)? {
            self.record_reminder_event(Some(reminder.id), "archived", &reminder.title, &reminder.notes)?;
        }
        let changed = self.conn.execute(
            "UPDATE reminders SET archived = 1, next_due_at = NULL, updated_at = ?1 WHERE id = ?2",
            params![Utc::now().to_rfc3339(), id],
        )?;
        ensure_changed(changed, id)?;
        Ok(())
    }

    pub fn create_note(&self, input: NoteInput) -> anyhow::Result<Note> {
        let normalized = input.normalized()?;
        let now = Utc::now();
        self.conn.execute(
            r#"INSERT INTO notes (title, content, color, pinned, archived, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)"#,
            params![
                normalized.title,
                normalized.content,
                normalized.color,
                if normalized.pinned { 1 } else { 0 },
                now.to_rfc3339(),
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        if !normalized.attachments.is_empty() {
            self.replace_note_attachments(id, normalized.attachments)?;
        }
        self.get_note(id)?.ok_or_else(|| anyhow::anyhow!("note not found after insert"))
    }

    pub fn update_note(&self, id: i64, input: NoteInput) -> anyhow::Result<Note> {
        let normalized = input.normalized()?;
        let changed = self.conn.execute(
            r#"UPDATE notes
               SET title = ?1, content = ?2, color = ?3, pinned = ?4, updated_at = ?5
               WHERE id = ?6 AND archived = 0"#,
            params![
                normalized.title,
                normalized.content,
                normalized.color,
                if normalized.pinned { 1 } else { 0 },
                Utc::now().to_rfc3339(),
                id,
            ],
        )?;
        ensure_changed(changed, id)?;
        self.replace_note_attachments(id, normalized.attachments)?;
        self.get_note(id)?.ok_or_else(|| anyhow::anyhow!("未找到便签：{}", id))
    }

    pub fn toggle_note_pin(&self, id: i64, pinned: bool) -> anyhow::Result<Note> {
        let changed = self.conn.execute(
            "UPDATE notes SET pinned = ?1, updated_at = ?2 WHERE id = ?3 AND archived = 0",
            params![if pinned { 1 } else { 0 }, Utc::now().to_rfc3339(), id],
        )?;
        ensure_changed(changed, id)?;
        self.get_note(id)?.ok_or_else(|| anyhow::anyhow!("未找到便签：{}", id))
    }

    pub fn archive_note(&self, id: i64) -> anyhow::Result<()> {
        let changed = self.conn.execute(
            "UPDATE notes SET archived = 1, updated_at = ?1 WHERE id = ?2",
            params![Utc::now().to_rfc3339(), id],
        )?;
        ensure_changed(changed, id)?;
        Ok(())
    }

    pub fn restore_note(&self, id: i64) -> anyhow::Result<Note> {
        let changed = self.conn.execute(
            "UPDATE notes SET archived = 0, updated_at = ?1 WHERE id = ?2",
            params![Utc::now().to_rfc3339(), id],
        )?;
        ensure_changed(changed, id)?;
        self.get_note(id)?.ok_or_else(|| anyhow::anyhow!("未找到便签：{}", id))
    }

    pub fn update_note_layouts(&self, layouts: Vec<NoteLayoutPatch>) -> anyhow::Result<()> {
        for layout in layouts {
            let changed = self.conn.execute(
                r#"UPDATE notes
                   SET x = ?1, y = ?2, width = ?3, height = ?4, rotation = ?5, updated_at = ?6
                   WHERE id = ?7 AND archived = 0"#,
                params![
                    layout.x,
                    layout.y,
                    layout.width.max(180.0),
                    layout.height.max(140.0),
                    layout.rotation.clamp(-8.0, 8.0),
                    Utc::now().to_rfc3339(),
                    layout.id,
                ],
            )?;
            ensure_changed(changed, layout.id)?;
        }
        Ok(())
    }

    pub fn list_notes(&self, query: Option<&str>) -> anyhow::Result<Vec<Note>> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM notes WHERE archived = 0 ORDER BY pinned DESC, updated_at DESC",
        )?;
        let rows = stmt.query([])?;
        let mut notes = rows_to_notes(rows)?;
        self.hydrate_note_attachments(&mut notes)?;
        if let Some(query) = query.map(str::trim).filter(|q| !q.is_empty()) {
            let q = query.to_lowercase();
            notes.retain(|n| n.title.to_lowercase().contains(&q) || n.content.to_lowercase().contains(&q));
        }
        notes.sort_by(|a, b| b.pinned.cmp(&a.pinned).then_with(|| b.updated_at.cmp(&a.updated_at)));
        Ok(notes)
    }

    pub fn list_reminder_events(&self, limit: usize) -> anyhow::Result<Vec<ReminderEvent>> {
        let safe_limit = limit.clamp(1, 100) as i64;
        let mut stmt = self.conn.prepare(
            "SELECT id, reminder_id, kind, title, body, created_at FROM reminder_events ORDER BY datetime(created_at) DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![safe_limit], |row| {
            Ok(ReminderEvent {
                id: row.get("id")?,
                reminder_id: row.get("reminder_id")?,
                kind: row.get("kind")?,
                title: row.get("title")?,
                body: row.get("body")?,
                created_at: parse_dt(&row.get::<_, String>("created_at")?)
                    .map_err(|error| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, error.into()))?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn record_reminder_event(
        &self,
        reminder_id: Option<i64>,
        kind: &str,
        title: &str,
        body: &str,
    ) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT INTO reminder_events(reminder_id, kind, title, body, created_at) VALUES(?1, ?2, ?3, ?4, ?5)",
            params![reminder_id, kind, title.trim(), body.trim(), Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn get_focus_mode(&self) -> anyhow::Result<bool> {
        let value: Option<String> = self.conn.query_row(
            "SELECT value FROM app_settings WHERE key = 'focus_mode'",
            [],
            |row| row.get(0),
        ).optional()?;
        Ok(value.as_deref() == Some("true"))
    }

    pub fn set_focus_mode(&self, enabled: bool) -> anyhow::Result<()> {
        self.conn.execute(
            "INSERT INTO app_settings(key, value) VALUES('focus_mode', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![if enabled { "true" } else { "false" }],
        )?;
        Ok(())
    }

    pub fn get(&self, id: i64) -> anyhow::Result<Option<Reminder>> {
        let mut stmt = self.conn.prepare("SELECT * FROM reminders WHERE id = ?1")?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row_to_reminder(row)?))
        } else {
            Ok(None)
        }
    }

    pub fn get_note(&self, id: i64) -> anyhow::Result<Option<Note>> {
        let mut stmt = self.conn.prepare("SELECT * FROM notes WHERE id = ?1")?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let mut note = row_to_note(row)?;
            note.attachments = self.list_note_attachments(id)?;
            Ok(Some(note))
        } else {
            Ok(None)
        }
    }

    pub fn replace_note_attachments(&self, note_id: i64, attachments: Vec<NoteAttachmentInput>) -> anyhow::Result<()> {
        if self.get_note(note_id)?.is_none() {
            anyhow::bail!("未找到便签：{}", note_id);
        }

        self.conn.execute("DELETE FROM note_attachments WHERE note_id = ?1", params![note_id])?;
        let now = Utc::now().to_rfc3339();
        for attachment in normalize_attachments(attachments) {
            self.conn.execute(
                "INSERT INTO note_attachments(note_id, path, name, description, created_at) VALUES(?1, ?2, ?3, ?4, ?5)",
                params![note_id, attachment.path, attachment.name, attachment.description, now],
            )?;
        }
        Ok(())
    }

    pub fn restore_reminder(&self, id: i64) -> anyhow::Result<Reminder> {
        let reminder = self.get(id)?.ok_or_else(|| anyhow::anyhow!("未找到提醒：{}", id))?;
        let next_due_at = reminder.next_due_at.unwrap_or(reminder.due_at).to_rfc3339();
        let changed = self.conn.execute(
            "UPDATE reminders SET completed = 0, archived = 0, next_due_at = ?1, updated_at = ?2 WHERE id = ?3",
            params![next_due_at, Utc::now().to_rfc3339(), id],
        )?;
        ensure_changed(changed, id)?;
        let restored = self.get(id)?.ok_or_else(|| anyhow::anyhow!("未找到提醒：{}", id))?;
        self.record_reminder_event(Some(restored.id), "restored", &restored.title, &restored.notes)?;
        Ok(restored)
    }

    fn ensure_note_attachment_columns(&self) -> anyhow::Result<()> {
        let mut stmt = self.conn.prepare("PRAGMA table_info(note_attachments)")?;
        let columns = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        if !columns.iter().any(|column| column == "description") {
            self.conn
                .execute("ALTER TABLE note_attachments ADD COLUMN description TEXT NOT NULL DEFAULT ''", [])?;
        }
        Ok(())
    }

    fn hydrate_note_attachments(&self, notes: &mut [Note]) -> anyhow::Result<()> {
        for note in notes {
            note.attachments = self.list_note_attachments(note.id)?;
        }
        Ok(())
    }

    fn list_note_attachments(&self, note_id: i64) -> anyhow::Result<Vec<NoteAttachment>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, path, name, description, created_at FROM note_attachments WHERE note_id = ?1 ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![note_id], |row| {
            Ok(NoteAttachment {
                id: row.get("id")?,
                path: row.get("path")?,
                name: row.get("name")?,
                description: row.get("description")?,
                created_at: parse_dt(&row.get::<_, String>("created_at")?)
                    .map_err(|error| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, error.into()))?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    fn query_active(&self) -> anyhow::Result<Vec<Reminder>> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM reminders WHERE archived = 0 AND completed = 0 ORDER BY next_due_at ASC",
        )?;
        let rows = stmt.query([])?;
        rows_to_reminders(rows)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReminderInput {
    pub title: String,
    #[serde(default)]
    pub notes: String,
    pub due_at: DateTime<Utc>,
    #[serde(default)]
    pub repeat_rule: RepeatRule,
    #[serde(default)]
    pub priority: ReminderPriority,
}

impl ReminderInput {
    fn validate(&self) -> anyhow::Result<()> {
        if self.title.trim().is_empty() {
            anyhow::bail!("标题不能为空");
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub color: String,
    pub pinned: bool,
    pub archived: bool,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub attachments: Vec<NoteAttachment>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NoteAttachment {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub description: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteAttachmentInput {
    pub path: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReminderEvent {
    pub id: i64,
    pub reminder_id: Option<i64>,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteLayoutPatch {
    pub id: i64,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NoteInput {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default = "default_note_color")]
    pub color: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub attachments: Vec<NoteAttachmentInput>,
}

impl NoteInput {
    fn normalized(self) -> anyhow::Result<Self> {
        let title = self.title.trim().to_string();
        let content = self.content.trim().to_string();
        if title.is_empty() && content.is_empty() {
            anyhow::bail!("便签标题和内容不能同时为空");
        }
        Ok(Self {
            title: if title.is_empty() { content.chars().take(18).collect() } else { title },
            content,
            color: normalize_note_color(&self.color),
            pinned: self.pinned,
            attachments: normalize_attachments(self.attachments)
                .into_iter()
                .map(|attachment| NoteAttachmentInput {
                    path: attachment.path,
                    description: attachment.description,
                })
                .collect(),
        })
    }
}

fn rows_to_reminders(mut rows: rusqlite::Rows<'_>) -> anyhow::Result<Vec<Reminder>> {
    let mut reminders = Vec::new();
    while let Some(row) = rows.next()? {
        reminders.push(row_to_reminder(row)?);
    }
    Ok(reminders)
}

fn rows_to_notes(mut rows: rusqlite::Rows<'_>) -> anyhow::Result<Vec<Note>> {
    let mut notes = Vec::new();
    while let Some(row) = rows.next()? {
        notes.push(row_to_note(row)?);
    }
    Ok(notes)
}

fn row_to_reminder(row: &rusqlite::Row<'_>) -> anyhow::Result<Reminder> {
    let repeat_json: String = row.get("repeat_rule")?;
    let priority: String = row.get("priority")?;
    Ok(Reminder {
        id: row.get("id")?,
        title: row.get("title")?,
        notes: row.get("notes")?,
        due_at: parse_dt(&row.get::<_, String>("due_at")?)?,
        next_due_at: parse_opt_dt(row.get("next_due_at")?)?,
        repeat_rule: serde_json::from_str(&repeat_json)?,
        priority: str_to_priority(&priority),
        completed: row.get::<_, i64>("completed")? == 1,
        archived: row.get::<_, i64>("archived")? == 1,
        fired_at: parse_opt_dt(row.get("fired_at")?)?,
        created_at: parse_dt(&row.get::<_, String>("created_at")?)?,
        updated_at: parse_dt(&row.get::<_, String>("updated_at")?)?,
    })
}

fn row_to_note(row: &rusqlite::Row<'_>) -> anyhow::Result<Note> {
    Ok(Note {
        id: row.get("id")?,
        title: row.get("title")?,
        content: row.get("content")?,
        color: row.get("color")?,
        pinned: row.get::<_, i64>("pinned")? == 1,
        archived: row.get::<_, i64>("archived")? == 1,
        x: row.get("x")?,
        y: row.get("y")?,
        width: row.get("width")?,
        height: row.get("height")?,
        rotation: row.get("rotation")?,
        attachments: Vec::new(),
        created_at: parse_dt(&row.get::<_, String>("created_at")?)?,
        updated_at: parse_dt(&row.get::<_, String>("updated_at")?)?,
    })
}

struct NormalizedAttachment {
    path: String,
    name: String,
    description: String,
}

fn normalize_attachments(attachments: Vec<NoteAttachmentInput>) -> Vec<NormalizedAttachment> {
    let mut normalized = Vec::new();
    for attachment in attachments {
        let path = attachment.path.trim().replace('\\', "/");
        if path.is_empty() || normalized.iter().any(|item: &NormalizedAttachment| item.path == path) {
            continue;
        }
        let name = Path::new(&path)
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.trim().is_empty())
            .unwrap_or(&path)
            .to_string();
        normalized.push(NormalizedAttachment {
            path,
            name,
            description: attachment.description.trim().chars().take(80).collect(),
        });
    }
    normalized
}

fn parse_dt(value: &str) -> anyhow::Result<DateTime<Utc>> {
    Ok(DateTime::parse_from_rfc3339(value)?.with_timezone(&Utc))
}

fn parse_opt_dt(value: Option<String>) -> anyhow::Result<Option<DateTime<Utc>>> {
    value.map(|v| parse_dt(&v)).transpose()
}

fn priority_to_str(priority: ReminderPriority) -> &'static str {
    match priority {
        ReminderPriority::Normal => "normal",
        ReminderPriority::High => "high",
    }
}

fn str_to_priority(value: &str) -> ReminderPriority {
    match value {
        "high" => ReminderPriority::High,
        _ => ReminderPriority::Normal,
    }
}

fn default_note_color() -> String {
    "blue".to_string()
}

fn normalize_note_color(value: &str) -> String {
    match value {
        "amber" | "mint" | "rose" | "violet" | "slate" => value.to_string(),
        _ => "blue".to_string(),
    }
}

fn ensure_changed(changed: usize, id: i64) -> anyhow::Result<()> {
    if changed == 0 {
        anyhow::bail!("未找到记录：{}", id);
    }
    Ok(())
}


