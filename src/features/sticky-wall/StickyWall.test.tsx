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
    view.addEventListener('pointerdown', bubbledPointerDown);

    archiveButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(archiveButton).not.toBeNull();
    expect(bubbledPointerDown).not.toHaveBeenCalled();
  });
});