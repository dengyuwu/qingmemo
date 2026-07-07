import { describe, expect, it } from 'vitest';
import type { BackendReminder } from '../../app-model';
import { buildReminderGroups } from './reminder-groups';

function reminder(overrides: Partial<BackendReminder>): BackendReminder {
  return {
    id: overrides.id ?? 1,
    title: overrides.title ?? '提醒',
    notes: overrides.notes ?? '',
    due_at: overrides.due_at ?? '2026-07-06T10:00:00.000Z',
    next_due_at: overrides.next_due_at ?? null,
    repeat_rule: overrides.repeat_rule ?? { kind: 'none' },
    priority: overrides.priority ?? 'normal',
    completed: overrides.completed ?? false,
    archived: overrides.archived ?? false,
    fired_at: overrides.fired_at ?? null,
    created_at: overrides.created_at ?? '2026-07-06T08:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-07-06T08:00:00.000Z',
  };
}

describe('buildReminderGroups', () => {
  it('按过期、今日、未来分组，并过滤已完成和已归档提醒', () => {
    const groups = buildReminderGroups(
      [
        reminder({ id: 1, title: '未来', due_at: '2026-07-08T09:00:00.000Z' }),
        reminder({ id: 2, title: '过期', due_at: '2026-07-06T07:00:00.000Z' }),
        reminder({ id: 3, title: '今日', due_at: '2026-07-06T12:00:00.000Z' }),
        reminder({ id: 4, title: '完成', due_at: '2026-07-06T12:00:00.000Z', completed: true }),
        reminder({ id: 5, title: '归档', due_at: '2026-07-06T12:00:00.000Z', archived: true }),
      ],
      new Date('2026-07-06T09:00:00.000Z'),
    );

    expect(groups.map((group) => group.key)).toEqual(['overdue', 'today', 'upcoming']);
    expect(groups.map((group) => group.reminders.map((item) => item.title))).toEqual([['过期'], ['今日'], ['未来']]);
  });
});
