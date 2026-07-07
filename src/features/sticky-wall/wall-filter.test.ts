import { describe, expect, it } from 'vitest';
import { buildWallExplorationState, countNotesByCategory, filterNotesByCategory, mergeVisibleNoteChanges, prepareVisibleNotes } from './wall-filter';
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
  height: 236,
  rotation: 0,
  attachments: [],
  pinned: false,
  archived: false,
  createdAt: '2026-07-05T00:00:00Z',
  updatedAt: '2026-07-05T00:00:00Z',
};

describe('sticky wall category filtering', () => {
  const notes: StickyNote[] = [
    { ...baseNote, id: 1, title: '客户跟进', content: '今天处理客户问题' },
    { ...baseNote, id: 2, title: '审批', content: '等待主管确认' },
    { ...baseNote, id: 3, title: '想法', content: '一个新产品灵感' },
  ];

  it('keeps every note visible when the filter is all', () => {
    expect(filterNotesByCategory(notes, 'all').map((note) => note.id)).toEqual([1, 2, 3]);
  });

  it('filters notes by inferred category for quick scanning', () => {
    expect(filterNotesByCategory(notes, 'today').map((note) => note.id)).toEqual([1]);
    expect(filterNotesByCategory(notes, 'waiting').map((note) => note.id)).toEqual([2]);
    expect(filterNotesByCategory(notes, 'idea').map((note) => note.id)).toEqual([3]);
  });

  it('counts categories from the full wall instead of the filtered view', () => {
    expect(countNotesByCategory(notes, 'today')).toBe(1);
    expect(countNotesByCategory(notes, 'waiting')).toBe(1);
    expect(countNotesByCategory(notes, 'idea')).toBe(1);
  });

  it('rebases filtered notes to the first visible slot for focused scanning', () => {
    const spreadNotes = [
      { ...notes[0], x: 24, y: 24 },
      { ...notes[1], x: 320, y: 168 },
    ];

    expect(prepareVisibleNotes(spreadNotes, 'waiting')).toMatchObject([{ id: 2, x: 24, y: 24 }]);
    expect(prepareVisibleNotes(spreadNotes, 'all').map((note) => ({ id: note.id, x: note.x, y: note.y }))).toEqual([
      { id: 1, x: 24, y: 24 },
      { id: 2, x: 320, y: 168 },
    ]);
  });

  it('merges moved visible notes without dropping hidden notes', () => {
    const movedWaiting = { ...notes[1], x: 48, y: 48 };

    expect(mergeVisibleNoteChanges(notes, [movedWaiting]).map((note) => ({ id: note.id, x: note.x, y: note.y }))).toEqual([
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 48, y: 48 },
      { id: 3, x: 0, y: 0 },
    ]);
  });
  it('highlights daily challenge notes without hiding the wall', () => {
    const state = buildWallExplorationState(notes, 'challenge', [2]);

    expect(state.visibleNotes.map((note) => note.id)).toEqual([1, 2, 3]);
    expect(state.highlightedIds).toEqual(new Set([2]));
    expect(state.dimmedIds.has(1)).toBe(true);
    expect(state.dimmedIds.has(2)).toBe(false);
  });

  it('filters missing-next-step exploration to notes that need action clarity', () => {
    const mixed = [
      { ...baseNote, id: 1, title: '资料堆', content: '客户背景资料' },
      { ...baseNote, id: 2, title: '修复登录', content: '今天处理登录 bug' },
    ];

    const state = buildWallExplorationState(mixed, 'missing-next-step', []);

    expect(state.visibleNotes.map((note) => note.id)).toEqual([1]);
    expect(state.emptyCopy).toContain('下一步');
  });
});
