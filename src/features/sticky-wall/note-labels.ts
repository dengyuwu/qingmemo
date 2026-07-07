import type { NoteCategory } from '../../note-intelligence';
import type { StickyNote } from './types';

export function categoryLabel(category: NoteCategory): string {
  if (category === 'today') return '行动项';
  if (category === 'waiting') return '等反馈';
  return '灵感';
}

export function categoryHelp(category: NoteCategory): string {
  if (category === 'today') return '行动项：内容像是需要推进、处理或修复的事项，不代表必须今天完成';
  if (category === 'waiting') return '等反馈：内容像是在等待确认、回复、反馈或审批';
  return '灵感：内容更像想法、资料或随手记录';
}

export function noteMood(note: StickyNote): string {
  const source = `${note.title}\n${note.content}`;
  if (note.priority === 'high') return '紧急';
  if (/卡住|阻塞|无法|不能|报错|故障|失败|不可用|打不开/i.test(source)) return '受阻';
  if (/等待|确认|回复|审批|反馈/.test(source)) return '等反馈';
  if (/客户|跟进/.test(source)) return '跟进中';
  if (/完成|已做|done/i.test(source)) return '快收尾';
  if (/bug|缺陷|修复|问题/i.test(source)) return '修复中';
  return '进行中';
}

export function noteMoodHelp(note: StickyNote): string {
  const mood = noteMood(note);
  if (mood === '紧急') return '紧急：这张便签被标记为高优先级';
  if (mood === '受阻') return '受阻：内容明确出现卡住、阻塞、无法、报错、故障或失败';
  if (mood === '等反馈') return '等反馈：内容像是在等待确认、回复、反馈或审批';
  if (mood === '跟进中') return '跟进中：内容像是客户或事项跟进';
  if (mood === '快收尾') return '快收尾：内容像是已经完成或接近完成';
  if (mood === '修复中') return '修复中：内容像是修复或问题处理，不代表已经受阻';
  return '进行中：暂时没有特殊状态';
}
