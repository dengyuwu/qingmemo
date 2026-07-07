export type InsightDialogAction = {
  key: 'close' | 'copy' | 'append-note' | 'create-reminder' | 'archive-note';
  label: string;
  tone: 'primary' | 'secondary';
};

export type InsightDialogActionOptions = {
  canAppendToNote?: boolean;
  canCreateReminder?: boolean;
  canArchiveNote?: boolean;
};

export function getInsightDialogActions(options: InsightDialogActionOptions = {}): InsightDialogAction[] {
  const actions: InsightDialogAction[] = [
    { key: 'close', label: '知道了', tone: 'primary' },
    options.canArchiveNote ? { key: 'archive-note', label: '归档', tone: 'secondary' } : { key: 'copy', label: '复制内容', tone: 'secondary' },
  ];

  if (options.canAppendToNote) actions.push({ key: 'append-note', label: '追加到便签', tone: 'secondary' });
  if (options.canCreateReminder) actions.push({ key: 'create-reminder', label: '转提醒', tone: 'secondary' });
  return actions;
}