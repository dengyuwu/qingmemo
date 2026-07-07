import type { BackendReminder } from '../../app-model';

export type ReminderGroupKey = 'overdue' | 'today' | 'upcoming';

export type ReminderGroup = {
  key: ReminderGroupKey;
  title: string;
  hint: string;
  reminders: BackendReminder[];
};

const groupCopy: Record<ReminderGroupKey, { title: string; hint: string }> = {
  overdue: { title: '过期', hint: '先处理这些，别装作没看见。' },
  today: { title: '今天', hint: '今天要盯住的时间点。' },
  upcoming: { title: '之后', hint: '未来安排，先放在后面。' },
};

export function buildReminderGroups(reminders: BackendReminder[], now = new Date()): ReminderGroup[] {
  const groups: Record<ReminderGroupKey, BackendReminder[]> = {
    overdue: [],
    today: [],
    upcoming: [],
  };

  for (const reminder of reminders) {
    if (reminder.completed || reminder.archived) continue;
    const due = new Date(reminder.next_due_at ?? reminder.due_at);
    if (due.getTime() < now.getTime()) groups.overdue.push(reminder);
    else if (isSameLocalDay(due, now)) groups.today.push(reminder);
    else groups.upcoming.push(reminder);
  }

  return (['overdue', 'today', 'upcoming'] as const)
    .map((key) => ({
      key,
      ...groupCopy[key],
      reminders: groups[key].sort(compareByDueTime),
    }))
    .filter((group) => group.reminders.length > 0);
}

function compareByDueTime(left: BackendReminder, right: BackendReminder): number {
  return dueTime(left) - dueTime(right);
}

function dueTime(reminder: BackendReminder): number {
  return new Date(reminder.next_due_at ?? reminder.due_at).getTime();
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
