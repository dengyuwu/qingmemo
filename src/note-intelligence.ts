export type NoteCategory = 'today' | 'waiting' | 'idea';

const TODAY_WORDS = ['今天', '今日', '马上', '现在', '立刻', '今晚', '上午', '下午', '待办', '修复', '发布', '处理'];
const WAITING_WORDS = ['等待', '等 ', '待确认', '确认', '跟进', '反馈', '回复', '审批', 'pending'];
const IDEA_WORDS = ['灵感', '想法', '创意', '也许', '可以', '方案', '脑洞', 'idea'];

export function inferNoteCategory(content: string): NoteCategory {
  const text = content.toLowerCase();
  if (TODAY_WORDS.some((word) => text.includes(word.toLowerCase()))) return 'today';
  if (WAITING_WORDS.some((word) => text.includes(word.toLowerCase()))) return 'waiting';
  if (IDEA_WORDS.some((word) => text.includes(word.toLowerCase()))) return 'idea';
  return 'idea';
}

export function inferReminderDateTimeLocal(content: string, base = new Date()): string {
  const text = content.trim();
  const relativeMinutes = parseRelativeMinutes(text);
  if (relativeMinutes !== null) {
    return toDateTimeLocal(addMinutes(base, relativeMinutes));
  }

  const dayOffset = text.includes('后天') ? 2 : text.includes('明天') ? 1 : 0;
  const time = parseClockTime(text);
  if (time) {
    const due = new Date(base);
    due.setDate(base.getDate() + dayOffset);
    due.setHours(time.hour, time.minute, 0, 0);
    if (dayOffset === 0 && due.getTime() <= base.getTime()) {
      due.setDate(due.getDate() + 1);
    }
    return toDateTimeLocal(due);
  }

  const defaultDue = new Date(base);
  defaultDue.setMinutes(defaultDue.getMinutes() + 30, 0, 0);
  return toDateTimeLocal(defaultDue);
}

export function describeAttachment(path: string, context = ''): string {
  const normalized = path.replace(/\\/g, '/');
  const name = normalized.split('/').filter(Boolean).pop() ?? normalized;
  const lower = name.toLowerCase();
  const contextHint = context.trim() ? `，关联「${context.trim().slice(0, 12)}」` : '';

  if (/\.(png|jpe?g|gif|webp|svg|psd|fig)$/i.test(lower)) return `图片/设计素材${contextHint}`;
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|md)$/i.test(lower)) return `文档资料${contextHint}`;
  if (/\.(zip|rar|7z|tar|gz)$/i.test(lower)) return `压缩包/归档文件${contextHint}`;
  if (/\.(exe|msi|bat|ps1|cmd)$/i.test(lower)) return `可执行/脚本文件${contextHint}`;
  if (/\.(mp4|mov|avi|mp3|wav)$/i.test(lower)) return `媒体素材${contextHint}`;
  return `关联文件${contextHint}`;
}

function parseRelativeMinutes(text: string): number | null {
  if (text.includes('半小时后') || text.includes('半个小时后')) return 30;
  const minuteMatch = text.match(/(\d+)\s*(分钟|分)\s*后/);
  if (minuteMatch) return Number(minuteMatch[1]);
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(小时|个小时)\s*后/);
  if (hourMatch) return Math.round(Number(hourMatch[1]) * 60);
  return null;
}

function parseClockTime(text: string): { hour: number; minute: number } | null {
  const match = text.match(/(凌晨|早上|上午|中午|下午|晚上|今晚)?\s*(\d{1,2})(?:[:：点](\d{1,2})?)?/);
  if (!match) return null;

  let hour = Number(match[2]);
  const minute = match[3] ? Number(match[3]) : 0;
  const period = match[1] ?? '';
  if (['下午', '晚上', '今晚'].includes(period) && hour < 12) hour += 12;
  if (period === '中午' && hour < 11) hour += 12;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function toDateTimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
