import { findNotesMissingNextStep } from '../../app-model';
import { inferNoteCategory, type NoteCategory } from '../../note-intelligence';
import type { StickyNote } from './types';

export type WallCategoryFilter = NoteCategory | 'all';
export type WallExplorationMode = 'all' | 'challenge' | 'waiting' | 'missing-next-step' | 'relationships';

export type WallExplorationState = {
  visibleNotes: StickyNote[];
  highlightedIds: Set<number>;
  dimmedIds: Set<number>;
  emptyCopy: string;
};

const FILTERED_ORIGIN = { x: 24, y: 24 };

export function filterNotesByCategory(notes: StickyNote[], filter: WallCategoryFilter): StickyNote[] {
  if (filter === 'all') return notes;
  return notes.filter((note) => inferNoteCategory(`${note.title}\n${note.content}`) === filter);
}

export function prepareVisibleNotes(notes: StickyNote[], filter: WallCategoryFilter): StickyNote[] {
  const visible = filterNotesByCategory(notes, filter);
  if (filter === 'all' || visible.length === 0) return visible;

  const minX = Math.min(...visible.map((note) => note.x));
  const minY = Math.min(...visible.map((note) => note.y));
  return visible.map((note) => ({
    ...note,
    x: note.x - minX + FILTERED_ORIGIN.x,
    y: note.y - minY + FILTERED_ORIGIN.y,
  }));
}

export function mergeVisibleNoteChanges(notes: StickyNote[], visibleNotes: StickyNote[]): StickyNote[] {
  const changedById = new Map(visibleNotes.map((note) => [note.id, note]));
  return notes.map((note) => changedById.get(note.id) ?? note);
}

export function countNotesByCategory(notes: StickyNote[], category: NoteCategory): number {
  return filterNotesByCategory(notes, category).length;
}

export function buildWallExplorationState(
  notes: StickyNote[],
  mode: WallExplorationMode,
  challengeNoteIds: number[],
): WallExplorationState {
  const challengeIds = new Set(challengeNoteIds);
  if (mode === 'all') {
    return { visibleNotes: notes, highlightedIds: new Set(), dimmedIds: new Set(), emptyCopy: '这里暂时没有便签。' };
  }

  if (mode === 'challenge') {
    return {
      visibleNotes: notes,
      highlightedIds: challengeIds,
      dimmedIds: new Set(notes.filter((note) => !challengeIds.has(note.id)).map((note) => note.id)),
      emptyCopy: '今日挑战暂时没有命中便签。',
    };
  }

  if (mode === 'waiting') {
    const visibleNotes = filterNotesByCategory(notes, 'waiting');
    return {
      visibleNotes,
      highlightedIds: new Set(visibleNotes.map((note) => note.id)),
      dimmedIds: new Set(),
      emptyCopy: '暂时没有等反馈便签。',
    };
  }

  if (mode === 'missing-next-step') {
    const visibleNotes = findNotesMissingNextStep(notes);
    return {
      visibleNotes,
      highlightedIds: new Set(visibleNotes.map((note) => note.id)),
      dimmedIds: new Set(),
      emptyCopy: '没有缺下一步的便签，墙面很清醒。',
    };
  }

  const tagged = notes.filter((note) => note.tags.length > 0);
  return {
    visibleNotes: notes,
    highlightedIds: new Set(tagged.map((note) => note.id)),
    dimmedIds: new Set(notes.filter((note) => note.tags.length === 0).map((note) => note.id)),
    emptyCopy: '暂时没有可连接的同主题便签。',
  };
}