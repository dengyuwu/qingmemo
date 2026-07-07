import { AnimatePresence, motion } from 'framer-motion';

const shortcuts = [
  ['Ctrl+K', '命令面板'],
  ['Ctrl+N', '新建便签'],
  ['Ctrl+R', '新建提醒'],
  ['Ctrl+F', '专注快速输入'],
  ['Ctrl+Shift+A', '整理便签墙'],
  ['Delete', '归档选中便签'],
  ['Ctrl+D', '归档选中便签'],
  ['Ctrl+Alt+Space', '迷你输入框'],
];

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            aria-label="关闭快捷键帮助"
            className="fixed inset-0 z-[82] bg-slate-950/24 backdrop-blur-[5px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[86] grid place-items-center p-4">
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label="快捷键帮助"
              className="w-[min(520px,calc(100vw-32px))] rounded-[30px] border border-white/80 bg-white/92 p-6 shadow-[0_34px_110px_rgba(15,23,42,.24)] backdrop-blur-2xl"
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') onClose();
              }}
            >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.28em] text-violet-600">Shortcuts</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-.03em] text-zinc-900">键盘操作</h2>
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
            <div className="mt-5 grid gap-2">
              {shortcuts.map(([keys, action]) => (
                <div key={keys} className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-900/[0.06] bg-zinc-50/70 px-4 py-3">
                  <span className="text-sm font-black text-zinc-700">{action}</span>
                  <kbd className="rounded-xl bg-white px-3 py-1.5 text-xs font-black text-zinc-500 shadow-sm">{keys}</kbd>
                </div>
              ))}
            </div>
            </motion.section>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
