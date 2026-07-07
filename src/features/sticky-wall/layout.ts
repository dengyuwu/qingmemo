import type { LayoutPatch, Point, StickyNote } from './types';
import { inferNoteCategory } from '../../note-intelligence';

export type SnapOptions = {
  gridSize: number;
  threshold: number;
};

export type ArrangeOptions = {
  containerWidth: number;
  gap?: number;
  startX?: number;
  startY?: number;
};

export type CompactSparseOptions = {
  gap?: number;
  startY?: number;
  maxGap?: number;
  columnTolerance?: number;
};

export const MIN_NOTE_WIDTH = 180;
export const MIN_NOTE_HEIGHT = 236;
const LEGACY_DEFAULT_NOTE_HEIGHT = 248;
const MAX_ROTATION = 8;

export function clampRotation(value: number): number {
  return Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, value));
}

export function normalizeNoteHeight(height: number): number {
  if (height <= LEGACY_DEFAULT_NOTE_HEIGHT) return MIN_NOTE_HEIGHT;
  return Math.max(MIN_NOTE_HEIGHT, height);
}

export function snapPoint(point: Point, options: SnapOptions): Point {
  return {
    x: snapAxis(point.x, options.gridSize, options.threshold),
    y: snapAxis(point.y, options.gridSize, options.threshold),
  };
}

export function applyGroupDrag(notes: StickyNote[], selectedIds: Set<number>, delta: Point): StickyNote[] {
  return notes.map((note) => {
    if (!selectedIds.has(note.id)) return note;
    return {
      ...note,
      x: note.x + delta.x,
      y: note.y + delta.y,
    };
  });
}

export function arrangeNotes(notes: StickyNote[], options: ArrangeOptions): StickyNote[] {
  const gap = options.gap ?? 24;
  const startX = options.startX ?? 24;
  const startY = options.startY ?? 24;
  const maxX = Math.max(startX, options.containerWidth);
  let cursorX = startX;
  let cursorY = startY;
  let rowHeight = 0;

  return notes.map((note) => {
    const width = Math.max(MIN_NOTE_WIDTH, note.width);
    const height = normalizeNoteHeight(note.height);
    const wouldOverflow = cursorX > startX && cursorX + width > maxX;

    if (wouldOverflow) {
      cursorX = startX;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }

    const arranged = {
      ...note,
      x: cursorX,
      y: cursorY,
      width,
      height,
      rotation: clampRotation(note.rotation),
    };

    cursorX += width + gap;
    rowHeight = Math.max(rowHeight, height);
    return arranged;
  });
}

export function arrangeWallNotes(notes: StickyNote[], options: ArrangeOptions): StickyNote[] {
  return arrangeNotes(notes, options);
}

export function arrangeNotesByCategory(notes: StickyNote[], options: ArrangeOptions): StickyNote[] {
  const lanes = [
    notes.filter((note) => inferNoteCategory(`${note.title}\n${note.content}`) === 'today'),
    notes.filter((note) => inferNoteCategory(`${note.title}\n${note.content}`) === 'waiting'),
    notes.filter((note) => inferNoteCategory(`${note.title}\n${note.content}`) === 'idea'),
  ];
  const arranged: StickyNote[] = [];
  const gap = options.gap ?? 24;
  const startX = options.startX ?? 24;
  const startY = options.startY ?? 24;
  const activeLanes = lanes.filter((laneNotes) => laneNotes.length > 0);
  if (activeLanes.length === 0) return arranged;

  const laneGap = Math.max(22, Math.min(36, gap * 1.15));
  const averageWidth = Math.round(
    notes.reduce((total, note) => total + Math.min(Math.max(MIN_NOTE_WIDTH, note.width), 300), 0) / notes.length,
  );
  const maxCompactWidth = activeLanes.length <= 2 ? 252 : 286;
  const compactLaneWidth = Math.min(Math.max(MIN_NOTE_WIDTH, averageWidth), maxCompactWidth);
  const availableLaneWidth = Math.max(
    MIN_NOTE_WIDTH,
    (options.containerWidth - startX * 2 - laneGap * (activeLanes.length - 1)) / activeLanes.length,
  );
  const laneWidth = Math.min(availableLaneWidth, compactLaneWidth);

  activeLanes.forEach((laneNotes, laneIndex) => {
    const laneX = startX + laneIndex * (laneWidth + laneGap);
    let cursorY = startY;

    laneNotes.forEach((note) => {
      const width = Math.min(Math.max(MIN_NOTE_WIDTH, note.width), Math.max(MIN_NOTE_WIDTH, laneWidth));
      const height = normalizeNoteHeight(note.height);
      arranged.push({
        ...note,
        x: laneX,
        y: cursorY,
        width,
        height,
        rotation: clampRotation(note.rotation),
      });
      cursorY += height + gap;
    });
  });

  return arranged;
}

export function compactSparseColumns(notes: StickyNote[], options: CompactSparseOptions = {}): StickyNote[] {
  if (notes.length <= 1) return notes;
  const gap = options.gap ?? 24;
  const startY = options.startY ?? 24;
  const maxGap = options.maxGap ?? 72;
  const columnTolerance = options.columnTolerance ?? 96;
  const columns: StickyNote[][] = [];

  for (const note of [...notes].sort((a, b) => a.x - b.x || a.y - b.y)) {
    const column = columns.find((items) => Math.abs(items[0].x - note.x) <= columnTolerance);
    if (column) column.push(note);
    else columns.push([note]);
  }

  let changed = false;
  const compactedById = new Map<number, StickyNote>();

  for (const column of columns) {
    column.sort((a, b) => a.y - b.y);
    let cursorY = Math.min(column[0].y, startY);
    for (let index = 0; index < column.length; index += 1) {
      const note = column[index];
      const nextY = index === 0 ? cursorY : Math.min(note.y, cursorY);
      const sparseGap = note.y - nextY;
      const y = sparseGap > maxGap ? nextY : note.y;
      if (Math.abs(y - note.y) > 0.1) changed = true;
      compactedById.set(note.id, { ...note, y });
      cursorY = y + normalizeNoteHeight(note.height) + gap;
    }
  }

  return changed ? notes.map((note) => compactedById.get(note.id) ?? note) : notes;
}

export function toLayoutPatch(note: StickyNote): LayoutPatch {
  return {
    id: note.id,
    x: note.x,
    y: note.y,
    width: Math.max(MIN_NOTE_WIDTH, note.width),
    height: normalizeNoteHeight(note.height),
    rotation: clampRotation(note.rotation),
  };
}

export function resizeNote(note: StickyNote, delta: Point): StickyNote {
  return {
    ...note,
    width: Math.max(MIN_NOTE_WIDTH, note.width + delta.x),
    height: Math.max(MIN_NOTE_HEIGHT, note.height + delta.y),
  };
}

export function nextPaperRotation(seed: number): number {
  const normalized = Math.sin(seed * 999) * 8;
  return Number(clampRotation(normalized).toFixed(2));
}

function snapAxis(value: number, gridSize: number, threshold: number): number {
  const snapped = Math.round(value / gridSize) * gridSize;
  return Math.abs(snapped - value) <= threshold ? snapped : value;
}
