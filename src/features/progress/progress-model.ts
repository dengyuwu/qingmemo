export type AchievementId =
  | 'streak_7'
  | 'zero_debt'
  | 'inspiration_hunter'
  | 'wall_cleaner'
  | 'perfect_battle'
  | 'bug_hunter'
  | 'ai_commander'
  | 'relation_master'
  | 'streak_30'
  | 'energy_master'
  | 'no_procrastination_week'
  | 'first_victory';

export type ThemeId = 'clean' | 'battlefield' | 'cyberpunk' | 'minimal';
export type NoteSkinId = 'default' | 'tactical' | 'neon' | 'glitch';

export type DailyQuestType = 'push-note' | 'clean-wall' | 'complete-priority' | 'no-skip' | 'review' | 'risk-clear';

export type DailyQuest = {
  id: string;
  type: DailyQuestType;
  title: string;
  description: string;
  xpReward: number;
  target: number;
  progress: number;
  completed: boolean;
  relatedNoteId?: number;
};

export type ProgressCounters = {
  dailyQueueDone: number;
  dailyQueueSkipped: number;
  wallArchivedTotal: number;
  maxWallArchiveBatch: number;
  aiCommanderUses: number;
  relationViews: number;
  bugNotesFixed: number;
  conversions: number;
  aiReviews: number;
  wallArranges: number;
  riskResolved: number;
  highEnergyStreak: number;
  zeroDebtStreak: number;
  noSkipQueueDays: number;
};

export type BattleCanvasState = {
  zoom: number;
  panX: number;
  panY: number;
  snapToGrid: boolean;
  arrangeMode: 'battlefield' | 'priority' | 'cluster';
};

export type ProgressSettings = {
  gamificationEnabled: boolean;
  selectedTheme: ThemeId;
  selectedSkin: NoteSkinId;
  reducedCelebrations: boolean;
};

export interface UserProgress {
  level: number;
  xp: number;
  streak: number;
  lastActiveDate: string;
  achievements: AchievementId[];
  unlockedSkins: NoteSkinId[];
  unlockedThemes: ThemeId[];
  dailyQuests: DailyQuest[];
  lastQuestDate: string;
  counters: ProgressCounters;
  canvas: BattleCanvasState;
  settings: ProgressSettings;
  onboardingSeen: boolean;
}

export type BattleContext = {
  today: string;
  focusScore: number;
  delayDebt: number;
  dailyQueueTotal: number;
  dailyQueueDone: number;
  dailyQueueSkipped: number;
  notesCreatedToday: number;
  archivedCount: number;
  bugFixedCount: number;
};

export type ProgressEvent =
  | { type: 'daily_queue_done' }
  | { type: 'daily_queue_skipped' }
  | { type: 'wall_cleaned'; count: number }
  | { type: 'ai_review_completed' }
  | { type: 'wall_arranged' }
  | { type: 'converted_item' }
  | { type: 'risk_resolved' }
  | { type: 'ai_commander_used' }
  | { type: 'relation_viewed' }
  | { type: 'note_created'; count?: number }
  | { type: 'bug_note_fixed'; count?: number };

export type ProgressCelebration = {
  xpGained: number;
  levelUp: boolean;
  unlockedAchievements: Achievement[];
  unlockedSkins: NoteSkinId[];
  unlockedThemes: ThemeId[];
  message: string;
};

export type ProgressApplyResult = {
  progress: UserProgress;
  celebration: ProgressCelebration;
};

export type Achievement = {
  id: AchievementId;
  name: string;
  description: string;
  icon: string;
  hidden?: boolean;
  target: number;
  getValue: (progress: UserProgress, context: BattleContext) => number;
};

export type AchievementCard = Achievement & {
  unlocked: boolean;
  value: number;
  progress: number;
};

export const XP_PER_LEVEL = 100;

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'streak_7',
    name: '七日作战节奏',
    description: '连续作战 7 天。',
    icon: '🔥',
    target: 7,
    getValue: (progress) => progress.streak,
  },
  {
    id: 'zero_debt',
    name: '零拖延债',
    description: '单日拖延债归零。',
    icon: '◎',
    target: 1,
    getValue: (_, context) => (context.delayDebt === 0 ? 1 : 0),
  },
  {
    id: 'inspiration_hunter',
    name: '灵感猎手',
    description: '单日新增灵感不少于 8 条。',
    icon: '✦',
    target: 8,
    getValue: (_, context) => context.notesCreatedToday,
  },
  {
    id: 'wall_cleaner',
    name: '战场清道夫',
    description: '单次清墙面归档不少于 15 张便签。',
    icon: '⌫',
    target: 15,
    getValue: (progress, context) => Math.max(progress.counters.maxWallArchiveBatch, context.archivedCount),
  },
  {
    id: 'perfect_battle',
    name: '完美战役',
    description: '今日队列全部完成且没有跳过。',
    icon: '🏆',
    target: 1,
    getValue: (_, context) => (context.dailyQueueTotal > 0 && context.dailyQueueDone >= context.dailyQueueTotal && context.dailyQueueSkipped === 0 ? 1 : 0),
  },
  {
    id: 'bug_hunter',
    name: 'Bug 猎人',
    description: '累计标记并修复 10 个 Bug 类便签。',
    icon: '⚑',
    target: 10,
    getValue: (progress, context) => Math.max(progress.counters.bugNotesFixed, context.bugFixedCount),
  },
  {
    id: 'ai_commander',
    name: 'AI 指挥官',
    description: '累计使用 AI 指挥官功能 20 次。',
    icon: '◇',
    target: 20,
    getValue: (progress) => progress.counters.aiCommanderUses,
  },
  {
    id: 'relation_master',
    name: '关系网大师',
    description: '在关系网模式下查看连接不少于 5 次。',
    icon: '⌘',
    target: 5,
    getValue: (progress) => progress.counters.relationViews,
  },
  {
    id: 'streak_30',
    name: '三十日远征',
    description: '连续作战 30 天。',
    icon: '♛',
    hidden: true,
    target: 30,
    getValue: (progress) => progress.streak,
  },
  {
    id: 'energy_master',
    name: '能量支配者',
    description: 'Focus Score 连续 7 天不低于 85。',
    icon: '⚡',
    target: 7,
    getValue: (progress) => progress.counters.highEnergyStreak,
  },
  {
    id: 'no_procrastination_week',
    name: '无拖延周',
    description: '一周内拖延债总和为 0。',
    icon: '☀',
    target: 7,
    getValue: (progress) => progress.counters.zeroDebtStreak,
  },
  {
    id: 'first_victory',
    name: '第一场胜利',
    description: '完成第一个今日队列任务。',
    icon: '✓',
    target: 1,
    getValue: (progress) => progress.counters.dailyQueueDone,
  },
];

const DEFAULT_COUNTERS: ProgressCounters = {
  dailyQueueDone: 0,
  dailyQueueSkipped: 0,
  wallArchivedTotal: 0,
  maxWallArchiveBatch: 0,
  aiCommanderUses: 0,
  relationViews: 0,
  bugNotesFixed: 0,
  conversions: 0,
  aiReviews: 0,
  wallArranges: 0,
  riskResolved: 0,
  highEnergyStreak: 0,
  zeroDebtStreak: 0,
  noSkipQueueDays: 0,
};

const DEFAULT_CANVAS: BattleCanvasState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  snapToGrid: true,
  arrangeMode: 'battlefield',
};

const DEFAULT_SETTINGS: ProgressSettings = {
  gamificationEnabled: true,
  selectedTheme: 'clean',
  selectedSkin: 'default',
  reducedCelebrations: false,
};

export function createDefaultProgress(today = todayKey()): UserProgress {
  return {
    level: 1,
    xp: 0,
    streak: 1,
    lastActiveDate: today,
    achievements: [],
    unlockedSkins: ['default'],
    unlockedThemes: ['clean'],
    dailyQuests: [],
    lastQuestDate: '',
    counters: { ...DEFAULT_COUNTERS },
    canvas: { ...DEFAULT_CANVAS },
    settings: { ...DEFAULT_SETTINGS },
    onboardingSeen: false,
  };
}

export function normalizeProgress(value: unknown, today = todayKey()): UserProgress {
  const raw = isObject(value) ? value : {};
  const defaults = createDefaultProgress(today);
  const xp = safeNumber(raw.xp, defaults.xp);
  const merged: UserProgress = {
    ...defaults,
    ...raw,
    xp,
    level: Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1),
    streak: Math.max(1, safeNumber(raw.streak, defaults.streak)),
    lastActiveDate: typeof raw.lastActiveDate === 'string' && raw.lastActiveDate ? raw.lastActiveDate : today,
    achievements: uniqueAchievementIds(raw.achievements),
    unlockedSkins: uniqueSkins([...(Array.isArray(raw.unlockedSkins) ? raw.unlockedSkins : []), 'default']),
    unlockedThemes: uniqueThemes([...(Array.isArray(raw.unlockedThemes) ? raw.unlockedThemes : []), 'clean']),
    dailyQuests: normalizeDailyQuests(raw.dailyQuests),
    lastQuestDate: typeof raw.lastQuestDate === 'string' ? raw.lastQuestDate : '',
    counters: { ...DEFAULT_COUNTERS, ...(isObject(raw.counters) ? raw.counters : {}) },
    canvas: { ...DEFAULT_CANVAS, ...(isObject(raw.canvas) ? raw.canvas : {}) },
    settings: { ...DEFAULT_SETTINGS, ...(isObject(raw.settings) ? raw.settings : {}) },
    onboardingSeen: Boolean(raw.onboardingSeen),
  };
  merged.canvas.zoom = clamp(merged.canvas.zoom, 0.5, 3);
  return merged;
}

export function touchBattleDay(progress: UserProgress, context: BattleContext): UserProgress {
  const normalized = normalizeProgress(progress, context.today);
  if (normalized.lastActiveDate === context.today) return updateDailyStreakCounters(normalized, context);

  const previous = new Date(`${normalized.lastActiveDate}T00:00:00`);
  const current = new Date(`${context.today}T00:00:00`);
  const oneDay = 24 * 60 * 60 * 1000;
  const streak = Number.isFinite(previous.getTime()) && current.getTime() - previous.getTime() === oneDay ? normalized.streak + 1 : 1;
  return updateDailyStreakCounters({ ...normalized, streak, lastActiveDate: context.today }, context);
}

export function applyProgressEvent(input: UserProgress, event: ProgressEvent, context: BattleContext): ProgressApplyResult {
  const before = touchBattleDay(input, context);
  if (!before.settings.gamificationEnabled) {
    return { progress: before, celebration: emptyCelebration('游戏化已关闭') };
  }

  const progress = cloneProgress(before);
  const xpGained = eventXp(event);
  progress.xp += xpGained;
  applyCounters(progress, event);

  const previousLevel = before.level;
  progress.level = Math.max(1, Math.floor(progress.xp / XP_PER_LEVEL) + 1);
  const unlockedThemes = mergeRewards(progress.unlockedThemes, themeUnlocksForLevel(progress.level));
  const unlockedSkins = mergeRewards(progress.unlockedSkins, skinUnlocksForLevel(progress.level));
  const newlyUnlockedThemes = unlockedThemes.filter((theme) => !progress.unlockedThemes.includes(theme));
  const newlyUnlockedSkins = unlockedSkins.filter((skin) => !progress.unlockedSkins.includes(skin));
  progress.unlockedThemes = unlockedThemes;
  progress.unlockedSkins = unlockedSkins;

  const unlockedAchievements = checkAchievements(progress, context);
  if (unlockedAchievements.length > 0) {
    progress.achievements = uniqueAchievementIds([...progress.achievements, ...unlockedAchievements.map((achievement) => achievement.id)]);
  }

  return {
    progress,
    celebration: {
      xpGained,
      levelUp: progress.level > previousLevel,
      unlockedAchievements,
      unlockedSkins: newlyUnlockedSkins,
      unlockedThemes: newlyUnlockedThemes,
      message: celebrationMessage(event, xpGained, progress.level > previousLevel),
    },
  };
}

export function getLevelProgress(progress: UserProgress) {
  const current = progress.xp % XP_PER_LEVEL;
  return {
    level: progress.level,
    current,
    required: XP_PER_LEVEL,
    percent: Math.round((current / XP_PER_LEVEL) * 100),
  };
}

export function buildAchievementCards(progress: UserProgress, context: BattleContext): AchievementCard[] {
  return ACHIEVEMENTS.map((achievement) => {
    const value = Math.min(achievement.target, Math.max(0, achievement.getValue(progress, context)));
    const unlocked = progress.achievements.includes(achievement.id) || value >= achievement.target;
    return {
      ...achievement,
      value,
      unlocked,
      progress: Math.round((value / achievement.target) * 100),
    };
  });
}

export function generateDailyQuests(progress: UserProgress, context: BattleContext): DailyQuest[] {
  const seed = Math.abs(hash(`${context.today}-${progress.level}-${context.delayDebt}-${context.focusScore}`));
  const pool: DailyQuest[] = [
    {
      id: `${context.today}-queue-victory`,
      type: 'no-skip',
      title: '今日队列夺旗',
      description: context.dailyQueueTotal > 0 ? `完成 ${Math.max(1, context.dailyQueueTotal)} 个今日队列任务，尽量别跳过。` : '先写一张便签，再推进它。',
      xpReward: 18,
      target: Math.max(1, context.dailyQueueTotal),
      progress: Math.min(context.dailyQueueDone, Math.max(1, context.dailyQueueTotal)),
      completed: context.dailyQueueTotal > 0 && context.dailyQueueDone >= context.dailyQueueTotal && context.dailyQueueSkipped === 0,
    },
    {
      id: `${context.today}-zero-debt`,
      type: 'risk-clear',
      title: '拖延债清零',
      description: context.delayDebt > 0 ? `把拖延债从 ${context.delayDebt} 压到 0。` : '保持今天没有拖延债。',
      xpReward: 16,
      target: 1,
      progress: context.delayDebt === 0 ? 1 : 0,
      completed: context.delayDebt === 0,
    },
    {
      id: `${context.today}-wall-clean`,
      type: 'clean-wall',
      title: '战场清扫',
      description: '归档或整理至少 3 张失焦便签。',
      xpReward: 14,
      target: 3,
      progress: Math.min(context.archivedCount, 3),
      completed: context.archivedCount >= 3,
    },
    {
      id: `${context.today}-priority`,
      type: 'complete-priority',
      title: '重点突破',
      description: '推进 1 个高优先级事项。',
      xpReward: 12,
      target: 1,
      progress: context.dailyQueueDone > 0 ? 1 : 0,
      completed: context.dailyQueueDone > 0,
    },
    {
      id: `${context.today}-review`,
      type: 'review',
      title: '战后复盘',
      description: '生成一次今日复盘，把胜利记下来。',
      xpReward: 15,
      target: 1,
      progress: progress.counters.aiReviews > 0 ? 1 : 0,
      completed: progress.counters.aiReviews > 0,
    },
  ];

  return [pool[seed % pool.length], pool[(seed + 2) % pool.length], pool[(seed + 4) % pool.length]]
    .filter((quest, index, list) => list.findIndex((item) => item.id === quest.id) === index)
    .concat(pool.filter((quest) => ![pool[seed % pool.length], pool[(seed + 2) % pool.length], pool[(seed + 4) % pool.length]].some((item) => item.id === quest.id)))
    .slice(0, 3)
    .map((quest) => ({ ...quest }));
}

export function ensureDailyQuests(progress: UserProgress, context: BattleContext): UserProgress {
  const normalized = normalizeProgress(progress, context.today);
  if (normalized.lastQuestDate === context.today && normalized.dailyQuests.length === 3) return normalized;
  return {
    ...normalized,
    lastQuestDate: context.today,
    dailyQuests: generateDailyQuests(normalized, context),
  };
}

export function markDailyQuestComplete(input: UserProgress, questId: string, context: BattleContext): ProgressApplyResult {
  const progress = ensureDailyQuests(input, context);
  const quest = progress.dailyQuests.find((item) => item.id === questId);
  if (!quest || quest.completed) return { progress, celebration: emptyCelebration('任务已经结算') };

  const next = cloneProgress(progress);
  next.dailyQuests = next.dailyQuests.map((item) => (item.id === questId ? { ...item, completed: true, progress: item.target } : item));
  next.xp += quest.xpReward;
  next.level = Math.max(1, Math.floor(next.xp / XP_PER_LEVEL) + 1);
  const unlockedAchievements = checkAchievements(next, context);
  next.achievements = uniqueAchievementIds([...next.achievements, ...unlockedAchievements.map((achievement) => achievement.id)]);

  return {
    progress: next,
    celebration: {
      xpGained: quest.xpReward,
      levelUp: next.level > progress.level,
      unlockedAchievements,
      unlockedSkins: [],
      unlockedThemes: [],
      message: `每日任务完成：+${quest.xpReward} XP`,
    },
  };
}

export function updateCanvasState(progress: UserProgress, patch: Partial<BattleCanvasState>): UserProgress {
  return {
    ...progress,
    canvas: {
      ...progress.canvas,
      ...patch,
      zoom: clamp(patch.zoom ?? progress.canvas.zoom, 0.5, 3),
    },
  };
}

export function todayKey(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function eventXp(event: ProgressEvent): number {
  if (event.type === 'daily_queue_done') return 20;
  if (event.type === 'daily_queue_skipped') return 5;
  if (event.type === 'wall_cleaned') return Math.min(80, Math.max(0, event.count) * 8);
  if (event.type === 'ai_review_completed') return 15;
  if (event.type === 'wall_arranged') return 10;
  if (event.type === 'converted_item') return 5;
  if (event.type === 'risk_resolved') return 10;
  return 0;
}

function applyCounters(progress: UserProgress, event: ProgressEvent) {
  if (event.type === 'daily_queue_done') progress.counters.dailyQueueDone += 1;
  if (event.type === 'daily_queue_skipped') progress.counters.dailyQueueSkipped += 1;
  if (event.type === 'wall_cleaned') {
    const count = Math.max(0, event.count);
    progress.counters.wallArchivedTotal += count;
    progress.counters.maxWallArchiveBatch = Math.max(progress.counters.maxWallArchiveBatch, count);
  }
  if (event.type === 'ai_review_completed') progress.counters.aiReviews += 1;
  if (event.type === 'wall_arranged') progress.counters.wallArranges += 1;
  if (event.type === 'converted_item') progress.counters.conversions += 1;
  if (event.type === 'risk_resolved') progress.counters.riskResolved += 1;
  if (event.type === 'ai_commander_used') progress.counters.aiCommanderUses += 1;
  if (event.type === 'relation_viewed') progress.counters.relationViews += 1;
  if (event.type === 'bug_note_fixed') progress.counters.bugNotesFixed += event.count ?? 1;
}

function updateDailyStreakCounters(progress: UserProgress, context: BattleContext): UserProgress {
  return {
    ...progress,
    counters: {
      ...progress.counters,
      highEnergyStreak: context.focusScore >= 85 ? Math.max(progress.counters.highEnergyStreak, 1) : 0,
      zeroDebtStreak: context.delayDebt === 0 ? Math.max(progress.counters.zeroDebtStreak, 1) : 0,
    },
  };
}

function checkAchievements(progress: UserProgress, context: BattleContext): Achievement[] {
  return ACHIEVEMENTS.filter((achievement) => {
    if (progress.achievements.includes(achievement.id)) return false;
    return achievement.getValue(progress, context) >= achievement.target;
  });
}

function themeUnlocksForLevel(level: number): ThemeId[] {
  const themes: ThemeId[] = ['clean'];
  if (level >= 2) themes.push('battlefield');
  if (level >= 4) themes.push('cyberpunk');
  if (level >= 6) themes.push('minimal');
  return themes;
}

function skinUnlocksForLevel(level: number): NoteSkinId[] {
  const skins: NoteSkinId[] = ['default'];
  if (level >= 2) skins.push('tactical');
  if (level >= 3) skins.push('neon');
  if (level >= 5) skins.push('glitch');
  return skins;
}

function mergeRewards<T extends string>(current: T[], next: T[]): T[] {
  return Array.from(new Set([...current, ...next]));
}

function celebrationMessage(event: ProgressEvent, xp: number, levelUp: boolean): string {
  if (levelUp) return `指挥官升级！+${xp} XP`;
  if (xp > 0) return `获得 +${xp} XP`;
  if (event.type === 'ai_commander_used') return 'AI 指挥记录 +1';
  if (event.type === 'relation_viewed') return '关系网侦察 +1';
  return '战况已记录';
}

function emptyCelebration(message: string): ProgressCelebration {
  return { xpGained: 0, levelUp: false, unlockedAchievements: [], unlockedSkins: [], unlockedThemes: [], message };
}

function cloneProgress(progress: UserProgress): UserProgress {
  return {
    ...progress,
    achievements: [...progress.achievements],
    unlockedSkins: [...progress.unlockedSkins],
    unlockedThemes: [...progress.unlockedThemes],
    dailyQuests: progress.dailyQuests.map((quest) => ({ ...quest })),
    counters: { ...progress.counters },
    canvas: { ...progress.canvas },
    settings: { ...progress.settings },
  };
}

function normalizeDailyQuests(value: unknown): DailyQuest[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((quest) => ({
    id: typeof quest.id === 'string' ? quest.id : hash(JSON.stringify(quest)).toString(),
    type: isQuestType(quest.type) ? quest.type : 'push-note',
    title: typeof quest.title === 'string' ? quest.title : '今日作战任务',
    description: typeof quest.description === 'string' ? quest.description : '推进一件小事。',
    xpReward: safeNumber(quest.xpReward, 12),
    target: Math.max(1, safeNumber(quest.target, 1)),
    progress: Math.max(0, safeNumber(quest.progress, 0)),
    completed: Boolean(quest.completed),
    relatedNoteId: typeof quest.relatedNoteId === 'number' ? quest.relatedNoteId : undefined,
  }));
}

function uniqueAchievementIds(value: unknown): AchievementId[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));
  return Array.from(new Set(value.filter((item): item is AchievementId => typeof item === 'string' && allowed.has(item as AchievementId))));
}

function uniqueSkins(value: unknown[]): NoteSkinId[] {
  const allowed = new Set<NoteSkinId>(['default', 'tactical', 'neon', 'glitch']);
  return Array.from(new Set(value.filter((item): item is NoteSkinId => typeof item === 'string' && allowed.has(item as NoteSkinId))));
}

function uniqueThemes(value: unknown[]): ThemeId[] {
  const allowed = new Set<ThemeId>(['clean', 'battlefield', 'cyberpunk', 'minimal']);
  return Array.from(new Set(value.filter((item): item is ThemeId => typeof item === 'string' && allowed.has(item as ThemeId))));
}

function isQuestType(value: unknown): value is DailyQuestType {
  return value === 'push-note' || value === 'clean-wall' || value === 'complete-priority' || value === 'no-skip' || value === 'review' || value === 'risk-clear';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result;
}
