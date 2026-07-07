use chrono::{DateTime, Datelike, Duration, TimeZone, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReminderPriority {
    Normal,
    High,
}

impl Default for ReminderPriority {
    fn default() -> Self {
        Self::Normal
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum RepeatRule {
    None,
    Daily,
    Weekly,
    Monthly,
    IntervalMinutes(i64),
}

impl Default for RepeatRule {
    fn default() -> Self {
        Self::None
    }
}

impl RepeatRule {
    pub fn next_after(self, due_at: DateTime<Utc>, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
        match self {
            RepeatRule::None => None,
            RepeatRule::Daily => Some(next_by_duration(due_at, now, Duration::days(1))),
            RepeatRule::Weekly => Some(next_by_duration(due_at, now, Duration::weeks(1))),
            RepeatRule::Monthly => Some(next_monthly(due_at, now)),
            RepeatRule::IntervalMinutes(minutes) if minutes > 0 => {
                Some(next_by_duration(due_at, now, Duration::minutes(minutes)))
            }
            RepeatRule::IntervalMinutes(_) => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            RepeatRule::None => "不重复",
            RepeatRule::Daily => "每天",
            RepeatRule::Weekly => "每周",
            RepeatRule::Monthly => "每月",
            RepeatRule::IntervalMinutes(_) => "自定义间隔",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Reminder {
    pub id: i64,
    pub title: String,
    pub notes: String,
    pub due_at: DateTime<Utc>,
    pub next_due_at: Option<DateTime<Utc>>,
    pub repeat_rule: RepeatRule,
    pub priority: ReminderPriority,
    pub completed: bool,
    pub archived: bool,
    pub fired_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Reminder {    pub fn new_for_test(
        id: i64,
        title: impl Into<String>,
        due_at: DateTime<Utc>,
        priority: ReminderPriority,
    ) -> Self {
        Self {
            id,
            title: title.into(),
            notes: String::new(),
            due_at,
            next_due_at: Some(due_at),
            repeat_rule: RepeatRule::None,
            priority,
            completed: false,
            archived: false,
            fired_at: None,
            created_at: due_at,
            updated_at: due_at,
        }
    }

    pub fn is_due_at(&self, now: DateTime<Utc>) -> bool {
        !self.completed
            && !self.archived
            && self.next_due_at.is_some_and(|next_due_at| next_due_at <= now)
    }

    pub fn advance_after_fire(&self, now: DateTime<Utc>) -> ReminderUpdateAfterFire {
        let next_due_at = self.repeat_rule.next_after(self.due_at, now);
        ReminderUpdateAfterFire {
            id: self.id,
            fired_at: now,
            next_due_at,
            completed: next_due_at.is_none(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReminderUpdateAfterFire {
    pub id: i64,
    pub fired_at: DateTime<Utc>,
    pub next_due_at: Option<DateTime<Utc>>,
    pub completed: bool,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SchedulerPolicy {
    pub focus_mode: bool,
}

impl SchedulerPolicy {
    pub fn filter_due(&self, reminders: Vec<Reminder>, now: DateTime<Utc>) -> Vec<Reminder> {
        reminders
            .into_iter()
            .filter(|reminder| reminder.is_due_at(now))
            .filter(|reminder| !self.focus_mode || reminder.priority == ReminderPriority::High)
            .collect()
    }

    pub fn missed_reminders(
        &self,
        reminders: Vec<Reminder>,
        now: DateTime<Utc>,
        grace_window: Duration,
    ) -> Vec<Reminder> {
        reminders
            .into_iter()
            .filter(|reminder| {
                reminder.next_due_at.is_some_and(|next_due_at| {
                    next_due_at < now - grace_window && !reminder.completed && !reminder.archived
                })
            })
            .collect()
    }
}

fn next_by_duration(
    due_at: DateTime<Utc>,
    now: DateTime<Utc>,
    interval: Duration,
) -> DateTime<Utc> {
    let mut candidate = due_at;
    while candidate <= now {
        candidate += interval;
    }
    candidate
}

fn next_monthly(due_at: DateTime<Utc>, now: DateTime<Utc>) -> DateTime<Utc> {
    let mut candidate = due_at;
    while candidate <= now {
        candidate = add_one_month(candidate);
    }
    candidate
}

fn add_one_month(value: DateTime<Utc>) -> DateTime<Utc> {
    let (year, month) = if value.month() == 12 {
        (value.year() + 1, 1)
    } else {
        (value.year(), value.month() + 1)
    };
    let last_day = last_day_of_month(year, month);
    let day = value.day().min(last_day);
    Utc.with_ymd_and_hms(year, month, day, value.hour(), value.minute(), value.second())
        .unwrap()
}

fn last_day_of_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 { (year + 1, 1) } else { (year, month + 1) };
    let first_next = Utc.with_ymd_and_hms(next_year, next_month, 1, 0, 0, 0).unwrap();
    (first_next - Duration::days(1)).day()
}

use chrono::Timelike;

