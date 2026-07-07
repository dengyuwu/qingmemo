import type { BackendReminder, ReminderDiagnostics } from '../../app-model';

export type ReminderStatusKind =
  | 'paused'
  | 'focus-filtered'
  | 'permission-denied'
  | 'permission-unknown'
  | 'overdue'
  | 'next-due';

export type ReminderStatus = {
  kind: ReminderStatusKind;
  tone: 'calm' | 'warning' | 'danger';
  label: string;
  detail: string;
};

export function describeReminderStatus(
  reminder: BackendReminder,
  diagnostics: ReminderDiagnostics | null,
  now = new Date(),
): ReminderStatus {
  const due = new Date(reminder.next_due_at ?? reminder.due_at);
  const dueLabel = formatStatusTime(due);

  if (diagnostics?.schedulerPaused) {
    return {
      kind: 'paused',
      tone: 'warning',
      label: '提醒已暂停',
      detail: '调度暂停中，这条提醒不会弹出。',
    };
  }

  if (diagnostics?.focusMode && reminder.priority !== 'high') {
    return {
      kind: 'focus-filtered',
      tone: 'warning',
      label: '专注模式安静',
      detail: '普通提醒会先安静，高优先级仍会弹出。',
    };
  }

  const permissionLabel = diagnostics?.notificationPermission ?? '未知';
  const permission = permissionLabel.toLowerCase();
  if (permission === 'denied') {
    return {
      kind: 'permission-denied',
      tone: 'danger',
      label: '通知被拒绝',
      detail: '系统通知权限被拒绝，请检查 Windows 通知设置。',
    };
  }

  if (diagnostics && permission && permission !== 'granted') {
    return {
      kind: 'permission-unknown',
      tone: 'warning',
      label: '通知待确认',
      detail: `当前通知权限：${diagnostics.notificationPermission}。`,
    };
  }

  if (Number.isFinite(due.getTime()) && due.getTime() < now.getTime() && !reminder.completed) {
    return {
      kind: 'overdue',
      tone: 'danger',
      label: '已经过期',
      detail: `${dueLabel} 应处理，本小姐建议现在清掉。`,
    };
  }

  return {
    kind: 'next-due',
    tone: 'calm',
    label: '等待提醒',
    detail: `${dueLabel} 触发。`,
  };
}

function formatStatusTime(value: Date): string {
  if (!Number.isFinite(value.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}


