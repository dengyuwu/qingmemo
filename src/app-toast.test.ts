import { describe, expect, it } from 'vitest';

import { shouldAutoDismissToast, shouldClearUndoOnToastDismiss } from './App';

describe('toast lifecycle', () => {
  it('keeps undo-only success toast eligible for auto-dismiss', () => {
    expect(shouldAutoDismissToast(null, '便签已归档', true)).toBe(true);
    expect(shouldAutoDismissToast(null, null, true)).toBe(true);
    expect(shouldAutoDismissToast('归档失败', '便签已归档', true)).toBe(false);
  });

  it('clears undo action when dismissing a non-error toast', () => {
    expect(shouldClearUndoOnToastDismiss(null)).toBe(true);
    expect(shouldClearUndoOnToastDismiss('归档失败')).toBe(false);
  });
});
