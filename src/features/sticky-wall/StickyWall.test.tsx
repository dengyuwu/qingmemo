import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StickyWall } from './StickyWall';
import type { StickyNote } from './types';

const note: StickyNote = {
  id: 1,
  title: 'Bug 记录',
  content: '跟进调色 APP 的 BUG 问题',
  color: 'sky',
  tags: ['轻备忘'],
  priority: 'normal',
  pinned: false,
  archived: false,
  attachments: [],
  x: 24,
  y: 24,
  width: 220,
  height: 236,
  rotation: 0,
  createdAt: '2026-07-07T08:00:00.000Z',
  updatedAt: '2026-07-07T08:00:00.000Z',
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
});

function renderStickyWall(notes: StickyNote[] = [note], overrides: Partial<Parameters<typeof StickyWall>[0]> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <StickyWall
        notes={notes}
        selectedIds={new Set()}
        onNotesChange={vi.fn()}
        onSelectionChange={vi.fn()}
        onEditNote={vi.fn()}
        onArchiveNote={vi.fn()}
        onConvertToReminder={vi.fn()}
        onTogglePriority={vi.fn()}
        onOpenAttachment={vi.fn()}
        onPersistLayouts={vi.fn().mockResolvedValue(undefined)}
        {...overrides}
      />,
    );
  });

  return container;
}

describe('StickyWall', () => {
  it('does not render the resize handle so bottom-right note actions stay clickable', () => {
    const view = renderStickyWall();

    expect(view.querySelector('[aria-label="拖动调整卡片大小"]')).toBeNull();
    expect(view.querySelector('[title="拖动调整卡片大小"]')).toBeNull();
  });

  it('keeps note action pointer events away from the draggable card layer', () => {
    const view = renderStickyWall([note], { onAskAiNextStep: vi.fn() });
    const archiveButton = view.querySelector('[aria-label="归档便签"]');
    const bubbledPointerDown = vi.fn();
    const bubbledMouseDown = vi.fn();
    view.addEventListener('pointerdown', bubbledPointerDown);
    view.addEventListener('mousedown', bubbledMouseDown);

    archiveButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    archiveButton?.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));

    expect(archiveButton).not.toBeNull();
    expect(bubbledPointerDown).not.toHaveBeenCalled();
    expect(bubbledMouseDown).not.toHaveBeenCalled();
  });


  it('captures wheel zoom inside the canvas without bubbling to the page', () => {
    const onCanvasStateChange = vi.fn();
    const outerWheel = vi.fn();
    const view = renderStickyWall([note], {
      canvasState: { zoom: 1, panX: 0, panY: 0, snapToGrid: true, arrangeMode: 'battlefield' },
      onCanvasStateChange,
    });
    const viewport = view.querySelector('[data-testid="sticky-wall-canvas-viewport"]');
    document.body.addEventListener('wheel', outerWheel);

    const wheel = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
    act(() => {
      viewport?.dispatchEvent(wheel);
    });
    document.body.removeEventListener('wheel', outerWheel);

    expect(viewport).not.toBeNull();
    expect(wheel.defaultPrevented).toBe(true);
    expect(outerWheel).not.toHaveBeenCalled();
    expect(onCanvasStateChange).toHaveBeenCalledWith({ zoom: 0.92 });
  });
  it('shows daily queue completion state on the matching note card', () => {
    const view = renderStickyWall([note], { dailyQueueNoteStatuses: { [note.id]: 'done' } });

    expect(view.textContent).toContain('已完成');
    expect(view.textContent).not.toContain('跟进中');
    expect(view.textContent).not.toContain('修复中');
  });
  it('archives from the bottom-right action button without selecting the card', () => {
    const onArchiveNote = vi.fn();
    const onSelectionChange = vi.fn();
    const view = renderStickyWall([note], { onArchiveNote, onSelectionChange });
    const archiveButton = view.querySelector('[aria-label="归档便签"]');

    act(() => {
      archiveButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });

    expect(archiveButton).not.toBeNull();
    expect(onArchiveNote).toHaveBeenCalledWith(note.id);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});
