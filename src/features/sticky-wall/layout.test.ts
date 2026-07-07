import { describe, expect, it } from 'vitest';
import {
  MIN_NOTE_HEIGHT,
  applyGroupDrag,
  normalizeNoteHeight,
  arrangeNotes,
  arrangeNotesByCategory,
  arrangeWallNotes,
  compactSparseColumns,
  clampRotation,
  snapPoint,
  toChangedLayoutPatches,
  toLayoutPatch,
} from './layout';
import type { StickyNote } from './types';

const baseNotes: StickyNote[] = [
  {
    id: 1,
    title: 'A',
    content: 'Alpha',
    color: 'butter',
    tags: [],
    priority: 'normal',
    x: 10,
    y: 20,
    width: 240,
    height: 180,
    rotation: 2,
    attachments: [],
    pinned: false,
    archived: false,
    createdAt: '2026-07-05T00:00:00Z',
    updatedAt: '2026-07-05T00:00:00Z',
  },
  {
    id: 2,
    title: 'B',
    content: 'Beta',
    color: 'mint',
    tags: [],
    priority: 'high',
    x: 300,
    y: 60,
    width: 260,
    height: 200,
    rotation: -3,
    attachments: [],
    pinned: true,
    archived: false,
    createdAt: '2026-07-05T00:00:00Z',
    updatedAt: '2026-07-05T00:00:00Z',
  },
];

describe('sticky wall layout helpers', () => {
  it('snaps points to grid when inside threshold', () => {
    expect(snapPoint({ x: 119, y: 132 }, { gridSize: 24, threshold: 6 })).toEqual({ x: 120, y: 132 });
  });

  it('keeps points unsnapped when outside threshold', () => {
    expect(snapPoint({ x: 113, y: 130 }, { gridSize: 24, threshold: 4 })).toEqual({ x: 113, y: 130 });
  });

  it('clamps rotation to a paper-like range', () => {
    expect(clampRotation(16)).toBe(8);
    expect(clampRotation(-12)).toBe(-8);
    expect(clampRotation(4.25)).toBe(4.25);
  });

  it('applies a group drag delta only to selected notes', () => {
    const moved = applyGroupDrag(baseNotes, new Set([1]), { x: 32, y: -8 });

    expect(moved[0]).toMatchObject({ id: 1, x: 42, y: 12 });
    expect(moved[1]).toMatchObject({ id: 2, x: 300, y: 60 });
  });

  it('arranges notes into responsive rows inside the available width', () => {
    const arranged = arrangeNotes(baseNotes, { containerWidth: 560, gap: 24, startX: 24, startY: 24 });

    expect(arranged[0]).toMatchObject({ id: 1, x: 24, y: 24 });
    expect(arranged[1]).toMatchObject({ id: 2, x: 288, y: 24 });
  });

  it('arranges the main wall as compact responsive rows instead of category lanes', () => {
    const arranged = arrangeWallNotes(
      [
        { ...baseNotes[0], id: 1, content: '今天修复 bug', width: 220 },
        { ...baseNotes[1], id: 2, content: '等待反馈', width: 220 },
        { ...baseNotes[0], id: 3, content: '今天补充处理顺序', width: 220 },
      ],
      { containerWidth: 840, gap: 24, startX: 24, startY: 24 },
    );

    expect(arranged.map((note) => ({ id: note.id, x: note.x, y: note.y }))).toEqual([
      { id: 1, x: 24, y: 24 },
      { id: 2, x: 268, y: 24 },
      { id: 3, x: 512, y: 24 },
    ]);
  });

  it('wraps arranged notes when the wall is narrow', () => {
    const arranged = arrangeNotes(baseNotes, { containerWidth: 360, gap: 24, startX: 24, startY: 24 });

    expect(arranged[0]).toMatchObject({ id: 1, x: 24, y: 24 });
    expect(arranged[1]).toMatchObject({ id: 2, x: 24, y: 24 + MIN_NOTE_HEIGHT + 24 });
  });

  it('arranges notes into compact today waiting and idea columns', () => {
    const arranged = arrangeNotesByCategory(
      [
        { ...baseNotes[0], id: 1, content: '等待客户确认' },
        { ...baseNotes[1], id: 2, content: '今天发布版本' },
        { ...baseNotes[0], id: 3, content: '一个灵感' },
      ],
      { containerWidth: 900, gap: 24, startX: 24, startY: 72 },
    );

    expect(arranged.map((note) => note.id)).toEqual([2, 1, 3]);
    expect(arranged[0].y).toBe(72);
    expect(arranged[1].y).toBe(72);
    expect(arranged[2].y).toBe(72);
    expect(arranged[1].x).toBeGreaterThan(arranged[0].x);
    expect(arranged[2].x).toBeGreaterThan(arranged[1].x);
  });

  it('compacts sparse saved vertical gaps inside each visual column', () => {
    const sparse = [
      { ...baseNotes[0], id: 1, x: 24, y: 24, height: 180 },
      { ...baseNotes[1], id: 2, x: 30, y: 430, height: 190 },
      { ...baseNotes[0], id: 3, x: 340, y: 390, height: 160 },
    ];

    const compacted = compactSparseColumns(sparse, { gap: 24, startY: 24, maxGap: 72 });

    expect(compacted.find((note) => note.id === 1)).toMatchObject({ y: 24 });
    expect(compacted.find((note) => note.id === 2)).toMatchObject({ y: 24 + MIN_NOTE_HEIGHT + 24 });
    expect(compacted.find((note) => note.id === 3)).toMatchObject({ y: 24 });
  });

  it('keeps persisted note layouts tall enough for a readable text preview', () => {
    expect(toLayoutPatch({ ...baseNotes[0], height: 180 }).height).toBe(MIN_NOTE_HEIGHT);
  });
  it('returns layout patches only for notes whose arranged layout changed', () => {
    const unchanged = { ...baseNotes[0], height: MIN_NOTE_HEIGHT };
    const changed = { ...baseNotes[1], x: 48, y: 72, height: MIN_NOTE_HEIGHT };

    expect(toChangedLayoutPatches([unchanged, baseNotes[1]], [unchanged, changed])).toEqual([
      {
        id: 2,
        x: 48,
        y: 72,
        width: 260,
        height: MIN_NOTE_HEIGHT,
        rotation: -3,
      },
    ]);
    expect(toChangedLayoutPatches([unchanged], [unchanged])).toEqual([]);
  });

  it('normalizes legacy default note heights so cards stay uniform', () => {
    expect(normalizeNoteHeight(214)).toBe(MIN_NOTE_HEIGHT);
    expect(normalizeNoteHeight(248)).toBe(MIN_NOTE_HEIGHT);
    expect(normalizeNoteHeight(280)).toBe(280);
  });
});
