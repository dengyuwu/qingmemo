import { describe, expect, it } from 'vitest';
import { getInsightDialogActions } from './insight-actions';

describe('AI insight dialog actions', () => {
  it('keeps insight results read-only by default', () => {
    expect(getInsightDialogActions()).toEqual([
      { key: 'close', label: '知道了', tone: 'primary' },
      { key: 'copy', label: '复制内容', tone: 'secondary' },
    ]);
  });

  it('keeps passive controls stable while exposing contextual actions', () => {
    expect(getInsightDialogActions({ canAppendToNote: true, canCreateReminder: true })).toEqual([
      { key: 'close', label: '知道了', tone: 'primary' },
      { key: 'copy', label: '复制内容', tone: 'secondary' },
      { key: 'append-note', label: '追加到便签', tone: 'secondary' },
      { key: 'create-reminder', label: '转提醒', tone: 'secondary' },
    ]);
  });

  it('replaces passive copy with archive when an insight is bound to notes', () => {
    expect(getInsightDialogActions({ canAppendToNote: true, canCreateReminder: true, canArchiveNote: true })).toEqual([
      { key: 'close', label: '知道了', tone: 'primary' },
      { key: 'archive-note', label: '归档', tone: 'secondary' },
      { key: 'append-note', label: '追加到便签', tone: 'secondary' },
      { key: 'create-reminder', label: '转提醒', tone: 'secondary' },
    ]);
  });
});