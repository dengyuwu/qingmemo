import type { AchievementId } from '../features/progress/progress-model';

export type DailyQuestPromptInput = {
  level: number;
  streak: number;
  delayDebt: number;
  focusScore: number;
  noteTitles: string[];
};

export type NarrativeReviewPromptInput = {
  level: number;
  xp: number;
  focusScore: number;
  delayDebt: number;
  completed: number;
  capturedIdeas: number;
  cleanliness: number;
  tomorrowHint: string;
};

export type ProgressAwarePromptContext = {
  level: number;
  achievements: AchievementId[];
};

export function buildDailyQuestPrompt(input: DailyQuestPromptInput): string {
  return [
    '你是轻备忘的 AI Commander，请为用户生成 3 个每日作战任务。',
    '只输出 JSON，格式为：[{"title":"","description":"","type":"push-note|clean-wall|complete-priority|no-skip|review|risk-clear","xpReward":12}]。',
    '不要输出 Markdown，不要解释 JSON，不要生成额外字段。',
    '每个任务都必须服务于真实推进：要么减少拖延债，要么推进今日队列，要么提升墙面清晰度。',
    '任务必须具体、轻量、今天能完成，不要生成删除数据或自动归档指令。',
    `指挥官等级：${input.level}`,
    `连续作战：${input.streak} 天`,
    `拖延债：${input.delayDebt}`,
    `Focus Score：${input.focusScore}`,
    `候选便签：${input.noteTitles.slice(0, 8).join('、') || '暂无'}`,
  ].join('\n');
}

export function buildNarrativeReviewPrompt(input: NarrativeReviewPromptInput): string {
  return [
    '请生成一段轻松爽感的中文「战役战报」，不要超过 140 字。',
    '风格：像桌面 AI 作战秘书，带一点傲娇，鼓励用户明天继续打开应用。',
    '必须包含：击败了多少拖延怪、俘获多少灵感、战场肃清度、明日第一步。',
    '不要空泛鸡汤，不要夸张玄学；每一句都要让用户知道今天哪里更有效率。',
    `指挥官等级：${input.level}`,
    `总 XP：${input.xp}`,
    `Focus Score：${input.focusScore}`,
    `拖延怪：${input.delayDebt}`,
    `完成推进：${input.completed}`,
    `俘获灵感：${input.capturedIdeas}`,
    `战场肃清度：${input.cleanliness}%`,
    `明日建议：${input.tomorrowHint}`,
  ].join('\n');
}

export function buildProgressAwareAiPrompt(mode: 'nextStep' | 'organize' | 'summary', content: string, context: ProgressAwarePromptContext): string {
  const modeCopy = {
    nextStep: '请给出 1 到 3 条下一步行动建议，每条都要能立刻执行。',
    organize: '请把内容归类为今天做、等待中、灵感，并标出最值得推进的一条。',
    summary: '请生成今日战况总览，强调胜利、风险和下一步。',
  }[mode];

  return [
    modeCopy,
    `当前指挥官等级：${context.level}`,
    `已解锁成就：${context.achievements.length ? context.achievements.join('、') : '暂无'}`,
    '输出中文短句，带一点作战桌氛围，但不要牺牲清晰度。',
    '输出必须能被用户直接执行：包含动作、对象和完成标准，避免泛泛鼓励。',
    '内容：',
    content.trim() || '暂无内容',
  ].join('\n');
}
