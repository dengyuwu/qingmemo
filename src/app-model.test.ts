import { describe, expect, it } from 'vitest';
import {
  buildAiNextStepPrompt,
  buildDashboardStats,
  buildAttachmentFromPath,
  buildDailyChallenge,
  buildDailyQueue,
  buildDailyQueueNoteStatusMap,
  dailyQueueItemKey,
  summarizeDailyQueueProgress,
  buildNoteInput,
  buildQuickReminderDraft,
  chooseAutoNoteColor,
  describeAttachment,
  buildReminderInput,
  buildWallCleanupSuggestions,
  buildRiskRadar,
  buildDailyRoute,
  buildDailyReview,
  filterNotes,
  filterFocusWallNotes,
  findNotesMissingNextStep,
  getReminderVisualTone,
  inferNoteCategory,
  inferReminderDateTimeLocal,
  recommendNoteMetadata,
  repeatRuleLabel,
  replaceNote,
  toStickyNote,
  type BackendNote,
  type BackendReminder,
} from './app-model';
import { MIN_NOTE_HEIGHT } from './features/sticky-wall/layout';

const backendNote: BackendNote = {
  id: 7,
  title: '会议纪要',
  content: '整理 #工作 复盘',
  color: 'amber',
  pinned: true,
  archived: false,
  x: 144,
  y: 96,
  width: 280,
  height: MIN_NOTE_HEIGHT,
  rotation: -4.5,
  attachments: [],
  created_at: '2026-07-05T01:00:00Z',
  updated_at: '2026-07-05T02:00:00Z',
};

describe('app note model helpers', () => {
  it('maps backend snake_case notes into sticky wall notes', () => {
    expect(toStickyNote(backendNote)).toMatchObject({
      id: 7,
      title: '会议纪要',
      content: '整理 #工作 复盘',
      color: 'amber',
      tags: ['工作'],
      priority: 'normal',
      x: 144,
      y: 96,
      width: 280,
      height: MIN_NOTE_HEIGHT,
      rotation: -4.5,
      attachments: [],
      pinned: true,
      archived: false,
      createdAt: '2026-07-05T01:00:00Z',
      updatedAt: '2026-07-05T02:00:00Z',
    });
  });

  it('normalizes unknown colors and unsafe layout values', () => {
    const note = toStickyNote({
      ...backendNote,
      color: 'unknown',
      width: 90,
      height: 80,
      rotation: 14,
    });

    expect(note.color).toBe('blue');
    expect(note.width).toBe(180);
    expect(note.height).toBe(MIN_NOTE_HEIGHT);
    expect(note.rotation).toBe(8);
  });

  it('builds trimmed note input for Tauri commands', () => {
    expect(buildNoteInput({ title: '  新便签  ', content: '  内容  ', color: 'mint', pinned: false, attachments: [] })).toEqual({
      title: '新便签',
      content: '内容',
      color: 'mint',
      pinned: false,
      attachments: [],
    });
  });

  it('chooses note color automatically from note text and seed', () => {
    expect(chooseAutoNoteColor('法院确认', '确认账户解绑', 0)).toBe(chooseAutoNoteColor('法院确认', '确认账户解绑', 0));
    expect(['butter', 'sky', 'mint', 'peach', 'lavender', 'graphite']).toContain(
      chooseAutoNoteColor('法院确认', '确认账户解绑', 0),
    );
  });

  it('replaces updated note without losing the existing order', () => {
    const first = toStickyNote(backendNote);
    const second = toStickyNote({ ...backendNote, id: 8, title: '第二张' });

    expect(replaceNote([first, second], { ...second, title: '已更新' }).map((note) => note.title)).toEqual([
      '会议纪要',
      '已更新',
    ]);
  });
});

const backendReminder: BackendReminder = {
  id: 5,
  title: '提交日报',
  notes: '记得补充风险',
  due_at: '2026-07-05T10:30:00Z',
  next_due_at: '2026-07-05T10:30:00Z',
  repeat_rule: { kind: 'none' },
  priority: 'high',
  completed: false,
  archived: false,
  fired_at: null,
  created_at: '2026-07-05T01:00:00Z',
  updated_at: '2026-07-05T02:00:00Z',
};

describe('dashboard model helpers', () => {

  it('builds wall cleanup suggestions for duplicate stale and done notes', () => {
    const base = { ...toStickyNote(backendNote), pinned: false };
    const notes = [
      { ...base, id: 1, title: '客户跟进', content: '客户：香港AI', updatedAt: '2026-07-05T02:00:00Z' },
      { ...base, id: 2, title: '客户跟进', content: '客户：香港AI', updatedAt: '2026-07-05T03:00:00Z' },
      { ...base, id: 3, title: '旧资料', content: '桌面文件用途记录', updatedAt: '2026-06-01T00:00:00Z' },
      { ...base, id: 4, title: '完成登录修复', content: '已做完，可以收起', updatedAt: '2026-07-05T00:00:00Z' },
    ];

    const suggestions = buildWallCleanupSuggestions(notes, new Date('2026-07-06T00:00:00Z'));

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'duplicate', noteIds: [1, 2] }),
        expect.objectContaining({ kind: 'stale', noteIds: [3] }),
        expect.objectContaining({ kind: 'done', noteIds: [4] }),
      ]),
    );
  });



  it('builds risk radar and daily route suggestions', () => {
    const base = { ...toStickyNote(backendNote), pinned: false };
    const notes = [
      { ...base, id: 1, title: '客户方案', content: '今天确认报价和负责人 #客户', priority: 'high' as const },
      { ...base, id: 2, title: '等待审批', content: '等待法务审批合同 #客户' },
      { ...base, id: 3, title: '项目背景', content: '资料堆' },
    ];
    const reminders = [
      { ...backendReminder, id: 1, title: '过期提醒', due_at: '2026-07-05T08:00:00Z', next_due_at: '2026-07-05T08:00:00Z', priority: 'high' as const },
      { ...backendReminder, id: 2, title: '今日提醒', due_at: '2026-07-06T11:00:00Z', next_due_at: '2026-07-06T11:00:00Z' },
    ];

    expect(buildRiskRadar(notes, reminders, new Date('2026-07-06T10:00:00Z'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'overdue-reminder', itemIds: [1] }),
        expect.objectContaining({ kind: 'waiting-note', itemIds: [1, 2] }),
        expect.objectContaining({ kind: 'missing-next-step', itemIds: [3] }),
      ]),
    );
    expect(buildDailyRoute(notes, reminders, new Date('2026-07-06T10:00:00Z'))[0]).toContain('先处理过期提醒');
  });
  it('builds daily challenge from overdue reminders before notes', () => {
    const base = { ...toStickyNote(backendNote), pinned: false };
    const notes = [
      { ...base, id: 1, title: '今日方案', content: '今天确认报价 #客户', priority: 'high' as const },
      { ...base, id: 2, title: '等待审批', content: '等待法务审批合同 #客户' },
    ];
    const reminders = [
      { ...backendReminder, id: 9, title: '过期发布', due_at: '2026-07-05T08:00:00Z', next_due_at: '2026-07-05T08:00:00Z' },
    ];

    expect(buildDailyChallenge(notes, reminders, new Date('2026-07-06T10:00:00Z'))).toMatchObject({
      title: '今日挑战',
      items: [
        expect.objectContaining({ kind: 'reminder', id: 9, reason: expect.stringContaining('过期') }),
        expect.objectContaining({ kind: 'note', id: 1, reason: expect.stringContaining('高优先级') }),
      ],
    });
  });

  it('returns a gentle daily challenge fallback when workspace is empty', () => {
    expect(buildDailyChallenge([], [], new Date('2026-07-06T10:00:00Z'))).toMatchObject({
      title: '今日挑战',
      items: [
        expect.objectContaining({
          kind: 'fallback',
          id: 'default-focus',
          title: expect.stringContaining('最有价值'),
        }),
      ],
    });
  });
  it('builds a routable daily queue from challenge items', () => {
    const base = { ...toStickyNote(backendNote), pinned: false };
    const notes = [
      { ...base, id: 1, title: '今日方案', content: '今天确认报价 #客户', priority: 'high' as const },
    ];
    const reminders = [
      { ...backendReminder, id: 9, title: '过期发布', due_at: '2026-07-05T08:00:00Z', next_due_at: '2026-07-05T08:00:00Z' },
    ];

    expect(buildDailyQueue(notes, reminders, new Date('2026-07-06T10:00:00Z'))).toMatchObject({
      title: '今日队列',
      primaryActionLabel: '继续推进',
      items: [
        expect.objectContaining({ kind: 'reminder', id: 9, route: 'reminders', actionLabel: '打开提醒' }),
        expect.objectContaining({ kind: 'note', id: 1, route: 'note-challenge', actionLabel: 'AI 下一步' }),
      ],
    });
  });

  it('maps completed daily queue notes for sticky wall status badges', () => {
    const base = { ...toStickyNote(backendNote), pinned: false };
    const queue = buildDailyQueue(
      [{ ...base, id: 1, title: '今日方案', content: '今天确认报价 #客户', priority: 'high' as const }],
      [{ ...backendReminder, id: 9, title: '过期发布', due_at: '2026-07-05T08:00:00Z', next_due_at: '2026-07-05T08:00:00Z' }],
      new Date('2026-07-06T10:00:00Z'),
    );

    expect(buildDailyQueueNoteStatusMap(queue, { 'reminder:9': 'done', 'note:1': 'skipped' })).toEqual({ 1: 'skipped' });
  });
  it('summarizes daily queue progress from local item states', () => {
    const base = { ...toStickyNote(backendNote), pinned: false };
    const queue = buildDailyQueue(
      [{ ...base, id: 1, title: '今日方案', content: '今天确认报价 #客户', priority: 'high' as const }],
      [{ ...backendReminder, id: 9, title: '过期发布', due_at: '2026-07-05T08:00:00Z', next_due_at: '2026-07-05T08:00:00Z' }],
      new Date('2026-07-06T10:00:00Z'),
    );

    expect(dailyQueueItemKey(queue.items[0])).toBe('reminder:9');
    expect(summarizeDailyQueueProgress(queue, { 'reminder:9': 'done', 'note:1': 'skipped' })).toEqual({
      total: 2,
      done: 1,
      skipped: 1,
      open: 0,
      label: '已完成 1/2 · 跳过 1',
    });
  });

  it('finds notes missing a next step without flagging explicit work notes', () => {
    const base = { ...toStickyNote(backendNote), pinned: false };
    const notes = [
      { ...base, id: 1, title: '资料堆', content: '客户背景和零散信息' },
      { ...base, id: 2, title: '修复登录 bug', content: '今天处理登录失败并发布' },
      { ...base, id: 3, title: '等待客户确认', content: '等待报价反馈' },
    ];

    expect(findNotesMissingNextStep(notes).map((note) => note.id)).toEqual([1]);
  });

  it('builds a bounded AI next-step prompt from selected notes', () => {
    const base = { ...toStickyNote(backendNote), pinned: false };
    const notes = [
      { ...base, id: 1, title: '客户方案', content: '今天确认报价和负责人\n'.repeat(40) },
      { ...base, id: 2, title: '等待审批', content: '等待法务审批合同' },
    ];

    const prompt = buildAiNextStepPrompt(notes, 'selected');

    expect(prompt).toContain('请给出 1 到 3 条下一步建议');
    expect(prompt).toContain('#1 客户方案');
    expect(prompt.length).toBeLessThanOrEqual(1200);
  });
  it('builds a daily review summary for the evening loop', () => {
    const base = { ...toStickyNote(backendNote), pinned: false };
    const notes = [
      { ...base, id: 1, title: '等待审批', content: '等待法务审批合同 #客户', updatedAt: '2026-07-05T00:00:00Z' },
      { ...base, id: 2, title: '旧资料', content: '资料堆', updatedAt: '2026-06-01T00:00:00Z' },
    ];
    const reminders = [
      { ...backendReminder, id: 1, title: '已完成', completed: true, due_at: '2026-07-06T08:00:00Z', next_due_at: '2026-07-06T08:00:00Z' },
      { ...backendReminder, id: 2, title: '过期提醒', due_at: '2026-07-05T08:00:00Z', next_due_at: '2026-07-05T08:00:00Z' },
    ];

    expect(buildDailyReview(notes, reminders, new Date('2026-07-06T10:00:00Z'))).toMatchObject({
      completedReminders: 1,
      overdueReminders: 1,
      waitingNotes: 1,
      cleanupSuggestions: [expect.objectContaining({ kind: 'stale', noteIds: [2] })],
    });
  });

  it('builds motivational dashboard stats from notes and active reminders', () => {
    const base = { ...toStickyNote(backendNote), pinned: false };
    const notes = [
      { ...base, id: 1, title: '等待审批', content: '等待法务审批合同 #客户' },
      { ...base, id: 2, title: '资料堆', content: '客户背景资料' },
      { ...base, id: 3, title: '今日发布', content: '重要：今天发布版本 !!', priority: 'high' as const },
    ];
    const reminders = [
      { ...backendReminder, id: 1, title: '过期提醒', due_at: '2026-07-05T08:00:00Z', next_due_at: '2026-07-05T08:00:00Z', priority: 'high' as const },
      { ...backendReminder, id: 2, title: '已完成', completed: true, due_at: '2026-07-06T08:00:00Z', next_due_at: '2026-07-06T08:00:00Z', updated_at: '2026-07-06T09:00:00Z' },
    ];

    expect(buildDashboardStats(notes, reminders, new Date('2026-07-06T10:00:00Z'))).toEqual({
      reminders: 1,
      highPriority: 2,
      notes: 3,
      overdueReminders: 1,
      waitingNotes: 1,
      missingNextStepNotes: 1,
      completedToday: 1,
      delayDebt: 4,
      focusScore: 62,
      conversionRate: 67,
      cleanliness: 100,
      headline: '先清过期提醒',
    });
  });

  it('keeps all notes visible when focus mode auto-selects a new note without tags', () => {
    const existing = toStickyNote({ ...backendNote, id: 7, title: '旧便签', content: '之前的内容 #客户' });
    const created = toStickyNote({ ...backendNote, id: 8, title: '新便签', content: '成长bug修复' });

    expect(filterFocusWallNotes([created, existing], new Set([created.id]), true, 'notes').map((note) => note.id)).toEqual([8, 7]);
  });

  it('keeps the sticky wall populated when switching visual stat cards', () => {
    const pinned = toStickyNote(backendNote);
    const high = toStickyNote({ ...backendNote, id: 8, pinned: false, content: '重要 !!' });

    expect(filterNotes([pinned, high], 'notes').map((note) => note.id)).toEqual([7, 8]);
    expect(filterNotes([pinned, high], 'reminders').map((note) => note.id)).toEqual([7, 8]);
    expect(filterNotes([pinned, high], 'highPriority').map((note) => note.id)).toEqual([7, 8]);
  });

  it('builds reminder input with RFC3339 due time and default repeat rule', () => {
    const input = buildReminderInput({
      title: '  喝水  ',
      notes: '  站起来活动  ',
      dueAtLocal: '2026-07-05T10:30',
      repeatRule: { kind: 'daily' },
      priority: 'normal',
    });

    expect(input).toMatchObject({
      title: '喝水',
      notes: '站起来活动',
      repeat_rule: { kind: 'daily' },
      priority: 'normal',
    });
    expect(input.due_at).toContain('2026-07-05T');
  });

  it('exposes an explicit visual tone for high priority reminders', () => {
    expect(getReminderVisualTone('high')).toMatchObject({
      label: '⚑ 高优先级',
      emphasis: 'critical',
    });
    expect(getReminderVisualTone('normal')).toMatchObject({
      label: '普通提醒',
      emphasis: 'calm',
    });
  });

  it('builds quick reminder drafts from raw input with automatic priority', () => {
    expect(buildQuickReminderDraft('重要：今晚发布新版本', '发布提醒')).toMatchObject({
      title: '发布提醒',
      notes: '重要：今晚发布新版本',
      repeatRule: { kind: 'none' },
      priority: 'high',
    });

    expect(buildQuickReminderDraft('每天半小时后喝水', '喝水')).toMatchObject({
      title: '喝水',
      notes: '每天半小时后喝水',
      repeatRule: { kind: 'daily' },
      priority: 'normal',
    });
  });

  it('formats repeat rule labels for the reminder UI', () => {
    expect(repeatRuleLabel({ kind: 'none' })).toBe('不重复');
    expect(repeatRuleLabel({ kind: 'weekly' })).toBe('每周');
    expect(repeatRuleLabel({ kind: 'interval_minutes', value: 45 })).toBe('每 45 分钟');
  });

  it('infers reminder time from natural Chinese quick input', () => {
    const now = new Date(2026, 6, 5, 9, 0, 0);

    expect(inferReminderDateTimeLocal('半小时后喝水', now)).toBe('2026-07-05T09:30');
    expect(inferReminderDateTimeLocal('下午3点开会', now)).toBe('2026-07-05T15:00');
    expect(inferReminderDateTimeLocal('明天9点发日报', now)).toBe('2026-07-06T09:00');
  });

  it('recommends note metadata from content without manual color picking', () => {
    const metadata = recommendNoteMetadata('重要：今天发布版本，等待小王确认 #工作');

    expect(metadata.priority).toBe('high');
    expect(metadata.category).toBe('today');
    expect(metadata.tags).toContain('工作');
    expect(['butter', 'sky', 'mint', 'peach', 'lavender', 'graphite']).toContain(metadata.color);
  });

  it('categorizes notes into today waiting and idea lanes', () => {
    expect(inferNoteCategory('今天修复登录问题')).toBe('today');
    expect(inferNoteCategory('等待客户确认报价')).toBe('waiting');
    expect(inferNoteCategory('一个新产品灵感')).toBe('idea');
  });

  it('adds a useful local explanation for associated files', () => {
    expect(describeAttachment('C:/Users/me/Desktop/合同报价.pdf', '给客户报价')).toContain('文档');
    expect(describeAttachment('C:/Users/me/Desktop/logo.png', '设计图标')).toContain('图片');
  });

  it('builds an attachment object from a manually typed path', () => {
    expect(buildAttachmentFromPath(' C:\\Users\\me\\Desktop\\报价.pdf ', '客户报价')).toMatchObject({
      path: 'C:/Users/me/Desktop/报价.pdf',
      name: '报价.pdf',
      description: expect.stringContaining('文档'),
    });
  });
});

