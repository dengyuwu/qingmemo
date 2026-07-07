import { describe, expect, it } from 'vitest';
import { categoryHelp, categoryLabel, noteMood, noteMoodHelp } from './note-labels';
import type { StickyNote } from './types';

const baseNote: StickyNote = {
  id: 1,
  title: '便签',
  content: '内容',
  color: 'butter',
  tags: [],
  priority: 'normal',
  x: 0,
  y: 0,
  width: 220,
  height: 214,
  rotation: 0,
  attachments: [],
  pinned: false,
  archived: false,
  createdAt: '2026-07-05T00:00:00Z',
  updatedAt: '2026-07-05T00:00:00Z',
};

describe('sticky note labels', () => {
  it('uses action-oriented copy for inferred today notes', () => {
    expect(categoryLabel('today')).toBe('行动项');
    expect(categoryHelp('today')).toContain('不代表必须今天完成');
  });

  it('does not classify plain bug fixes as blocked', () => {
    const note = { ...baseNote, title: '成长bug修复', content: '成长有些bug修复' };

    expect(noteMood(note)).toBe('修复中');
    expect(noteMoodHelp(note)).toContain('不代表已经受阻');
  });

  it('shows blocked only when the text explicitly says it is stuck', () => {
    const note = { ...baseNote, title: '登录问题', content: '接口报错，流程卡住无法提交' };

    expect(noteMood(note)).toBe('受阻');
    expect(noteMoodHelp(note)).toContain('卡住');
  });
});
