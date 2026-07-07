import { describe, expect, it } from 'vitest';
import { getInsightDialogActions } from './insight-actions';

describe('AI insight dialog actions', () => {
  it('keeps insight results read-only by default', () => {
    expect(getInsightDialogActions()).toEqual([
      { key: 'close', label: '知道了', tone: 'primary' },
      { key: 'copy', label: '复制内容', tone: 'secondary' },
    ]);
  });

  it('prioritizes contextual executable actions before passive actions', () => {
    expect(getInsightDialogActions({ canAppendToNote: true, canCreateReminder: true })).toEqual([
      { key: 'append-note', label: '追加到便签', tone: 'primary' },
      { key: 'create-reminder', label: '转提醒', tone: 'primary' },
      { key: 'copy', label: '复制内容', tone: 'secondary' },
      { key: 'close', label: '知道了', tone: 'secondary' },
    ]);
  });
});