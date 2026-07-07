import { MIN_NOTE_WIDTH, clampRotation, normalizeNoteHeight } from './features/sticky-wall/layout';
import type { NoteColor, NotePriority, StickyNote } from './features/sticky-wall/types';
import {
  describeAttachment,
  inferNoteCategory,
  inferReminderDateTimeLocal,
  type NoteCategory,
} from './note-intelligence';

export { describeAttachment, inferNoteCategory, inferReminderDateTimeLocal };

export type BackendNote = {
  id: number;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  archived: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  attachments: NoteAttachment[];
  created_at: string;
  updated_at: string;
};

export type NoteAttachment = {
  id?: number;
  path: string;
  name: string;
  description?: string;
  created_at?: string;
};

export type NoteInputDraft = {
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  attachments: NoteAttachment[];
};

export type NoteInputPayload = {
  title: string;
  content: string;
  color: NoteColor;
  pinned: boolean;
  attachments: Array<{ path: string; description: string }>;
};

export type ReminderPriority = 'normal' | 'high';

export type RepeatRulePayload =
  | { kind: 'none' }
  | { kind: 'daily' }
  | { kind: 'weekly' }
  | { kind: 'monthly' }
  | { kind: 'interval_minutes'; value: number };

export type BackendReminder = {
  id: number;
  title: string;
  notes: string;
  due_at: string;
  next_due_at: string | null;
  repeat_rule: RepeatRulePayload;
  priority: ReminderPriority;
  completed: boolean;
  archived: boolean;
  fired_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReminderEvent = {
  id: number;
  reminder_id?: number | null;
  kind: 'created' | 'fired' | 'completed' | 'archived' | 'restored' | 'test' | string;
  title: string;
  body: string;
  created_at: string;
};

export type ReminderDiagnostics = {
  notificationPermission: string;
  schedulerPaused: boolean;
  focusMode: boolean;
  autostartEnabled: boolean | null;
  nextDueAt: string | null;
  databasePath: string;
  checkedAt: string;
};

export type BackupResult = {
  path: string;
  notes: number;
  reminders: number;
};

export type WallCleanupSuggestion = {
  kind: 'duplicate' | 'stale' | 'done';
  noteIds: number[];
  title: string;
  description: string;
};

export type RiskRadarItem = {
  kind: 'overdue-reminder' | 'waiting-note' | 'missing-next-step' | 'high-priority';
  itemIds: number[];
  title: string;
  description: string;
};

export type DailyChallengeItem =
  | { kind: 'reminder'; id: number; title: string; reason: string }
  | { kind: 'note'; id: number; title: string; reason: string }
  | { kind: 'fallback'; id: 'default-focus'; title: string; reason: string };

export type DailyChallenge = {
  title: string;
  subtitle: string;
  items: DailyChallengeItem[];
  highlightedNoteIds: number[];
};

export type DailyQueueItem = DailyChallengeItem & {
  route: 'note-challenge' | 'reminders' | 'fallback';
  actionLabel: string;
};

export type DailyQueue = {
  title: string;
  subtitle: string;
  primaryActionLabel: string;
  items: DailyQueueItem[];
  highlightedNoteIds: number[];
};

export type DailyQueueItemStatus = 'open' | 'done' | 'skipped';
export type DailyQueueStatusMap = Record<string, DailyQueueItemStatus>;
export type DailyQueueNoteStatusMap = Record<number, Exclude<DailyQueueItemStatus, 'open'>>;

export type DailyQueueProgress = {
  total: number;
  done: number;
  skipped: number;
  open: number;
  label: string;
};
export type DailyReview = {
  completedReminders: number;
  overdueReminders: number;
  waitingNotes: number;
  highPriorityItems: number;
  cleanupSuggestions: WallCleanupSuggestion[];
  summaryLines: string[];
};

export type ReminderInputDraft = {
  title: string;
  notes: string;
  dueAtLocal: string;
  repeatRule: RepeatRulePayload;
  priority: ReminderPriority;
};

export type ReminderInputPayload = {
  title: string;
  notes: string;
  due_at: string;
  repeat_rule: RepeatRulePayload;
  priority: ReminderPriority;
};

export type DashboardFilter = 'reminders' | 'highPriority' | 'notes';

export type DashboardStats = {
  reminders: number;
  highPriority: number;
  notes: number;
  overdueReminders: number;
  waitingNotes: number;
  missingNextStepNotes: number;
  completedToday: number;
  delayDebt: number;
  focusScore: number;
  conversionRate: number;
  cleanliness: number;
  headline: string;
};

export type ReminderVisualTone = {
  label: string;
  emphasis: 'calm' | 'critical';
  accentClass: string;
  badgeClass: string;
  cardClass: string;
};

export type RecommendedNoteMetadata = {
  color: NoteColor;
  priority: NotePriority;
  tags: string[];
  category: NoteCategory;
};

const NOTE_COLORS = ['butter', 'sky', 'mint', 'peach', 'lavender', 'graphite', 'blue', 'amber', 'rose', 'violet', 'slate'] as const;
const AUTO_NOTE_COLORS: NoteColor[] = ['butter', 'sky', 'mint', 'peach', 'lavender', 'graphite'];
const TAG_PATTERN = /#([\p{L}\p{N}_-]+)/gu;

export function toStickyNote(note: BackendNote): StickyNote {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    color: normalizeColor(note.color),
    tags: extractTags(note.content),
    priority: inferPriority(note.content),
    x: note.x,
    y: note.y,
    width: Math.max(MIN_NOTE_WIDTH, note.width),
    height: normalizeNoteHeight(note.height),
    rotation: clampRotation(note.rotation),
    attachments: note.attachments ?? [],
    pinned: note.pinned,
    archived: note.archived,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  };
}

export function buildNoteInput(draft: NoteInputDraft): NoteInputPayload {
  return {
    title: draft.title.trim(),
    content: draft.content.trim(),
    color: draft.color === 'auto' ? chooseAutoNoteColor(draft.title, draft.content) : normalizeColor(draft.color),
    pinned: draft.pinned,
    attachments: draft.attachments.map((attachment) => ({
      path: attachment.path,
      description: attachment.description ?? describeAttachment(attachment.path, draft.content),
    })),
  };
}

export function buildAttachmentFromPath(path: string, context = ''): NoteAttachment {
  const normalized = path.trim().replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const name = parts.length > 0 ? parts[parts.length - 1] : normalized;
  return {
    path: normalized,
    name,
    description: describeAttachment(normalized, context),
  };
}

export function chooseAutoNoteColor(title: string, content: string, seed = 0): NoteColor {
  const source = `${title.trim()}\n${content.trim()}\n${seed}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return AUTO_NOTE_COLORS[Math.abs(hash) % AUTO_NOTE_COLORS.length];
}

export function replaceNote(notes: StickyNote[], updated: StickyNote): StickyNote[] {
  return notes.map((note) => (note.id === updated.id ? updated : note));
}

export function filterNotes(notes: StickyNote[], filter: DashboardFilter): StickyNote[] {
  void filter;
  return notes;
}

export function filterFocusWallNotes(
  notes: StickyNote[],
  selectedIds: Set<number>,
  focusMode: boolean,
  activeFilter: DashboardFilter,
): StickyNote[] {
  if (!focusMode || activeFilter !== 'notes' || selectedIds.size === 0) return notes;

  const selectedNotes = notes.filter((note) => selectedIds.has(note.id));
  if (selectedNotes.length === 0) return notes;

  const focusTags = new Set(selectedNotes.flatMap((note) => note.tags));
  if (focusTags.size === 0) return notes;

  return notes.filter((note) => selectedIds.has(note.id) || note.tags.some((tag) => focusTags.has(tag)));
}


export function buildWallCleanupSuggestions(notes: StickyNote[], now = new Date()): WallCleanupSuggestion[] {
  const suggestions: WallCleanupSuggestion[] = [];
  const activeNotes = notes.filter((note) => !note.archived);
  const groups = new Map<string, StickyNote[]>();

  for (const note of activeNotes) {
    const key = `${note.title}\n${note.content}`.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), note]);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    suggestions.push({
      kind: 'duplicate',
      noteIds: group.map((note) => note.id),
      title: `发现 ${group.length} 张重复便签`,
      description: `「${group[0].title || '未命名便签'}」内容高度一致，可以合并或收起一张，桌面会清爽很多。`,
    });
  }

  const staleNotes = activeNotes.filter((note) => {
    if (note.priority === 'high' || note.pinned) return false;
    const updated = new Date(note.updatedAt).getTime();
    if (!Number.isFinite(updated)) return false;
    return now.getTime() - updated > 21 * 24 * 60 * 60 * 1000;
  });
  if (staleNotes.length > 0) {
    suggestions.push({
      kind: 'stale',
      noteIds: staleNotes.slice(0, 6).map((note) => note.id),
      title: `有 ${staleNotes.length} 张便签很久没动`,
      description: '超过 21 天未更新、未置顶且非高优先级。本小姐建议检查后归档，别让旧纸片占地盘。',
    });
  }

  const doneNotes = activeNotes.filter((note) => /完成|已做|done|搞定|已处理/i.test(`${note.title}\n${note.content}`));
  if (doneNotes.length > 0) {
    suggestions.push({
      kind: 'done',
      noteIds: doneNotes.slice(0, 6).map((note) => note.id),
      title: `有 ${doneNotes.length} 张像是已完成`,
      description: '这些便签出现了完成语义，可以转入归档或总结。完成了还赖在墙上，会显得你很拖沓哦。',
    });
  }

  return suggestions.slice(0, 6);
}


const NEXT_STEP_PATTERN = /等待|反馈|确认|审批|回复|下一步|负责人|截止|时间|提醒|todo|待办|今天|明天|处理|修复|发布|完成|跟进|安排|检查|提交|联系|同步|review/i;

export function findNotesMissingNextStep(notes: StickyNote[]): StickyNote[] {
  return notes.filter((note) => {
    if (note.archived) return false;
    const source = `${note.title}\n${note.content}`;
    return !NEXT_STEP_PATTERN.test(source);
  });
}

export function buildDailyChallenge(notes: StickyNote[], reminders: BackendReminder[], now = new Date()): DailyChallenge {
  const activeNotes = notes.filter((note) => !note.archived);
  const activeReminders = reminders.filter((reminder) => !reminder.archived && !reminder.completed);
  const nowMs = now.getTime();
  const items: DailyChallengeItem[] = [];
  const usedNoteIds = new Set<number>();

  const pushUniqueNote = (note: StickyNote, reason: string) => {
    if (usedNoteIds.has(note.id)) return;
    usedNoteIds.add(note.id);
    items.push({ kind: 'note', id: note.id, title: note.title || '未命名便签', reason });
  };

  activeReminders
    .filter((reminder) => {
      const due = new Date(reminder.next_due_at ?? reminder.due_at).getTime();
      return Number.isFinite(due) && due < nowMs;
    })
    .slice(0, 2)
    .forEach((reminder) => {
      items.push({ kind: 'reminder', id: reminder.id, title: reminder.title, reason: '过期提醒，先止损。' });
    });

  activeNotes
    .filter((note) => note.priority === 'high')
    .slice(0, 2)
    .forEach((note) => pushUniqueNote(note, '高优先级便签，今天别装没看见。'));

  activeNotes
    .filter((note) => inferNoteCategory(`${note.title}\n${note.content}`) === 'today')
    .slice(0, 2)
    .forEach((note) => pushUniqueNote(note, '今日行动项，适合推进一步。'));

  findNotesMissingNextStep(activeNotes)
    .slice(0, 1)
    .forEach((note) => pushUniqueNote(note, '缺少下一步，补清楚就会轻松很多。'));

  const selected = items.slice(0, 3);
  if (selected.length === 0) {
    selected.push({
      kind: 'fallback',
      id: 'default-focus',
      title: '选一张最有价值的便签推进到底',
      reason: '今天没有明显风险，本小姐允许你优雅地挑重点。',
    });
  }

  return {
    title: '今日挑战',
    subtitle: selected.some((item) => item.kind !== 'fallback') ? '本小姐替你挑了最该推进的事。' : '墙面清爽，挑一件真正有价值的事。',
    items: selected,
    highlightedNoteIds: selected.flatMap((item) => (item.kind === 'note' ? [item.id] : [])),
  };
}

export function buildDailyQueue(notes: StickyNote[], reminders: BackendReminder[], now = new Date()): DailyQueue {
  const challenge = buildDailyChallenge(notes, reminders, now);
  return {
    title: '今日队列',
    subtitle: challenge.subtitle,
    primaryActionLabel: '继续推进',
    highlightedNoteIds: challenge.highlightedNoteIds,
    items: challenge.items.map((item) => {
      if (item.kind === 'note') return { ...item, route: 'note-challenge', actionLabel: 'AI 下一步' };
      if (item.kind === 'reminder') return { ...item, route: 'reminders', actionLabel: '打开提醒' };
      return { ...item, route: 'fallback', actionLabel: '写一张便签' };
    }),
  };
}

export function dailyQueueItemKey(item: DailyQueueItem): string {
  return `${item.kind}:${item.id}`;
}

export function getDailyQueueItemStatus(item: DailyQueueItem, statuses: DailyQueueStatusMap): DailyQueueItemStatus {
  return statuses[dailyQueueItemKey(item)] ?? 'open';
}

export function summarizeDailyQueueProgress(queue: DailyQueue, statuses: DailyQueueStatusMap): DailyQueueProgress {
  const total = queue.items.length;
  const done = queue.items.filter((item) => getDailyQueueItemStatus(item, statuses) === 'done').length;
  const skipped = queue.items.filter((item) => getDailyQueueItemStatus(item, statuses) === 'skipped').length;
  const open = Math.max(0, total - done - skipped);
  const label = skipped > 0 ? `已完成 ${done}/${total} · 跳过 ${skipped}` : `已完成 ${done}/${total}`;

  return { total, done, skipped, open, label };
}

export function buildDailyQueueNoteStatusMap(queue: DailyQueue, statuses: DailyQueueStatusMap): DailyQueueNoteStatusMap {
  return queue.items.reduce<DailyQueueNoteStatusMap>((result, item) => {
    if (item.kind !== 'note') return result;
    const status = getDailyQueueItemStatus(item, statuses);
    if (status !== 'open') result[item.id] = status;
    return result;
  }, {});
}

export function buildAiNextStepPrompt(notes: StickyNote[], scope: 'selected' | 'workspace' = 'selected'): string {
  const activeNotes = notes.filter((note) => !note.archived).slice(0, 8);
  if (activeNotes.length === 0) {
    return '当前没有选中便签。请给出 1 到 3 条今天可以开始的轻量行动建议，语气简短、有推动力。';
  }

  const header =
    scope === 'selected'
      ? '这些是用户选中的便签。请给出 1 到 3 条下一步建议，可包含补充负责人、转提醒、集中催办或拆成小行动。'
      : '这些是当前工作区便签摘要。请给出 1 到 3 条今天最值得推进的下一步建议。';
  const body = activeNotes
    .map((note) => {
      const content = `${note.content}`.replace(/\s+/g, ' ').trim().slice(0, 180);
      const tags = note.tags.length ? ` 标签：${note.tags.slice(0, 4).join('、')}` : '';
      return `#${note.id} ${note.title || '未命名便签'}${tags}\n${content || '无正文'}`;
    })
    .join('\n\n');

  return `${header}\n\n要求：输出中文短句；不要自动归档或删除；每条建议必须可执行。\n\n${body}`.slice(0, 1200);
}
export function buildRiskRadar(notes: StickyNote[], reminders: BackendReminder[], now = new Date()): RiskRadarItem[] {
  const activeNotes = notes.filter((note) => !note.archived);
  const activeReminders = reminders.filter((reminder) => !reminder.archived && !reminder.completed);
  const risks: RiskRadarItem[] = [];
  const nowMs = now.getTime();

  const overdue = activeReminders.filter((reminder) => {
    const due = new Date(reminder.next_due_at ?? reminder.due_at).getTime();
    return Number.isFinite(due) && due < nowMs;
  });
  if (overdue.length > 0) {
    risks.push({
      kind: 'overdue-reminder',
      itemIds: overdue.slice(0, 6).map((reminder) => reminder.id),
      title: `有 ${overdue.length} 条提醒已经过期`,
      description: `先处理：${overdue.slice(0, 3).map((reminder) => reminder.title).join('、')}。本小姐可不会替你背锅。`,
    });
  }

  const waiting = activeNotes.filter((note) => /等待|反馈|确认|审批|回复/.test(`${note.title}
${note.content}`));
  if (waiting.length > 0) {
    risks.push({
      kind: 'waiting-note',
      itemIds: waiting.slice(0, 6).map((note) => note.id),
      title: `有 ${waiting.length} 张便签在等反馈`,
      description: '建议今天主动催一下，等别人不是把事情丢给空气。',
    });
  }

  const missingNextStep = activeNotes.filter((note) => {
    const source = `${note.title}
${note.content}`;
    return !/等待|反馈|确认|审批|回复|下一步|负责人|截止|时间|提醒|todo|待办|今天|明天|处理/.test(source);
  });
  if (missingNextStep.length > 0) {
    risks.push({
      kind: 'missing-next-step',
      itemIds: missingNextStep.slice(0, 6).map((note) => note.id),
      title: `有 ${missingNextStep.length} 张便签缺少下一步`,
      description: '这些更像资料堆，不像行动项。补一句“下一步”，墙面会立刻清醒。',
    });
  }

  const highPriority = activeNotes.filter((note) => note.priority === 'high').map((note) => note.id);
  if (highPriority.length > 0) {
    risks.push({
      kind: 'high-priority',
      itemIds: highPriority.slice(0, 6),
      title: `有 ${highPriority.length} 张高优先级便签`,
      description: '别把所有事都标重点，重点太多就等于没有重点。',
    });
  }

  return risks.slice(0, 6);
}

export function buildDailyRoute(notes: StickyNote[], reminders: BackendReminder[], now = new Date()): string[] {
  const risks = buildRiskRadar(notes, reminders, now);
  const route: string[] = [];
  if (risks.some((risk) => risk.kind === 'overdue-reminder')) route.push('先处理过期提醒，避免继续滚雪球。');
  const highNotes = notes.filter((note) => !note.archived && note.priority === 'high').slice(0, 3);
  if (highNotes.length > 0) route.push(`再处理高优先级便签：${highNotes.map((note) => note.title).join('、')}。`);
  const todayNotes = notes.filter((note) => inferNoteCategory(`${note.title}
${note.content}`) === 'today').slice(0, 3);
  if (todayNotes.length > 0) route.push(`然后推进行动项：${todayNotes.map((note) => note.title).join('、')}。`);
  if (risks.some((risk) => risk.kind === 'waiting-note')) route.push('最后统一催等反馈事项，别零散打断自己的节奏。');
  if (route.length === 0) route.push('今天处理顺序很清爽：选一张最有价值的便签推进到底。');
  return route;
}

export function buildDailyReview(notes: StickyNote[], reminders: BackendReminder[], now = new Date()): DailyReview {
  const activeNotes = notes.filter((note) => !note.archived);
  const activeReminders = reminders.filter((reminder) => !reminder.archived);
  const nowMs = now.getTime();
  const completedReminders = activeReminders.filter((reminder) => reminder.completed).length;
  const overdueReminders = activeReminders.filter((reminder) => {
    if (reminder.completed) return false;
    const due = new Date(reminder.next_due_at ?? reminder.due_at).getTime();
    return Number.isFinite(due) && due < nowMs;
  }).length;
  const waitingNotes = activeNotes.filter((note) => inferNoteCategory(`${note.title}\n${note.content}`) === 'waiting').length;
  const highPriorityItems =
    activeNotes.filter((note) => note.priority === 'high').length +
    activeReminders.filter((reminder) => !reminder.completed && reminder.priority === 'high').length;
  const cleanupSuggestions = buildWallCleanupSuggestions(activeNotes, now).slice(0, 3);
  const summaryLines = [
    `完成提醒：${completedReminders} 条。`,
    overdueReminders ? `拖延项：${overdueReminders} 条，明天先清掉。` : '拖延项：暂时没有。',
    waitingNotes ? `等反馈：${waitingNotes} 项，建议集中催办。` : '等反馈：暂时没有。',
    cleanupSuggestions.length ? `可整理：${cleanupSuggestions.length} 条墙面建议。` : '墙面暂时清爽。',
  ];

  return { completedReminders, overdueReminders, waitingNotes, highPriorityItems, cleanupSuggestions, summaryLines };
}
export function buildDashboardStats(notes: StickyNote[], reminders: BackendReminder[], now = new Date()): DashboardStats {
  const activeNotes = notes.filter((note) => !note.archived);
  const activeReminders = reminders.filter((reminder) => !reminder.completed && !reminder.archived);
  const nowMs = now.getTime();
  const overdueReminders = activeReminders.filter((reminder) => {
    const due = new Date(reminder.next_due_at ?? reminder.due_at).getTime();
    return Number.isFinite(due) && due < nowMs;
  }).length;
  const waitingNotes = activeNotes.filter((note) => inferNoteCategory(`${note.title}\n${note.content}`) === 'waiting').length;
  const missingNextStepNotes = findNotesMissingNextStep(activeNotes).length;
  const completedToday = reminders.filter((reminder) => reminder.completed && isSameLocalDate(reminder.updated_at, now)).length;
  const delayDebt = overdueReminders * 2 + waitingNotes + missingNextStepNotes;
  const conversionRate = activeNotes.length === 0 ? 100 : Math.round(((activeNotes.length - missingNextStepNotes) / activeNotes.length) * 100);
  const cleanliness = Math.max(0, 100 - buildWallCleanupSuggestions(activeNotes, now).length * 18);
  const focusScore = clampPercent(100 - delayDebt * 10 + completedToday * 2);
  const headline = overdueReminders > 0
    ? '先清过期提醒'
    : missingNextStepNotes > 0
      ? '补齐下一步'
      : completedToday > 0
        ? '节奏不错'
        : '挑一件事推进';

  return {
    reminders: activeReminders.length,
    highPriority:
      activeNotes.filter((note) => note.priority === 'high').length +
      activeReminders.filter((reminder) => reminder.priority === 'high').length,
    notes: activeNotes.length,
    overdueReminders,
    waitingNotes,
    missingNextStepNotes,
    completedToday,
    delayDebt,
    focusScore,
    conversionRate,
    cleanliness,
    headline,
  };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isSameLocalDate(value: string, target: Date): boolean {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth() && date.getDate() === target.getDate();
}

export function buildReminderInput(draft: ReminderInputDraft): ReminderInputPayload {
  return {
    title: draft.title.trim(),
    notes: draft.notes.trim(),
    due_at: localDateTimeToIso(draft.dueAtLocal),
    repeat_rule: normalizeRepeatRule(draft.repeatRule),
    priority: draft.priority,
  };
}

export function buildQuickReminderDraft(content: string, title: string): ReminderInputDraft {
  return {
    title: title.trim(),
    notes: content.trim(),
    dueAtLocal: inferReminderDateTimeLocal(content),
    repeatRule: inferRepeatRule(content),
    priority: inferReminderPriority(`${title}\n${content}`),
  };
}

export function repeatRuleLabel(rule: RepeatRulePayload): string {
  const normalized = normalizeRepeatRule(rule);
  if (normalized.kind === 'daily') return '每天';
  if (normalized.kind === 'weekly') return '每周';
  if (normalized.kind === 'monthly') return '每月';
  if (normalized.kind === 'interval_minutes') return `每 ${normalized.value} 分钟`;
  return '不重复';
}

export function recommendNoteMetadata(content: string, title = ''): RecommendedNoteMetadata {
  const source = `${title}\n${content}`;
  const explicitTags = extractTags(source);
  const inferredTags = inferTags(source);
  return {
    color: chooseAutoNoteColor(title, content),
    priority: inferPriority(source),
    tags: Array.from(new Set([...explicitTags, ...inferredTags])).slice(0, 5),
    category: inferNoteCategory(source),
  };
}

export function getReminderVisualTone(priority: ReminderPriority): ReminderVisualTone {
  if (priority === 'high') {
    return {
      label: '⚑ 高优先级',
      emphasis: 'critical',
      accentClass: 'bg-gradient-to-b from-rose-500 via-orange-400 to-amber-300',
      badgeClass: 'bg-gradient-to-r from-rose-500 to-orange-400 text-white shadow-[0_10px_24px_rgba(244,63,94,.25)]',
      cardClass: 'border-rose-200/75 bg-gradient-to-br from-white/92 via-rose-50/74 to-amber-50/70',
    };
  }

  return {
    label: '普通提醒',
    emphasis: 'calm',
    accentClass: 'bg-gradient-to-b from-sky-400 to-cyan-300',
    badgeClass: 'bg-sky-50 text-sky-600',
    cardClass: 'border-white/70 bg-white/74',
  };
}

export function normalizeColor(color: string): NoteColor {
  return NOTE_COLORS.includes(color as NoteColor) ? (color as NoteColor) : 'blue';
}

function extractTags(content: string): string[] {
  return Array.from(content.matchAll(TAG_PATTERN), (match) => match[1]).slice(0, 5);
}

function inferTags(content: string): string[] {
  const tags: string[] = [];
  const text = content.toLowerCase();
  if (/bug|修复|发布|版本|代码/.test(text)) tags.push('开发');
  if (/客户|报价|合同|发票/.test(text)) tags.push('客户');
  if (/设计|图标|图片|ui|视觉/.test(text)) tags.push('设计');
  if (/会议|日报|周报|复盘/.test(text)) tags.push('工作');
  if (/灵感|想法|创意|idea/.test(text)) tags.push('灵感');
  return tags;
}

function inferPriority(content: string): NotePriority {
  if (content.includes('#普通优先级')) return 'normal';
  return content.includes('!!') || content.includes('重要') ? 'high' : 'normal';
}

function inferReminderPriority(content: string): ReminderPriority {
  return content.includes('!!') || content.includes('重要') || content.includes('紧急') || content.includes('高优先级')
    ? 'high'
    : 'normal';
}

function inferRepeatRule(content: string): RepeatRulePayload {
  if (/每(天|日)|每天|每日/.test(content)) return { kind: 'daily' };
  if (/每周|每星期|每个星期/.test(content)) return { kind: 'weekly' };
  if (/每月|每个月/.test(content)) return { kind: 'monthly' };
  if (/每(半小时|30分钟)|每隔半小时/.test(content)) return { kind: 'interval_minutes', value: 30 };
  if (/每(小时|60分钟)|每隔一小时/.test(content)) return { kind: 'interval_minutes', value: 60 };
  return { kind: 'none' };
}

function normalizeRepeatRule(rule: RepeatRulePayload): RepeatRulePayload {
  if (rule.kind !== 'interval_minutes') return rule;
  const value = Number.isFinite(rule.value) ? Math.max(1, Math.round(rule.value)) : 30;
  return { kind: 'interval_minutes', value };
}

function localDateTimeToIso(value: string): string {
  const date = value ? new Date(value) : new Date(Date.now() + 30 * 60 * 1000);
  return date.toISOString();
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

