type FloatingActionBarProps = {
  selectedCount: number;
  onArchive: () => void;
  onMarkHigh: () => void;
  onMarkNormal: () => void;
  onArrange: () => void;
  onClear: () => void;
  onAskAiNextStep?: () => void;
};

export function FloatingActionBar({
  selectedCount,
  onArchive,
  onMarkHigh,
  onMarkNormal,
  onArrange,
  onClear,
  onAskAiNextStep,
}: FloatingActionBarProps) {
  if (selectedCount <= 1) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-[24px] border border-white/78 bg-white/88 px-3 py-2 shadow-[0_22px_60px_rgba(15,23,42,.18)] backdrop-blur-2xl">
      <span className="pointer-events-auto rounded-full bg-zinc-950 px-3 py-2 text-xs font-black text-white">已选 {selectedCount}</span>
      <BatchButton label="归档" icon="▣" onClick={onArchive} />
      <BatchButton label="高优先级" icon="⚑" onClick={onMarkHigh} />
      <BatchButton label="普通" icon="↓" onClick={onMarkNormal} />
      <BatchButton label="整理" icon="▦" onClick={onArrange} />
      {onAskAiNextStep && <BatchButton label="AI 下一步" icon="✦" onClick={onAskAiNextStep} />}
      <button
        type="button"
        className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-zinc-950/[0.055] text-sm font-black text-zinc-500 transition hover:bg-white hover:text-zinc-900"
        aria-label="清除选择"
        title="清除选择"
        onClick={onClear}
      >
        x
      </button>
    </div>
  );
}

function BatchButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="pointer-events-auto flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-black text-zinc-600 shadow-sm transition hover:-translate-y-0.5 hover:text-zinc-900 hover:shadow-md"
      onClick={onClick}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
