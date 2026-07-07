use chrono::{Duration, Utc};
use qingmemo_win_lib::{
    reminder::{ReminderPriority, RepeatRule},
    store::{NoteAttachmentInput, NoteInput, ReminderInput, ReminderStore},
};

#[test]
fn store_rejects_blank_title() {
    let store = ReminderStore::in_memory().unwrap();
    let result = store.create(ReminderInput {
        title: "   ".to_string(),
        notes: "没有标题不应该保存".to_string(),
        due_at: Utc::now() + Duration::minutes(5),
        repeat_rule: RepeatRule::None,
        priority: ReminderPriority::Normal,
    });

    assert!(result.is_err());
}

#[test]
fn store_lists_created_reminder_by_due_time() {
    let store = ReminderStore::in_memory().unwrap();
    let later = Utc::now() + Duration::hours(2);
    let earlier = Utc::now() + Duration::minutes(30);

    store
        .create(ReminderInput {
            title: "稍后提醒".to_string(),
            notes: String::new(),
            due_at: later,
            repeat_rule: RepeatRule::None,
            priority: ReminderPriority::Normal,
        })
        .unwrap();
    let first = store
        .create(ReminderInput {
            title: "优先提醒".to_string(),
            notes: "搜索关键字".to_string(),
            due_at: earlier,
            repeat_rule: RepeatRule::None,
            priority: ReminderPriority::High,
        })
        .unwrap();

    let reminders = store.list_active(Some("关键字")).unwrap();

    assert_eq!(reminders.len(), 1);
    assert_eq!(reminders[0].id, first.id);
    assert_eq!(reminders[0].title, "优先提醒");
}


#[test]
fn notes_can_be_created_searched_pinned_and_archived() {
    let store = ReminderStore::in_memory().unwrap();

    let normal = store
        .create_note(NoteInput {
            title: "普通便签".to_string(),
            content: "买牛奶".to_string(),
            color: "blue".to_string(),
            pinned: false,
            attachments: Vec::new(),
        })
        .unwrap();
    let pinned = store
        .create_note(NoteInput {
            title: "灵感".to_string(),
            content: "游戏时也能后台提醒".to_string(),
            color: "amber".to_string(),
            pinned: true,
            attachments: Vec::new(),
        })
        .unwrap();

    let notes = store.list_notes(Some("提醒")).unwrap();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0].id, pinned.id);

    let notes = store.list_notes(None).unwrap();
    assert_eq!(notes[0].id, pinned.id);
    assert_eq!(notes[1].id, normal.id);

    store.archive_note(pinned.id).unwrap();
    let notes = store.list_notes(None).unwrap();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0].id, normal.id);
}


#[test]
fn note_layout_persists_position_size_rotation() {
    let store = ReminderStore::in_memory().unwrap();
    let note = store
        .create_note(NoteInput {
            title: "布局便签".to_string(),
            content: "拖拽后要记住位置".to_string(),
            color: "mint".to_string(),
            pinned: false,
            attachments: Vec::new(),
        })
        .unwrap();

    store
        .update_note_layouts(vec![qingmemo_win_lib::store::NoteLayoutPatch {
            id: note.id,
            x: 128.0,
            y: 96.0,
            width: 280.0,
            height: 220.0,
            rotation: -4.5,
        }])
        .unwrap();

    let saved = store.get_note(note.id).unwrap().unwrap();
    assert_eq!(saved.x, 128.0);
    assert_eq!(saved.y, 96.0);
    assert_eq!(saved.width, 280.0);
    assert_eq!(saved.height, 220.0);
    assert_eq!(saved.rotation, -4.5);
}

#[test]
fn store_lists_recent_reminders_after_one_shot_fire() {
    let store = ReminderStore::in_memory().unwrap();
    let due_at = Utc::now() - Duration::minutes(1);
    let reminder = store
        .create(ReminderInput {
            title: "到点提醒".to_string(),
            notes: "这条提醒刚刚触发".to_string(),
            due_at,
            repeat_rule: RepeatRule::None,
            priority: ReminderPriority::Normal,
        })
        .unwrap();

    store.mark_after_fire(reminder.advance_after_fire(Utc::now())).unwrap();

    assert!(store.list_active(None).unwrap().is_empty());
    let recent = store.list_recent(5).unwrap();
    assert_eq!(recent.len(), 1);
    assert_eq!(recent[0].title, "到点提醒");
    assert!(recent[0].completed);
    assert!(recent[0].fired_at.is_some());
}

#[test]
fn note_attachments_are_replaced_and_listed_with_notes() {
    let store = ReminderStore::in_memory().unwrap();
    let note = store
        .create_note(NoteInput {
            title: "桌面文件说明".to_string(),
            content: "这些文件和这个事项有关".to_string(),
            color: "mint".to_string(),
            pinned: false,
            attachments: Vec::new(),
        })
        .unwrap();

    store
        .replace_note_attachments(
            note.id,
            vec![
                NoteAttachmentInput {
                    path: "C:/Users/Administrator/Desktop/a.docx".to_string(),
                    description: String::new(),
                },
                NoteAttachmentInput {
                    path: "C:/Users/Administrator/Desktop/b.png".to_string(),
                    description: "设计截图".to_string(),
                },
            ],
        )
        .unwrap();

    let notes = store.list_notes(None).unwrap();
    let saved = notes.iter().find(|item| item.id == note.id).unwrap();

    assert_eq!(saved.attachments.len(), 2);
    assert_eq!(saved.attachments[0].name, "a.docx");
    assert_eq!(saved.attachments[1].path, "C:/Users/Administrator/Desktop/b.png");
    assert_eq!(saved.attachments[1].description, "设计截图");

    store
        .replace_note_attachments(
            note.id,
            vec![NoteAttachmentInput { path: "C:/Users/Administrator/Desktop/c.pdf".to_string(), description: String::new() }],
        )
        .unwrap();

    let saved = store.get_note(note.id).unwrap().unwrap();
    assert_eq!(saved.attachments.len(), 1);
    assert_eq!(saved.attachments[0].name, "c.pdf");
}
