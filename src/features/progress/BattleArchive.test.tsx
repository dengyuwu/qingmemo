import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BattleArchiveHeader, BattleGrowthPanel, BattleRewardsPanel } from './BattleArchive';
import { buildAchievementCards, createDefaultProgress, getLevelProgress, type BattleContext } from './progress-model';
import type { DailyReview, DashboardStats } from '../../app-model';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const context: BattleContext = {
  today: '2026-07-07',
  focusScore: 91,
  delayDebt: 0,
  dailyQueueTotal: 3,
  dailyQueueDone: 3,
  dailyQueueSkipped: 0,
  notesCreatedToday: 8,
  archivedCount: 2,
  bugFixedCount: 1,
};

const stats: DashboardStats = {
  reminders: 3,
  highPriority: 1,
  notes: 8,
  overdueReminders: 0,
  waitingNotes: 1,
  missingNextStepNotes: 1,
  completedToday: 4,
  delayDebt: 0,
  focusScore: 91,
  conversionRate: 75,
  cleanliness: 88,
  headline: '推进一件主线',
};

const review: DailyReview = {
  completedReminders: 2,
  overdueReminders: 0,
  waitingNotes: 1,
  highPriorityItems: 1,
  cleanupSuggestions: [],
  summaryLines: ['今天击破 4 个推进点。', '明天先处理主线。'],
};

const progress = {
  ...createDefaultProgress('2026-07-07'),
  xp: 145,
  level: 2,
  streak: 9,
  achievements: ['first_victory' as const, 'zero_debt' as const],
  unlockedSkins: ['default' as const, 'tactical' as const],
  unlockedThemes: ['clean' as const, 'battlefield' as const],
};

function render(node: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
});

describe('BattleArchive rail components', () => {
  it('renders the fixed commander profile with level, xp progress, streak, and achievement preview', () => {
    const view = render(
      <BattleArchiveHeader
        progress={progress}
        levelProgress={getLevelProgress(progress)}
        achievements={buildAchievementCards(progress, context)}
      />,
    );

    expect(view.textContent).toContain('Lv.2');
    expect(view.textContent).toContain('45/100 XP');
    expect(view.textContent).toContain('连续作战 9 天');
    expect(view.textContent).toContain('第一场胜利');
  });

  it('renders achievement cards and horizontal reward selectors separately', () => {
    const view = render(
      <BattleRewardsPanel
        progress={progress}
        achievements={buildAchievementCards(progress, context)}
        onThemeChange={vi.fn()}
        onSkinChange={vi.fn()}
        onToggleGamification={vi.fn()}
      />,
    );

    expect(view.textContent).toContain('成就墙');
    expect(view.textContent).toContain('第一场胜利');
    expect(view.textContent).toContain('主题涂装');
    expect(view.textContent).toContain('战术边框');
  });

  it('renders growth metrics and a compact battle timeline', () => {
    const view = render(<BattleGrowthPanel progress={progress} stats={stats} review={review} />);

    expect(view.textContent).toContain('数据成长');
    expect(view.textContent).toContain('91');
    expect(view.textContent).toContain('战斗历程');
    expect(view.textContent).toContain('Lv.2');
  });
});