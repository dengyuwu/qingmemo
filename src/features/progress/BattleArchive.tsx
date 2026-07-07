import { motion } from 'framer-motion';
import type { DailyReview, DashboardStats } from '../../app-model';
import { NOTE_SKINS, THEMES, resolveSelectedSkin, resolveSelectedTheme } from '../../theme/theme-system';
import type { AchievementCard, BattleContext, DailyQuest, NoteSkinId, ThemeId, UserProgress } from './progress-model';

export function BattleArchive({
  progress,
  levelProgress,
  achievements,
  context,
  onCompleteQuest,
  onThemeChange,
  onSkinChange,
  onToggleGamification,
}: {
  progress: UserProgress;
  levelProgress: { level: number; current: number; required: number; percent: number };
  achievements: AchievementCard[];
  context: BattleContext;
  onCompleteQuest: (questId: string) => void;
  onThemeChange: (theme: ThemeId) => void;
  onSkinChange: (skin: NoteSkinId) => void;
  onToggleGamification: () => void;
}) {
  return (
    <section className="space-y-3">
      <BattleArchiveHeader progress={progress} levelProgress={levelProgress} achievements={achievements} />
      <BattleQuestPanel progress={progress} context={context} onCompleteQuest={onCompleteQuest} />
      <BattleRewardsPanel
        progress={progress}
        achievements={achievements}
        onThemeChange={onThemeChange}
        onSkinChange={onSkinChange}
        onToggleGamification={onToggleGamification}
      />
    </section>
  );
}

export function BattleArchiveHeader({
  progress,
  levelProgress,
  achievements,
}: {
  progress: UserProgress;
  levelProgress: { level: number; current: number; required: number; percent: number };
  achievements: AchievementCard[];
}) {
  const unlockedPreview = achievements.filter((achievement) => progress.achievements.includes(achievement.id)).slice(-3).reverse();

  return (
    <section className="relative overflow-hidden rounded-[26px] border border-white/72 bg-[linear-gradient(135deg,rgba(255,255,255,.82),rgba(239,246,255,.62),rgba(250,245,255,.58))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.86),0_18px_48px_rgba(68,83,120,.10)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute -right-12 -top-14 h-32 w-32 rounded-full bg-sky-300/22 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <motion.div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] bg-zinc-950 text-white shadow-[0_18px_34px_rgba(15,23,42,.24)]"
          animate={progress.settings.gamificationEnabled ? { y: [0, -3, 0], rotate: [0, -2, 2, 0] } : { y: 0, rotate: 0 }}
          transition={{ duration: 3.2, repeat: progress.settings.gamificationEnabled ? Infinity : 0, ease: 'easeInOut' }}
        >
          <span className="text-[10px] font-black uppercase tracking-[.18em] text-white/42">Lv</span>
          <span className="-mt-3 text-2xl font-black leading-none tabular-nums">{progress.level}</span>
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.28em] text-violet-600">Battle Archive</p>
              <h3 className="mt-1 truncate text-lg font-black tracking-[-.03em] text-zinc-950">Lv.{progress.level} AI 指挥官</h3>
            </div>
            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">火焰 {progress.streak}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-950/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-emerald-400"
              initial={{ width: 0 }}
              animate={{ width: `${levelProgress.percent}%` }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-black text-zinc-400">
            <span>{levelProgress.current}/{levelProgress.required} XP</span>
            <span>连续作战 {progress.streak} 天</span>
          </div>
        </div>
      </div>

      <div className="relative mt-3 flex items-center gap-1.5 overflow-hidden">
        {unlockedPreview.length === 0 ? (
          <span className="rounded-full bg-white/70 px-3 py-1.5 text-[10px] font-black text-zinc-400">完成第一件事后点亮徽章</span>
        ) : (
          unlockedPreview.map((achievement) => (
            <span key={achievement.id} className="min-w-0 rounded-full bg-white/74 px-2.5 py-1.5 text-[10px] font-black text-zinc-600 shadow-sm">
              <span className="mr-1">{achievement.icon}</span>{achievement.name}
            </span>
          ))
        )}
      </div>
    </section>
  );
}

export function BattleQuestPanel({
  progress,
  context,
  onCompleteQuest,
}: {
  progress: UserProgress;
  context: BattleContext;
  onCompleteQuest: (questId: string) => void;
}) {
  return (
    <section className="rounded-[24px] border border-white/72 bg-white/52 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.76)]">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.24em] text-sky-600">Daily Quests</p>
          <h3 className="text-sm font-black text-zinc-900">每日作战任务</h3>
        </div>
        <span className="rounded-full bg-white/76 px-2.5 py-1 text-[10px] font-black text-zinc-400">能量 {context.focusScore}</span>
      </div>
      <div className="space-y-2">
        {progress.dailyQuests.map((quest) => (
          <DailyQuestRow key={quest.id} quest={quest} onComplete={() => onCompleteQuest(quest.id)} />
        ))}
      </div>
    </section>
  );
}

export function BattleRewardsPanel({
  progress,
  achievements,
  onThemeChange,
  onSkinChange,
  onToggleGamification,
}: {
  progress: UserProgress;
  achievements: AchievementCard[];
  onThemeChange: (theme: ThemeId) => void;
  onSkinChange: (skin: NoteSkinId) => void;
  onToggleGamification: () => void;
}) {
  const visibleAchievements = achievements.filter((achievement) => !achievement.hidden || achievement.unlocked);
  const theme = resolveSelectedTheme(progress.settings.selectedTheme, progress.unlockedThemes);
  const skin = resolveSelectedSkin(progress.settings.selectedSkin, progress.unlockedSkins);

  return (
    <section className="space-y-3">
      <section className="rounded-[24px] border border-white/72 bg-white/52 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.76)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.24em] text-violet-600">Rewards</p>
            <h3 className="text-sm font-black text-zinc-900">成就墙</h3>
          </div>
          <span className="rounded-full bg-white/74 px-2.5 py-1 text-[10px] font-black text-zinc-400">{progress.achievements.length}/{achievements.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 2xl:grid-cols-3">
          {visibleAchievements.map((achievement) => (
            <AchievementTile key={achievement.id} achievement={achievement} />
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-white/72 bg-white/52 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.76)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.24em] text-emerald-600">Arsenal</p>
            <h3 className="text-sm font-black text-zinc-900">主题涂装</h3>
          </div>
          <button className="rounded-full bg-white/74 px-2.5 py-1 text-[10px] font-black text-zinc-500 hover:bg-white" onClick={onToggleGamification}>
            {progress.settings.gamificationEnabled ? '游戏化开' : '游戏化关'}
          </button>
        </div>
        <p className="mb-2 text-[11px] font-bold text-zinc-400">当前：{theme.name} · {skin.name}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {THEMES.map((item) => {
            const unlocked = progress.unlockedThemes.includes(item.id);
            const active = item.id === theme.id;
            return (
              <RewardPill
                key={item.id}
                title={item.name}
                description={unlocked ? item.description : '升级后解锁'}
                active={active}
                locked={!unlocked}
                tone="theme"
                onClick={() => onThemeChange(item.id)}
              />
            );
          })}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {NOTE_SKINS.map((item) => {
            const unlocked = progress.unlockedSkins.includes(item.id);
            const active = item.id === skin.id;
            return (
              <RewardPill
                key={item.id}
                title={item.name}
                description={unlocked ? item.description : '升级后解锁'}
                active={active}
                locked={!unlocked}
                tone="skin"
                onClick={() => onSkinChange(item.id)}
              />
            );
          })}
        </div>
      </section>
    </section>
  );
}

export function BattleGrowthPanel({ progress, stats, review }: { progress: UserProgress; stats: DashboardStats; review: DailyReview }) {
  const cleanRatio = Math.max(0, Math.min(100, stats.cleanliness));
  const timeline = [
    { title: `Lv.${progress.level} 指挥官`, detail: `${progress.xp} XP · 连续作战 ${progress.streak} 天`, tone: 'sky' },
    { title: '今日推进', detail: `${stats.completedToday} 个完成 · 转行动 ${stats.conversionRate}%`, tone: 'emerald' },
    { title: '战场清晰度', detail: `清爽度 ${cleanRatio}% · 拖延债 ${stats.delayDebt}`, tone: stats.delayDebt > 0 ? 'rose' : 'violet' },
  ];

  return (
    <section className="space-y-3">
      <section className="rounded-[24px] border border-white/72 bg-white/52 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.76)]">
        <div className="mb-2">
          <p className="text-[10px] font-black uppercase tracking-[.24em] text-sky-600">Growth</p>
          <h3 className="text-sm font-black text-zinc-900">数据成长</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <GrowthMetric label="Focus" value={stats.focusScore} suffix="" tone="sky" />
          <GrowthMetric label="转行动" value={stats.conversionRate} suffix="%" tone="violet" />
          <GrowthMetric label="清爽度" value={stats.cleanliness} suffix="%" tone="emerald" />
          <GrowthMetric label="拖延债" value={stats.delayDebt} suffix="" tone="rose" />
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl bg-zinc-950/[0.04] p-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/80">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-emerald-400" animate={{ width: `${cleanRatio}%` }} />
          </div>
          <p className="mt-2 text-[11px] font-bold text-zinc-500">清晰度建议：{stats.delayDebt > 0 ? '先处理拖延债，再补下一步。' : '战场清爽，适合推进一个高价值事项。'}</p>
        </div>
      </section>

      <section className="rounded-[24px] border border-white/72 bg-white/52 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.76)]">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-black text-zinc-900">战斗历程</h3>
          <span className="rounded-full bg-white/74 px-2.5 py-1 text-[10px] font-black text-zinc-400">可折叠感</span>
        </div>
        <div className="space-y-2">
          {timeline.map((item) => (
            <div key={item.title} className="relative rounded-2xl border border-white/70 bg-white/64 px-3 py-2.5">
              <span className={`absolute left-0 top-3 h-8 w-1 rounded-r-full ${timelineToneClass(item.tone)}`} />
              <p className="pl-2 text-xs font-black text-zinc-800">{item.title}</p>
              <p className="mt-0.5 pl-2 text-[11px] font-bold text-zinc-400">{item.detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {review.summaryLines.slice(0, 2).map((line) => (
            <p key={line} className="rounded-2xl bg-white/58 px-3 py-2 text-[11px] font-bold leading-4 text-zinc-500">{line}</p>
          ))}
        </div>
      </section>
    </section>
  );
}

function DailyQuestRow({ quest, onComplete }: { quest: DailyQuest; onComplete: () => void }) {
  const percent = Math.round((Math.min(quest.progress, quest.target) / quest.target) * 100);
  return (
    <div className={`rounded-[18px] border px-3 py-2 ${quest.completed ? 'border-emerald-100 bg-emerald-50/70' : 'border-white/70 bg-white/68'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-zinc-800">{quest.completed ? '完成 · ' : ''}{quest.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-4 text-zinc-500">{quest.description}</p>
        </div>
        <button className="shrink-0 rounded-full bg-zinc-950 px-2.5 py-1 text-[10px] font-black text-white disabled:bg-zinc-200" disabled={quest.completed} onClick={onComplete}>
          +{quest.xpReward} XP
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-950/[0.06]">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" animate={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function AchievementTile({ achievement }: { achievement: AchievementCard }) {
  return (
    <div className={`rounded-[18px] border px-3 py-2 ${achievement.unlocked ? 'border-violet-100 bg-violet-50/70' : 'border-white/70 bg-white/58 opacity-72'}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-white/76 text-sm shadow-sm">{achievement.unlocked ? achievement.icon : '锁'}</span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-black text-zinc-800">{achievement.name}</p>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-zinc-400">{achievement.value}/{achievement.target}</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-950/[0.06]">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-sky-400" animate={{ width: `${achievement.progress}%` }} />
      </div>
    </div>
  );
}

function RewardPill({
  title,
  description,
  active,
  locked,
  tone,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  locked: boolean;
  tone: 'theme' | 'skin';
  onClick: () => void;
}) {
  const activeClass = tone === 'theme' ? 'bg-zinc-950 text-white' : 'bg-sky-600 text-white';
  return (
    <button
      type="button"
      disabled={locked}
      className={`min-w-[132px] rounded-2xl border px-3 py-2 text-left transition ${active ? activeClass : 'border-white/70 bg-white/70 text-zinc-600 hover:bg-white'} disabled:opacity-38`}
      onClick={onClick}
    >
      <span className="block truncate text-[11px] font-black">{locked ? '锁定 · ' : ''}{title}</span>
      <span className="mt-0.5 block truncate text-[10px] font-bold opacity-62">{description}</span>
    </button>
  );
}

function GrowthMetric({ label, value, suffix, tone }: { label: string; value: number; suffix: string; tone: 'sky' | 'violet' | 'emerald' | 'rose' }) {
  const toneClass = {
    sky: 'text-sky-700 bg-sky-50/70 border-sky-100',
    violet: 'text-violet-700 bg-violet-50/70 border-violet-100',
    emerald: 'text-emerald-700 bg-emerald-50/70 border-emerald-100',
    rose: 'text-rose-600 bg-rose-50/70 border-rose-100',
  }[tone];
  return (
    <div className={`rounded-[18px] border px-3 py-2.5 ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[.12em] opacity-60">{label}</p>
      <p className="mt-1 text-2xl font-black leading-none tabular-nums">{value}<span className="text-xs">{suffix}</span></p>
    </div>
  );
}

function timelineToneClass(tone: string): string {
  if (tone === 'emerald') return 'bg-emerald-400';
  if (tone === 'rose') return 'bg-rose-400';
  if (tone === 'violet') return 'bg-violet-400';
  return 'bg-sky-400';
}