import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  applyProgressEvent,
  buildAchievementCards,
  createDefaultProgress,
  generateDailyQuests,
  getLevelProgress,
  markDailyQuestComplete,
  normalizeProgress,
  type ProgressEvent,
} from './progress-model';

const battleContext = {
  today: '2026-07-07',
  focusScore: 92,
  delayDebt: 0,
  dailyQueueTotal: 3,
  dailyQueueDone: 3,
  dailyQueueSkipped: 0,
  notesCreatedToday: 8,
  archivedCount: 0,
  bugFixedCount: 0,
};

describe('progress model', () => {
  it('creates a safe default commander profile for the current battle day', () => {
    const progress = createDefaultProgress('2026-07-07');

    expect(progress.level).toBe(1);
    expect(progress.xp).toBe(0);
    expect(progress.streak).toBe(1);
    expect(progress.lastActiveDate).toBe('2026-07-07');
    expect(progress.unlockedSkins).toContain('default');
    expect(progress.unlockedThemes).toContain('clean');
    expect(progress.settings.gamificationEnabled).toBe(true);
  });

  it('awards XP, levels up, unlocks rewards, and checks achievements after events', () => {
    const base = { ...createDefaultProgress('2026-07-07'), xp: 95 };

    const { progress, celebration } = applyProgressEvent(base, { type: 'wall_arranged' }, battleContext);

    expect(progress.xp).toBe(105);
    expect(progress.level).toBe(2);
    expect(getLevelProgress(progress)).toEqual({ level: 2, current: 5, required: 100, percent: 5 });
    expect(progress.unlockedSkins).toContain('tactical');
    expect(progress.unlockedThemes).toContain('battlefield');
    expect(celebration.levelUp).toBe(true);
  });

  it('unlocks daily queue and zero debt achievements from real battle context', () => {
    const first = createDefaultProgress('2026-07-07');
    const { progress } = applyProgressEvent(first, { type: 'daily_queue_done' }, battleContext);

    expect(progress.xp).toBe(20);
    expect(progress.achievements).toContain('first_victory');
    expect(progress.achievements).toContain('perfect_battle');
    expect(progress.achievements).toContain('zero_debt');
    expect(progress.achievements).toContain('inspiration_hunter');
  });

  it('caps cleanup archive XP at 80 for a single clear-wall operation', () => {
    const first = createDefaultProgress('2026-07-07');
    const { progress } = applyProgressEvent(first, { type: 'wall_cleaned', count: 15 }, { ...battleContext, archivedCount: 15 });

    expect(progress.xp).toBe(80);
    expect(progress.achievements).toContain('wall_cleaner');
  });

  it('tracks achievement progress for cumulative commander actions', () => {
    let progress = createDefaultProgress('2026-07-07');
    const event: ProgressEvent = { type: 'ai_commander_used' };
    for (let index = 0; index < 19; index += 1) {
      progress = applyProgressEvent(progress, event, battleContext).progress;
    }

    const cardsBefore = buildAchievementCards(progress, battleContext);
    expect(cardsBefore.find((card) => card.id === 'ai_commander')?.progress).toBe(95);
    expect(progress.achievements).not.toContain('ai_commander');

    progress = applyProgressEvent(progress, event, battleContext).progress;
    expect(progress.achievements).toContain('ai_commander');
  });

  it('generates three daily quests and awards each completed quest only once', () => {
    const first = createDefaultProgress('2026-07-07');
    const quests = generateDailyQuests(first, battleContext);
    const withQuests = { ...first, dailyQuests: quests, lastQuestDate: '2026-07-07' };

    expect(quests).toHaveLength(3);
    expect(new Set(quests.map((quest) => quest.id)).size).toBe(3);

    const once = markDailyQuestComplete(withQuests, quests[0].id, battleContext).progress;
    const twice = markDailyQuestComplete(once, quests[0].id, battleContext).progress;

    expect(once.xp).toBeGreaterThan(first.xp);
    expect(twice.xp).toBe(once.xp);
    expect(twice.dailyQuests.find((quest) => quest.id === quests[0].id)?.completed).toBe(true);
  });

  it('normalizes legacy progress without losing required fields or unlocked defaults', () => {
    const normalized = normalizeProgress({ xp: 210, achievements: ['first_victory'] }, '2026-07-07');

    expect(normalized.level).toBe(3);
    expect(normalized.achievements).toEqual(['first_victory']);
    expect(normalized.unlockedSkins).toContain('default');
    expect(normalized.unlockedThemes).toContain('clean');
    expect(ACHIEVEMENTS).toHaveLength(12);
  });
});
