import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openPath } from '@tauri-apps/plugin-opener';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  buildAiNextStepPrompt,
  buildDashboardStats,
  buildAttachmentFromPath,
  buildNoteInput,
  buildQuickReminderDraft,
  buildReminderInput,
  buildWallCleanupSuggestions,
  buildRiskRadar,
  buildDailyRoute,
  buildDailyReview,
  buildDailyQueue,
  dailyQueueItemKey,
  getDailyQueueItemStatus,
  summarizeDailyQueueProgress,
  chooseAutoNoteColor,
  describeAttachment,
  filterNotes,
  filterFocusWallNotes,
  getReminderVisualTone,
  inferNoteCategory,
  recommendNoteMetadata,
  replaceNote,
  repeatRuleLabel,
  toStickyNote,
  type BackupResult,
  type BackendNote,
  type BackendReminder,
  type DashboardFilter,
  type DailyQueue,
  type DailyQueueItem,
  type DailyQueueItemStatus,
  type DailyQueueProgress,
  type DailyQueueStatusMap,
  type DashboardStats,
  type NoteAttachment,
  type NoteInputDraft,
  type RepeatRulePayload,
  type ReminderDiagnostics,
  type ReminderEvent,
  type ReminderInputDraft,
} from './app-model';
import { arrangeWallNotes, toLayoutPatch } from './features/sticky-wall/layout';
import { DailyBriefDialog } from './features/daily-loop/DailyBrief';
import { ShortcutHelp } from './features/help/ShortcutHelp';
import { type MotionMode, motionModeLabel, nextMotionMode, shouldLoopMotion } from './features/motion/motion-mode';
import { buildReminderGroups } from './features/reminders/reminder-groups';
import { describeReminderStatus } from './features/reminders/reminder-status';
import { StickyWall } from './features/sticky-wall/StickyWall';
import type { LayoutPatch, StickyNote } from './features/sticky-wall/types';
import type { WallExplorationMode } from './features/sticky-wall/wall-filter';
import { getInsightDialogActions } from './insight-actions';

type DrawerMode = 'note-create' | 'note-edit' | 'reminder-create' | 'reminder-edit';
type DrawerState = { mode: DrawerMode; id?: number } | null;
type QuickEntryMode = 'note' | 'reminder';
type GeneratedTitle = { title: string; source: 'ai' | 'fallback' };
type GeneratedText = { text: string; source: 'ai' | 'fallback' };
type AiKeyStatus = { configured: boolean; source: string | null };
type AiAssistMode = 'action' | 'tease' | 'reminder' | 'time' | 'file' | 'organize' | 'summary' | 'compress' | 'recommend' | 'dailyRoast' | 'nextStep';
type ReminderFiredPayload = { id: number; title: string; body: string; priority: 'normal' | 'high' };
type FileBrowserEntry = { name: string; path: string; isDir: boolean };
type FileBrowserDirectory = { currentPath: string; parentPath: string | null; entries: FileBrowserEntry[] };
type AiInsight = {
  title: string;
  text: string;
  source: 'ai' | 'fallback';
  canAppendToNote?: boolean;
  canCreateReminder?: boolean;
  canArchiveNote?: boolean;
  targetNoteIds?: number[];
};
type SidePanelMode = 'focus' | 'center' | 'timeline';
type CommandPaletteAction = { id: string; label: string; hint: string; icon: string; run: () => void };
type UndoAction =
  | { label: string; kind: 'archive-note'; id: number }
  | { label: string; kind: 'complete-reminder' | 'archive-reminder'; id: number };
type MiniCaptureMode = 'note' | 'reminder';
type SmartEntry = { mode: QuickEntryMode; content: string; priority: 'normal' | 'high'; attachments: NoteAttachment[]; dueAtLocal?: string; reason?: string };

const quickCopies = ['把脑袋里的小火花贴出来。', '今天最重要的一件事是什么？', '写下来，笨蛋，别全靠脑子硬扛。'];
const noteTemplates = [
  { name: '今日计划', content: '今日最重要：\n1. \n2. \n3. \n\n风险/阻塞：\n\n晚上复盘：' },
  { name: '客户跟进', content: '客户：\n事项：\n下一步：\n提醒时间：\n关联文件：' },
  { name: 'Bug 记录', content: '现象：\n复现步骤：\n影响范围：\n原因猜测：\n修复结果：' },
  { name: '会议纪要', content: '会议主题：\n结论：\n待办：\n负责人：\n截止时间：' },
  { name: '灵感收集', content: '灵感：\n为什么值得做：\n第一步：\n参考：' },
];

const pageVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
};

const riseVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 360, damping: 30 } },
};

const metricMeta: Record<DashboardFilter, { label: string; icon: string; tone: string; glow: string }> = {
  notes: {
    label: '便签',
    icon: '✦',
    tone: 'from-violet-500 to-sky-500',
    glow: 'shadow-violet-500/18',
  },
  reminders: {
    label: '提醒',
    icon: '◷',
    tone: 'from-sky-500 to-cyan-400',
    glow: 'shadow-sky-500/18',
  },
  highPriority: {
    label: '高优先级',
    icon: '⚑',
    tone: 'from-rose-500 to-amber-400',
    glow: 'shadow-rose-500/18',
  },
};

export default function App() {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [reminders, setReminders] = useState<BackendReminder[]>([]);
  const [recentReminders, setRecentReminders] = useState<BackendReminder[]>([]);
  const [reminderEvents, setReminderEvents] = useState<ReminderEvent[]>([]);
  const [diagnostics, setDiagnostics] = useState<ReminderDiagnostics | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [commandText, setCommandText] = useState('');
  const [quickMode, setQuickMode] = useState<QuickEntryMode>('note');
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>('notes');
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>('focus');
  const [wallExplorationMode, setWallExplorationMode] = useState<WallExplorationMode>('all');
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [miniCaptureOpen, setMiniCaptureOpen] = useState(false);
  const [miniCaptureMode, setMiniCaptureMode] = useState<MiniCaptureMode>('note');
  const [startupBriefOpen, setStartupBriefOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [motionMode, setMotionMode] = useState<MotionMode>(() => readMotionMode());
  const [dailyQueueStatuses, setDailyQueueStatuses] = useState<DailyQueueStatusMap>(() => readDailyQueueStatuses());
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [alarm, setAlarm] = useState<ReminderFiredPayload | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [createdNoteId, setCreatedNoteId] = useState<number | null>(null);
  const [arranging, setArranging] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [remindersPaused, setRemindersPaused] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<NoteInputDraft>(() => emptyNoteDraft());
  const [reminderDraft, setReminderDraft] = useState<ReminderInputDraft>(() => emptyReminderDraft());
  const canvasMeasureRef = useRef<HTMLDivElement>(null);
  const alarmedReminderIds = useRef<Set<number>>(new Set());
  const [canvasWidth, setCanvasWidth] = useState(960);

  const editingNote = drawer?.mode === 'note-edit' ? notes.find((note) => note.id === drawer.id) : undefined;
  const editingReminder =
    drawer?.mode === 'reminder-edit' ? reminders.find((reminder) => reminder.id === drawer.id) : undefined;
  const visibleNotes = useMemo(() => filterNotes(notes, activeFilter), [activeFilter, notes]);
  const focusWallNotes = useMemo(
    () => filterFocusWallNotes(visibleNotes, selectedIds, focusMode, activeFilter),
    [activeFilter, focusMode, selectedIds, visibleNotes],
  );
  const visibleReminders = useMemo(
    () => (activeFilter === 'highPriority' ? reminders.filter((reminder) => reminder.priority === 'high') : reminders),
    [activeFilter, reminders],
  );
  const highPriorityNotes = useMemo(() => notes.filter((note) => note.priority === 'high'), [notes]);
  const highPriorityReminders = useMemo(() => reminders.filter((reminder) => reminder.priority === 'high'), [reminders]);
  const wallCount =
    activeFilter === 'notes'
      ? focusWallNotes.length
      : activeFilter === 'reminders'
        ? reminders.length
        : highPriorityNotes.length + highPriorityReminders.length;
  const stats = useMemo(() => buildDashboardStats(notes, reminders), [notes, reminders]);
  const dailyRoute = useMemo(() => buildDailyRoute(notes, reminders), [notes, reminders]);
  const dailyReview = useMemo(() => buildDailyReview(notes, reminders), [notes, reminders]);
  const dailyQueue = useMemo(() => buildDailyQueue(notes, reminders), [notes, reminders]);
  const dailyQueueProgress = useMemo(
    () => summarizeDailyQueueProgress(dailyQueue, dailyQueueStatuses),
    [dailyQueue, dailyQueueStatuses],
  );
  const riskRadar = useMemo(() => buildRiskRadar(notes, reminders), [notes, reminders]);
  const nextReminder = visibleReminders[0];
  const selectedWallNotes = useMemo(() => notes.filter((note) => selectedIds.has(note.id)), [notes, selectedIds]);

  useEffect(() => {
    const preventDefaultContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener('contextmenu', preventDefaultContextMenu);
    return () => document.removeEventListener('contextmenu', preventDefaultContextMenu);
  }, []);

  useEffect(() => {
    void refreshData();
    const unlistenQuickAdd = listen('quick-add', () => openNoteDrawer());
    const unlistenPausedChanged = listen<boolean>('paused-changed', (event) => {
      setRemindersPaused(Boolean(event.payload));
    });
    const unlistenReminderFired = listen<ReminderFiredPayload>('reminder-fired', (event) => {
      alarmedReminderIds.current.add(event.payload.id);
      setAlarm(event.payload);
      setSuccess(`提醒到时间：${event.payload.title}`);
      void refreshData();
    });
    const pollTimer = window.setInterval(() => {
      void refreshRecentReminders(true);
    }, 15_000);
    return () => {
      window.clearInterval(pollTimer);
      void unlistenQuickAdd.then((dispose) => dispose());
      void unlistenPausedChanged.then((dispose) => dispose());
      void unlistenReminderFired.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommandK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (!isCommandK) return;
      event.preventDefault();
      setCommandPaletteOpen((open) => !open);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'n' || key === 'r' || event.code === 'Space') {
        event.preventDefault();
        if (key === 'n') {
          setMiniCaptureMode('note');
          setMiniCaptureOpen(true);
        } else if (key === 'r') {
          setMiniCaptureMode('reminder');
          setMiniCaptureOpen(true);
        } else {
          setMiniCaptureOpen((open) => !open);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      const key = event.key.toLowerCase();
      if (event.ctrlKey && !event.altKey && key === 'n') {
        event.preventDefault();
        openNoteDrawer();
      }
      if (event.ctrlKey && !event.altKey && key === 'r') {
        event.preventDefault();
        openReminderDrawer();
      }
      if (event.ctrlKey && !event.altKey && key === 'f') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[data-quick-entry="true"]')?.focus();
      }
      if (event.ctrlKey && event.shiftKey && key === 'a') {
        event.preventDefault();
        setActiveFilter('notes');
        void arrangeVisibleNotes();
      }
      if (!typing && key === 'delete' && selectedIds.size > 0) {
        event.preventDefault();
        void archiveSelectedNotes();
      }
      if (event.ctrlKey && !event.altKey && key === 'd' && selectedIds.size > 0) {
        event.preventDefault();
        void archiveSelectedNotes();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, notes]);

  useEffect(() => {
    if (!drawer) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [drawer]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), 2600);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  useEffect(() => {
    if (!createdNoteId) return;
    const timer = window.setTimeout(() => setCreatedNoteId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [createdNoteId]);
  useEffect(() => {
    window.localStorage.setItem('qmemo-motion-mode', motionMode);
  }, [motionMode]);

  useEffect(() => {
    writeDailyQueueStatuses(dailyQueueStatuses);
  }, [dailyQueueStatuses]);

  useEffect(() => {
    if (loading) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `qmemo-startup-brief-${todayKey}`;
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, 'shown');
    const timer = window.setTimeout(() => setStartupBriefOpen(true), 450);
    return () => window.clearTimeout(timer);
  }, [loading]);


  useEffect(() => {
    const node = canvasMeasureRef.current;
    if (!node) return;
    const updateWidth = () => setCanvasWidth(node.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  async function refreshData() {
    setLoading(true);
    setError(null);
    try {
      const [loadedNotes, loadedReminders] = await Promise.all([
        invoke<BackendNote[]>('list_notes', { query: null }),
        invoke<BackendReminder[]>('list_reminders', { query: null }),
        refreshRecentReminders(false),
        refreshReminderEvents(),
      ]);
      const mappedNotes = loadedNotes.map(toStickyNote);
      setNotes(mappedNotes);
      setReminders(loadedReminders);
      setSelectedIds((current) => keepExistingSelection(current, mappedNotes));
      void refreshSystemStatus();
      void refreshDiagnostics();
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function refreshReminderEvents() {
    const events = await invoke<ReminderEvent[]>('list_reminder_events', { limit: 30 });
    setReminderEvents(events);
    return events;
  }

  async function refreshDiagnostics() {
    try {
      setDiagnostics(await invoke<ReminderDiagnostics>('get_reminder_diagnostics'));
    } catch {
      setDiagnostics(null);
    }
  }

  async function refreshSystemStatus() {
    const [focus, paused, autostart] = await Promise.allSettled([
      invoke<boolean>('get_focus_mode'),
      invoke<boolean>('get_reminders_paused'),
      invoke<boolean>('get_autostart'),
    ]);
    if (focus.status === 'fulfilled') setFocusMode(focus.value);
    if (paused.status === 'fulfilled') setRemindersPaused(paused.value);
    if (autostart.status === 'fulfilled') setAutoStart(autostart.value);
  }

  async function toggleFocusMode() {
    const next = !focusMode;
    setFocusMode(next);
    setError(null);
    try {
      await invoke('set_focus_mode', { enabled: next });
      setSuccess(next ? '专注模式开启：普通提醒会先安静一点。' : '专注模式关闭：普通提醒恢复。');
    } catch (caught) {
      setFocusMode(!next);
      setError(formatError(caught));
    }
  }

  async function toggleReminderPause() {
    const next = !remindersPaused;
    setRemindersPaused(next);
    setError(null);
    try {
      await invoke('set_reminders_paused', { paused: next });
      setSuccess(next ? '提醒已暂停，别暂停太久，笨蛋。' : '提醒已恢复，本小姐继续盯着。');
    } catch (caught) {
      setRemindersPaused(!next);
      setError(formatError(caught));
    }
  }

  async function refreshRecentReminders(shouldAlarm: boolean) {
    const recent = await invoke<BackendReminder[]>('list_recent_reminders', { limit: 8 });
    setRecentReminders(recent);
    if (shouldAlarm) {
      const freshFired = recent.find((reminder) => shouldShowMissedAlarm(reminder, alarmedReminderIds.current));
      if (freshFired) {
        alarmedReminderIds.current.add(freshFired.id);
        setAlarm({
          id: freshFired.id,
          title: freshFired.title,
          body: freshFired.notes || '到时间啦，别装没看见，笨蛋。',
          priority: freshFired.priority,
        });
      }
    }
    return recent;
  }

  function openNoteDrawer(note?: StickyNote) {
    if (note) {
      setNoteDraft({ title: note.title, content: note.content, color: note.color, pinned: note.pinned, attachments: note.attachments });
      setDrawer({ mode: 'note-edit', id: note.id });
    } else {
      setNoteDraft(emptyNoteDraft());
      setDrawer({ mode: 'note-create' });
    }
  }

  function openReminderDrawer(reminder?: BackendReminder) {
    if (reminder) {
      setReminderDraft({
        title: reminder.title,
        notes: reminder.notes,
        dueAtLocal: toDateTimeLocal(reminder.due_at),
        repeatRule: reminder.repeat_rule,
        priority: reminder.priority,
      });
      setDrawer({ mode: 'reminder-edit', id: reminder.id });
    } else {
      setReminderDraft(emptyReminderDraft());
      setDrawer({ mode: 'reminder-create' });
    }
  }

  function closeDrawer() {
    setDrawer(null);
  }

  function setDailyQueueItemStatus(item: DailyQueueItem, status: DailyQueueItemStatus) {
    setDailyQueueStatuses((current) => {
      const key = dailyQueueItemKey(item);
      const next = { ...current };
      if (status === 'open') delete next[key];
      else next[key] = status;
      return next;
    });
    setSuccess(status === 'done' ? '已标记完成。' : status === 'skipped' ? '已跳过，今天先别纠缠它。' : '已恢复到今日队列。');
  }

  async function saveNote() {
    if (!noteDraft.title.trim() && !noteDraft.content.trim()) return;
    const title =
      noteDraft.title.trim() || (await generateTitle('note', noteDraft.content || noteDraft.title || '新的便签')).title;
    const autoDraft = {
      ...noteDraft,
      title,
      color: chooseAutoNoteColor(
        title,
        noteDraft.content,
        drawer?.mode === 'note-edit' ? (editingNote?.id ?? notes.length) : notes.length,
      ),
    };
    const input = buildNoteInput(autoDraft);
    setSaving(true);
    setError(null);
    try {
      if (drawer?.mode === 'note-edit' && editingNote) {
        const updated = toStickyNote(await invoke<BackendNote>('update_note', { id: editingNote.id, input }));
        setNotes((current) => replaceNote(current, updated));
        setSuccess('便签已保存，哼，还算利落。');
      } else {
        const created = toStickyNote(await invoke<BackendNote>('create_note', { input }));
        setNotes((current) => [created, ...current]);
        setSelectedIds(new Set([created.id]));
        setCreatedNoteId(created.id);
        setActiveFilter('notes');
        setSuccess('新便签贴好了。');
      }
      closeDrawer();
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function saveReminder() {
    if (!reminderDraft.title.trim() && !reminderDraft.notes.trim()) return;
    const title =
      reminderDraft.title.trim() || (await generateTitle('reminder', reminderDraft.notes || reminderDraft.title || '新的提醒')).title;
    const input = buildReminderInput({ ...reminderDraft, title });
    if (!input.title) return;
    setSaving(true);
    setError(null);
    try {
      if (drawer?.mode === 'reminder-edit' && editingReminder) {
        const updated = await invoke<BackendReminder>('update_reminder', {
          id: editingReminder.id,
          input,
        });
        setReminders((current) => current.map((reminder) => (reminder.id === updated.id ? updated : reminder)));
        setSuccess('提醒更新好了，本小姐继续盯着。');
      } else {
        const created = await invoke<BackendReminder>('create_reminder', { input });
        setReminders((current) => [created, ...current]);
        setActiveFilter('reminders');
        setSuccess('提醒安排好了，本小姐替你盯时间。');
      }
      closeDrawer();
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function archiveNote(id: number) {
    setError(null);
    try {
      await invoke('archive_note', { id });
      setNotes((current) => current.filter((note) => note.id !== id));
      setUndoAction({ label: '便签已归档', kind: 'archive-note', id });
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch (caught) {
      setError(formatError(caught));
    }
  }

  async function archiveSelectedNotes() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setError(null);
    try {
      await Promise.all(ids.map((id) => invoke('archive_note', { id })));
      const archivedIds = new Set(ids);
      setNotes((current) => current.filter((note) => !archivedIds.has(note.id)));
      setSelectedIds(new Set());
      setUndoAction(ids.length === 1 ? { label: '便签已归档', kind: 'archive-note', id: ids[0] } : null);
      setSuccess(ids.length === 1 ? '便签已归档。' : `${ids.length} 张便签已归档。`);
    } catch (caught) {
      setError(formatError(caught));
    }
  }

  async function archiveInsightNotes(noteIds: number[]) {
    const ids = noteIds.filter((id) => notes.some((note) => note.id === id));
    if (ids.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all(ids.map((id) => invoke('archive_note', { id })));
      const archivedIds = new Set(ids);
      setNotes((current) => current.filter((note) => !archivedIds.has(note.id)));
      setSelectedIds((current) => new Set([...current].filter((id) => !archivedIds.has(id))));
      setUndoAction(ids.length === 1 ? { label: '便签已归档', kind: 'archive-note', id: ids[0] } : null);
      setAiInsight(null);
      setSuccess(ids.length === 1 ? '便签已归档。' : `${ids.length} 张便签已归档。`);
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setSaving(false);
    }
  }
  async function openAttachment(path: string) {
    setError(null);
    try {
      await openPath(path);
    } catch (caught) {
      setError(`文件打不开：${formatError(caught)}`);
    }
  }

  async function completeReminder(id: number) {
    setError(null);
    try {
      await invoke('complete_reminder', { id });
      setReminders((current) => current.filter((reminder) => reminder.id !== id));
      setUndoAction({ label: '提醒已完成', kind: 'complete-reminder', id });
      setCelebration('完成一件事，勉强值得夸一下。');
      setSuccess('这条提醒完成了，笨蛋还挺可靠嘛。');
    } catch (caught) {
      setError(formatError(caught));
    }
  }

  async function archiveReminder(id: number) {
    setError(null);
    try {
      await invoke('archive_reminder', { id });
      setReminders((current) => current.filter((reminder) => reminder.id !== id));
      setUndoAction({ label: '提醒已收起', kind: 'archive-reminder', id });
    } catch (caught) {
      setError(formatError(caught));
    }
  }

  async function setNotePriority(note: StickyNote, priority: 'normal' | 'high') {
    const nextContent = normalizeNotePriorityContent(note.content, priority);
    const input = buildNoteInput({
      title: note.title,
      content: nextContent,
      color: note.color,
      pinned: note.pinned,
      attachments: note.attachments,
    });
    setError(null);
    try {
      const updated = toStickyNote(await invoke<BackendNote>('update_note', { id: note.id, input }));
      setNotes((current) => replaceNote(current, updated));
      setSuccess(priority === 'high' ? '便签已标为高优先级。' : '便签已降为普通。');
    } catch (caught) {
      setError(formatError(caught));
    }
  }

  async function setSelectedNotesPriority(priority: 'normal' | 'high') {
    const selectedNotes = notes.filter((note) => selectedIds.has(note.id));
    if (selectedNotes.length === 0) return;
    setError(null);
    try {
      const updated = await Promise.all(
        selectedNotes.map((note) =>
          invoke<BackendNote>('update_note', {
            id: note.id,
            input: buildNoteInput({
              title: note.title,
              content: normalizeNotePriorityContent(note.content, priority),
              color: note.color,
              pinned: note.pinned,
              attachments: note.attachments,
            }),
          }),
        ),
      );
      const updatedById = new Map(updated.map((note) => [note.id, toStickyNote(note)]));
      setNotes((current) => current.map((note) => updatedById.get(note.id) ?? note));
      setSuccess(priority === 'high' ? `${selectedNotes.length} 张便签已标为高优先级。` : `${selectedNotes.length} 张便签已降为普通。`);
    } catch (caught) {
      setError(formatError(caught));
    }
  }

  async function arrangeSelectedNotes() {
    const selectedNotes = focusWallNotes.filter((note) => selectedIds.has(note.id));
    if (selectedNotes.length <= 1) return;
    setArranging(true);
    try {
      const arranged = arrangeWallNotes(selectedNotes, {
        containerWidth: Math.max(320, canvasWidth - 8),
        gap: 24,
        startX: 24,
        startY: 24,
      });
      const arrangedById = new Map(arranged.map((note) => [note.id, note]));
      setNotes((current) => current.map((note) => arrangedById.get(note.id) ?? note));
      await persistLayouts(arranged.map(toLayoutPatch));
      setSuccess(`${selectedNotes.length} 张选中便签已整理。`);
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      window.setTimeout(() => setArranging(false), 900);
    }
  }
  async function setReminderPriority(reminder: BackendReminder, priority: 'normal' | 'high') {
    setError(null);
    try {
      const updated = await invoke<BackendReminder>('update_reminder', {
        id: reminder.id,
        input: buildReminderInput({
          title: reminder.title,
          notes: reminder.notes,
          dueAtLocal: toDateTimeLocal(reminder.due_at),
          repeatRule: reminder.repeat_rule,
          priority,
        }),
      });
      setReminders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSuccess(priority === 'high' ? '提醒已标为高优先级。' : '提醒已降为普通。');
    } catch (caught) {
      setError(formatError(caught));
    }
  }

  async function snoozeReminder(reminder: BackendReminder, minutes: number) {
    const due = new Date(Date.now() + minutes * 60 * 1000);
    setError(null);
    try {
      const updated = await invoke<BackendReminder>('update_reminder', {
        id: reminder.id,
        input: buildReminderInput({
          title: reminder.title,
          notes: reminder.notes,
          dueAtLocal: toDateTimeLocal(due.toISOString()),
          repeatRule: reminder.repeat_rule,
          priority: reminder.priority,
        }),
      });
      setReminders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSuccess(`已推迟 ${minutes >= 60 ? `${Math.round(minutes / 60)} 小时` : `${minutes} 分钟`}。`);
    } catch (caught) {
      setError(formatError(caught));
    }
  }
  async function convertNoteToReminder(note: StickyNote) {
    setSaving(true);
    setError(null);
    try {
      const draft = buildQuickReminderDraft(`${note.title}\n${note.content}`, note.title || '便签提醒');
      const created = await invoke<BackendReminder>('create_reminder', {
        input: buildReminderInput({
          ...draft,
          priority: note.priority === 'high' ? 'high' : draft.priority,
        }),
      });
      await invoke('archive_note', { id: note.id });
      setReminders((current) => [created, ...current]);
      setNotes((current) => current.filter((item) => item.id !== note.id));
      setActiveFilter('reminders');
      setSidePanelMode('center');
      setUndoAction({ label: '便签已转为提醒', kind: 'archive-note', id: note.id });
      setSuccess('便签已经转成提醒，本小姐会盯时间。');
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function convertReminderToNote(reminder: BackendReminder) {
    setSaving(true);
    setError(null);
    try {
      const content = formatReminderAsNoteContent(reminder);
      const input = buildNoteInput({
        title: reminder.title,
        content: reminder.priority === 'high' ? normalizeNotePriorityContent(content, 'high') : content,
        color: chooseAutoNoteColor(reminder.title, content, notes.length),
        pinned: reminder.priority === 'high',
        attachments: [],
      });
      const created = toStickyNote(await invoke<BackendNote>('create_note', { input }));
      await invoke('archive_reminder', { id: reminder.id });
      setNotes((current) => [created, ...current]);
      setReminders((current) => current.filter((item) => item.id !== reminder.id));
      setSelectedIds(new Set([created.id]));
      setCreatedNoteId(created.id);
      setActiveFilter('notes');
      setUndoAction({ label: '提醒已转为便签', kind: 'archive-reminder', id: reminder.id });
      setSuccess('提醒已经转成便签，信息收好了。');
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function persistLayouts(layouts: LayoutPatch[]) {
    if (layouts.length === 0) return;
    setError(null);
    try {
      await invoke('update_many_note_layouts', { layouts });
    } catch (caught) {
      const message = formatError(caught);
      setError(message);
      throw new Error(message);
    }
  }

  async function undoLastAction() {
    if (!undoAction) return;
    setError(null);
    try {
      if (undoAction.kind === 'archive-note') {
        const restored = toStickyNote(await invoke<BackendNote>('restore_note', { id: undoAction.id }));
        setNotes((current) => [restored, ...current.filter((note) => note.id !== restored.id)]);
        setActiveFilter('notes');
      } else {
        const restored = await invoke<BackendReminder>('restore_reminder', { id: undoAction.id });
        setReminders((current) => [restored, ...current.filter((reminder) => reminder.id !== restored.id)]);
        setActiveFilter('reminders');
        void refreshReminderEvents();
      }
      setUndoAction(null);
      setSuccess('撤销成功，算你反应快。');
    } catch (caught) {
      setError(formatError(caught));
    }
  }

  async function arrangeVisibleNotes() {
    setArranging(true);
    const arranged = arrangeWallNotes(focusWallNotes, {
      containerWidth: Math.max(320, canvasWidth - 8),
      gap: 24,
      startX: 24,
      startY: 24,
    });
    const arrangedById = new Map(arranged.map((note) => [note.id, note]));
    setNotes((current) => current.map((note) => arrangedById.get(note.id) ?? note));
    await persistLayouts(arranged.map(toLayoutPatch));
    window.setTimeout(() => setArranging(false), 900);
    setSuccess('便签墙整理好了，乱糟糟退散。');
  }

  function showCleanupSuggestions() {
    const suggestions = buildWallCleanupSuggestions(notes);
    if (suggestions.length === 0) {
      setAiInsight({
        title: 'AI 清理建议',
        text: '本小姐巡视了一圈：暂时没发现明显重复、过期或已完成便签。桌面还算体面，继续保持。',
        source: 'fallback',
      });
      return;
    }
    setAiInsight({
      title: 'AI 清理建议',
      text: suggestions
        .map(
          (suggestion, index) =>
            `${index + 1}. ${suggestion.title}\n${suggestion.description}\n涉及便签：${suggestion.noteIds.map((id) => `#${id}`).join('、')}`,
        )
        .join('\n\n'),
      source: 'fallback',
    });
  }


  async function generateTitle(kind: QuickEntryMode, content: string): Promise<GeneratedTitle> {
    try {
      return await invoke<GeneratedTitle>('generate_ai_title', { kind, content });
    } catch {
      return { title: fallbackTitle(content, kind), source: 'fallback' };
    }
  }

  async function createQuickEntry() {
    const content = commandText.trim();
    if (!content) return;
    await createQuickEntryFrom(content, quickMode);
    setCommandText('');
  }

  async function createQuickEntryFrom(content: string, mode: QuickEntryMode) {
    const parsed = parseSmartEntry(content, mode);
    if (!parsed.content) return;
    setSaving(true);
    setError(null);
    try {
      const generated = await generateTitle(parsed.mode, parsed.content);
      if (parsed.mode === 'note') {
        const input = buildNoteInput({
          title: generated.title,
          content: parsed.priority === 'high' ? normalizeNotePriorityContent(parsed.content, 'high') : parsed.content,
          color: chooseAutoNoteColor(generated.title, parsed.content, notes.length),
          pinned: parsed.priority === 'high',
          attachments: parsed.attachments,
        });
        const created = toStickyNote(await invoke<BackendNote>('create_note', { input }));
        setNotes((current) => [created, ...current]);
        setSelectedIds(new Set([created.id]));
        setCreatedNoteId(created.id);
        setActiveFilter('notes');
        setSuccess(parsed.reason ?? (generated.source === 'ai' ? 'AI 已生成标题并贴好便签。' : '便签贴好了，标题用了本地规则。'));
      } else {
        const draft = buildQuickReminderDraft(parsed.content, generated.title);
        const created = await invoke<BackendReminder>('create_reminder', {
          input: buildReminderInput({
            ...draft,
            dueAtLocal: parsed.dueAtLocal ?? draft.dueAtLocal,
            priority: parsed.priority === 'high' ? 'high' : draft.priority,
          }),
        });
        setReminders((current) => [created, ...current]);
        setActiveFilter('reminders');
        setSidePanelMode('center');
        setSuccess(parsed.reason ?? (generated.source === 'ai' ? 'AI 已识别时间并安排提醒。' : '提醒安排好了，标题用了本地规则。'));
      }
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function createReminderFromText(content: string, preferredTitle?: string) {
    const text = content.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      const generated = await generateTitle('reminder', preferredTitle ? `${preferredTitle}\n${text}` : text);
      const draft = buildQuickReminderDraft(text, generated.title);
      const created = await invoke<BackendReminder>('create_reminder', { input: buildReminderInput(draft) });
      setReminders((current) => [created, ...current]);
      setActiveFilter('reminders');
      setSidePanelMode('center');
      setSuccess('AI 建议已经变成提醒，本小姐替你盯着。');
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function createNoteFromText(title: string, content: string) {
    const text = content.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    try {
      const input = buildNoteInput({
        title: title.trim() || fallbackTitle(text, 'note'),
        content: text,
        color: chooseAutoNoteColor(title, text, notes.length),
        pinned: false,
        attachments: [],
      });
      const created = toStickyNote(await invoke<BackendNote>('create_note', { input }));
      setNotes((current) => [created, ...current]);
      setSelectedIds(new Set([created.id]));
      setCreatedNoteId(created.id);
      setActiveFilter('notes');
      setSuccess('AI 结果已经保存成便签。');
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function runGlobalAi(mode: Extract<AiAssistMode, 'summary' | 'dailyRoast' | 'organize'>) {
    const content = buildWorkspacePrompt(notes, reminders);
    setAiBusy(mode);
    setError(null);
    try {
      const result = await invoke<GeneratedText>('generate_ai_assist', { mode, content });
      setAiInsight({
        title: mode === 'summary' ? '今日总结' : mode === 'dailyRoast' ? '本小姐毒舌模式' : 'AI 分类整理建议',
        text: result.text,
        source: result.source,
      });
      setSuccess(mode === 'summary' ? '今日总结已生成。' : mode === 'dailyRoast' ? '毒舌模式已开麦。' : 'AI 整理建议已生成。');
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setAiBusy(null);
    }
  }

  async function askAiNextStepForSelection(noteIds?: number[]) {
    const explicitIds = noteIds ? new Set(noteIds) : selectedIds;
    const selectedNotes = notes.filter((note) => explicitIds.has(note.id));
    const sourceNotes = selectedNotes.length > 0 ? selectedNotes : notes.slice(0, 8);
    const prompt = buildAiNextStepPrompt(sourceNotes, selectedNotes.length > 0 ? 'selected' : 'workspace');
    setAiBusy('nextStep');
    setError(null);
    try {
      const result = await invoke<GeneratedText>('generate_ai_assist', { mode: 'nextStep', content: prompt });
      setAiInsight({
        title: selectedNotes.length > 0 ? 'AI 下一步' : '今日下一步',
        text: result.text,
        source: result.source,
        canAppendToNote: selectedNotes.length > 0,
        canCreateReminder: true,
        canArchiveNote: selectedNotes.length > 0,
        targetNoteIds: selectedNotes.map((note) => note.id),
      });
      setSuccess('AI 下一步已经生成。');
    } catch (caught) {
      setAiInsight({
        title: 'AI 下一步',
        text: `本地建议：先给最模糊的便签补一句“下一步”，再把能定时间的事项转成提醒。\n\n${formatError(caught)}`,
        source: 'fallback',
        canAppendToNote: selectedNotes.length > 0,
        canCreateReminder: true,
        canArchiveNote: selectedNotes.length > 0,
        targetNoteIds: selectedNotes.map((note) => note.id),
      });
    } finally {
      setAiBusy(null);
    }
  }

  async function appendInsightToSelectedNotes(insight: AiInsight) {
    const targetIds = insight.targetNoteIds?.length ? insight.targetNoteIds : Array.from(selectedIds);
    if (targetIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await Promise.all(
        notes
          .filter((note) => targetIds.includes(note.id))
          .map((note) => {
            const input = buildNoteInput({
              title: note.title,
              content: `${note.content.trim()}\n\nAI 下一步：\n${insight.text}`.trim(),
              color: note.color,
              pinned: note.pinned,
              attachments: note.attachments,
            });
            return invoke<BackendNote>('update_note', { id: note.id, input });
          }),
      );
      const changed = updated.map(toStickyNote);
      setNotes((current) => current.map((note) => changed.find((item) => item.id === note.id) ?? note));
      setSuccess('AI 下一步已追加到便签。');
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setSaving(false);
    }
  }
  async function runTestReminder() {
    setError(null);
    try {
      await invoke('test_reminder');
      await Promise.all([refreshReminderEvents(), refreshDiagnostics()]);
      setSidePanelMode('center');
      setSuccess('测试提醒已发出。看到了就说明通知链路正常，笨蛋。');
    } catch (caught) {
      setError(formatError(caught));
    }
  }

  async function exportBackup() {
    setError(null);
    try {
      const result = await invoke<BackupResult>('export_backup');
      setSuccess(`备份已生成：${result.notes} 张便签 / ${result.reminders} 条提醒`);
      setAiInsight({
        title: '备份完成',
        text: `备份文件：${result.path}\n\n已导出 ${result.notes} 张便签、${result.reminders} 条提醒。`,
        source: 'fallback',
      });
    } catch (caught) {
      setError(formatError(caught));
    }
  }

  async function copyInsightText(title: string, text: string) {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${text}`);
      setSuccess('洞察内容已复制。');
    } catch (caught) {
      setError(`复制失败：${formatError(caught)}`);
    }
  }

  function showReminderDiagnostics() {
    setSidePanelMode('center');
    setAiInsight({
      title: '提醒诊断',
      text: diagnostics
        ? [
            `通知权限：${diagnostics.notificationPermission}`,
            `调度状态：${diagnostics.schedulerPaused ? '已暂停' : '运行中'}`,
            `专注模式：${diagnostics.focusMode ? '开启' : '关闭'}`,
            `开机自启：${diagnostics.autostartEnabled === null ? '未知' : diagnostics.autostartEnabled ? '已启用' : '未启用'}`,
            `下次提醒：${diagnostics.nextDueAt ? formatReminderTime(diagnostics.nextDueAt) : '暂无'}`,
            `检查时间：${formatReminderTime(diagnostics.checkedAt)}`,
          ].join('\n')
        : '诊断信息暂时不可用。先打开提醒中心刷新一次，再回来查看。',
      source: 'fallback',
    });
  }
  function showDailyBrief(kind: 'plan' | 'review') {
    const todayReminders = reminders.filter((reminder) => isSameLocalDay(reminder.next_due_at ?? reminder.due_at, new Date()));
    const overdue = reminders.filter((reminder) => {
      const due = new Date(reminder.next_due_at ?? reminder.due_at).getTime();
      return Number.isFinite(due) && due < Date.now();
    });
    const todayNotes = notes.filter((note) => inferNoteCategory(`${note.title}
${note.content}`) === 'today').slice(0, 5);
    const waitingNotes = notes.filter((note) => inferNoteCategory(`${note.title}
${note.content}`) === 'waiting').slice(0, 5);
    const completedEvents = reminderEvents.filter((event) => event.kind === 'completed').slice(0, 5);
    const text =
      kind === 'plan'
        ? [
            '今日处理顺序：',
            ...buildDailyRoute(notes, reminders).map((item, index) => `${index + 1}. ${item}`),
            '',
            `今日提醒：${todayReminders.length} 条；过期：${overdue.length} 条。`,
            waitingNotes.length ? `等反馈：${waitingNotes.map((note) => note.title).join('、')}` : '等反馈：暂时没有。',
          ]
        : [
            '今日复盘：',
            completedEvents.length ? `完成提醒：${completedEvents.map((event) => event.title).join('、')}` : '完成提醒：今天还没记录完成项。',
            `剩余今日提醒：${todayReminders.length} 条。`,
            overdue.length ? `拖延项：${overdue.map((reminder) => reminder.title).join('、')}` : '拖延项：暂时没有，勉强夸你一句。',
            '明日建议：把等反馈事项提前确认，不要让桌面继续堆灰。',
          ];
    setAiInsight({
      title: kind === 'plan' ? '处理顺序' : '今日复盘',
      text: text.join('\n'),
      source: 'fallback',
    });
    setSuccess(kind === 'plan' ? '处理顺序已生成。' : '今日复盘已生成。');
  }

  function showRiskRadar() {
    const risks = buildRiskRadar(notes, reminders);
    setAiInsight({
      title: 'AI 风险雷达',
      text:
        risks.length === 0
          ? '本小姐扫描完了：暂时没有明显风险。今天别主动制造混乱就行。'
          : risks.map((risk, index) => `${index + 1}. ${risk.title}\n${risk.description}`).join('\n\n'),
      source: 'fallback',
    });
    setSuccess('风险雷达扫描完成。');
  }


  async function snoozeAlarm(payload: ReminderFiredPayload) {
    const due = new Date(Date.now() + 10 * 60 * 1000);
    try {
      const input = buildReminderInput({
        title: payload.title,
        notes: payload.body,
        dueAtLocal: toDateTimeLocal(due.toISOString()),
        repeatRule: { kind: 'none' },
        priority: payload.priority,
      });
      const created = await invoke<BackendReminder>('create_reminder', { input });
      setReminders((current) => [created, ...current]);
      setAlarm(null);
      setSuccess('已推迟 10 分钟，本小姐继续盯着。');
    } catch (caught) {
      setError(formatError(caught));
    }
  }

  const commandActions = useMemo<CommandPaletteAction[]>(
    () => [
      {
        id: 'new-note',
        label: '写一张便签',
        hint: '打开便签抽屉',
        icon: '✦',
        run: () => openNoteDrawer(),
      },
      {
        id: 'new-reminder',
        label: '新增提醒',
        hint: '打开提醒抽屉',
        icon: '◷',
        run: () => openReminderDrawer(),
      },
      {
        id: 'show-reminders',
        label: '打开提醒中心',
        hint: '查看过期、今日和最近提醒',
        icon: '◎',
        run: () => setSidePanelMode('center'),
      },
      {
        id: 'show-timeline',
        label: '查看今日 / 本周',
        hint: '打开时间线',
        icon: '☀',
        run: () => setSidePanelMode('timeline'),
      },
      {
        id: 'summary',
        label: '生成今日总结',
        hint: 'DeepSeek 或本地兜底',
        icon: '◇',
        run: () => void runGlobalAi('summary'),
      },
      {
        id: 'daily-plan',
        label: '查看处理顺序',
        hint: '按风险、提醒和便签给出先后顺序',
        icon: '☑',
        run: () => showDailyBrief('plan'),
      },
      {
        id: 'risk-radar',
        label: 'AI 风险雷达',
        hint: '检查过期、等反馈、缺下一步事项',
        icon: '⚠',
        run: showRiskRadar,
      },
      {
        id: 'daily-review',
        label: '生成今日复盘',
        hint: '查看完成项、拖延项和明日建议',
        icon: '☾',
        run: () => showDailyBrief('review'),
      },
      {
        id: 'organize',
        label: '一键整理便签墙',
        hint: '按当前宽度紧凑铺开',
        icon: '▦',
        run: () => {
          setActiveFilter('notes');
          void arrangeVisibleNotes();
        },
      },
      {
        id: 'cleanup-wall',
        label: 'AI 清理便签墙',
        hint: '找重复、过期、可归档便签',
        icon: '⌁',
        run: showCleanupSuggestions,
      },
      {
        id: 'roast',
        label: '本小姐毒舌模式',
        hint: '吐槽一下拖延项',
        icon: '♛',
        run: () => void runGlobalAi('dailyRoast'),
      },
      {
        id: 'focus',
        label: focusMode ? '关闭专注模式' : '开启专注模式',
        hint: '控制普通提醒是否安静',
        icon: '☾',
        run: () => void toggleFocusMode(),
      },
      {
        id: 'pause',
        label: remindersPaused ? '恢复提醒' : '暂停提醒',
        hint: '临时暂停/恢复调度提醒',
        icon: 'Ⅱ',
        run: () => void toggleReminderPause(),
      },
      {
        id: 'test-reminder',
        label: '测试提醒链路',
        hint: '同时触发系统通知和应用内弹窗',
        icon: '!',
        run: () => void runTestReminder(),
      },
      {
        id: 'export-backup',
        label: '导出本地备份',
        hint: '生成 JSON 备份文件',
        icon: '⇩',
        run: () => void exportBackup(),
      },
      {
        id: 'mini-capture',
        label: '打开迷你输入框',
        hint: 'Ctrl Alt Space',
        icon: '⌁',
        run: () => setMiniCaptureOpen(true),
      },
      {
        id: 'shortcut-help',
        label: '快捷键帮助',
        hint: '查看命令、创建、归档和迷你输入快捷键',
        icon: '?',
        run: () => setShortcutHelpOpen(true),
      },
      {
        id: 'motion-mode',
        label: `切换动效强度：${motionModeLabel(motionMode)}`,
        hint: '安静 / 活力 / 炫酷',
        icon: '◎',
        run: () => setMotionMode((mode) => nextMotionMode(mode)),
      },
      {
        id: 'ai-settings',
        label: '打开 AI 设置',
        hint: '配置 DeepSeek Key',
        icon: '⚙',
        run: () => setAiSettingsOpen(true),
      },
    ],
    [focusMode, remindersPaused, notes, reminders, focusWallNotes, canvasWidth, motionMode],
  );

  return (
    <main className="relative h-screen overflow-x-hidden overflow-y-auto text-zinc-950">
      <AuroraBackdrop motionMode={motionMode} />
      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto flex min-h-screen max-w-[1580px] flex-col gap-2.5 px-4 py-3 max-[1180px]:px-3"
      >
        <motion.div variants={riseVariants}>
          <CommandIsland
            value={commandText}
            mode={quickMode}
            saving={saving}
            motionMode={motionMode}
            onMotionModeChange={() => setMotionMode((mode) => nextMotionMode(mode))}
            onValueChange={setCommandText}
            onModeChange={setQuickMode}
            onSubmit={() => void createQuickEntry()}
          />
        </motion.div>

        <motion.section variants={riseVariants} className="grid grid-cols-[minmax(0,1fr)_370px] gap-2.5 max-[1180px]:grid-cols-1">
          <HeroPanel stats={stats} active={activeFilter} nextReminder={nextReminder} motionMode={motionMode} onSelect={setActiveFilter} />
          <MetricDock stats={stats} active={activeFilter} motionMode={motionMode} onSelect={setActiveFilter} />
        </motion.section>

        <motion.section
          variants={riseVariants}
          className="grid min-h-[590px] flex-1 grid-cols-[minmax(0,1fr)_370px] gap-2.5 max-[1180px]:min-h-[780px] max-[1180px]:grid-cols-1"
        >
          <CanvasStage
            count={wallCount}
            activeFilter={activeFilter}
            measureRef={canvasMeasureRef}
            onArrange={() => {
              if (activeFilter === 'notes') void arrangeVisibleNotes();
              else setSuccess('这面墙已经按时间和优先级整理好了。');
            }}
            onCreate={() => (activeFilter === 'notes' ? openNoteDrawer() : openReminderDrawer())}
          >
            {activeFilter === 'notes' && (
              <StickyWall
                notes={focusWallNotes}
                selectedIds={selectedIds}
                onNotesChange={(changed) => {
                  const changedById = new Map(changed.map((note) => [note.id, note]));
                  setNotes((current) => current.map((note) => changedById.get(note.id) ?? note));
                }}
                onSelectionChange={setSelectedIds}
                onEditNote={openNoteDrawer}
                onArchiveNote={(id) => void archiveNote(id)}
                onConvertToReminder={(note) => void convertNoteToReminder(note)}
                onTogglePriority={(note) => void setNotePriority(note, note.priority === 'high' ? 'normal' : 'high')}
                onOpenAttachment={(path) => void openAttachment(path)}
                onPersistLayouts={persistLayouts}
                onArchiveSelected={() => void archiveSelectedNotes()}
                onSetSelectedPriority={(priority) => void setSelectedNotesPriority(priority)}
                onArrangeSelected={() => void arrangeSelectedNotes()}
                onClearSelection={() => setSelectedIds(new Set())}
                motionMode={motionMode}
                createdNoteId={createdNoteId}
                arranging={arranging}
                explorationMode={wallExplorationMode}
                challengeNoteIds={dailyQueue.highlightedNoteIds}
                onExplorationModeChange={setWallExplorationMode}
                onAskAiNextStep={(noteIds) => void askAiNextStepForSelection(noteIds)}
              />
            )}
            {activeFilter === 'reminders' && (
              <ReminderWall
                reminders={reminders}
                onCreate={() => openReminderDrawer()}
                onEdit={openReminderDrawer}
                onComplete={(id) => void completeReminder(id)}
                onArchive={(id) => void archiveReminder(id)}
                onSnooze={(reminder, minutes) => void snoozeReminder(reminder, minutes)}
                diagnostics={diagnostics}
                onConvertToNote={(reminder) => void convertReminderToNote(reminder)}
                onTogglePriority={(reminder) => void setReminderPriority(reminder, reminder.priority === 'high' ? 'normal' : 'high')}
              />
            )}
            {activeFilter === 'highPriority' && (
              <PriorityWall
                notes={highPriorityNotes}
                reminders={highPriorityReminders}
                onCreateReminder={() => openReminderDrawer()}
                onEditNote={openNoteDrawer}
                onEditReminder={openReminderDrawer}
                onOpenAttachment={(path) => void openAttachment(path)}
                onCompleteReminder={(id) => void completeReminder(id)}
                onConvertNoteToReminder={(note) => void convertNoteToReminder(note)}
                onConvertReminderToNote={(reminder) => void convertReminderToNote(reminder)}
                onDowngradeNote={(note) => void setNotePriority(note, 'normal')}
                onDowngradeReminder={(reminder) => void setReminderPriority(reminder, 'normal')}
              />
            )}
          </CanvasStage>

          <FocusRail
            loading={loading}
            reminders={visibleReminders}
            recentReminders={recentReminders}
            reminderEvents={reminderEvents}
            diagnostics={diagnostics}
            activeFilter={activeFilter}
            mode={sidePanelMode}
            motionMode={motionMode}
            focusMode={focusMode}
            remindersPaused={remindersPaused}
            autoStart={autoStart}
            dailyQueue={dailyQueue}
            dailyQueueProgress={dailyQueueProgress}
            dailyQueueStatuses={dailyQueueStatuses}
            onDailyQueueItem={(item) => {
              if (item.kind === 'note') {
                setActiveFilter('notes');
                setWallExplorationMode('challenge');
                setSelectedIds(new Set([item.id]));
                return;
              }
              if (item.kind === 'reminder') {
                setActiveFilter('reminders');
                setSidePanelMode('center');
                return;
              }
              openNoteDrawer();
            }}
            onModeChange={setSidePanelMode}
            onSetDailyQueueItemStatus={setDailyQueueItemStatus}
            onCreateReminder={() => openReminderDrawer()}
            onOpenAiSettings={() => setAiSettingsOpen(true)}
            onDailySummary={() => void runGlobalAi('summary')}
            onDailyRoast={() => void runGlobalAi('dailyRoast')}
            onDailyPlan={() => showDailyBrief('plan')}
            onRiskRadar={showRiskRadar}
            onDailyReview={() => showDailyBrief('review')}
            onTestReminder={() => void runTestReminder()}
            onExportBackup={() => void exportBackup()}
            onReminderDiagnostics={showReminderDiagnostics}
            aiBusy={aiBusy}
            onToggleFocusMode={() => void toggleFocusMode()}
            onToggleReminderPause={() => void toggleReminderPause()}
            onRefresh={() => void refreshData()}
            onEditReminder={openReminderDrawer}
            onCompleteReminder={(id) => void completeReminder(id)}
            onArchiveReminder={(id) => void archiveReminder(id)}
            onSnoozeReminder={(reminder, minutes) => void snoozeReminder(reminder, minutes)}
            onConvertReminderToNote={(reminder) => void convertReminderToNote(reminder)}
            onToggleReminderPriority={(reminder) => void setReminderPriority(reminder, reminder.priority === 'high' ? 'normal' : 'high')}
          />
        </motion.section>
      </motion.div>

      <Toast
        error={error}
        success={success}
        undo={undoAction}
        onUndo={() => void undoLastAction()}
        onDismiss={() => (error ? setError(null) : setSuccess(null))}
      />
      <CelebrationBurst message={celebration} />
      <CommandPalette
        open={commandPaletteOpen}
        actions={commandActions}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <DailyBriefDialog
        open={startupBriefOpen}
        stats={stats}
        nextReminder={nextReminder}
        route={dailyRoute}
        risks={riskRadar}
        review={dailyReview}
        onClose={() => setStartupBriefOpen(false)}
        onStartFocus={() => {
          setStartupBriefOpen(false);
          void toggleFocusMode();
        }}
        onDailyPlan={() => {
          setStartupBriefOpen(false);
          showDailyBrief('plan');
        }}
        onRiskRadar={() => {
          setStartupBriefOpen(false);
          showRiskRadar();
        }}
        onDailyReview={() => {
          setStartupBriefOpen(false);
          showDailyBrief('review');
        }}
      />
      <ShortcutHelp open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />
      <MiniCapture
        open={miniCaptureOpen}
        mode={miniCaptureMode}
        saving={saving}
        onModeChange={setMiniCaptureMode}
        onClose={() => setMiniCaptureOpen(false)}
        onSubmit={(value, mode) => {
          void createQuickEntryFrom(value, mode);
          setMiniCaptureOpen(false);
        }}
      />
      <ReminderAlarmDialog
        alarm={alarm}
        onClose={() => setAlarm(null)}
        onComplete={(id) => {
          setAlarm(null);
          void completeReminder(id);
        }}
        onSnooze={(payload) => void snoozeAlarm(payload)}
      />
      <AiInsightDialog
        insight={aiInsight}
        onClose={() => setAiInsight(null)}
        onCopy={(title, text) => void copyInsightText(title, text)}
        onAppendToNote={(insight) => void appendInsightToSelectedNotes(insight)}
        onCreateReminder={(insight) => void createReminderFromText(insight.text, insight.title)}
        onArchiveNotes={(noteIds) => void archiveInsightNotes(noteIds)}
      />
      <EditorDrawer
        drawer={drawer}
        noteDraft={noteDraft}
        reminderDraft={reminderDraft}
        saving={saving}
        onClose={closeDrawer}
        onNoteDraftChange={setNoteDraft}
        onReminderDraftChange={setReminderDraft}
        onCreateReminderFromText={(content) => void createReminderFromText(content, noteDraft.title)}
        onSaveNote={() => void saveNote()}
        onSaveReminder={() => void saveReminder()}
      />
      <AiSettingsDialog open={aiSettingsOpen} onClose={() => setAiSettingsOpen(false)} />
    </main>
  );
}

function AuroraBackdrop({ motionMode }: { motionMode: MotionMode }) {
  const loopMotion = shouldLoopMotion(motionMode);
  const wildMotion = motionMode === 'wild';
  return (
    <div className={`pointer-events-none fixed inset-0 overflow-hidden ${motionMode === 'calm' ? 'motion-calm' : ''}`}>
      <motion.div
        className="aurora-blob aurora-blob-a"
        animate={loopMotion ? { x: [-18, wildMotion ? 28 : 14, -18], y: [0, wildMotion ? 18 : 8, 0], scale: [1, wildMotion ? 1.08 : 1.035, 1] } : { x: 0, y: 0, scale: 1 }}
        transition={{ duration: wildMotion ? 12 : 18, repeat: loopMotion ? Infinity : 0, ease: 'easeInOut' }}
      />
      <motion.div
        className="aurora-blob aurora-blob-b"
        animate={loopMotion ? { x: [16, wildMotion ? -20 : -10, 16], y: [-8, wildMotion ? 16 : 6, -8], scale: [1, wildMotion ? 1.1 : 1.04, 1] } : { x: 0, y: 0, scale: 1 }}
        transition={{ duration: wildMotion ? 14 : 20, repeat: loopMotion ? Infinity : 0, ease: 'easeInOut' }}
      />
      <motion.div
        className="aurora-blob aurora-blob-c"
        animate={loopMotion ? { x: [-10, wildMotion ? 18 : 8, -10], y: [12, wildMotion ? -18 : -8, 12], scale: [1, wildMotion ? 1.07 : 1.03, 1] } : { x: 0, y: 0, scale: 1 }}
        transition={{ duration: wildMotion ? 16 : 22, repeat: loopMotion ? Infinity : 0, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.72),transparent_44%),linear-gradient(135deg,#f8fbff_0%,#f4f3ff_48%,#fff8ee_100%)]" />
      <motion.div
        className="absolute inset-0 opacity-[0.30] [background-image:linear-gradient(rgba(15,23,42,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,.045)_1px,transparent_1px)] [background-size:56px_56px]"
        animate={loopMotion ? { backgroundPosition: ['0px 0px', wildMotion ? '56px 56px' : '24px 24px'] } : { backgroundPosition: '0px 0px' }}
        transition={{ duration: wildMotion ? 22 : 38, repeat: loopMotion ? Infinity : 0, ease: 'linear' }}
      />
    </div>
  );
}

function CommandIsland({
  value,
  mode,
  saving,
  motionMode,
  onMotionModeChange,
  onValueChange,
  onModeChange,
  onSubmit,
}: {
  value: string;
  mode: QuickEntryMode;
  saving: boolean;
  motionMode: MotionMode;
  onMotionModeChange: () => void;
  onValueChange: (value: string) => void;
  onModeChange: (mode: QuickEntryMode) => void;
  onSubmit: () => void;
}) {
  const nextMode = mode === 'note' ? 'reminder' : 'note';
  const loopMotion = shouldLoopMotion(motionMode);
  const wildMotion = motionMode === 'wild';
  const motionButtonTone =
    motionMode === 'calm'
      ? 'border-emerald-100 bg-emerald-50/82 text-emerald-700'
      : motionMode === 'lively'
        ? 'border-sky-100 bg-sky-50/82 text-sky-700'
        : 'border-violet-100 bg-violet-50/86 text-violet-700';
  return (
    <header className="grid grid-cols-[minmax(330px,390px)_minmax(280px,1fr)] items-center gap-3.5 rounded-[26px] border border-white/70 bg-white/64 px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,.04),0_18px_54px_rgba(68,83,120,.11)] backdrop-blur-2xl max-[1180px]:grid-cols-1">
      <div className="flex min-w-0 items-center gap-3">
        <motion.div className="relative grid h-10 w-10 shrink-0 place-items-center">
          <motion.div
            className="absolute inset-[-3px] rounded-[18px] bg-gradient-to-r from-sky-400 via-violet-400 to-cyan-300 opacity-70 blur-[1px]"
            animate={loopMotion ? { rotate: 360, scale: [1, wildMotion ? 1.08 : 1.035, 1] } : { rotate: 0, scale: 1 }}
            transition={{ rotate: { duration: wildMotion ? 2.8 : 6, repeat: loopMotion ? Infinity : 0, ease: 'linear' }, scale: { duration: wildMotion ? 1.05 : 2.6, repeat: loopMotion ? Infinity : 0, ease: 'easeInOut' } }}
          />
          <motion.div
            animate={loopMotion ? { y: [0, wildMotion ? -9 : -4, 0], rotate: [0, wildMotion ? -16 : -5, wildMotion ? 16 : 5, 0], scale: [1, wildMotion ? 1.16 : 1.045, 1] } : { y: 0, rotate: 0, scale: 1 }}
            transition={{ duration: wildMotion ? 1.35 : 3.2, repeat: loopMotion ? Infinity : 0, ease: 'easeInOut' }}
            className="relative grid h-10 w-10 place-items-center rounded-[16px] bg-gradient-to-br from-sky-500 via-blue-500 to-violet-500 text-lg font-bold text-white shadow-[0_16px_32px_rgba(59,130,246,.32)]"
          >
            Q
          </motion.div>
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[.26em] text-sky-600">Q Memo</p>
          <h1 className="truncate text-[16px] font-bold tracking-tight">轻备忘 · 今日工作台</h1>
        </div>
        <button
          type="button"
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-black shadow-[inset_0_1px_0_rgba(255,255,255,.8)] transition hover:bg-white ${motionButtonTone}`}
          title="切换动效强度"
          onClick={onMotionModeChange}
        >
          动效 · {motionModeLabel(motionMode)}
        </button>
      </div>

      <form
        className="group flex h-10 items-center gap-3 rounded-2xl border border-white/70 bg-white/74 px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.85),0_10px_28px_rgba(15,23,42,.05)] transition focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(14,165,233,.12),0_14px_34px_rgba(15,23,42,.08)]"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            onModeChange(nextMode);
          }
        }}
      >
        <button
          type="button"
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
            mode === 'note' ? 'bg-zinc-950 text-white shadow-[0_8px_18px_rgba(15,23,42,.18)]' : 'bg-sky-50 text-sky-700'
          }`}
          onClick={() => onModeChange(nextMode)}
          title="按 Tab 切换便签/提醒"
        >
          {mode === 'note' ? '✦ 便签' : '◷ 提醒'}
        </button>
        <input
          data-quick-entry="true"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-zinc-400"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={mode === 'note' ? '直接输入内容，Enter 创建便签，Tab 切换提醒...' : '直接输入提醒内容，Enter 创建提醒，Tab 切回便签...'}
        />
        <span className="rounded-full bg-zinc-900/[0.04] px-2 py-1 text-[11px] font-medium text-zinc-400">
          {saving ? 'AI...' : 'Enter'}
        </span>
      </form>

    </header>
  );
}

function HeroPanel({
  stats,
  active,
  nextReminder,
  motionMode,
  onSelect,
}: {
  stats: { reminders: number; highPriority: number; notes: number };
  active: DashboardFilter;
  nextReminder?: BackendReminder;
  motionMode: MotionMode;
  onSelect: (filter: DashboardFilter) => void;
}) {
  const loopMotion = shouldLoopMotion(motionMode);
  const wildMotion = motionMode === 'wild';
  return (
    <section className="relative overflow-hidden rounded-[26px] border border-white/72 bg-white/52 p-3 shadow-[0_1px_2px_rgba(15,23,42,.04),0_16px_48px_rgba(68,83,120,.09)] backdrop-blur-2xl">
      <div className="absolute -right-20 -top-24 h-60 w-60 rounded-full bg-sky-300/25 blur-3xl" />
      <div className="absolute bottom-0 right-16 h-36 w-36 rounded-full bg-amber-200/35 blur-3xl" />
      <div className="relative grid items-start grid-cols-[minmax(0,1fr)_190px] gap-3 max-[760px]:grid-cols-1">
        <div>
          <motion.p variants={riseVariants} className="text-xs font-semibold uppercase tracking-[.32em] text-sky-600">
            Aurora Desk
          </motion.p>
          <motion.h2 variants={riseVariants} className="mt-1 max-w-2xl text-[25px] font-semibold leading-[1.03] tracking-[-.045em] text-zinc-950 max-[1360px]:text-[23px]">
            把今天整理成一面会呼吸的灵感墙。
          </motion.h2>
          <motion.p variants={riseVariants} className="mt-2 max-w-xl text-[12px] font-medium leading-5 text-zinc-500">
            便签负责承载想法，提醒负责守住时间。乱糟糟的事情交给本小姐，你只要把下一步写下来就好。
          </motion.p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {(['notes', 'reminders', 'highPriority'] as DashboardFilter[]).map((key) => (
              <button
                key={key}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                  active === key ? 'bg-zinc-950 text-white shadow-[0_12px_28px_rgba(15,23,42,.22)]' : 'bg-white/70 text-zinc-500 hover:bg-white hover:text-zinc-800'
                }`}
                onClick={() => onSelect(key)}
              >
                {metricMeta[key].icon} {metricMeta[key].label}
              </button>
            ))}
          </div>
        </div>

        <motion.div
          whileHover={{ y: -8, rotate: -1.2, scale: 1.035 }}
          className="relative h-[154px] overflow-hidden rounded-[22px] border border-white/12 bg-zinc-950 p-3.5 text-white shadow-[0_18px_44px_rgba(15,23,42,.22)]"
        >
          <motion.div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(125,211,252,.20),transparent_35%),radial-gradient(circle_at_100%_100%,rgba(196,181,253,.16),transparent_38%)]"
            animate={loopMotion ? { opacity: [0.72, wildMotion ? 1 : 0.86, 0.72] } : { opacity: 0.72 }}
            transition={{ duration: wildMotion ? 4.8 : 8, repeat: loopMotion ? Infinity : 0, ease: 'easeInOut' }}
          />
          <motion.div
            className="pointer-events-none absolute -inset-10 rounded-full border border-sky-300/18"
            animate={loopMotion ? { rotate: 360, scale: [1, wildMotion ? 1.28 : 1.08, 1] } : { rotate: 0, scale: 1 }}
            transition={{ rotate: { duration: wildMotion ? 4.2 : 9, repeat: loopMotion ? Infinity : 0, ease: 'linear' }, scale: { duration: wildMotion ? 1.6 : 4, repeat: loopMotion ? Infinity : 0, ease: 'easeInOut' } }}
          />
          <motion.div
            className="pointer-events-none absolute inset-y-0 -left-20 w-16 rotate-12 bg-white/18 blur-md"
            animate={loopMotion ? { x: [-90, wildMotion ? 310 : 190] } : { x: -90, opacity: 0 }}
            transition={{ duration: wildMotion ? 1.35 : 3.4, repeat: loopMotion ? Infinity : 0, repeatDelay: wildMotion ? 0.28 : 2, ease: 'easeInOut' }}
          />
          <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[.26em] text-white/45">Next</p>
          {nextReminder ? (
            <div className="mt-3">
              <p className="line-clamp-1 text-base font-semibold leading-snug">{nextReminder.title}</p>
              <p className="mt-2 text-xs font-medium text-white/55">{formatReminderTime(nextReminder.next_due_at ?? nextReminder.due_at)}</p>
              <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-white/70">{nextReminder.notes || '没有备注，但本小姐会准时提醒。'}</p>
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-lg font-semibold leading-snug">暂无提醒</p>
              <p className="mt-3 text-sm leading-6 text-white/60">新增一条，本小姐替你盯时间。</p>
            </div>
          )}
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-sky-300 to-violet-300"
              initial={{ width: '18%' }}
              animate={loopMotion ? { width: ['12%', wildMotion ? '96%' : '62%', '36%'] } : { width: '36%' }}
              transition={{ duration: wildMotion ? 2.6 : 5, repeat: loopMotion ? Infinity : 0, ease: 'easeInOut' }}
            />
          </div>
          <p className="mt-2 text-[11px] font-medium text-white/35">今日节奏 · {stats.notes} 张便签 / {stats.reminders} 条提醒</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function MetricDock({
  stats,
  active,
  motionMode,
  onSelect,
}: {
  stats: { reminders: number; highPriority: number; notes: number };
  active: DashboardFilter;
  motionMode: MotionMode;
  onSelect: (filter: DashboardFilter) => void;
}) {
  const loopMotion = shouldLoopMotion(motionMode);
  const wildMotion = motionMode === 'wild';
  const entries: Array<[DashboardFilter, number]> = [
    ['notes', stats.notes],
    ['reminders', stats.reminders],
    ['highPriority', stats.highPriority],
  ];

  return (
    <section className="grid grid-cols-3 gap-2.5 max-[1180px]:grid-cols-3">
      {entries.map(([key, value], index) => {
        const meta = metricMeta[key];
        return (
          <motion.button
            key={key}
            variants={riseVariants}
            custom={index}
            whileHover={{ y: motionMode === 'calm' ? -4 : wildMotion ? -16 : -8, rotate: motionMode === 'calm' ? 0 : index === 1 ? 3.5 : -3.5, scale: motionMode === 'calm' ? 1.02 : wildMotion ? 1.09 : 1.045 }}
            whileTap={{ scale: 0.98 }}
            animate={loopMotion ? {
              y: active === key ? [0, wildMotion ? -16 : -7, 0] : [0, wildMotion ? -7 - index : -3, 0],
              scale: active === key ? [1, wildMotion ? 1.075 : 1.025, 1] : [1, wildMotion ? 1.035 : 1.012, 1],
            } : { y: 0, scale: 1 }}
            transition={{ duration: wildMotion ? 1.85 + index * 0.18 : 3.4 + index * 0.22, repeat: loopMotion ? Infinity : 0, ease: 'easeInOut' }}
            className={`group relative min-h-[154px] overflow-hidden rounded-[24px] border p-3 text-left backdrop-blur-2xl transition before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/95 before:to-transparent ${
              active === key
                ? 'border-white/85 bg-white/82 shadow-[0_1px_2px_rgba(15,23,42,.04),0_28px_68px_rgba(59,130,246,.18)]'
                : 'border-white/70 bg-white/46 shadow-[0_1px_2px_rgba(15,23,42,.04),0_20px_58px_rgba(68,83,120,.10)] hover:bg-white/68'
            }`}
            onClick={() => onSelect(key)}
          >
            <div className={`absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${meta.tone} opacity-20 blur-2xl transition group-hover:opacity-35`} />
            <motion.div
              className={`grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br ${meta.tone} text-base text-white shadow-lg ${meta.glow}`}
              animate={loopMotion ? { rotate: active === key ? [0, wildMotion ? -24 : -8, wildMotion ? 24 : 8, 0] : [0, wildMotion ? 18 : 5, 0], y: active === key ? [0, wildMotion ? -7 : -3, 0] : [0, wildMotion ? -5 : -2, 0] } : { rotate: 0, y: 0 }}
              transition={{ duration: wildMotion ? 1.35 : 3, repeat: loopMotion ? Infinity : 0, ease: 'easeInOut' }}
            >
              {meta.icon}
            </motion.div>
            <p className="mt-3 text-[12px] font-semibold text-zinc-500">{meta.label}</p>
            <motion.p layout className="mt-1 text-[28px] font-semibold leading-none tracking-[-.04em] tabular-nums">
              {value}
            </motion.p>
          </motion.button>
        );
      })}
    </section>
  );
}

function CanvasStage({
  count,
  activeFilter,
  measureRef,
  onArrange,
  onCreate,
  children,
}: {
  count: number;
  activeFilter: DashboardFilter;
  measureRef: RefObject<HTMLDivElement>;
  onArrange: () => void;
  onCreate: () => void;
  children: ReactNode;
}) {
  return (
    <section className="relative flex min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/72 bg-white/48 p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_24px_70px_rgba(68,83,120,.125)] backdrop-blur-2xl">
      <motion.div className="absolute -left-24 top-20 h-60 w-60 rounded-full bg-violet-200/24 blur-3xl" animate={{ scale: [1, 1.16, 1], opacity: [0.45, 0.78, 0.45] }} transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent"
        animate={{ opacity: [0.35, 0.9, 0.35], x: [-24, 24, -24] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.28em] text-sky-600">Canvas</p>
          <h2 className="mt-0.5 text-[20px] font-semibold tracking-[-.03em]">{wallTitle(activeFilter)}</h2>
          <p className="mt-1 text-xs font-semibold text-zinc-400">{viewHint(activeFilter)}</p>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
          <span className="rounded-full bg-white/68 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-500 shadow-inner">
            {count} {activeFilter === 'reminders' ? '条提醒' : activeFilter === 'highPriority' ? '个重点' : '张灵感'}
          </span>
          <ActionButton compact tone="light" onClick={onArrange}>{activeFilter === 'notes' ? '自动整理' : '排序说明'}</ActionButton>
          <ActionButton compact onClick={onCreate}>{activeFilter === 'notes' ? '+ 写一张' : '+ 新提醒'}</ActionButton>
        </div>
      </div>
      <div ref={measureRef} className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeFilter}
            className="absolute inset-0"
            initial={{ opacity: 0, y: 18, scale: 0.985, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -12, scale: 0.985, filter: 'blur(8px)' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function FocusRail({
  loading,
  reminders,
  recentReminders,
  reminderEvents,
  diagnostics,
  activeFilter,
  mode,
  motionMode,
  focusMode,
  remindersPaused,
  autoStart,
  dailyQueue,
  dailyQueueProgress,
  dailyQueueStatuses,
  onDailyQueueItem,
  onSetDailyQueueItemStatus,
  onModeChange,
  onCreateReminder,
  onOpenAiSettings,
  onDailySummary,
  onDailyRoast,
  onDailyPlan,
  onRiskRadar,
  onDailyReview,
  onTestReminder,
  onExportBackup,
  onReminderDiagnostics,
  aiBusy,
  onToggleFocusMode,
  onToggleReminderPause,
  onRefresh,
  onEditReminder,
  onCompleteReminder,
  onArchiveReminder,
  onSnoozeReminder,
  onConvertReminderToNote,
  onToggleReminderPriority,
}: {
  loading: boolean;
  reminders: BackendReminder[];
  recentReminders: BackendReminder[];
  reminderEvents: ReminderEvent[];
  diagnostics: ReminderDiagnostics | null;
  activeFilter: DashboardFilter;
  mode: SidePanelMode;
  motionMode: MotionMode;
  focusMode: boolean;
  remindersPaused: boolean;
  autoStart: boolean;
  dailyQueue: DailyQueue;
  dailyQueueProgress: DailyQueueProgress;
  dailyQueueStatuses: DailyQueueStatusMap;
  onDailyQueueItem: (item: DailyQueueItem) => void;
  onSetDailyQueueItemStatus: (item: DailyQueueItem, status: DailyQueueItemStatus) => void;
  onModeChange: (mode: SidePanelMode) => void;
  onCreateReminder: () => void;
  onOpenAiSettings: () => void;
  onDailySummary: () => void;
  onDailyRoast: () => void;
  onDailyPlan: () => void;
  onRiskRadar: () => void;
  onDailyReview: () => void;
  onTestReminder: () => void;
  onExportBackup: () => void;
  onReminderDiagnostics: () => void;
  aiBusy: string | null;
  onToggleFocusMode: () => void;
  onToggleReminderPause: () => void;
  onRefresh: () => void;
  onEditReminder: (reminder: BackendReminder) => void;
  onCompleteReminder: (id: number) => void;
  onArchiveReminder: (id: number) => void;
  onSnoozeReminder: (reminder: BackendReminder, minutes: number) => void;
  onConvertReminderToNote: (reminder: BackendReminder) => void;
  onToggleReminderPriority: (reminder: BackendReminder) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col gap-2.5">
      <section className="rounded-[26px] border border-white/72 bg-white/58 p-3 shadow-[0_1px_2px_rgba(15,23,42,.04),0_18px_52px_rgba(68,83,120,.095)] backdrop-blur-2xl">
        <div className="mb-2.5 flex items-start justify-between gap-3 px-1">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.28em] text-sky-600">Today</p>
            <h2 className="mt-0.5 text-base font-semibold">{dailyQueue.title}</h2>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-400">{dailyQueue.subtitle}</p>
          </div>
          <span className="rounded-full bg-zinc-950 px-2.5 py-1 text-[11px] font-black text-white shadow-[0_10px_22px_rgba(15,23,42,.16)]">{dailyQueueProgress.label}</span>
        </div>
        <div className="space-y-2">
          {dailyQueue.items.map((item, index) => {
            const status = getDailyQueueItemStatus(item, dailyQueueStatuses);
            return (
              <DailyQueueButton
                key={`${item.kind}-${item.id}`}
                item={item}
                index={index}
                status={status}
                onClick={() => onDailyQueueItem(item)}
                onDone={() => onSetDailyQueueItemStatus(item, 'done')}
                onSkip={() => onSetDailyQueueItemStatus(item, 'skipped')}
                onRestore={() => onSetDailyQueueItemStatus(item, 'open')}
              />
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <RailMiniAction title={aiBusy === 'summary' ? '分析中' : '概览'} icon="☀" onClick={onDailySummary} />
          <RailMiniAction title="先做" icon="☑" onClick={onDailyPlan} />
          <RailMiniAction title="风险" icon="⚠" onClick={onRiskRadar} />
          <RailMiniAction title="复盘" icon="↺" onClick={onDailyReview} />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5 border-t border-white/62 pt-2">
          <RailToolAction title="统计" onClick={() => onModeChange('center')} />
          <RailToolAction title="历史" onClick={() => onModeChange('timeline')} />
          <RailToolAction title="诊断" onClick={onReminderDiagnostics} />
          <RailToolAction title="备份" onClick={onExportBackup} />
        </div>
      </section>
      <section className="rounded-[26px] border border-white/72 bg-white/54 p-2 shadow-[0_1px_2px_rgba(15,23,42,.04),0_18px_52px_rgba(68,83,120,.095)] backdrop-blur-2xl">
        <div className="grid grid-cols-3 gap-1">
          {([
            ['focus', '专注', '✦'],
            ['center', '中心', '◷'],
            ['timeline', '时间线', '☀'],
          ] as Array<[SidePanelMode, string, string]>).map(([key, label, icon]) => (
            <button
              key={key}
              className={`rounded-2xl px-3 py-2 text-xs font-black transition ${
                mode === key
                  ? 'bg-zinc-950 text-white shadow-[0_12px_26px_rgba(15,23,42,.20)]'
                  : 'text-zinc-400 hover:bg-white/70 hover:text-zinc-700'
              }`}
              onClick={() => onModeChange(key)}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </section>

      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          className="min-h-0 flex-1"
          initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        >
          {mode === 'focus' && (
            <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/72 bg-white/54 p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_18px_52px_rgba(68,83,120,.095)] backdrop-blur-2xl">
              <div className="mb-2 flex items-center justify-between px-1">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.26em] text-sky-600">Focus</p>
                  <h2 className="mt-0.5 text-lg font-semibold tracking-[-.02em]">
                    {activeFilter === 'highPriority' ? '高优先级提醒' : '提醒流'}
                  </h2>
                </div>
                <button className="rounded-full bg-zinc-950 px-3.5 py-2 text-xs font-semibold text-white shadow-lg" onClick={onCreateReminder}>
                  + 新增
                </button>
              </div>
              <ReminderList
                loading={loading}
                reminders={reminders}
                diagnostics={diagnostics}
                onSnooze={onSnoozeReminder}
                onEdit={onEditReminder}
                onComplete={onCompleteReminder}
                onArchive={onArchiveReminder}
                onConvertToNote={onConvertReminderToNote}
                onTogglePriority={onToggleReminderPriority}
              />
            </section>
          )}
          {mode === 'center' && (
            <ReminderCenter
              reminders={reminders}
              recentReminders={recentReminders}
              reminderEvents={reminderEvents}
              diagnostics={diagnostics}
              focusMode={focusMode}
              remindersPaused={remindersPaused}
              autoStart={autoStart}
              onToggleFocusMode={onToggleFocusMode}
              onToggleReminderPause={onToggleReminderPause}
              onTestReminder={onTestReminder}
              onExportBackup={onExportBackup}
              onDailyReview={onDailyReview}
              onEdit={onEditReminder}
              onComplete={onCompleteReminder}
              onRefresh={onRefresh}
            />
          )}
          {mode === 'timeline' && (
            <ReminderTimeline reminders={reminders} onEdit={onEditReminder} onComplete={onCompleteReminder} />
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

function DailyQueueButton({
  item,
  index,
  status,
  onClick,
  onDone,
  onSkip,
  onRestore,
}: {
  item: DailyQueueItem;
  index: number;
  status: DailyQueueItemStatus;
  onClick: () => void;
  onDone: () => void;
  onSkip: () => void;
  onRestore: () => void;
}) {
  const badge = item.kind === 'reminder' ? '提醒' : item.kind === 'note' ? '便签' : '默认';
  const icon = item.kind === 'reminder' ? '◷' : item.kind === 'note' ? '✦' : '+';
  const toneClass =
    item.kind === 'reminder'
      ? 'border-rose-100 bg-rose-50/64 text-rose-700'
      : item.kind === 'note'
        ? 'border-sky-100 bg-sky-50/64 text-sky-700'
        : 'border-zinc-100 bg-white/70 text-zinc-600';
  const statusLabel = status === 'done' ? '已完成' : status === 'skipped' ? '已跳过' : item.actionLabel;
  const mutedClass = status === 'open' ? '' : 'opacity-62';

  return (
    <div
      className={`group rounded-[20px] border border-white/74 bg-white/68 px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,.035)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_12px_28px_rgba(15,23,42,.09)] ${mutedClass}`}
    >
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={onClick}>
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-2xl border text-xs font-black ${toneClass}`}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.16em] text-zinc-400">
            #{index + 1} {badge}
          </span>
          <span className="mt-1 block truncate text-[13px] font-black text-zinc-800">{item.title}</span>
          <span className="mt-0.5 block line-clamp-2 text-[11px] font-semibold leading-4 text-zinc-500">{item.reason}</span>
        </span>
        <span className="mt-1 shrink-0 rounded-full bg-zinc-950 px-2.5 py-1 text-[10px] font-black text-white">
          {statusLabel}
        </span>
      </button>
      <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-white/68 pt-2">
        {status === 'open' ? (
          <>
            <DailyQueueMicroAction label="完成" onClick={onDone} />
            <DailyQueueMicroAction label="跳过" onClick={onSkip} muted />
          </>
        ) : (
          <DailyQueueMicroAction label="恢复" onClick={onRestore} />
        )}
      </div>
    </div>
  );
}

function DailyQueueMicroAction({ label, muted = false, onClick }: { label: string; muted?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`rounded-full px-2.5 py-1 text-[10px] font-black transition ${
        muted ? 'bg-white/62 text-zinc-400 hover:bg-white hover:text-zinc-700' : 'bg-zinc-950 text-white hover:bg-zinc-800'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function RailMiniAction({ title, icon, onClick }: { title: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-2xl bg-white/68 px-2 py-2 text-[11px] font-black text-zinc-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:text-zinc-900"
      onClick={onClick}
      title={title}
    >
      <span className="mr-1">{icon}</span>{title}
    </button>
  );
}

function RailToolAction({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-xl px-2 py-1.5 text-[10px] font-black text-zinc-400 transition hover:bg-white/70 hover:text-zinc-700"
      onClick={onClick}
    >
      {title}
    </button>
  );
}

function RecentReminderList({
  reminders,
  onEdit,
}: {
  reminders: BackendReminder[];
  onEdit: (reminder: BackendReminder) => void;
}) {
  if (reminders.length === 0) {
    return <p className="rounded-2xl border border-dashed border-zinc-900/10 bg-white/35 px-4 py-5 text-center text-xs font-semibold text-zinc-400">暂无最近提醒。</p>;
  }

  return (
    <div className="space-y-2">
      {reminders.slice(0, 4).map((reminder) => {
        const fired = Boolean(reminder.fired_at);
        return (
          <motion.button
            key={reminder.id}
            type="button"
            className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
              fired
                ? 'border-emerald-100 bg-emerald-50/62 hover:bg-emerald-50'
                : 'border-sky-100 bg-sky-50/54 hover:bg-sky-50'
            }`}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => {
              if (!reminder.completed) onEdit(reminder);
            }}
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-sm shadow-sm ${fired ? 'bg-emerald-500 text-white' : 'bg-sky-500 text-white'}`}>
              {fired ? '✓' : '◷'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-black text-zinc-700">{reminder.title}</span>
              <span className="mt-0.5 block truncate text-[11px] font-semibold text-zinc-400">
                {fired
                  ? `已提醒 · ${formatReminderTime(reminder.fired_at ?? reminder.due_at)}`
                  : `待提醒 · ${formatReminderTime(reminder.next_due_at ?? reminder.due_at)} · ${repeatRuleLabel(reminder.repeat_rule)}`}
              </span>
            </span>
            {reminder.priority === 'high' && <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-black text-rose-500">高</span>}
          </motion.button>
        );
      })}
    </div>
  );
}

function ReminderCenter({
  reminders,
  recentReminders,
  reminderEvents,
  diagnostics,
  focusMode,
  remindersPaused,
  autoStart,
  onToggleFocusMode,
  onToggleReminderPause,
  onTestReminder,
  onExportBackup,
  onDailyReview,
  onEdit,
  onComplete,
  onRefresh,
}: {
  reminders: BackendReminder[];
  recentReminders: BackendReminder[];
  reminderEvents: ReminderEvent[];
  diagnostics: ReminderDiagnostics | null;
  focusMode: boolean;
  remindersPaused: boolean;
  autoStart: boolean;
  onToggleFocusMode: () => void;
  onToggleReminderPause: () => void;
  onTestReminder: () => void;
  onExportBackup: () => void;
  onDailyReview: () => void;
  onEdit: (reminder: BackendReminder) => void;
  onComplete: (id: number) => void;
  onRefresh: () => void;
}) {
  const now = Date.now();
  const overdue = reminders.filter((reminder) => reminder.next_due_at && new Date(reminder.next_due_at).getTime() < now);
  const today = reminders.filter((reminder) => isSameLocalDay(reminder.next_due_at ?? reminder.due_at, new Date()));
  const repeating = reminders.filter((reminder) => reminder.repeat_rule.kind !== 'none');

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/72 bg-white/54 p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_18px_52px_rgba(68,83,120,.095)] backdrop-blur-2xl">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.26em] text-violet-600">Reminder Hub</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-[-.02em]">提醒中心</h2>
        </div>
        <button className="rounded-full bg-white/74 px-3 py-1.5 text-xs font-black text-zinc-500 shadow-sm" onClick={onRefresh}>
          ↻ 刷新
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatusPill active={!remindersPaused} label={remindersPaused ? '已暂停' : '运行中'} icon="◷" tone={remindersPaused ? 'rose' : 'emerald'} />
        <StatusPill active={focusMode} label={focusMode ? '专注中' : '普通'} icon="✦" tone={focusMode ? 'sky' : 'zinc'} />
        <StatusPill active={autoStart} label={autoStart ? '自启' : '手动'} icon="↗" tone={autoStart ? 'violet' : 'zinc'} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className={`rounded-2xl px-3 py-2.5 text-xs font-black transition ${
            focusMode ? 'bg-sky-600 text-white shadow-[0_12px_26px_rgba(14,165,233,.22)]' : 'bg-white/72 text-zinc-600 hover:bg-white'
          }`}
          onClick={onToggleFocusMode}
        >
          {focusMode ? '关闭专注' : '开启专注'}
        </button>
        <button
          className={`rounded-2xl px-3 py-2.5 text-xs font-black transition ${
            remindersPaused ? 'bg-rose-500 text-white shadow-[0_12px_26px_rgba(244,63,94,.20)]' : 'bg-white/72 text-zinc-600 hover:bg-white'
          }`}
          onClick={onToggleReminderPause}
        >
          {remindersPaused ? '恢复提醒' : '暂停提醒'}
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <button className="rounded-2xl bg-white/72 px-3 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-white" onClick={onTestReminder}>
          测试提醒
        </button>
        <button className="rounded-2xl bg-white/72 px-3 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-white" onClick={onDailyReview}>
          今日复盘
        </button>
        <button className="rounded-2xl bg-white/72 px-3 py-2.5 text-xs font-black text-zinc-600 transition hover:bg-white" onClick={onExportBackup}>
          备份
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="过期" value={overdue.length} tone="rose" />
        <MiniStat label="今日" value={today.length} tone="sky" />
        <MiniStat label="重复" value={repeating.length} tone="violet" />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        <DiagnosticsCard diagnostics={diagnostics} />
        <ReminderCenterGroup title="过期提醒" reminders={overdue} empty="没有过期提醒，表现不错嘛。" onEdit={onEdit} onComplete={onComplete} />
        <ReminderCenterGroup title="今日提醒" reminders={today} empty="今天暂时没有提醒。" onEdit={onEdit} onComplete={onComplete} />
        <ReminderHistoryCard events={reminderEvents} />
        <div className="mt-3 rounded-[22px] border border-white/70 bg-white/42 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black text-zinc-700">最近提醒</h3>
            <span className="rounded-full bg-white/72 px-2.5 py-1 text-[11px] font-black text-zinc-400">{recentReminders.length}</span>
          </div>
          <RecentReminderList reminders={recentReminders} onEdit={onEdit} />
        </div>
      </div>
    </section>
  );
}

function StatusPill({ active, label, icon, tone }: { active: boolean; label: string; icon: string; tone: 'emerald' | 'rose' | 'sky' | 'violet' | 'zinc' }) {
  const toneClass = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    sky: 'bg-sky-50 text-sky-700 border-sky-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    zinc: 'bg-white/60 text-zinc-500 border-white/70',
  }[tone];
  return (
    <div className={`rounded-2xl border px-2.5 py-2 text-center text-[11px] font-black ${toneClass}`}>
      <span className="mr-1">{icon}</span>
      {label}
      {active && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle opacity-65" />}
    </div>
  );
}

function DiagnosticsCard({ diagnostics }: { diagnostics: ReminderDiagnostics | null }) {
  return (
    <div className="mb-3 rounded-[22px] border border-white/70 bg-white/42 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-black text-zinc-700">提醒诊断</h3>
        <span className="rounded-full bg-white/72 px-2.5 py-1 text-[11px] font-black text-zinc-400">Trust</span>
      </div>
      {!diagnostics ? (
        <p className="text-xs font-semibold text-zinc-400">诊断信息暂时不可用。</p>
      ) : (
        <div className="space-y-2 text-[11px] font-bold text-zinc-500">
          <DiagnosticRow label="通知权限" value={diagnostics.notificationPermission} />
          <DiagnosticRow label="下次提醒" value={diagnostics.nextDueAt ? formatReminderTime(diagnostics.nextDueAt) : '暂无'} />
          <DiagnosticRow label="数据库" value={diagnostics.databasePath} />
          <DiagnosticRow label="检查时间" value={formatReminderTime(diagnostics.checkedAt)} />
        </div>
      )}
    </div>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 rounded-2xl bg-white/48 px-3 py-2">
      <span className="shrink-0 text-zinc-400">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-zinc-600" title={value}>
        {value}
      </span>
    </div>
  );
}

function ReminderHistoryCard({ events }: { events: ReminderEvent[] }) {
  const labelMap: Record<string, string> = {
    created: '创建',
    fired: '已提醒',
    completed: '完成',
    archived: '收起',
    restored: '恢复',
    test: '测试',
  };
  return (
    <div className="mt-3 rounded-[22px] border border-white/70 bg-white/42 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-black text-zinc-700">提醒历史</h3>
        <span className="rounded-full bg-white/72 px-2.5 py-1 text-[11px] font-black text-zinc-400">{events.length}</span>
      </div>
      {events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-900/10 bg-white/32 px-3 py-4 text-center text-xs font-semibold text-zinc-400">
          还没有提醒历史。
        </p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 6).map((event) => (
            <div key={event.id} className="rounded-2xl bg-white/58 px-3 py-2 text-xs shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-black text-zinc-700">{event.title}</span>
                <span className="shrink-0 rounded-full bg-zinc-950/[0.05] px-2 py-1 text-[10px] font-black text-zinc-500">
                  {labelMap[event.kind] ?? event.kind}
                </span>
              </div>
              <p className="mt-1 truncate text-[11px] font-semibold text-zinc-400">{formatReminderTime(event.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: 'rose' | 'sky' | 'violet' }) {
  const toneClass = {
    rose: 'from-rose-50 to-orange-50 text-rose-600',
    sky: 'from-sky-50 to-cyan-50 text-sky-600',
    violet: 'from-violet-50 to-fuchsia-50 text-violet-600',
  }[tone];
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${toneClass} px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.8)]`}>
      <p className="text-[11px] font-black opacity-65">{label}</p>
      <p className="mt-1 text-2xl font-black leading-none tracking-[-.04em]">{value}</p>
    </div>
  );
}

function ReminderCenterGroup({
  title,
  reminders,
  empty,
  onEdit,
  onComplete,
}: {
  title: string;
  reminders: BackendReminder[];
  empty: string;
  onEdit: (reminder: BackendReminder) => void;
  onComplete: (id: number) => void;
}) {
  return (
    <div className="mt-3 first:mt-0 rounded-[22px] border border-white/70 bg-white/42 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-black text-zinc-700">{title}</h3>
        <span className="rounded-full bg-white/72 px-2.5 py-1 text-[11px] font-black text-zinc-400">{reminders.length}</span>
      </div>
      {reminders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-900/10 bg-white/32 px-3 py-4 text-center text-xs font-semibold text-zinc-400">{empty}</p>
      ) : (
        <div className="space-y-2">
          {reminders.slice(0, 5).map((reminder) => (
            <ReminderMiniItem key={reminder.id} reminder={reminder} onEdit={onEdit} onComplete={onComplete} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReminderMiniItem({
  reminder,
  onEdit,
  onComplete,
}: {
  reminder: BackendReminder;
  onEdit: (reminder: BackendReminder) => void;
  onComplete: (id: number) => void;
}) {
  return (
    <motion.div
      layout
      className="group rounded-2xl border border-white/70 bg-white/62 px-3 py-2.5 shadow-sm"
      whileHover={{ x: 2 }}
    >
      <button className="block w-full text-left" onClick={() => onEdit(reminder)}>
        <span className="block truncate text-xs font-black text-zinc-700">{reminder.title}</span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-zinc-400">
          {formatReminderTime(reminder.next_due_at ?? reminder.due_at)} · {repeatRuleLabel(reminder.repeat_rule)}
        </span>
      </button>
      <button className="mt-2 rounded-full bg-zinc-950 px-3 py-1 text-[11px] font-black text-white opacity-0 transition group-hover:opacity-100" onClick={() => onComplete(reminder.id)}>
        完成
      </button>
    </motion.div>
  );
}

function ReminderTimeline({
  reminders,
  onEdit,
  onComplete,
}: {
  reminders: BackendReminder[];
  onEdit: (reminder: BackendReminder) => void;
  onComplete: (id: number) => void;
}) {
  const today = new Date();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const groups = [
    { title: '今天', items: reminders.filter((reminder) => isSameLocalDay(reminder.next_due_at ?? reminder.due_at, today)) },
    { title: '明天', items: reminders.filter((reminder) => isSameLocalDay(reminder.next_due_at ?? reminder.due_at, tomorrow)) },
    {
      title: '本周稍后',
      items: reminders.filter((reminder) => {
        const due = new Date(reminder.next_due_at ?? reminder.due_at);
        return due > tomorrow && due <= weekEnd;
      }),
    },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/72 bg-white/54 p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_18px_52px_rgba(68,83,120,.095)] backdrop-blur-2xl">
      <div className="mb-3 px-1">
        <p className="text-xs font-semibold uppercase tracking-[.26em] text-amber-600">Timeline</p>
        <h2 className="mt-0.5 text-lg font-semibold tracking-[-.02em]">今日 / 本周</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.title} className="relative mb-3 rounded-[22px] border border-white/70 bg-white/42 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-black text-zinc-700">{group.title}</h3>
              <span className="rounded-full bg-white/72 px-2.5 py-1 text-[11px] font-black text-zinc-400">{group.items.length}</span>
            </div>
            {group.items.length === 0 ? (
              <p className="py-4 text-center text-xs font-semibold text-zinc-400">这里暂时安静。</p>
            ) : (
              <div className="space-y-2">
                {group.items.map((reminder) => (
                  <ReminderMiniItem key={reminder.id} reminder={reminder} onEdit={onEdit} onComplete={onComplete} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickAction({
  title,
  icon,
  tone,
  motionMode,
  onClick,
}: {
  title: string;
  icon: string;
  tone: 'violet' | 'sky' | 'amber' | 'emerald' | 'rose';
  motionMode: MotionMode;
  onClick: () => void;
}) {
  const calmMotion = motionMode === 'calm';
  const wildMotion = motionMode === 'wild';
  const toneClass = {
    violet: 'from-violet-500 to-fuchsia-400 shadow-violet-500/20',
    sky: 'from-sky-500 to-cyan-400 shadow-sky-500/20',
    amber: 'from-amber-400 to-orange-500 shadow-orange-500/20',
    emerald: 'from-emerald-400 to-teal-500 shadow-emerald-500/20',
    rose: 'from-rose-500 to-pink-400 shadow-rose-500/20',
  }[tone];
  return (
    <motion.button
      title={title}
      aria-label={title}
      animate={calmMotion ? { y: 0, rotate: 0 } : { y: [0, wildMotion ? -12 : -6, 0], rotate: [0, wildMotion ? -3 : -1.5, wildMotion ? 3 : 1.5, 0] }}
      transition={{ duration: wildMotion ? 1.45 : 2.4, repeat: calmMotion ? 0 : Infinity, ease: 'easeInOut' }}
      whileHover={{ y: calmMotion ? -3 : wildMotion ? -18 : -8, scale: calmMotion ? 1.025 : wildMotion ? 1.14 : 1.06, rotate: calmMotion ? 0 : wildMotion ? -4 : -1.5 }}
      whileTap={{ scale: 0.96 }}
      className="group relative grid min-h-[76px] place-items-center overflow-hidden rounded-2xl border border-white/70 bg-white/74 p-2 text-center shadow-[0_1px_2px_rgba(15,23,42,.03),0_10px_26px_rgba(68,83,120,.075)] transition hover:border-white hover:bg-white hover:shadow-[0_1px_2px_rgba(15,23,42,.04),0_16px_34px_rgba(68,83,120,.12)]"
      onClick={onClick}
    >
      <div className={`absolute -right-7 -top-7 h-20 w-20 rounded-full bg-gradient-to-br ${toneClass} opacity-20 blur-2xl transition group-hover:opacity-36`} />
      <motion.div
        className="pointer-events-none absolute inset-y-0 -left-12 w-10 rotate-12 bg-white/40 blur-sm"
        animate={calmMotion ? { x: -60, opacity: 0 } : { x: [-60, 180], opacity: 1 }}
        transition={{ duration: wildMotion ? 1.05 : 2.2, repeat: calmMotion ? 0 : Infinity, repeatDelay: wildMotion ? 0.18 : 1.4, ease: 'easeInOut' }}
      />
      <motion.span
        className={`relative grid h-8 w-8 place-items-center rounded-2xl bg-gradient-to-br ${toneClass} text-sm text-white shadow-lg transition group-hover:scale-105`}
        animate={calmMotion ? { rotate: 0, scale: 1 } : { rotate: [0, 360], scale: [1, wildMotion ? 1.22 : 1.08, 1] }}
        transition={{ rotate: { duration: wildMotion ? 2.8 : 5.5, repeat: calmMotion ? 0 : Infinity, ease: 'linear' }, scale: { duration: wildMotion ? 0.95 : 2.4, repeat: calmMotion ? 0 : Infinity, ease: 'easeInOut' } }}
        whileHover={{ rotate: calmMotion ? 0 : [0, -14, 14, 0] }}
      >
        {icon}
      </motion.span>
      <span className="relative mt-1.5 block text-[11px] font-semibold text-zinc-700">{title}</span>
    </motion.button>
  );
}


function IconActionButton({
  label,
  icon,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  icon: string;
  tone?: 'dark' | 'neutral' | 'sky' | 'amber' | 'rose';
  onClick: () => void;
}) {
  const toneClass = {
    dark: 'bg-zinc-950 text-white shadow-[0_10px_22px_rgba(15,23,42,.18)] hover:shadow-[0_14px_28px_rgba(15,23,42,.24)]',
    neutral: 'bg-zinc-950/[0.055] text-zinc-600 hover:bg-white/86 hover:text-zinc-900',
    sky: 'bg-sky-50 text-sky-600 hover:bg-sky-100 hover:text-sky-700',
    amber: 'bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800',
    rose: 'bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700',
  }[tone];

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-2xl text-[13px] font-black leading-none transition hover:-translate-y-0.5 active:translate-y-0 ${toneClass}`}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function ReminderList({
  reminders,
  loading,
  diagnostics,
  onSnooze,
  onEdit,
  onComplete,
  onArchive,
  onConvertToNote,
  onTogglePriority,
}: {
  reminders: BackendReminder[];
  loading: boolean;
  diagnostics: ReminderDiagnostics | null;
  onSnooze: (reminder: BackendReminder, minutes: number) => void;
  onEdit: (reminder: BackendReminder) => void;
  onComplete: (id: number) => void;
  onArchive: (id: number) => void;
  onConvertToNote: (reminder: BackendReminder) => void;
  onTogglePriority: (reminder: BackendReminder) => void;
}) {
  if (loading) return <EmptyState icon="…" title="正在翻本小姐的小账本..." description="马上就好，别催啦。" />;
  if (reminders.length === 0) return <EmptyState icon="◷" title="暂无提醒" description="新增一条，本小姐替你盯时间。" />;

  const groups = buildReminderGroups(reminders);
  if (groups.length === 0) return <EmptyState icon="✓" title="提醒都处理完了" description="完成和归档的内容已经收起来了。" />;

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" className="flex max-h-full flex-col gap-3 overflow-y-auto px-1 pb-1 pr-1.5">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-2xl border border-white/72 bg-white/82 px-3 py-2 shadow-[0_10px_24px_rgba(15,23,42,.06)] backdrop-blur-xl">
            <div className="min-w-0">
              <h3 className="text-xs font-black text-zinc-700">{group.title}</h3>
              <p className="mt-0.5 truncate text-[10px] font-semibold text-zinc-400">{group.hint}</p>
            </div>
            <span className="shrink-0 rounded-full bg-zinc-950/[0.055] px-2.5 py-1 text-[10px] font-black text-zinc-500">{group.reminders.length}</span>
          </div>
          {group.reminders.map((reminder) => {
            const tone = getReminderVisualTone(reminder.priority);
            const status = describeReminderStatus(reminder, diagnostics);
            const statusClass = status.tone === 'danger' ? 'text-rose-500' : status.tone === 'warning' ? 'text-amber-600' : 'text-sky-600';
            return (
              <motion.article
                key={reminder.id}
                variants={riseVariants}
                layout
                whileHover={{ x: -3, y: -4, scale: 1.012 }}
                className={`group relative overflow-hidden rounded-[22px] border p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_30px_rgba(68,83,120,.08)] transition hover:bg-white ${tone.cardClass}`}
              >
                {tone.emphasis === 'critical' && (
                  <motion.div
                    className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-rose-300/32 blur-2xl"
                    animate={{ scale: [1, 1.16, 1], opacity: [0.42, 0.72, 0.42] }}
                    transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
                <div className={`absolute left-0 top-0 h-full w-1.5 ${tone.accentClass}`} />
                <div className="relative flex items-start justify-between gap-2 pl-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-black tracking-[-.01em]">{reminder.title}</p>
                    <p className="mt-1 text-[11px] font-semibold text-zinc-400 tabular-nums">
                      {formatReminderTime(reminder.next_due_at ?? reminder.due_at)} · {repeatRuleLabel(reminder.repeat_rule)}
                    </p>
                    <p className={'mt-1 line-clamp-1 text-[11px] font-black ' + statusClass} title={status.detail}>
                      {status.label} · {status.detail}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${tone.badgeClass}`}>{tone.label}</span>
                </div>
                {reminder.notes && <p className="relative mt-2 line-clamp-2 pl-1.5 text-[12px] font-medium leading-5 text-zinc-500">{reminder.notes}</p>}
                <div className="relative mt-3 flex flex-nowrap gap-1.5 pl-1.5">
                  <IconActionButton label="标记完成" icon="✓" tone="dark" onClick={() => onComplete(reminder.id)} />
                  <IconActionButton label="10 分钟后提醒" icon="10" tone="amber" onClick={() => onSnooze(reminder, 10)} />
                  <IconActionButton label="1 小时后提醒" icon="1h" tone="amber" onClick={() => onSnooze(reminder, 60)} />
                  <IconActionButton label="编辑提醒" icon="✎" onClick={() => onEdit(reminder)} />
                  <IconActionButton label="转为便签" icon="↗" tone="sky" onClick={() => onConvertToNote(reminder)} />
                  <IconActionButton
                    label={reminder.priority === 'high' ? '降为普通提醒' : '标记高优先级'}
                    icon={reminder.priority === 'high' ? '↓' : '⚑'}
                    tone="amber"
                    onClick={() => onTogglePriority(reminder)}
                  />
                  <IconActionButton label="归档提醒" icon="▣" onClick={() => onArchive(reminder.id)} />
                </div>
              </motion.article>
            );
          })}
        </section>
      ))}
    </motion.div>
  );
}


function ReminderWall({
  reminders,
  diagnostics,
  onCreate,
  onEdit,
  onComplete,
  onArchive,
  onSnooze,
  onConvertToNote,
  onTogglePriority,
}: {
  reminders: BackendReminder[];
  diagnostics: ReminderDiagnostics | null;
  onCreate: () => void;
  onEdit: (reminder: BackendReminder) => void;
  onComplete: (id: number) => void;
  onArchive: (id: number) => void;
  onSnooze: (reminder: BackendReminder, minutes: number) => void;
  onConvertToNote: (reminder: BackendReminder) => void;
  onTogglePriority: (reminder: BackendReminder) => void;
}) {
  if (reminders.length === 0) {
    return <EmptyState icon="◷" title="提醒墙空着呢" description="新增一条，本小姐替你盯时间。" />;
  }

  return (
    <WallSurface>
      <motion.div variants={pageVariants} initial="hidden" animate="show" className="grid grid-cols-3 gap-3.5 p-4 max-[1380px]:grid-cols-2 max-[760px]:grid-cols-1">
        {reminders.map((reminder) => {
          const tone = getReminderVisualTone(reminder.priority);
          const status = describeReminderStatus(reminder, diagnostics);
          const statusClass = status.tone === 'danger' ? 'text-rose-500' : status.tone === 'warning' ? 'text-amber-600' : 'text-sky-600';
          return (
            <motion.article
              key={reminder.id}
              variants={riseVariants}
              layout
              whileHover={{ y: -6, rotate: -0.35, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`group relative min-h-[160px] overflow-hidden rounded-[26px] border p-4 shadow-[0_1px_2px_rgba(15,23,42,.05),0_18px_44px_rgba(68,83,120,.12),inset_0_1px_0_rgba(255,255,255,.75)] transition ${tone.cardClass}`}
            >
              <motion.div
                className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-white/50 blur-2xl"
                animate={{ scale: [1, 1.14, 1], opacity: [0.3, 0.56, 0.3] }}
                transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className={`absolute left-0 top-0 h-full w-1.5 ${tone.accentClass}`} />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-base font-black tracking-[-.02em]">{reminder.title}</p>
                  <p className="mt-2 text-xs font-bold text-zinc-400 tabular-nums">
                    {formatReminderTime(reminder.next_due_at ?? reminder.due_at)} · {repeatRuleLabel(reminder.repeat_rule)}
                  </p>
                  <p className={'mt-1 line-clamp-1 text-[11px] font-black ' + statusClass} title={status.detail}>
                    {status.label} · {status.detail}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${tone.badgeClass}`}>{tone.label}</span>
              </div>
              <p className="relative mt-4 line-clamp-3 text-[13px] font-medium leading-6 text-zinc-500">{reminder.notes || '没有备注，但时间到了本小姐会提醒。'}</p>
              <div className="relative mt-4 flex flex-nowrap gap-2">
                <IconActionButton label="标记完成" icon="✓" tone="dark" onClick={() => onComplete(reminder.id)} />
                <IconActionButton label="10 分钟后提醒" icon="10" tone="amber" onClick={() => onSnooze(reminder, 10)} />
                <IconActionButton label="1 小时后提醒" icon="1h" tone="amber" onClick={() => onSnooze(reminder, 60)} />
                <IconActionButton label="编辑提醒" icon="✎" onClick={() => onEdit(reminder)} />
                <IconActionButton label="转为便签" icon="↗" tone="sky" onClick={() => onConvertToNote(reminder)} />
                <IconActionButton
                  label={reminder.priority === 'high' ? '降为普通提醒' : '标记高优先级'}
                  icon={reminder.priority === 'high' ? '↓' : '⚑'}
                  tone="amber"
                  onClick={() => onTogglePriority(reminder)}
                />
                <IconActionButton label="归档提醒" icon="▣" onClick={() => onArchive(reminder.id)} />
              </div>
            </motion.article>
          );
        })}
        <motion.button
          variants={riseVariants}
          whileHover={{ y: -5, scale: 1.01 }}
          className="grid min-h-[160px] place-items-center rounded-[26px] border border-dashed border-sky-200 bg-sky-50/45 p-5 text-sm font-black text-sky-600"
          onClick={onCreate}
        >
          + 添加提醒
        </motion.button>
      </motion.div>
    </WallSurface>
  );
}

function PriorityWall({
  notes,
  reminders,
  onCreateReminder,
  onEditNote,
  onEditReminder,
  onOpenAttachment,
  onCompleteReminder,
  onConvertNoteToReminder,
  onConvertReminderToNote,
  onDowngradeNote,
  onDowngradeReminder,
}: {
  notes: StickyNote[];
  reminders: BackendReminder[];
  onCreateReminder: () => void;
  onEditNote: (note: StickyNote) => void;
  onEditReminder: (reminder: BackendReminder) => void;
  onOpenAttachment: (path: string) => void;
  onCompleteReminder: (id: number) => void;
  onConvertNoteToReminder: (note: StickyNote) => void;
  onConvertReminderToNote: (reminder: BackendReminder) => void;
  onDowngradeNote: (note: StickyNote) => void;
  onDowngradeReminder: (reminder: BackendReminder) => void;
}) {
  if (notes.length === 0 && reminders.length === 0) {
    return <EmptyState icon="⚑" title="暂无高优先级" description="现在没有要紧事，笨蛋可以喘口气。" />;
  }

  return (
    <WallSurface>
      <motion.div variants={pageVariants} initial="hidden" animate="show" className="grid grid-cols-3 gap-3.5 p-4 max-[1380px]:grid-cols-2 max-[760px]:grid-cols-1">
        {notes.map((note) => (
          <motion.article
            key={`note-${note.id}`}
            variants={riseVariants}
            whileHover={{ y: -6, rotate: -0.35, scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="group relative min-h-[160px] overflow-hidden rounded-[26px] border border-amber-200/70 bg-gradient-to-br from-white/94 via-amber-50/82 to-yellow-100/54 p-4 shadow-[0_1px_2px_rgba(15,23,42,.05),0_18px_44px_rgba(245,158,11,.13),inset_0_1px_0_rgba(255,255,255,.76)]"
            onDoubleClick={() => onEditNote(note)}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,.78),transparent_34%)]" />
            <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-amber-400 to-rose-400" />
            <span className="relative rounded-full bg-amber-100/84 px-3 py-1 text-[11px] font-black text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,.65)]">便签 · 高优先级</span>
            <h3 className="relative mt-4 line-clamp-2 text-base font-black tracking-[-.02em]">{note.title}</h3>
            <p className="relative mt-3 line-clamp-3 text-[13px] font-medium leading-6 text-zinc-500">{note.content}</p>
            {note.attachments.length > 0 && (
              <div className="relative mt-3 flex flex-wrap gap-1.5">
                {note.attachments.slice(0, 2).map((attachment) => (
                  <button
                    key={attachment.path}
                    className="max-w-[130px] truncate rounded-full bg-white/75 px-2.5 py-1 text-[11px] font-bold text-zinc-600"
                    onClick={() => onOpenAttachment(attachment.path)}
                  >
                    📎 {attachment.name}
                  </button>
                ))}
              </div>
            )}
            <div className="relative mt-4 flex flex-nowrap gap-2">
              <IconActionButton label="转为提醒" icon="◷" tone="sky" onClick={() => onConvertNoteToReminder(note)} />
              <IconActionButton label="编辑便签" icon="✎" onClick={() => onEditNote(note)} />
              <IconActionButton label="降为普通" icon="↓" tone="amber" onClick={() => onDowngradeNote(note)} />
            </div>
          </motion.article>
        ))}
        {reminders.map((reminder) => (
          <motion.article
            key={`reminder-${reminder.id}`}
            variants={riseVariants}
            whileHover={{ y: -6, rotate: 0.35, scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="group relative min-h-[160px] overflow-hidden rounded-[26px] border border-rose-200/80 bg-gradient-to-br from-white/94 via-rose-50/82 to-amber-50/68 p-4 shadow-[0_1px_2px_rgba(15,23,42,.05),0_18px_44px_rgba(244,63,94,.13),inset_0_1px_0_rgba(255,255,255,.76)]"
          >
            <motion.div
              className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-rose-300/28 blur-2xl"
              animate={{ scale: [1, 1.16, 1], opacity: [0.35, 0.68, 0.35] }}
              transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-rose-500 to-orange-400" />
            <span className="relative rounded-full bg-gradient-to-r from-rose-500 to-orange-400 px-3 py-1 text-[11px] font-black text-white shadow-[0_10px_22px_rgba(244,63,94,.20)]">提醒 · 高优先级</span>
            <h3 className="relative mt-4 line-clamp-2 text-base font-black tracking-[-.02em]">{reminder.title}</h3>
            <p className="relative mt-2 text-xs font-bold text-zinc-400 tabular-nums">
              {formatReminderTime(reminder.next_due_at ?? reminder.due_at)} · {repeatRuleLabel(reminder.repeat_rule)}
            </p>
            <p className="relative mt-3 line-clamp-2 text-[13px] font-medium leading-6 text-zinc-500">{reminder.notes}</p>
            <div className="relative mt-4 flex flex-nowrap gap-2">
              <IconActionButton label="标记完成" icon="✓" tone="dark" onClick={() => onCompleteReminder(reminder.id)} />
              <IconActionButton label="编辑提醒" icon="✎" onClick={() => onEditReminder(reminder)} />
              <IconActionButton label="转为便签" icon="↗" tone="sky" onClick={() => onConvertReminderToNote(reminder)} />
              <IconActionButton label="降为普通" icon="↓" tone="amber" onClick={() => onDowngradeReminder(reminder)} />
            </div>
          </motion.article>
        ))}
        <motion.button
          variants={riseVariants}
          whileHover={{ y: -5, scale: 1.01 }}
          className="grid min-h-[160px] place-items-center rounded-[26px] border border-dashed border-rose-200 bg-rose-50/45 p-5 text-sm font-black text-rose-600"
          onClick={onCreateReminder}
        >
          + 添加高优先级提醒
        </motion.button>
      </motion.div>
    </WallSurface>
  );
}

function WallSurface({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full min-h-0 overflow-auto rounded-[24px] border border-white/60 bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,.6)]">
      <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:radial-gradient(circle,rgba(15,23,42,.12)_1px,transparent_1px)] [background-size:26px_26px] [background-position:13px_13px]" />
      <motion.div
        className="pointer-events-none absolute -left-28 top-10 h-56 w-56 rounded-full bg-sky-200/20 blur-3xl"
        animate={{ x: [0, 22, 0], opacity: [0.45, 0.72, 0.45] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute bottom-0 right-0 h-48 w-48 rounded-full bg-violet-200/18 blur-3xl"
        animate={{ y: [0, -18, 0], opacity: [0.38, 0.62, 0.38] }}
        transition={{ duration: 8.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

function Toast({
  error,
  success,
  undo,
  onUndo,
  onDismiss,
}: {
  error: string | null;
  success: string | null;
  undo: UndoAction | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const message = error ?? success;
  return (
    <AnimatePresence>
      {(message || undo) && (
        <motion.div
          initial={{ opacity: 0, y: -18, x: '-50%', scale: 0.96 }}
          animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
          exit={{ opacity: 0, y: -18, x: '-50%', scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
          className={`fixed left-1/2 top-6 z-[70] flex items-center gap-2.5 rounded-full border px-5 py-2.5 text-sm font-semibold shadow-[0_16px_48px_rgba(15,23,42,.16)] backdrop-blur-2xl ${
            error ? 'border-rose-200 bg-rose-50/95 text-rose-600' : 'border-emerald-200 bg-emerald-50/95 text-emerald-600'
          }`}
        >
          <span>{error ? '⚠' : '✓'}</span>
          <button onClick={onDismiss}>{message ?? undo?.label}</button>
          {undo && !error && (
            <button
              className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-zinc-700 shadow-sm"
              onClick={onUndo}
            >
              撤销
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CelebrationBurst({ message }: { message: string | null }) {
  const particles = ['✦', '◇', '✧', '＊', '♡', '⚑'];
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[74] grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative rounded-[32px] border border-white/80 bg-white/86 px-7 py-5 text-center shadow-[0_34px_110px_rgba(15,23,42,.24)] backdrop-blur-2xl"
            initial={{ scale: 0.82, y: 20, rotate: -2 }}
            animate={{ scale: 1, y: 0, rotate: 0 }}
            exit={{ scale: 0.86, y: -12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 430, damping: 26 }}
          >
            {particles.map((particle, index) => (
              <motion.span
                key={`${particle}-${index}`}
                className="absolute left-1/2 top-1/2 text-xl"
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                animate={{
                  x: Math.cos(index * 1.05) * (80 + index * 7),
                  y: Math.sin(index * 1.05) * (58 + index * 5),
                  opacity: [0, 1, 0],
                  scale: [0.4, 1.1, 0.6],
                  rotate: index % 2 ? 28 : -28,
                }}
                transition={{ duration: 1.4, ease: 'easeOut' }}
              >
                {particle}
              </motion.span>
            ))}
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-sky-500 text-2xl text-white shadow-[0_18px_38px_rgba(16,185,129,.28)]">
              ✓
            </div>
            <p className="text-sm font-black text-zinc-800">{message}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CommandPalette({
  open,
  actions,
  onClose,
}: {
  open: boolean;
  actions: CommandPaletteAction[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const filtered = actions.filter((action) => `${action.label} ${action.hint}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            aria-label="关闭命令面板"
            className="fixed inset-0 z-[86] bg-slate-950/28 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="命令面板"
            className="fixed left-1/2 top-[16vh] z-[96] w-[560px] max-w-[calc(100vw-40px)] overflow-hidden rounded-[34px] border border-white/80 bg-white/92 p-4 shadow-[0_54px_150px_rgba(15,23,42,.34)] backdrop-blur-2xl"
            initial={{ opacity: 0, x: '-50%', y: -24, scale: 0.94 }}
            animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: -24, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="flex items-center gap-3 rounded-[24px] border border-zinc-900/[0.06] bg-zinc-950/[0.035] px-4 py-3">
              <span className="text-lg">⌘</span>
              <input
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-zinc-800 outline-none placeholder:text-zinc-400"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') onClose();
                  if (event.key === 'Enter' && filtered[0]) {
                    filtered[0].run();
                    onClose();
                  }
                }}
                placeholder="搜索命令：提醒中心、今日概览、时间线..."
              />
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-zinc-400 shadow-sm">Ctrl K</span>
            </div>
            <div className="mt-3 max-h-[420px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-semibold text-zinc-400">没有这个命令，笨蛋别乱输。</p>
              ) : (
                <div className="space-y-2">
                  {filtered.map((action) => (
                    <motion.button
                      key={action.id}
                      className="group flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left transition hover:bg-zinc-950/[0.045]"
                      whileHover={{ x: 3 }}
                      onClick={() => {
                        action.run();
                        onClose();
                      }}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-violet-500 text-white shadow-[0_12px_24px_rgba(59,130,246,.20)]">
                        {action.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black text-zinc-800">{action.label}</span>
                        <span className="mt-0.5 block text-xs font-semibold text-zinc-400">{action.hint}</span>
                      </span>
                      <span className="text-xs font-black text-zinc-300 opacity-0 transition group-hover:opacity-100">Enter</span>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}

function StartupBriefDialog({
  open,
  stats,
  nextReminder,
  onClose,
  onStartFocus,
  onDailyPlan,
}: {
  open: boolean;
  stats: DashboardStats;
  nextReminder?: BackendReminder;
  onClose: () => void;
  onStartFocus: () => void;
  onDailyPlan: () => void;
}) {
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
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="今日启动简报"
            className="fixed left-1/2 top-1/2 z-[85] w-[min(520px,calc(100vw-32px))] rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-[0_34px_110px_rgba(15,23,42,.24)] backdrop-blur-2xl"
            initial={{ opacity: 0, y: 'calc(-50% + 18px)', x: '-50%', scale: 0.94 }}
            animate={{ opacity: 1, y: '-50%', x: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: 'calc(-50% + 18px)', x: '-50%', scale: 0.94 }}
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
                ×
              </button>
            </div>
            <div className="mt-5 rounded-[24px] border border-zinc-900/[0.06] bg-zinc-50/72 p-4">
              <p className="text-xs font-black uppercase tracking-[.18em] text-zinc-400">Next</p>
              <p className="mt-2 text-base font-black text-zinc-800">{nextReminder ? nextReminder.title : '暂无提醒'}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-zinc-500">
                {nextReminder
                  ? `${formatReminderTime(nextReminder.next_due_at ?? nextReminder.due_at)} · ${nextReminder.notes || '没有备注。'}`
                  : '新增一条，本小姐替你盯时间。'}
              </p>
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
        </>
      )}
    </AnimatePresence>
  );
}
function MiniCapture({
  open,
  mode,
  saving,
  onModeChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: MiniCaptureMode;
  saving: boolean;
  onModeChange: (mode: MiniCaptureMode) => void;
  onClose: () => void;
  onSubmit: (value: string, mode: QuickEntryMode) => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue('');
  }, [open]);

  const nextMode: MiniCaptureMode = mode === 'note' ? 'reminder' : 'note';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            aria-label="关闭迷你输入"
            className="fixed inset-0 z-[84] bg-slate-950/18 backdrop-blur-[4px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.form
            className="fixed left-1/2 top-20 z-[94] flex w-[620px] max-w-[calc(100vw-40px)] items-center gap-3 rounded-[30px] border border-white/80 bg-white/92 px-4 py-3 shadow-[0_34px_110px_rgba(15,23,42,.28)] backdrop-blur-2xl"
            initial={{ opacity: 0, x: '-50%', y: -28, scale: 0.94 }}
            animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: -28, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(value, mode);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'Tab') {
                event.preventDefault();
                onModeChange(nextMode);
              }
            }}
          >
            <button
              type="button"
              className={`rounded-full px-3.5 py-2 text-xs font-black ${
                mode === 'note' ? 'bg-zinc-950 text-white' : 'bg-sky-600 text-white'
              }`}
              onClick={() => onModeChange(nextMode)}
            >
              {mode === 'note' ? '✦ 便签' : '◷ 提醒'}
            </button>
            <input
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-zinc-800 outline-none placeholder:text-zinc-400"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="迷你输入：Enter 创建，Tab 切换便签/提醒，Esc 关闭..."
            />
            <span className="rounded-full bg-zinc-950/[0.05] px-3 py-1.5 text-[11px] font-black text-zinc-400">
              {saving ? '保存中' : 'Ctrl Alt Space'}
            </span>
          </motion.form>
        </>
      )}
    </AnimatePresence>
  );
}

function ReminderAlarmDialog({
  alarm,
  onClose,
  onComplete,
  onSnooze,
}: {
  alarm: ReminderFiredPayload | null;
  onClose: () => void;
  onComplete: (id: number) => void;
  onSnooze: (payload: ReminderFiredPayload) => void;
}) {
  return (
    <AnimatePresence>
      {alarm && (
        <>
          <motion.div
            className="fixed inset-0 z-[75] bg-slate-950/34 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.section
            role="alertdialog"
            aria-modal="true"
            aria-label="提醒到时间"
            className="fixed left-1/2 top-1/2 z-[85] w-[460px] max-w-[calc(100vw-40px)] overflow-hidden rounded-[36px] border border-white/80 bg-white/92 p-7 text-center shadow-[0_54px_150px_rgba(15,23,42,.36)] backdrop-blur-2xl"
            initial={{ opacity: 0, x: '-50%', y: '-42%', scale: 0.88, rotate: -2 }}
            animate={{
              opacity: 1,
              x: alarm.priority === 'high' ? ['-50%', 'calc(-50% - 5px)', 'calc(-50% + 5px)', '-50%'] : '-50%',
              y: '-50%',
              scale: 1,
              rotate: alarm.priority === 'high' ? [0, -0.6, 0.6, 0] : 0,
            }}
            exit={{ opacity: 0, x: '-50%', y: '-44%', scale: 0.9, rotate: 2 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            <motion.div
              className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-rose-300/34 blur-3xl"
              animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.78, 0.45] }}
              transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-gradient-to-br from-rose-500 to-amber-400 text-3xl text-white shadow-[0_22px_48px_rgba(244,63,94,.28)]"
              animate={{ rotate: [-3, 3, -3], scale: [1, 1.05, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              ◷
            </motion.div>
            <p className="mt-5 text-xs font-black uppercase tracking-[.28em] text-rose-500">Reminder Alert</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-.03em]">{alarm.title}</h2>
            <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-zinc-950/[0.04] px-4 py-3 text-sm font-semibold leading-7 text-zinc-500">
              {alarm.body || '到时间啦，别装没看见，笨蛋。'}
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <button className="rounded-2xl border border-zinc-900/[0.08] bg-white px-4 py-3 text-sm font-bold text-zinc-500" onClick={onClose}>
                知道了
              </button>
              <button className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700" onClick={() => onSnooze(alarm)}>
                10分钟后
              </button>
              <button className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-bold text-white shadow-[0_14px_32px_rgba(15,23,42,.22)]" onClick={() => onComplete(alarm.id)}>
                完成
              </button>
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}

function AiInsightDialog({
  insight,
  onClose,
  onCopy,
  onAppendToNote,
  onCreateReminder,
  onArchiveNotes,
}: {
  insight: AiInsight | null;
  onClose: () => void;
  onCopy: (title: string, text: string) => void;
  onAppendToNote: (insight: AiInsight) => void;
  onCreateReminder: (insight: AiInsight) => void;
  onArchiveNotes: (noteIds: number[]) => void;
}) {
  const actions = getInsightDialogActions({
    canAppendToNote: Boolean(insight?.canAppendToNote),
    canCreateReminder: Boolean(insight?.canCreateReminder),
    canArchiveNote: Boolean(insight?.canArchiveNote && insight.targetNoteIds?.length),
  });
  const hasExecutableActions = actions.some((action) => action.key === 'append-note' || action.key === 'create-reminder');
  return (
    <AnimatePresence>
      {insight && (
        <>
          <motion.button
            aria-label="关闭 AI 结果"
            className="fixed inset-0 z-[78] bg-slate-950/24 backdrop-blur-[5px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="pointer-events-none fixed inset-0 z-[88] grid place-items-center px-6">
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={insight.title}
            className="pointer-events-auto w-[520px] max-w-[calc(100vw-48px)] overflow-hidden rounded-[34px] border border-white/80 bg-white/92 p-6 shadow-[0_44px_120px_rgba(15,23,42,.28)] backdrop-blur-2xl"
            initial={{ opacity: 0, y: 22, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 22, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.28em] text-violet-600">AI Action</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-.03em]">{insight.title}</h2>
                <p className="mt-1 text-xs font-semibold text-zinc-400">{hasExecutableActions ? '本小姐已经把能落地的动作放前面了。' : '先读结论，再决定要不要继续推进。'}</p>
              </div>
              <button className="grid h-10 w-10 place-items-center rounded-full bg-white/64 text-zinc-400 transition hover:bg-white hover:text-zinc-700" onClick={onClose}>
                ✕
              </button>
            </div>
            <div className="mt-5 max-h-[46vh] overflow-y-auto whitespace-pre-wrap rounded-[24px] border border-violet-100 bg-gradient-to-br from-violet-50/86 to-sky-50/70 p-4 text-sm font-semibold leading-7 text-zinc-600">
              <span className="mb-2 block text-[11px] font-black text-violet-500">{insight.source === 'ai' ? 'DeepSeek 生成' : '本地分析'}</span>
              {insight.text}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {actions.map((action) => (
                <button
                  key={action.key}
                  className={
                    action.tone === 'primary'
                      ? 'rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-bold text-white shadow-[0_14px_32px_rgba(15,23,42,.22)] transition hover:-translate-y-0.5'
                      : 'rounded-2xl border border-zinc-900/[0.08] bg-white px-4 py-3 text-sm font-bold text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-800'
                  }
                  onClick={() => {
                    if (action.key === 'copy') onCopy(insight.title, insight.text);
                    if (action.key === 'append-note') onAppendToNote(insight);
                    if (action.key === 'create-reminder') onCreateReminder(insight);
                    if (action.key === 'archive-note') {
                      onArchiveNotes(insight.targetNoteIds ?? []);
                      return;
                    }
                    onClose();
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </motion.aside>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
function AiSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKey('');
    setMessage(null);
    void refreshStatus();
  }, [open]);

  async function refreshStatus() {
    try {
      setStatus(await invoke<AiKeyStatus>('get_ai_key_status'));
    } catch {
      setStatus({ configured: false, source: null });
    }
  }

  async function saveKey() {
    if (!key.trim()) {
      setMessage('Key 不能为空，笨蛋。');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const next = await invoke<AiKeyStatus>('save_ai_key', { key });
      setStatus(next);
      setKey('');
      setMessage('AI Key 已保存到本机配置文件。');
    } catch (caught) {
      setMessage(formatError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            aria-label="关闭 AI 设置"
            className="fixed inset-0 z-[80] bg-slate-950/28 backdrop-blur-[5px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="AI 设置"
            className="fixed right-5 top-5 z-[90] w-[420px] max-w-[calc(100vw-40px)] overflow-hidden rounded-[34px] border border-white/80 bg-white/90 p-7 shadow-[0_54px_140px_rgba(15,23,42,.32)] backdrop-blur-2xl"
            initial={{ x: 460, opacity: 0.2 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 460, opacity: 0.2 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.28em] text-emerald-600">AI Lab</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-.03em]">DeepSeek 设置</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-zinc-400">Key 只保存到本机，不会写进代码和安装包。</p>
              </div>
              <button className="grid h-10 w-10 place-items-center rounded-full bg-white/64 text-zinc-400 transition hover:bg-white hover:text-zinc-700" onClick={onClose}>
                ✕
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm font-semibold text-emerald-700">
              当前状态：{status?.configured ? `已配置（${status.source ?? '未知来源'}）` : '未配置'}
            </div>

            <label className="mt-5 block">
              <span className="mb-2.5 block text-[13px] font-semibold text-zinc-500">DeepSeek API Key</span>
              <input
                type="password"
                className="field-input"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="粘贴 sk-...，保存后会清空输入框"
              />
            </label>

            {message && <p className="mt-3 rounded-2xl bg-zinc-950/[0.04] px-4 py-3 text-xs font-semibold text-zinc-500">{message}</p>}

            <div className="mt-6 flex gap-3">
              <button className="flex-1 rounded-2xl border border-zinc-900/[0.08] bg-white px-4 py-3 text-sm font-semibold text-zinc-500" onClick={onClose}>
                取消
              </button>
              <button
                className="flex-[1.4] rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(16,185,129,.24)] disabled:opacity-45"
                disabled={saving}
                onClick={() => void saveKey()}
              >
                {saving ? '保存中...' : '保存 Key'}
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function EditorDrawer({
  drawer,
  noteDraft,
  reminderDraft,
  saving,
  onClose,
  onNoteDraftChange,
  onReminderDraftChange,
  onCreateReminderFromText,
  onSaveNote,
  onSaveReminder,
}: {
  drawer: DrawerState;
  noteDraft: NoteInputDraft;
  reminderDraft: ReminderInputDraft;
  saving: boolean;
  onClose: () => void;
  onNoteDraftChange: (draft: NoteInputDraft) => void;
  onReminderDraftChange: (draft: ReminderInputDraft) => void;
  onCreateReminderFromText: (content: string) => void;
  onSaveNote: () => void;
  onSaveReminder: () => void;
}) {
  const isNote = drawer?.mode.startsWith('note');
  const title = isNote
    ? drawer?.mode === 'note-edit'
      ? '编辑便签'
      : '写一张便签'
    : drawer?.mode === 'reminder-edit'
      ? '编辑提醒'
      : '新增提醒';

  return (
    <AnimatePresence>
      {drawer && (
        <>
          <motion.button
            aria-label="关闭编辑抽屉"
            className="fixed inset-0 z-40 bg-slate-950/28 backdrop-blur-[5px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed bottom-5 right-5 top-5 z-50 flex w-[420px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-[34px] border border-white/80 bg-white/88 shadow-[0_1px_2px_rgba(15,23,42,.06),0_54px_140px_rgba(15,23,42,.32)] backdrop-blur-2xl"
            initial={{ x: 480, opacity: 0.3, rotateY: -12 }}
            animate={{ x: 0, opacity: 1, rotateY: 0 }}
            exit={{ x: 480, opacity: 0.3, rotateY: -12 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32, mass: 0.9 }}
          >
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-300/24 blur-3xl" />
            <div className="relative flex items-start justify-between gap-4 px-7 pb-2 pt-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.28em] text-sky-600">Composer</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-.03em]">{title}</h2>
                <p className="mt-1.5 text-[13px] font-medium text-zinc-400">按 ESC 关闭，别说本小姐没提醒你。</p>
              </div>
              <button aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full bg-white/64 text-zinc-400 transition hover:bg-white hover:text-zinc-700" onClick={onClose}>
                ✕
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto px-7 py-6">
              {isNote ? (
                <NoteForm draft={noteDraft} onChange={onNoteDraftChange} onCreateReminderFromText={onCreateReminderFromText} />
              ) : (
                <ReminderForm draft={reminderDraft} onChange={onReminderDraftChange} />
              )}
            </div>

            <div className="relative flex gap-3 border-t border-zinc-900/[0.06] bg-white/54 px-7 py-5">
              <button className="flex-1 rounded-2xl border border-zinc-900/[0.08] bg-white px-4 py-3 text-sm font-semibold text-zinc-500 transition hover:text-zinc-800" onClick={onClose}>
                取消
              </button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                className="flex-[1.5] rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(37,99,235,.30)] transition hover:brightness-110 disabled:opacity-45"
                disabled={saving}
                onClick={isNote ? onSaveNote : onSaveReminder}
              >
                {saving ? '保存中...' : isNote ? '保存便签' : '保存提醒'}
              </motion.button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function NoteForm({
  draft,
  onChange,
  onCreateReminderFromText,
}: {
  draft: NoteInputDraft;
  onChange: (draft: NoteInputDraft) => void;
  onCreateReminderFromText: (content: string) => void;
}) {
  const placeholder = useMemo(() => quickCopies[Math.floor(Math.random() * quickCopies.length)], []);
  const recommendation = useMemo(() => recommendNoteMetadata(draft.content, draft.title), [draft.content, draft.title]);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [directory, setDirectory] = useState<FileBrowserDirectory | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState('');
  const [aiLoading, setAiLoading] = useState<AiAssistMode | null>(null);
  const [aiResult, setAiResult] = useState<GeneratedText | null>(null);
  const [aiResultMode, setAiResultMode] = useState<AiAssistMode | null>(null);

  async function loadFiles(path?: string) {
    setBrowserLoading(true);
    setBrowserError(null);
    try {
      const next = await invoke<FileBrowserDirectory>('list_local_files', { path: path ?? null });
      setDirectory(next);
      setBrowserOpen(true);
    } catch (caught) {
      setBrowserError(formatError(caught));
    } finally {
      setBrowserLoading(false);
    }
  }

  function toggleFile(path: string) {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function attachSelectedFiles() {
    const entries = directory?.entries.filter((entry) => selectedPaths.has(entry.path) && !entry.isDir) ?? [];
    if (entries.length === 0) return;
    const merged = mergeAttachments(
      draft.attachments,
      entries.map((entry) => ({
        path: entry.path,
        name: entry.name,
        description: describeAttachment(entry.path, draft.content),
      })),
    );
    onChange({ ...draft, attachments: merged });
    setSelectedPaths(new Set());
    setBrowserOpen(false);
  }

  async function useManualPath() {
    const path = manualPath.trim();
    if (!path) return;
    setBrowserError(null);

    try {
      const directory = await invoke<FileBrowserDirectory>('list_local_files', { path });
      setDirectory(directory);
      setBrowserOpen(true);
      setManualPath('');
      return;
    } catch {
      const attachment = buildAttachmentFromPath(path, draft.content);
      const merged = mergeAttachments(draft.attachments, [attachment]);
      onChange({ ...draft, attachments: merged });
      setManualPath('');
    }
  }

  async function runAiAssist(mode: AiAssistMode) {
    const content = draft.content.trim();
    if (!content) {
      setAiResult({ source: 'fallback', text: '先写点内容，本小姐才知道要怎么帮你玩。' });
      setAiResultMode(mode);
      return;
    }
    setAiLoading(mode);
    try {
      const result = await invoke<GeneratedText>('generate_ai_assist', { mode, content });
      setAiResult(result);
      setAiResultMode(mode);
    } catch (caught) {
      setAiResult({ source: 'fallback', text: `AI 暂时没回应：${formatError(caught)}` });
      setAiResultMode(mode);
    } finally {
      setAiLoading(null);
    }
  }

  function applyAiResult() {
    if (!aiResult || !aiResultMode) return;
    if (aiResultMode === 'compress') {
      onChange({ ...draft, content: aiResult.text });
      return;
    }
    if (aiResultMode === 'recommend') {
      const tags = recommendation.tags.map((tag) => `#${tag}`).join(' ');
      const priorityMark = recommendation.priority === 'high' && !draft.content.includes('!!') ? ' !!' : '';
      const nextContent = `${draft.content.trim()}${priorityMark}${tags ? `\n${tags}` : ''}`.trim();
      onChange({ ...draft, content: nextContent, color: recommendation.color });
      return;
    }
    if (aiResultMode === 'reminder' || aiResultMode === 'time' || aiResultMode === 'action') {
      onCreateReminderFromText(aiResult.text);
    }
  }

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={riseVariants} className="rounded-2xl border border-white/70 bg-white/62 p-4 shadow-[0_1px_2px_rgba(15,23,42,.03)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-700">便签模板</p>
          <span className="text-[11px] font-bold text-zinc-400">一键套用</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {noteTemplates.map((template) => (
            <button
              key={template.name}
              type="button"
              className="rounded-xl bg-white/78 px-3 py-2 text-left text-xs font-bold text-zinc-600 shadow-sm transition hover:bg-white hover:text-zinc-950"
              onClick={() =>
                onChange({
                  ...draft,
                  title: draft.title || template.name,
                  content: draft.content.trim() ? `${draft.content.trim()}\n\n${template.content}` : template.content,
                })
              }
            >
              {template.name}
            </button>
          ))}
        </div>
      </motion.div>
      <motion.div variants={riseVariants}>
        <Field label="内容">
          <textarea className="field-input h-44 resize-none leading-7" value={draft.content} onChange={(event) => onChange({ ...draft, content: event.target.value })} placeholder={placeholder} />
        </Field>
      </motion.div>
      <motion.div
        variants={riseVariants}
        className="rounded-2xl border border-sky-100/80 bg-gradient-to-br from-sky-50/92 to-indigo-50/70 px-4 py-3.5 text-sm font-semibold text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,.8)]"
      >
        ✨ 标题、颜色、优先级和标签会自动推荐：
        <span className="ml-1 rounded-full bg-white/70 px-2 py-1 text-[11px]">
          {categoryLabel(recommendation.category)} · {recommendation.priority === 'high' ? '高优先级' : '普通'} · {recommendation.tags.slice(0, 2).map((tag) => `#${tag}`).join(' ') || '#轻备忘'}
        </span>
      </motion.div>
      <motion.div variants={riseVariants} className="rounded-2xl border border-violet-100/80 bg-gradient-to-br from-violet-50/90 to-sky-50/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.8)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-700">AI 灵感玩法</p>
            <p className="mt-1 text-xs font-medium text-zinc-400">让便签更会玩一点，哼。</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['action', '行动建议'],
            ['tease', '傲娇吐槽'],
            ['reminder', '拆提醒'],
            ['time', '提醒时间'],
            ['compress', '压缩摘要'],
            ['recommend', '推荐标签'],
          ] as Array<[AiAssistMode, string]>).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className="rounded-xl bg-white/78 px-3 py-2 text-xs font-bold text-zinc-600 shadow-sm transition hover:bg-white hover:text-zinc-950 disabled:opacity-45"
              disabled={aiLoading !== null}
              onClick={() => void runAiAssist(mode)}
            >
              {aiLoading === mode ? '生成中...' : label}
            </button>
          ))}
        </div>
        {aiResult && (
          <div className="mt-3 whitespace-pre-wrap rounded-xl bg-white/78 px-3 py-2 text-xs font-semibold leading-6 text-zinc-600">
            <span className="mb-1 block text-[11px] font-bold text-violet-500">
              {aiResult.source === 'ai' ? 'DeepSeek 生成' : '本地兜底'}
            </span>
            {aiResult.text}
            {aiResultMode && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(['compress', 'recommend', 'reminder', 'time', 'action'] as AiAssistMode[]).includes(aiResultMode) && (
                  <button
                    type="button"
                    className="rounded-full bg-zinc-950 px-3 py-1.5 text-[11px] font-black text-white shadow-[0_10px_22px_rgba(15,23,42,.16)]"
                    onClick={applyAiResult}
                  >
                    {aiResultMode === 'compress'
                      ? '替换为摘要'
                      : aiResultMode === 'recommend'
                        ? '应用推荐'
                        : '一键生成提醒'}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-zinc-500 shadow-sm"
                  onClick={() => onChange({ ...draft, content: `${draft.content.trim()}\n\n${aiResult.text}`.trim() })}
                >
                  追加到便签
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
      <motion.div variants={riseVariants} className="rounded-2xl border border-white/70 bg-white/66 p-4 shadow-[0_1px_2px_rgba(15,23,42,.03)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-700">关联文件</p>
            <p className="mt-1 text-xs font-medium text-zinc-400">只保存本地路径，不上传文件。</p>
          </div>
          <button
            type="button"
            className="rounded-2xl bg-zinc-950 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,.18)]"
            onClick={() => {
              if (browserOpen) setBrowserOpen(false);
              else void loadFiles(directory?.currentPath);
            }}
          >
            {browserOpen ? '收起' : '+ 浏览文件'}
          </button>
        </div>
        {browserOpen && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-900/[0.06] bg-zinc-50/80">
            <form
              className="flex items-center gap-2 border-b border-zinc-900/[0.06] bg-white/52 px-3 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                void useManualPath();
              }}
            >
              <input
                className="min-w-0 flex-1 rounded-xl border border-zinc-900/[0.06] bg-white px-3 py-2 text-xs font-semibold text-zinc-600 outline-none transition focus:border-sky-300"
                value={manualPath}
                onChange={(event) => setManualPath(event.target.value)}
                placeholder="输入文件或文件夹路径，例如 C:/Users/.../桌面/报价.pdf"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-[0_10px_22px_rgba(14,165,233,.18)]"
              >
                使用路径
              </button>
            </form>
            <div className="flex items-center justify-between gap-2 border-b border-zinc-900/[0.06] px-3 py-2">
              <button
                type="button"
                disabled={!directory?.parentPath || browserLoading}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-zinc-500 shadow-sm disabled:opacity-40"
                onClick={() => directory?.parentPath && void loadFiles(directory.parentPath)}
              >
                ↑ 上级
              </button>
              <span className="min-w-0 flex-1 truncate text-center text-[11px] font-semibold text-zinc-400">
                {directory?.currentPath ?? '桌面'}
              </span>
              <button
                type="button"
                disabled={selectedPaths.size === 0}
                className="rounded-xl bg-zinc-950 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-35"
                onClick={attachSelectedFiles}
              >
                关联 {selectedPaths.size}
              </button>
            </div>
            {browserError && <p className="px-3 py-2 text-xs font-semibold text-rose-500">{browserError}</p>}
            <div className="max-h-56 overflow-y-auto p-2">
              {browserLoading && <p className="px-2 py-4 text-center text-xs font-semibold text-zinc-400">本小姐正在翻文件...</p>}
              {!browserLoading && directory?.entries.length === 0 && (
                <p className="px-2 py-4 text-center text-xs font-semibold text-zinc-400">这里空空的。</p>
              )}
              {!browserLoading &&
                directory?.entries.map((entry) => (
                  <div key={entry.path} className="mb-1 flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-white">
                    {entry.isDir ? (
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-xs font-bold text-sky-700"
                        onClick={() => void loadFiles(entry.path)}
                      >
                        📁 {entry.name}
                      </button>
                    ) : (
                      <>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-zinc-950"
                          checked={selectedPaths.has(entry.path)}
                          onChange={() => toggleFile(entry.path)}
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-zinc-600"
                          onClick={() => toggleFile(entry.path)}
                          title={entry.path}
                        >
                          📄 {entry.name}
                        </button>
                      </>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
        {!browserOpen && (
          <form
            className="mt-4 flex items-center gap-2 rounded-2xl border border-zinc-900/[0.06] bg-zinc-50/70 p-2"
            onSubmit={(event) => {
              event.preventDefault();
              void useManualPath();
            }}
          >
            <input
              className="min-w-0 flex-1 bg-transparent px-2 text-xs font-semibold text-zinc-600 outline-none placeholder:text-zinc-400"
              value={manualPath}
              onChange={(event) => setManualPath(event.target.value)}
              placeholder="也可以直接粘贴文件路径，Enter 关联"
            />
            <button type="submit" className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-zinc-700 shadow-sm">
              关联路径
            </button>
          </form>
        )}
        {draft.attachments.length > 0 && (
          <div className="mt-3 space-y-2">
            {draft.attachments.map((attachment) => (
              <div key={attachment.path} className="flex items-center justify-between gap-2 rounded-xl bg-zinc-950/[0.04] px-3 py-2">
                <span className="min-w-0 text-xs font-semibold text-zinc-600">
                  <span className="block truncate">📎 {attachment.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
                    {attachment.description || describeAttachment(attachment.path, draft.content)}
                  </span>
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-zinc-400 hover:text-rose-500"
                  onClick={() =>
                    onChange({ ...draft, attachments: draft.attachments.filter((item) => item.path !== attachment.path) })
                  }
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.div>
      <motion.label variants={riseVariants} className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/70 bg-white/66 px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,.03)]">
        <span className="text-sm font-semibold text-zinc-600">置顶这张便签</span>
        <input type="checkbox" className="peer sr-only" checked={draft.pinned} onChange={(event) => onChange({ ...draft, pinned: event.target.checked })} />
        <span className="relative h-6 w-11 rounded-full bg-zinc-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-[0_2px_6px_rgba(15,23,42,.2)] after:transition-transform peer-checked:bg-sky-500 peer-checked:after:translate-x-5" />
      </motion.label>
    </motion.div>
  );
}

function ReminderForm({ draft, onChange }: { draft: ReminderInputDraft; onChange: (draft: ReminderInputDraft) => void }) {
  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={riseVariants}>
        <Field label="提醒时间">
          <input className="field-input" type="datetime-local" value={draft.dueAtLocal} onChange={(event) => onChange({ ...draft, dueAtLocal: event.target.value })} />
        </Field>
      </motion.div>
      <motion.div variants={riseVariants}>
        <Field label="优先级">
          <div className="grid grid-cols-2 gap-1 rounded-2xl border border-zinc-900/[0.06] bg-zinc-900/[0.03] p-1">
            {(['normal', 'high'] as const).map((priority) => (
              <button
                key={priority}
                type="button"
                className={`rounded-[14px] px-4 py-2.5 text-sm font-semibold transition ${
                  draft.priority === priority
                    ? priority === 'high'
                      ? 'bg-white text-rose-500 shadow-[0_2px_8px_rgba(15,23,42,.08)]'
                      : 'bg-white text-zinc-800 shadow-[0_2px_8px_rgba(15,23,42,.08)]'
                    : 'text-zinc-400 hover:text-zinc-600'
                }`}
                onClick={() => onChange({ ...draft, priority })}
              >
                {priority === 'high' ? '⚑ 高优先级' : '普通'}
              </button>
            ))}
          </div>
        </Field>
      </motion.div>
      <motion.div variants={riseVariants}>
        <Field label="重复规则">
          <RepeatRulePicker
            value={draft.repeatRule}
            onChange={(repeatRule) => onChange({ ...draft, repeatRule })}
          />
        </Field>
      </motion.div>
      <motion.div variants={riseVariants}>
        <Field label="备注">
          <textarea className="field-input h-32 resize-none leading-7" value={draft.notes} onChange={(event) => onChange({ ...draft, notes: event.target.value })} placeholder="输入提醒内容，标题会由 AI 自动生成。" />
        </Field>
      </motion.div>
    </motion.div>
  );
}

function RepeatRulePicker({
  value,
  onChange,
}: {
  value: RepeatRulePayload;
  onChange: (value: RepeatRulePayload) => void;
}) {
  const intervalValue = value.kind === 'interval_minutes' ? value.value : 30;
  const options: Array<{ label: string; rule: RepeatRulePayload; icon: string }> = [
    { label: '不重复', rule: { kind: 'none' }, icon: '—' },
    { label: '每天', rule: { kind: 'daily' }, icon: '日' },
    { label: '每周', rule: { kind: 'weekly' }, icon: '周' },
    { label: '每月', rule: { kind: 'monthly' }, icon: '月' },
    { label: '间隔', rule: { kind: 'interval_minutes', value: intervalValue }, icon: '↻' },
  ];

  return (
    <div className="rounded-2xl border border-zinc-900/[0.06] bg-zinc-900/[0.03] p-1.5">
      <div className="grid grid-cols-5 gap-1">
        {options.map((option) => {
          const active = value.kind === option.rule.kind;
          return (
            <button
              key={option.rule.kind}
              type="button"
              className={`rounded-[14px] px-2 py-2.5 text-xs font-black transition ${
                active
                  ? 'bg-white text-zinc-900 shadow-[0_2px_10px_rgba(15,23,42,.08)]'
                  : 'text-zinc-400 hover:bg-white/45 hover:text-zinc-600'
              }`}
              onClick={() => onChange(option.rule)}
            >
              <span className="mb-1 block text-[11px] opacity-70">{option.icon}</span>
              {option.label}
            </button>
          );
        })}
      </div>
      {value.kind === 'interval_minutes' && (
        <div className="mt-2 flex items-center gap-2 rounded-[14px] bg-white/72 px-3 py-2">
          <span className="text-xs font-bold text-zinc-400">每隔</span>
          <input
            type="number"
            min={1}
            max={1440}
            className="min-w-0 flex-1 bg-transparent text-sm font-black text-zinc-700 outline-none"
            value={intervalValue}
            onChange={(event) =>
              onChange({
                kind: 'interval_minutes',
                value: Math.max(1, Number(event.target.value) || 30),
              })
            }
          />
          <span className="text-xs font-bold text-zinc-400">分钟提醒一次</span>
        </div>
      )}
      <p className="mt-2 px-2 text-[11px] font-semibold text-zinc-400">当前：{repeatRuleLabel(value)}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2.5 block text-[13px] font-semibold text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="grid h-full min-h-[230px] place-items-center rounded-[24px] border border-dashed border-zinc-900/10 bg-white/34 p-8 text-center">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm">
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[22px] bg-white/85 text-2xl text-zinc-400 shadow-[0_1px_2px_rgba(15,23,42,.05),0_14px_34px_rgba(15,23,42,.10)]">
          {icon}
        </motion.div>
        <h3 className="text-[15px] font-semibold text-zinc-700">{title}</h3>
        <p className="mt-1.5 text-[13px] font-medium leading-6 text-zinc-400">{description}</p>
      </motion.div>
    </div>
  );
}

function ActionButton({
  children,
  tone = 'dark',
  compact = false,
  onClick,
}: {
  children: ReactNode;
  tone?: 'dark' | 'light';
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ y: -3, scale: 1.025 }}
      whileTap={{ scale: 0.97 }}
      className={`${compact ? 'px-3.5 py-2 text-xs' : 'px-5 py-3 text-sm'} rounded-2xl font-semibold transition ${
        tone === 'dark'
          ? 'bg-zinc-950 text-white shadow-[0_14px_32px_rgba(15,23,42,.24)] hover:bg-zinc-800'
          : 'border border-zinc-900/10 bg-white/82 text-zinc-700 shadow-[0_10px_24px_rgba(15,23,42,.07)] hover:bg-white'
      }`}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}

function readMotionMode(): MotionMode {
  const value = window.localStorage.getItem('qmemo-motion-mode');
  return value === 'calm' || value === 'lively' || value === 'wild' ? value : 'wild';
}

function dailyQueueStorageKey(date = new Date()): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return 'qmemo-daily-queue-' + localDate;
}

function readDailyQueueStatuses(): DailyQueueStatusMap {
  try {
    const raw = window.localStorage.getItem(dailyQueueStorageKey());
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(([, status]) => status === 'done' || status === 'skipped'),
    ) as DailyQueueStatusMap;
  } catch {
    return {};
  }
}

function writeDailyQueueStatuses(statuses: DailyQueueStatusMap) {
  try {
    const persisted = Object.fromEntries(
      Object.entries(statuses).filter(([, status]) => status === 'done' || status === 'skipped'),
    );
    window.localStorage.setItem(dailyQueueStorageKey(), JSON.stringify(persisted));
  } catch {
    // localStorage may be unavailable in restricted WebView modes.
  }
}


function parseSmartEntry(raw: string, fallbackMode: QuickEntryMode): SmartEntry {
  let text = raw.trim();
  let mode = fallbackMode;
  let priority: 'normal' | 'high' = 'normal';
  const attachments: NoteAttachment[] = [];

  if (/^!(\s|$)/.test(text) || /^！(\s|$)/.test(text)) {
    priority = 'high';
    text = text.replace(/^[!！]\s*/, '');
  }

  const commandMatch = text.match(/^\/(note|n|便签|reminder|r|提醒)\s+/i);
  if (commandMatch) {
    const command = commandMatch[1].toLowerCase();
    mode = command === 'note' || command === 'n' || command === '便签' ? 'note' : 'reminder';
    text = text.slice(commandMatch[0].length).trim();
  }

  const fileMatches = Array.from(text.matchAll(/file:([^\n#]+?)(?=\s#|\sfile:|$)/gi));
  for (const match of fileMatches) {
    const path = match[1].trim().replace(/^['"]|['"]$/g, '');
    if (path) attachments.push(buildAttachmentFromPath(path, text));
  }
  text = text.replace(/\s*file:[^\n#]+?(?=\s#|\sfile:|$)/gi, '').trim();

  const looksTimed = /(提醒|明天|后天|今天|今晚|早上|上午|中午|下午|晚上|下周|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}[点:]|\d+\s*(分钟|小时|天)后)/.test(text);
  if (fallbackMode === 'note' && looksTimed && /提醒|明天|后天|今晚|\d+\s*(分钟|小时|天)后|\d{1,2}[点:]/.test(text)) {
    mode = 'reminder';
  }

  if (/重要|紧急|马上|必须|高优先级|urgent/i.test(text)) priority = 'high';

  return {
    mode,
    content: text,
    priority,
    attachments: mode === 'note' ? attachments : [],
    reason:
      mode === 'reminder' && looksTimed
        ? '已识别时间语义并创建提醒。'
        : attachments.length
          ? '已关联本地路径并创建便签。'
          : priority === 'high'
            ? '已按高优先级创建。'
            : undefined,
  };
}

function emptyNoteDraft(): NoteInputDraft {
  return { title: '', content: '', color: 'auto', pinned: false, attachments: [] };
}

function emptyReminderDraft(): ReminderInputDraft {
  const due = new Date(Date.now() + 30 * 60 * 1000);
  return { title: '', notes: '', dueAtLocal: toDateTimeLocal(due.toISOString()), repeatRule: { kind: 'none' }, priority: 'normal' };
}

function keepExistingSelection(current: Set<number>, mappedNotes: StickyNote[]): Set<number> {
  const existing = new Set(mappedNotes.map((note) => note.id));
  const kept = new Set(Array.from(current).filter((id) => existing.has(id)));
  if (kept.size === 0 && mappedNotes[0]) kept.add(mappedNotes[0].id);
  return kept;
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatReminderTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function isSameLocalDay(value: string, target: Date): boolean {
  const date = new Date(value);
  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  );
}

function viewHint(filter: DashboardFilter): string {
  if (filter === 'highPriority') return '高优先级视图：重点便签和紧急提醒都在这里。';
  if (filter === 'reminders') return '提醒视图：把时间节点铺成一面墙。';
  return '便签视图：拖动整理你的灵感卡片。';
}

function wallTitle(filter: DashboardFilter): string {
  if (filter === 'highPriority') return '高优先级墙';
  if (filter === 'reminders') return '提醒墙';
  return '便签墙';
}

function categoryLabel(category: ReturnType<typeof inferNoteCategory>): string {
  if (category === 'today') return '行动项';
  if (category === 'waiting') return '等反馈';
  return '灵感';
}

function buildWorkspacePrompt(notes: StickyNote[], reminders: BackendReminder[]): string {
  const noteLines = notes
    .slice(0, 30)
    .map((note) => `便签｜${categoryLabel(inferNoteCategory(`${note.title}\n${note.content}`))}｜${note.priority}｜${note.title}：${note.content}`)
    .join('\n');
  const reminderLines = reminders
    .slice(0, 30)
    .map((reminder) => `提醒｜${reminder.priority}｜${formatReminderTime(reminder.next_due_at ?? reminder.due_at)}｜${reminder.title}：${reminder.notes}`)
    .join('\n');
  return [noteLines, reminderLines].filter(Boolean).join('\n');
}

function shouldShowMissedAlarm(reminder: BackendReminder, seenIds: Set<number>): boolean {
  if (!reminder.fired_at || seenIds.has(reminder.id)) return false;
  const firedAt = new Date(reminder.fired_at).getTime();
  if (!Number.isFinite(firedAt)) return false;
  return Date.now() - firedAt <= 10 * 60 * 1000;
}

function normalizeNotePriorityContent(content: string, priority: 'normal' | 'high'): string {
  const cleaned = content
    .replace(/\n?\s*!!\s*高优先级\s*/g, '\n')
    .replace(/\s*!!\s*/g, ' ')
    .replace(/\n?\s*#普通优先级\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (priority === 'high') {
    return `${cleaned}\n\n!! 高优先级`.trim();
  }
  return `${cleaned}\n\n#普通优先级`.trim();
}

function formatReminderAsNoteContent(reminder: BackendReminder): string {
  return [
    reminder.notes || '这条提醒没有备注。',
    '',
    `提醒时间：${formatReminderTime(reminder.next_due_at ?? reminder.due_at)}`,
    `重复规则：${repeatRuleLabel(reminder.repeat_rule)}`,
    reminder.priority === 'high' ? '来源：高优先级提醒' : '来源：提醒',
  ].join('\n');
}

function fallbackTitle(content: string, kind: QuickEntryMode): string {
  const title = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 18)
    .trim();
  if (title) return title;
  return kind === 'reminder' ? '新的提醒' : '新的便签';
}

function toAttachment(path: string): NoteAttachment {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const name = parts.length > 0 ? parts[parts.length - 1] : normalized;
  return { path: normalized, name };
}

function mergeAttachments(current: NoteAttachment[], incoming: NoteAttachment[]): NoteAttachment[] {
  const byPath = new Map(current.map((attachment) => [attachment.path, attachment]));
  for (const attachment of incoming) byPath.set(attachment.path, attachment);
  return Array.from(byPath.values());
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}






