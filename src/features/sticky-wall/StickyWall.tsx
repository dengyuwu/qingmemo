import { motion, type PanInfo } from 'framer-motion';
import { useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type TouchEvent } from 'react';
import { MIN_NOTE_HEIGHT, applyGroupDrag, compactSparseColumns, snapPoint, toLayoutPatch } from './layout';
import { categoryHelp, categoryLabel, noteMood, noteMoodHelp } from './note-labels';
import { buildWallExplorationState, countNotesByCategory, filterNotesByCategory, mergeVisibleNoteChanges, prepareVisibleNotes, type WallCategoryFilter, type WallExplorationMode } from './wall-filter';
import type { LayoutPatch, NoteColor, StickyNote } from './types';
import { inferNoteCategory } from '../../note-intelligence';
import { FloatingActionBar } from '../actions/FloatingActionBar';

type StickyWallProps = {
  notes: StickyNote[];
  selectedIds: Set<number>;
  onNotesChange: (notes: StickyNote[]) => void;
  onSelectionChange: (ids: Set<number>) => void;
  onEditNote: (note: StickyNote) => void;
  onArchiveNote: (id: number) => void;
  onConvertToReminder: (note: StickyNote) => void;
  onTogglePriority: (note: StickyNote) => void;
  onOpenAttachment: (path: string) => void;
  onPersistLayouts: (patches: LayoutPatch[]) => Promise<void>;
  onArchiveSelected?: () => void;
  onSetSelectedPriority?: (priority: 'normal' | 'high') => void;
  onArrangeSelected?: () => void;
  onClearSelection?: () => void;
  explorationMode?: WallExplorationMode;
  challengeNoteIds?: number[];
  onExplorationModeChange?: (mode: WallExplorationMode) => void;
  onAskAiNextStep?: (noteIds?: number[]) => void;
  motionMode?: 'calm' | 'lively' | 'wild';
  createdNoteId?: number | null;
  arranging?: boolean;
};

const colorClass: Record<NoteColor, string> = {
  butter: 'from-white via-[#fffdf7] to-[#f5ead0] text-zinc-900 border-amber-100/70 shadow-amber-900/8',
  sky: 'from-white via-[#f7fcff] to-[#dfeffc] text-zinc-900 border-sky-100/70 shadow-sky-900/8',
  mint: 'from-white via-[#f6fcfa] to-[#dcefe8] text-zinc-900 border-emerald-100/70 shadow-emerald-900/8',
  peach: 'from-white via-[#fff8f3] to-[#f5e1d8] text-zinc-900 border-orange-100/70 shadow-orange-900/8',
  lavender: 'from-white via-[#fbf8ff] to-[#e9e2f6] text-zinc-900 border-violet-100/70 shadow-violet-900/8',
  graphite: 'from-[#455063] via-[#303848] to-[#1f2531] text-white border-white/14 shadow-slate-950/18',
  blue: 'from-[#fbfdff] via-[#edf7ff] to-[#d7edff] text-zinc-900 border-sky-200/62 shadow-sky-900/10',
  amber: 'from-[#fffef9] via-[#fff8dc] to-[#ffe9a6] text-zinc-900 border-amber-200/62 shadow-amber-900/10',
  rose: 'from-white via-[#fff7fa] to-[#f5dde7] text-zinc-900 border-rose-100/70 shadow-rose-900/8',
  violet: 'from-white via-[#fbf8ff] to-[#e9e2f6] text-zinc-900 border-violet-100/70 shadow-violet-900/8',
  slate: 'from-[#455063] via-[#303848] to-[#1f2531] text-white border-white/14 shadow-slate-950/18',
};

const accentClass: Record<NoteColor, string> = {
  butter: 'from-amber-300 via-yellow-300 to-orange-300',
  sky: 'from-sky-300 via-cyan-300 to-blue-300',
  mint: 'from-emerald-300 via-teal-300 to-lime-300',
  peach: 'from-orange-300 via-rose-300 to-amber-300',
  lavender: 'from-violet-300 via-fuchsia-300 to-sky-300',
  graphite: 'from-slate-200 via-white/70 to-sky-200',
  blue: 'from-sky-300 via-cyan-300 to-blue-300',
  amber: 'from-amber-300 via-yellow-300 to-orange-300',
  rose: 'from-rose-300 via-pink-300 to-orange-300',
  violet: 'from-violet-300 via-fuchsia-300 to-sky-300',
  slate: 'from-slate-200 via-white/70 to-sky-200',
};

const iconClass: Record<NoteColor, string> = {
  butter: 'bg-amber-400/16 text-amber-700 ring-amber-300/24',
  sky: 'bg-sky-400/14 text-sky-700 ring-sky-300/24',
  mint: 'bg-emerald-400/14 text-emerald-700 ring-emerald-300/24',
  peach: 'bg-orange-400/14 text-orange-700 ring-orange-300/24',
  lavender: 'bg-violet-400/14 text-violet-700 ring-violet-300/24',
  graphite: 'bg-white/10 text-white/76 ring-white/14',
  blue: 'bg-sky-400/14 text-sky-700 ring-sky-300/24',
  amber: 'bg-amber-400/16 text-amber-700 ring-amber-300/24',
  rose: 'bg-rose-400/14 text-rose-700 ring-rose-300/24',
  violet: 'bg-violet-400/14 text-violet-700 ring-violet-300/24',
  slate: 'bg-white/10 text-white/76 ring-white/14',
};

const emptyCopies = [
  '没有便签，写一张灵感卡片吧，笨蛋。',
  '这里空空的，等你丢进第一张小纸条。',
  '脑袋里的小火花，可以先放这里。',
  '没有便签也没关系，安静也是一种生产力。',
];

export function StickyWall({
  notes,
  selectedIds,
  onNotesChange,
  onSelectionChange,
  onEditNote,
  onArchiveNote,
  onConvertToReminder,
  onTogglePriority,
  onOpenAttachment,
  onPersistLayouts,
  onArchiveSelected,
  onSetSelectedPriority,
  onArrangeSelected,
  onClearSelection,
  explorationMode = 'all',
  challengeNoteIds = [],
  onExplorationModeChange,
  onAskAiNextStep,
  motionMode = 'lively',
  createdNoteId,
  arranging = false,
}: StickyWallProps) {
  const [savingId, setSavingId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<WallCategoryFilter>('all');
  const [contextMenu, setContextMenu] = useState<{ note: StickyNote; x: number; y: number } | null>(null);
  const dragStartNotes = useRef<StickyNote[]>([]);
  const emptyCopy = useMemo(() => emptyCopies[Math.floor(Math.random() * emptyCopies.length)], [notes.length]);
  const exploration = useMemo(() => buildWallExplorationState(notes, explorationMode, challengeNoteIds), [notes, explorationMode, challengeNoteIds]);
  const baseVisibleNotes = useMemo(
    () => (categoryFilter === 'all' ? exploration.visibleNotes : filterNotesByCategory(exploration.visibleNotes, categoryFilter)),
    [categoryFilter, exploration.visibleNotes],
  );
  const visibleNotes = useMemo(() => prepareVisibleNotes(baseVisibleNotes, categoryFilter), [baseVisibleNotes, categoryFilter]);
  const categoryTabs = useMemo(
    () => [
      { key: 'all' as const, label: '全部', count: notes.length, title: '全部：显示便签墙上的所有便签' },
      { key: 'today' as const, label: categoryLabel('today'), count: countNotesByCategory(notes, 'today'), title: categoryHelp('today') },
      { key: 'waiting' as const, label: categoryLabel('waiting'), count: countNotesByCategory(notes, 'waiting'), title: categoryHelp('waiting') },
      { key: 'idea' as const, label: categoryLabel('idea'), count: countNotesByCategory(notes, 'idea'), title: categoryHelp('idea') },
    ],
    [notes],
  );
  const displayNotes = useMemo(
    () =>
      compactSparseColumns(visibleNotes, { gap: 24, startY: 24, maxGap: 72 }).sort((left, right) => {
        if (left.pinned === right.pinned) return left.id - right.id;
        return left.pinned ? 1 : -1;
      }),
    [visibleNotes],
  );
  const connections = useMemo(() => buildTagConnections(displayNotes), [displayNotes]);
  const calmMotion = motionMode === 'calm';
  const wildMotion = motionMode === 'wild';

  function selectNote(noteId: number, additive: boolean) {
    setContextMenu(null);
    const next = new Set(additive ? selectedIds : []);
    if (additive && next.has(noteId)) next.delete(noteId);
    else next.add(noteId);
    onSelectionChange(next);
  }

  function beginDrag(noteId: number) {
    setContextMenu(null);
    dragStartNotes.current = displayNotes;
    if (!selectedIds.has(noteId)) {
      onSelectionChange(new Set([noteId]));
    }
  }

  async function endDrag(activeId: number, info: PanInfo) {
    const activeSelection = selectedIds.has(activeId) ? selectedIds : new Set([activeId]);
    const moved = applyGroupDrag(dragStartNotes.current, activeSelection, info.offset).map((note) => {
      if (!activeSelection.has(note.id)) return note;
      const snapped = snapPoint({ x: note.x, y: note.y }, { gridSize: 24, threshold: 7 });
      return { ...note, x: snapped.x, y: snapped.y };
    });
    onNotesChange(mergeVisibleNoteChanges(notes, moved));
    const patches = moved.filter((note) => activeSelection.has(note.id)).map(toLayoutPatch);
    await persistWithFeedback(activeId, patches);
  }


  async function persistWithFeedback(noteId: number, patches: LayoutPatch[]) {
    setSavingId(noteId);
    await onPersistLayouts(patches);
    window.setTimeout(() => setSavingId(null), 650);
  }

  function openContextMenu(note: StickyNote, event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    onSelectionChange(new Set([note.id]));
    const width = 220;
    const height = 224;
    setContextMenu({
      note,
      x: Math.min(event.clientX, window.innerWidth - width - 12),
      y: Math.min(event.clientY, window.innerHeight - height - 12),
    });
  }

  function noteCategory(note: StickyNote) {
    return inferNoteCategory(`${note.title}\n${note.content}`);
  }

  function stickyCategoryLabel(note: StickyNote): string {
    return categoryLabel(noteCategory(note));
  }

  function stickyCategoryHelp(note: StickyNote): string {
    return categoryHelp(noteCategory(note));
  }

  if (notes.length === 0) {
    return (
      <div className="relative grid h-full min-h-0 place-items-center overflow-hidden rounded-[24px] border border-dashed border-zinc-900/10 bg-white/30 p-10 text-center">
        <DotGrid />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative max-w-sm">
          <motion.div
            initial={{ rotate: -10, scale: 0.9 }}
            animate={{ rotate: -6, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16 }}
            className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-[18px] bg-gradient-to-br from-[#fff8cf] to-[#ffe99e] text-3xl shadow-[0_1px_2px_rgba(31,41,55,.08),0_18px_36px_rgba(31,41,55,.16)]"
          >
            ✦
          </motion.div>
          <h3 className="text-xl font-bold tracking-tight text-zinc-800">{emptyCopy}</h3>
          <p className="mt-3 text-sm font-medium leading-6 text-zinc-400">
            按 Win+Shift+N 或点击右上角「+ 便签」，把脑袋里的小火花贴到墙上。
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-white/60 bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,.6)]">
      <div className="pointer-events-none absolute -left-20 top-10 h-56 w-56 rounded-full bg-sky-200/24 blur-3xl" />
      <div className="pointer-events-none absolute bottom-8 right-2 h-48 w-48 rounded-full bg-amber-200/20 blur-3xl" />
      <div className="relative z-20 grid grid-cols-4 gap-2 px-4 pb-2 pt-3">
        {categoryTabs.map((tab) => {
          const active = categoryFilter === tab.key;
          return (
            <motion.button
              key={tab.key}
              type="button"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              aria-pressed={active}
              title={`${tab.title}。点击筛选，再点全部恢复。`}
              className={`min-w-0 rounded-2xl border px-3 py-2 text-left text-xs font-black shadow-[0_10px_24px_rgba(15,23,42,.055),inset_0_1px_0_rgba(255,255,255,.72)] backdrop-blur-xl transition ${
                active
                  ? 'border-sky-200/80 bg-white/86 text-zinc-900 ring-2 ring-sky-300/32'
                  : 'border-white/72 bg-white/58 text-zinc-500 hover:bg-white/76 hover:text-zinc-700'
              }`}
              onClick={(event) => {
                event.stopPropagation();
                setContextMenu(null);
                setCategoryFilter(tab.key);
              } }
            >
              <span className="block truncate">{tab.label} · {tab.count}</span>
            </motion.button>
          );
        })}
      </div>
      <div className="relative z-20 flex gap-2 overflow-x-auto px-4 pb-2">
        {([
          ['all', '全景'],
          ['challenge', '今日挑战'],
          ['waiting', '等反馈'],
          ['missing-next-step', '缺下一步'],
          ['relationships', '关系网'],
        ] as Array<[WallExplorationMode, string]>).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black transition ${
              explorationMode === mode ? 'bg-zinc-950 text-white' : 'bg-white/56 text-zinc-500 hover:bg-white hover:text-zinc-800'
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onExplorationModeChange?.(mode);
            } }
          >
            {label}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden" onClick={() => setContextMenu(null)}>
      <FloatingActionBar
        selectedCount={selectedIds.size}
        onArchive={() => onArchiveSelected?.()}
        onMarkHigh={() => onSetSelectedPriority?.('high')}
        onMarkNormal={() => onSetSelectedPriority?.('normal')}
        onArrange={() => onArrangeSelected?.()}
        onClear={() => onClearSelection?.()}
        onAskAiNextStep={onAskAiNextStep ? () => onAskAiNextStep() : undefined}
      />
      <DotGrid />
      <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible">
        {connections.map((connection) => (
          <motion.line
            key={`${connection.from.id}-${connection.to.id}-${connection.tag}`}
            x1={connection.from.x + connection.from.width / 2}
            y1={connection.from.y + connection.from.height / 2}
            x2={connection.to.x + connection.to.width / 2}
            y2={connection.to.y + connection.to.height / 2}
            stroke="rgba(14,165,233,.18)"
            strokeWidth="2"
            strokeDasharray="6 10"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        ))}
      </svg>
      {displayNotes.length === 0 && (
        <div className="absolute inset-0 z-[2] grid place-items-center px-6 text-center">
          <div className="rounded-[22px] border border-white/70 bg-white/72 px-5 py-4 shadow-[0_14px_36px_rgba(15,23,42,.10)] backdrop-blur-xl">
            <p className="text-sm font-black text-zinc-700">{exploration.emptyCopy}</p>
            <button
              type="button"
              className="mt-3 rounded-full bg-zinc-950 px-4 py-2 text-xs font-black text-white shadow-[0_10px_24px_rgba(15,23,42,.18)] transition hover:-translate-y-0.5"
              onClick={(event) => {
                event.stopPropagation();
                setCategoryFilter('all');
              } }
            >
              查看全部
            </button>
          </div>
        </div>
      )}
      {contextMenu && (
        <StickyContextMenu
          note={contextMenu.note}
          x={contextMenu.x}
          y={contextMenu.y}
          onEdit={() => {
            onEditNote(contextMenu.note);
            setContextMenu(null);
          }}
          onConvert={() => {
            onConvertToReminder(contextMenu.note);
            setContextMenu(null);
          }}
          onTogglePriority={() => {
            onTogglePriority(contextMenu.note);
            setContextMenu(null);
          }}
          onArchive={() => {
            onArchiveNote(contextMenu.note.id);
            setContextMenu(null);
          }}
        />
      )}
      {displayNotes.map((note) => (
        <motion.div
          key={note.id}
          drag
          dragMomentum={false}
          dragElastic={0.04}
          onClick={(event) => selectNote(note.id, event.ctrlKey || event.shiftKey)}
          onContextMenu={(event) => openContextMenu(note, event)}
          onDoubleClick={() => onEditNote(note)}
          onDragStart={() => beginDrag(note.id)}
          onDragEnd={(_, info) => void endDrag(note.id, info)}
          initial={{ opacity: 0, scale: 0.82, y: -38, rotate: note.rotation - 5 }}
          animate={{
            x: note.x,
            y: note.y,
            width: note.width,
            height: note.height,
            rotate: note.rotation,
            opacity: exploration.dimmedIds.has(note.id) ? 0.48 : 1,
            scale: createdNoteId === note.id ? [0.78, wildMotion ? 1.08 : 1.04, 0.98, 1] : selectedIds.has(note.id) ? [1, calmMotion ? 1.005 : wildMotion ? 1.025 : 1.015, 1] : 1,
          }}
          whileDrag={{ scale: calmMotion ? 1.01 : wildMotion ? 1.055 : 1.035, rotate: note.rotation * 0.12, cursor: 'grabbing', zIndex: 50 }}
          transition={{
            type: 'spring',
            stiffness: arranging ? 300 : 480,
            damping: arranging ? 22 : 28,
            mass: 0.82,
          }}
          style={{ zIndex: note.pinned ? 24 : selectedIds.has(note.id) ? 20 : 10 }}
          className="absolute left-0 top-0 cursor-grab select-none touch-none"
        >
          <motion.article
            whileHover={{ y: calmMotion ? -2 : wildMotion ? -8 : -5, scale: calmMotion ? 1.004 : wildMotion ? 1.025 : 1.014, rotate: note.rotation * 0.035 }}
            animate={{
              boxShadow:
                savingId === note.id
                  ? '0 1px 2px rgba(31,41,55,.08), 0 28px 66px rgba(16,185,129,.24), inset 0 1px 0 rgba(255,255,255,.92)'
                  : selectedIds.has(note.id)
                    ? '0 1px 2px rgba(31,41,55,.08), 0 30px 70px rgba(14,165,233,.24), inset 0 1px 0 rgba(255,255,255,.92)'
                    : '0 1px 2px rgba(31,41,55,.05), 0 20px 48px rgba(31,41,55,.12), inset 0 1px 0 rgba(255,255,255,.92)',
            } }
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            style={{ minHeight: MIN_NOTE_HEIGHT }}
            className={`group relative flex h-full w-full flex-col overflow-hidden rounded-[24px] border bg-gradient-to-br ${colorClass[note.color] ?? colorClass.butter} p-3.5 backdrop-blur-2xl before:pointer-events-none before:absolute before:inset-0 before:rounded-[24px] before:bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,.92),transparent_32%),radial-gradient(circle_at_90%_88%,rgba(255,255,255,.44),transparent_38%),linear-gradient(135deg,rgba(255,255,255,.48),transparent_54%)] after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[23px] after:border after:border-white/48 ${
              selectedIds.has(note.id)
                ? 'ring-2 ring-sky-500/58'
                : savingId === note.id
                  ? 'ring-2 ring-emerald-300/45'
                  : exploration.highlightedIds.has(note.id)
                    ? 'ring-2 ring-violet-400/58'
                    : ''
            }`}
          >
            <motion.div
              className={`pointer-events-none absolute left-7 right-7 top-0 z-20 h-1 rounded-b-full bg-gradient-to-r ${accentClass[note.color] ?? accentClass.butter} opacity-85`}
              animate={calmMotion ? { opacity: 0.8, scaleX: 1 } : selectedIds.has(note.id) ? { opacity: [0.7, 1, 0.7], scaleX: [0.86, 1.04, 0.86] } : { opacity: [0.72, 0.95, 0.72], scaleX: [0.92, 1, 0.92] }}
              transition={{ duration: selectedIds.has(note.id) ? 1.2 : 2.8, repeat: calmMotion ? 0 : Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="pointer-events-none absolute -right-10 -top-10 z-[1] h-28 w-28 rounded-full bg-white/44 blur-2xl"
              animate={calmMotion ? { scale: 1, opacity: 0.24 } : { scale: [1, 1.25, 1], opacity: [0.22, 0.58, 0.22] }}
              transition={{ duration: 3.6, repeat: calmMotion ? 0 : Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="pointer-events-none absolute inset-y-0 -left-24 z-[1] w-14 rotate-12 bg-white/18 blur-md"
              animate={calmMotion ? { x: -70, opacity: 0 } : { x: [-70, note.width + 90], opacity: 1 }}
              transition={{ duration: 2.8, repeat: calmMotion ? 0 : Infinity, repeatDelay: 1.1, ease: 'easeInOut' }}
            />
            <div className="relative z-10 flex min-w-0 items-center gap-1.5 pr-1">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-2xl ring-1 ${iconClass[note.color] ?? iconClass.butter}`}>
                {note.priority === 'high' ? '⚑' : '✦'}
              </span>
              <span
                className="shrink-0 rounded-full border border-white/48 bg-white/40 px-2 py-0.5 text-[10px] font-black opacity-75 shadow-[inset_0_1px_0_rgba(255,255,255,.7)]"
                title={stickyCategoryHelp(note)}
              >
                {stickyCategoryLabel(note)}
              </span>
              {noteMood(note) !== '进行中' && (
                <span
                  className="shrink-0 rounded-full border border-white/36 bg-white/30 px-2 py-0.5 text-[10px] font-black opacity-62 shadow-[inset_0_1px_0_rgba(255,255,255,.52)]"
                  title={noteMoodHelp(note)}
                >
                  {noteMood(note)}
                </span>
              )}
              {note.pinned && (
                <motion.span
                  initial={{ scale: 0.88 }}
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut' }}
                  className="ml-auto shrink-0 rounded-full border border-rose-100 bg-rose-50/84 px-2.5 py-1 text-[11px] font-black text-rose-500 shadow-[0_8px_18px_rgba(244,63,94,.10)]"
                  title="已置顶"
                >
                  📌
                </motion.span>
              )}
            </div>

            <h3 className="relative z-10 mt-2.5 line-clamp-2 text-[16px] font-black leading-snug text-zinc-900/92">
              {note.title || '未命名便签'}
            </h3>

            <p
              className="relative z-10 mt-2 min-h-[6rem] flex-1 overflow-hidden rounded-[18px] border border-white/56 bg-white/28 px-3 py-2.5 text-[12px] font-bold leading-5 text-zinc-700/90 shadow-[inset_0_1px_0_rgba(255,255,255,.58)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4] whitespace-pre-wrap"
              title={note.content || '双击写点什么...'}
            >
              {note.content || '双击写点什么...'}
            </p>
            {note.attachments.length > 0 && (
              <div className="relative z-10 mt-2 flex flex-wrap gap-1.5">
                {note.attachments.slice(0, 2).map((attachment) => (
                  <button
                    key={attachment.path}
                    className="max-w-[124px] truncate rounded-full border border-white/36 bg-white/48 px-2.5 py-1 text-[11px] font-bold opacity-78 shadow-[0_1px_4px_rgba(15,23,42,.08)] transition hover:bg-white hover:opacity-100"
                    title={attachment.path}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenAttachment(attachment.path);
                    } }
                  >
                    📎 {attachment.name}
                    {attachment.description && <span className="ml-1 opacity-60">· {attachment.description}</span>}
                  </button>
                ))}
                {note.attachments.length > 2 && (
                  <span className="rounded-full bg-white/36 px-2.5 py-1 text-[11px] font-bold opacity-60">
                    +{note.attachments.length - 2}
                  </span>
                )}
              </div>
            )}
            <div className="relative z-10 mt-2 flex min-h-7 items-center justify-between gap-2 text-[11px] font-black">
              <span className="truncate rounded-full bg-white/44 px-2.5 py-1 text-zinc-600/90 opacity-60">
                {note.tags.length ? note.tags.map((tag) => `#${tag}`).join(' ') : '#轻备忘'}
              </span>
              <div className="ml-auto flex shrink-0 items-center justify-end">
                <span className="rounded-full bg-white/40 px-2.5 py-1 text-zinc-600/90 opacity-60 transition group-hover:hidden" title={stickyCategoryHelp(note)}>
                  {note.priority === 'high' ? '⚑ 高优先级' : note.attachments.length ? `📎 ${note.attachments.length}` : '自动配色'}
                </span>
                <div
                  className="relative z-30 hidden items-center gap-1 rounded-2xl bg-white/12 p-0.5 group-hover:flex"
                  onMouseDownCapture={stopCardPointerEvent}
                  onPointerDownCapture={stopCardPointerEvent}
                  onTouchStartCapture={stopCardPointerEvent}
                >
                  {onAskAiNextStep && (
                    <NoteActionButton
                      label="AI 下一步"
                      icon="✦"
                      tone="sky"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectionChange(new Set([note.id]));
                        onAskAiNextStep([note.id]);
                      } }
                    />
                  )}
                  <NoteActionButton
                    label={note.priority === 'high' ? '降为普通优先级' : '标记为高优先级'}
                    icon={<PriorityIcon high={note.priority === 'high'} />}
                    tone="amber"
                    onClick={(event) => {
                      event.stopPropagation();
                      onTogglePriority(note);
                    } }
                  />
                  <NoteActionButton
                    label="转为提醒"
                    icon={<ClockIcon />}
                    tone="sky"
                    onClick={(event) => {
                      event.stopPropagation();
                      onConvertToReminder(note);
                    } }
                  />
                  <NoteActionButton
                    label="归档便签"
                    icon={<ArchiveIcon />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onArchiveNote(note.id);
                    } }
                  />
                </div>
              </div>
            </div>
          </motion.article>
        </motion.div>
      ))}
      </div>
    </div>
  );
}


function StickyContextMenu({
  note,
  x,
  y,
  onEdit,
  onConvert,
  onTogglePriority,
  onArchive,
}: {
  note: StickyNote;
  x: number;
  y: number;
  onEdit: () => void;
  onConvert: () => void;
  onTogglePriority: () => void;
  onArchive: () => void;
}) {
  return (
    <motion.div
      className="fixed z-[90] w-[208px] overflow-hidden rounded-[22px] border border-white/78 bg-white/92 p-1.5 shadow-[0_24px_70px_rgba(15,23,42,.22)] backdrop-blur-2xl"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="px-3 py-2">
        <p className="truncate text-[11px] font-black text-zinc-700">{note.title || '未命名便签'}</p>
        <p className="mt-0.5 text-[10px] font-semibold text-zinc-400">右键操作</p>
      </div>
      <ContextMenuButton icon="✎" label="编辑便签" onClick={onEdit} />
      <ContextMenuButton icon="◷" label="转为提醒" onClick={onConvert} />
      <ContextMenuButton icon="⚑" label={note.priority === 'high' ? '降为普通优先级' : '标为高优先级'} onClick={onTogglePriority} />
      <ContextMenuButton icon="▣" label="归档便签" danger onClick={onArchive} />
    </motion.div>
  );
}

function ContextMenuButton({
  icon,
  label,
  danger = false,
  onClick,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-black transition ${danger ? 'text-rose-600 hover:bg-rose-50' : 'text-zinc-600 hover:bg-zinc-950/[0.045] hover:text-zinc-900'}`}
      onPointerDownCapture={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-zinc-950/[0.045] text-[11px]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}


function stopCardPointerEvent(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement> | TouchEvent<HTMLElement>) {
  event.stopPropagation();
}

function NoteActionButton({
  label,
  icon,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  icon: ReactNode;
  tone?: 'neutral' | 'sky' | 'amber';
  onClick: (event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) => void;
}) {
  const toneClass = {
    neutral: 'border-zinc-200/60 bg-white/44 text-zinc-500 hover:bg-white/82 hover:text-zinc-800',
    sky: 'border-sky-100/70 bg-sky-50/62 text-sky-700 hover:bg-sky-50',
    amber: 'border-amber-100/70 bg-amber-50/62 text-amber-700 hover:bg-amber-50',
  }[tone];

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`relative z-30 grid h-8 w-8 shrink-0 place-items-center rounded-xl border text-[11px] font-black leading-none shadow-[0_1px_3px_rgba(31,41,55,.08)] transition hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_8px_18px_rgba(15,23,42,.10)] ${toneClass}`}
      onMouseDownCapture={stopCardPointerEvent}
      onMouseDown={stopCardPointerEvent}
      onPointerDownCapture={stopCardPointerEvent}
      onPointerDown={stopCardPointerEvent}
      onTouchStartCapture={stopCardPointerEvent}
      onTouchStart={stopCardPointerEvent}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
    >
      {icon}
    </button>
  );
}

function PriorityIcon({ high }: { high: boolean }) {
  return high ? (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path d="M10 4v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m6.5 10.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
      <path d="M5 3.8A1.8 1.8 0 0 1 6.8 2h6.15c.76 0 1.15.9.64 1.46L12.25 5l1.34 1.54c.5.57.1 1.46-.64 1.46H7v7.25a.95.95 0 1 1-1.9 0V3.8H5Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 6.4v4l3 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
      <path d="M4.5 6.5h11v8.2a1.8 1.8 0 0 1-1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8V6.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3.7 4.2h12.6v2.3H3.7V4.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M7.8 10.2h4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function buildTagConnections(notes: StickyNote[]): Array<{ from: StickyNote; to: StickyNote; tag: string }> {
  const connections: Array<{ from: StickyNote; to: StickyNote; tag: string }> = [];
  for (let leftIndex = 0; leftIndex < notes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < notes.length; rightIndex += 1) {
      const left = notes[leftIndex];
      const right = notes[rightIndex];
      const shared = left.tags.find((tag) => right.tags.includes(tag));
      if (!shared) continue;
      connections.push({ from: left, to: right, tag: shared });
      if (connections.length >= 10) return connections;
    }
  }
  return connections;
}

function DotGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle,rgba(15,23,42,.14)_1px,transparent_1px)] [background-size:26px_26px] [background-position:13px_13px]" />
  );
}

