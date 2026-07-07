import { describe, expect, it } from 'vitest';
import type { BackendReminder, ReminderDiagnostics } from '../../app-model';
import { describeReminderStatus } from './reminder-status';

const reminder: BackendReminder = {
  id: 1,
  title: '提交日报',
  notes: '补风险',
  due_at: '2026-07-06T10:00:00Z',
  next_due_at: '2026-07-06T10:00:00Z',
  repeat_rule: { kind: 'none' },
  priority: 'normal',
  completed: false,
  archived: false,
  fired_at: null,
  created_at: '2026-07-06T08:00:00Z',
  updated_at: '2026-07-06T08:00:00Z',
};

const diagnostics: ReminderDiagnostics = {
  notificationPermission: 'granted',
  schedulerPaused: false,
  focusMode: false,
  autostartEnabled: true,
  nextDueAt: '2026-07-06T10:00:00Z',
  databasePath: 'C:/data/qingmemo.sqlite3',
  checkedAt: '2026-07-06T09:00:00Z',
};

describe('describeReminderStatus', () => {
  it('explains paused reminders first', () => {
    expect(describeReminderStatus(reminder, { ...diagnostics, schedulerPaused: true }, new Date('2026-07-06T09:00:00Z'))).toMatchObject({
      kind: 'paused',
      tone: 'warning',
    });
  });

  it('explains normal reminders filtered by focus mode', () => {
    expect(describeReminderStatus(reminder, { ...diagnostics, focusMode: true }, new Date('2026-07-06T09:00:00Z'))).toMatchObject({
      kind: 'focus-filtered',
      tone: 'warning',
    });
  });

  it('explains notification permission issues', () => {
    expect(describeReminderStatus(reminder, { ...diagnostics, notificationPermission: 'denied' }, new Date('2026-07-06T09:00:00Z'))).toMatchObject({
      kind: 'permission-denied',
      tone: 'danger',
    });
  });

  it('marks overdue reminders', () => {
    expect(describeReminderStatus(reminder, diagnostics, new Date('2026-07-06T10:30:00Z'))).toMatchObject({
      kind: 'overdue',
      tone: 'danger',
    });
  });

  it('shows the next due time for healthy reminders', () => {
    expect(describeReminderStatus(reminder, diagnostics, new Date('2026-07-06T09:00:00Z'))).toMatchObject({
      kind: 'next-due',
      tone: 'calm',
      detail: expect.stringContaining('07/06'),
    });
  });
});