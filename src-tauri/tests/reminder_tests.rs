use chrono::{Duration, TimeZone, Utc};
use qingmemo_win_lib::reminder::{ReminderPriority, RepeatRule, Reminder, SchedulerPolicy};

#[test]
fn daily_repeat_advances_until_future() {
    let due = Utc.with_ymd_and_hms(2026, 7, 5, 9, 30, 0).unwrap();
    let now = Utc.with_ymd_and_hms(2026, 7, 7, 10, 0, 0).unwrap();

    let next = RepeatRule::Daily.next_after(due, now).unwrap();

    assert_eq!(next, Utc.with_ymd_and_hms(2026, 7, 8, 9, 30, 0).unwrap());
}

#[test]
fn focus_mode_allows_only_high_priority_due_reminders() {
    let now = Utc.with_ymd_and_hms(2026, 7, 5, 12, 0, 0).unwrap();
    let low = Reminder::new_for_test(1, "喝水", now - Duration::minutes(1), ReminderPriority::Normal);
    let high = Reminder::new_for_test(2, "会议", now - Duration::minutes(1), ReminderPriority::High);
    let policy = SchedulerPolicy { focus_mode: true };

    let due = policy.filter_due(vec![low, high], now);

    assert_eq!(due.len(), 1);
    assert_eq!(due[0].id, 2);
}

#[test]
fn missed_reminders_are_detected_with_grace_window() {
    let now = Utc.with_ymd_and_hms(2026, 7, 5, 12, 0, 0).unwrap();
    let missed = Reminder::new_for_test(1, "报表", now - Duration::minutes(20), ReminderPriority::Normal);
    let future = Reminder::new_for_test(2, "散步", now + Duration::minutes(5), ReminderPriority::Normal);

    let result = SchedulerPolicy::default().missed_reminders(vec![missed, future], now, Duration::minutes(10));

    assert_eq!(result.len(), 1);
    assert_eq!(result[0].title, "报表");
}
