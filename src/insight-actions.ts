export type InsightDialogAction = {
  key: 'close' | 'copy' | 'append-note' | 'create-reminder';
  label: string;
  tone: 'primary' | 'secondary';
};

export type InsightDialogActionOptions = {
  canAppendToNote?: boolean;
  canCreateReminder?: boolean;
};

export function getInsightDialogActions(options: InsightDialogActionOptions = {}): InsightDialogAction[] {
  if (!options.canAppendToNote && !options.canCreateReminder) {
    return [
      { key: 'close', label: '知道了', tone: 'primary' },
      { key: 'copy', label: '复制内容', tone: 'secondary' },
    ];
  }

  const actions: InsightDialogAction[] = [];
  if (options.canAppendToNote) actions.push({ key: 'append-note', label: '追加到便签', tone: 'primary' });
  if (options.canCreateReminder) actions.push({ key: 'create-reminder', label: '转提醒', tone: 'primary' });
  actions.push({ key: 'copy', label: '复制内容', tone: 'secondary' });
  actions.push({ key: 'close', label: '知道了', tone: 'secondary' });
  return actions;
}