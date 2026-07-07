import { AnimatePresence, motion } from 'framer-motion';

export type BattleCelebrationState = {
  title: string;
  detail: string;
  xp?: number;
} | null;

export function BattleVictoryOverlay({ celebration }: { celebration: BattleCelebrationState }) {
  return (
    <AnimatePresence>
      {celebration && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[120] grid place-items-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative overflow-hidden rounded-[34px] border border-white/80 bg-white/88 px-8 py-7 text-center shadow-[0_44px_130px_rgba(15,23,42,.30)] backdrop-blur-2xl"
            initial={{ y: 24, scale: 0.88, rotate: -1 }}
            animate={{ y: 0, scale: 1, rotate: 0 }}
            exit={{ y: -18, scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          >
            <motion.div
              className="absolute inset-x-8 top-0 h-1 rounded-b-full bg-gradient-to-r from-sky-400 via-violet-400 to-emerald-400"
              animate={{ scaleX: [0.4, 1, 0.76, 1] }}
              transition={{ duration: 1.4, ease: 'easeInOut' }}
            />
            <p className="text-xs font-black uppercase tracking-[.32em] text-violet-600">Battle Victory</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-.04em] text-zinc-950">{celebration.title}</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-zinc-500">{celebration.detail}</p>
            {typeof celebration.xp === 'number' && celebration.xp > 0 && (
              <motion.p
                className="mx-auto mt-4 w-fit rounded-full bg-zinc-950 px-4 py-2 text-sm font-black text-white shadow-[0_18px_34px_rgba(15,23,42,.22)]"
                initial={{ scale: 0.7 }}
                animate={{ scale: [0.7, 1.08, 1] }}
              >
                +{celebration.xp} XP
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
