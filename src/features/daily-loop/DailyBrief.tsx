import { AnimatePresence, motion } from 'framer-motion';
import type { BackendReminder, DailyReview, DashboardStats, RiskRadarItem } from '../../app-model';

type DailyBriefDialogProps = {
  open: boolean;
  stats: DashboardStats;
  nextReminder?: BackendReminder;
  route: string[];
  risks: RiskRadarItem[];
  review: DailyReview;
  onClose: () => void;
  onStartFocus: () => void;
  onDailyPlan: () => void;
  onRiskRadar: () => void;
  onDailyReview: () => void;
};

export function DailyBriefDialog({
  open,
  stats,
  nextReminder,
  route,
  risks,
  review,
  onClose,
  onStartFocus,
  onDailyPlan,
  onRiskRadar,
  onDailyReview,
}: DailyBriefDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            aria-label="关闭启动简报"
            className="fixed inset-0 z-[84] bg-slate-950/24 backdrop-blur-[5px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[85] grid place-items-center p-4">
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label="今日启动简报"
              className="w-[min(720px,calc(100vw-32px))] rounded-[32px] border border-white/80 bg-white/92 p-6 shadow-[0_34px_110px_rgba(15,23,42,.24)] backdrop-blur-2xl"
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.28em] text-sky-600">Daily Brief</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-.03em] text-zinc-900">今天先抓住重点。</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-zinc-500">
                  便签 {stats.notes} 张，提醒 {stats.reminders} 条，高优先级 {stats.highPriority} 个。
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-950/[0.04] text-zinc-400 transition hover:bg-white hover:text-zinc-700"
                onClick={onClose}
              >
                x
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[1.05fr_.95fr]">
              <section className="rounded-[24px] border border-zinc-900/[0.06] bg-zinc-50/72 p-4">
                <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-400">Next</p>
                <p className="mt-2 text-base font-black text-zinc-800">{nextReminder ? nextReminder.title : '暂无提醒'}</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-zinc-500">
                  {nextReminder
                    ? `${formatBriefReminderTime(nextReminder.next_due_at ?? nextReminder.due_at)} · ${nextReminder.notes || '没有备注。'}`
                    : '新增一条，本小姐替你盯时间。'}
                </p>
              </section>

              <section className="rounded-[24px] border border-sky-100 bg-sky-50/58 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[.18em] text-sky-500">处理顺序</p>
                  <button className="rounded-full bg-white/74 px-3 py-1.5 text-[11px] font-black text-sky-700" onClick={onDailyPlan}>
                    展开
                  </button>
                </div>
                <ol className="mt-3 space-y-2 text-xs font-bold leading-5 text-zinc-600">
                  {route.slice(0, 3).map((item, index) => (
                    <li key={`${index}-${item}`} className="rounded-2xl bg-white/58 px-3 py-2">
                      {index + 1}. {item}
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <section className="rounded-[24px] border border-rose-100 bg-rose-50/46 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[.18em] text-rose-500">风险</p>
                  <button className="rounded-full bg-white/74 px-3 py-1.5 text-[11px] font-black text-rose-600" onClick={onRiskRadar}>
                    扫描
                  </button>
                </div>
                <p className="mt-3 text-sm font-black text-zinc-800">{risks.length ? risks[0].title : '暂时没有明显风险'}</p>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-zinc-500">
                  {risks.length ? risks[0].description : '别主动制造混乱就行。'}
                </p>
              </section>

              <section className="rounded-[24px] border border-violet-100 bg-violet-50/46 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[.18em] text-violet-500">晚间复盘</p>
                  <button className="rounded-full bg-white/74 px-3 py-1.5 text-[11px] font-black text-violet-600" onClick={onDailyReview}>
                    生成
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <BriefMetric label="完成" value={review.completedReminders} />
                  <BriefMetric label="拖延" value={review.overdueReminders} />
                  <BriefMetric label="等反馈" value={review.waitingNotes} />
                </div>
              </section>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-zinc-600 shadow-sm" onClick={onClose}>
                稍后再说
              </button>
              <button type="button" className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-bold text-sky-700 shadow-sm" onClick={onDailyPlan}>
                看处理顺序
              </button>
              <button type="button" className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-bold text-white shadow-[0_14px_32px_rgba(15,23,42,.22)]" onClick={onStartFocus}>
                开始专注
              </button>
            </div>
            </motion.section>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function BriefMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/64 px-3 py-2 shadow-sm">
      <p className="text-[10px] font-black text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-black tracking-[-.04em] text-zinc-800">{value}</p>
    </div>
  );
}

export function formatBriefReminderTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
