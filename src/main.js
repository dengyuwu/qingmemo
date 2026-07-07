const tauri = window.__TAURI__;
const invoke = tauri?.core?.invoke;
const listen = tauri?.event?.listen;

const state = {
  view: "dashboard",
  query: "",
  notes: [],
  reminders: [],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  viewTitle: $("#viewTitle"),
  summary: $("#summary"),
  search: $("#searchInput"),
  noteList: $("#noteList"),
  reminderList: $("#reminderList"),
  statReminder: $("#statReminder"),
  statHigh: $("#statHigh"),
  statNotes: $("#statNotes"),
  quickNote: $("#quickNoteBtn"),
  quickReminder: $("#quickReminderBtn"),
  noteComposer: $("#noteComposer"),
  reminderComposer: $("#reminderComposer"),
  noteForm: $("#noteForm"),
  noteEditingId: $("#noteEditingId"),
  noteTitle: $("#noteTitleInput"),
  noteContent: $("#noteContentInput"),
  noteColor: $("#noteColorInput"),
  notePinned: $("#notePinnedInput"),
  cancelNoteEdit: $("#cancelNoteEditBtn"),
  reminderForm: $("#reminderForm"),
  editingId: $("#editingId"),
  title: $("#titleInput"),
  notes: $("#notesInput"),
  due: $("#dueInput"),
  repeat: $("#repeatInput"),
  priority: $("#priorityInput"),
  cancelReminderEdit: $("#cancelReminderEditBtn"),
  focusMode: $("#focusMode"),
  paused: $("#paused"),
  autostart: $("#autostart"),
  toast: $("#toast"),
};

boot();

async function boot() {
  if (!invoke) {
    showToast("当前不在 Tauri 环境中，无法调用本地服务。");
    return;
  }
  bindEvents();
  setDefaultDueTime();
  await Promise.all([loadSettings(), refreshAll()]);
  setView("dashboard");
}

function bindEvents() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  els.search.addEventListener("input", debounce(() => {
    state.query = els.search.value.trim();
    refreshAll();
  }, 160));
  els.quickNote.addEventListener("click", () => {
    setView("notes");
    resetNoteForm();
    els.noteComposer.scrollIntoView({ behavior: "smooth", block: "center" });
    els.noteTitle.focus();
  });
  els.quickReminder.addEventListener("click", () => {
    setView("reminders");
    resetReminderForm();
    els.reminderComposer.scrollIntoView({ behavior: "smooth", block: "center" });
    els.title.focus();
  });
  els.noteForm.addEventListener("submit", saveNote);
  els.reminderForm.addEventListener("submit", saveReminder);
  els.cancelNoteEdit.addEventListener("click", resetNoteForm);
  els.cancelReminderEdit.addEventListener("click", resetReminderForm);
  els.focusMode.addEventListener("change", () => toggleFocusMode(els.focusMode.checked));
  els.paused.addEventListener("change", () => togglePaused(els.paused.checked));
  els.autostart.addEventListener("change", () => toggleAutostart(els.autostart.checked));

  listen?.("quick-add", () => {
    setView("reminders");
    resetReminderForm();
    showToast("已打开快速新增提醒。");
    els.title.focus();
  });
  listen?.("focus-mode-changed", (event) => { els.focusMode.checked = Boolean(event.payload); });
  listen?.("paused-changed", (event) => { els.paused.checked = Boolean(event.payload); });
}

function setView(view) {
  state.view = view;
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const titles = { dashboard: "今日工作台", notes: "便签墙", reminders: "提醒清单" };
  els.viewTitle.textContent = titles[view];
  els.noteComposer.classList.toggle("hidden", view === "reminders");
  els.reminderComposer.classList.toggle("hidden", view === "notes");
  $('[data-panel="notes"]').classList.toggle("hidden", view === "reminders");
  $('[data-panel="reminders"]').classList.toggle("hidden", view === "notes");
  renderSummary();
}

async function refreshAll() {
  try {
    const [notes, reminders] = await Promise.all([
      invoke("list_notes", { query: state.query || null }),
      invoke("list_reminders", { query: state.query || null }),
    ]);
    state.notes = notes;
    state.reminders = reminders;
    renderAll();
  } catch (error) {
    showToast(`加载失败：${error}`);
  }
}

async function loadSettings() {
  try {
    const [focusMode, paused, autostart] = await Promise.all([
      invoke("get_focus_mode"),
      invoke("get_reminders_paused"),
      invoke("get_autostart").catch(() => false),
    ]);
    els.focusMode.checked = focusMode;
    els.paused.checked = paused;
    els.autostart.checked = autostart;
  } catch (error) {
    showToast(`读取设置失败：${error}`);
  }
}

function renderAll() {
  renderStats();
  renderSummary();
  renderNotes();
  renderReminders();
}

function renderStats() {
  els.statReminder.textContent = state.reminders.length;
  els.statHigh.textContent = state.reminders.filter((r) => r.priority === "high").length;
  els.statNotes.textContent = state.notes.length;
}

function renderSummary() {
  const q = state.query ? `，搜索“${state.query}”` : "";
  const prefix = state.view === "notes" ? "便签模式" : state.view === "reminders" ? "提醒模式" : "总览模式";
  els.summary.textContent = `${prefix}${q}：${state.notes.length} 张便签，${state.reminders.length} 条提醒。`;
}

function renderNotes() {
  if (!state.notes.length) {
    els.noteList.innerHTML = `<div class="empty">没有便签。写一张灵感卡片吧，笨蛋。</div>`;
    return;
  }
  els.noteList.replaceChildren(...state.notes.map(renderNoteCard));
}

function renderNoteCard(note) {
  const card = document.createElement("article");
  card.className = `note-card ${note.color || "blue"}`;
  const title = document.createElement("h4");
  title.className = "note-title";
  title.append(document.createTextNode(note.title));
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = note.pinned ? "置顶" : colorLabel(note.color);
  title.append(badge);

  const content = document.createElement("p");
  content.className = "note-content";
  content.textContent = note.content || "（空便签）";

  const actions = document.createElement("div");
  actions.className = "note-actions";
  actions.append(
    actionButton("编辑", "ghost", () => editNote(note)),
    actionButton(note.pinned ? "取消置顶" : "置顶", "ghost", () => toggleNotePin(note)),
    actionButton("归档", "danger", () => archiveNote(note.id)),
  );
  card.append(title, content, actions);
  return card;
}

function renderReminders() {
  if (!state.reminders.length) {
    els.reminderList.innerHTML = `<div class="empty">暂无提醒。新增一条，本小姐替你盯时间。</div>`;
    return;
  }
  els.reminderList.replaceChildren(...state.reminders.map(renderReminderCard));
}

function renderReminderCard(reminder) {
  const card = document.createElement("article");
  card.className = "reminder-card";

  const time = document.createElement("div");
  time.className = "time-pill";
  const due = new Date(reminder.next_due_at || reminder.due_at);
  time.innerHTML = `<div>${pad(due.getHours())}:${pad(due.getMinutes())}</div><small>${due.getMonth() + 1}/${due.getDate()}</small>`;

  const main = document.createElement("div");
  main.className = "reminder-main";
  const title = document.createElement("h4");
  title.textContent = reminder.title;
  const body = document.createElement("p");
  body.textContent = reminder.notes || "到点提醒，无额外备注。";
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.append(tag(reminder.priority === "high" ? "高优先级" : "普通"), tag(repeatLabel(reminder.repeat_rule)));
  main.append(title, body, meta);

  const actions = document.createElement("div");
  actions.className = "reminder-actions";
  actions.append(
    actionButton("编辑", "ghost", () => editReminder(reminder)),
    actionButton("完成", "ghost", () => completeReminder(reminder.id)),
    actionButton("归档", "danger", () => archiveReminder(reminder.id)),
  );

  card.append(time, main, actions);
  return card;
}

async function saveNote(event) {
  event.preventDefault();
  const input = {
    title: els.noteTitle.value.trim(),
    content: els.noteContent.value.trim(),
    color: els.noteColor.value,
    pinned: els.notePinned.checked,
  };
  if (!input.title && !input.content) {
    showToast("便签标题和内容不能都为空。 ");
    return;
  }
  try {
    const id = Number(els.noteEditingId.value);
    if (id) {
      await invoke("update_note", { id, input });
      showToast("便签已更新。 ");
    } else {
      await invoke("create_note", { input });
      showToast("便签已保存。 ");
    }
    resetNoteForm();
    await refreshAll();
  } catch (error) {
    showToast(`保存便签失败：${error}`);
  }
}

function editNote(note) {
  setView("notes");
  els.noteEditingId.value = note.id;
  els.noteTitle.value = note.title;
  els.noteContent.value = note.content;
  els.noteColor.value = note.color || "blue";
  els.notePinned.checked = note.pinned;
  els.cancelNoteEdit.classList.remove("hidden");
  els.noteComposer.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetNoteForm() {
  els.noteForm.reset();
  els.noteEditingId.value = "";
  els.noteColor.value = "blue";
  els.cancelNoteEdit.classList.add("hidden");
}

async function toggleNotePin(note) {
  try {
    await invoke("toggle_note_pin", { id: note.id, pinned: !note.pinned });
    await refreshAll();
  } catch (error) {
    showToast(`置顶失败：${error}`);
  }
}

async function archiveNote(id) {
  try {
    await invoke("archive_note", { id });
    showToast("便签已归档。 ");
    await refreshAll();
  } catch (error) {
    showToast(`归档便签失败：${error}`);
  }
}

async function saveReminder(event) {
  event.preventDefault();
  const input = reminderFormToInput();
  if (!input) return;
  try {
    const id = Number(els.editingId.value);
    if (id) {
      await invoke("update_reminder", { id, input });
      showToast("提醒已更新。 ");
    } else {
      await invoke("create_reminder", { input });
      showToast("提醒已保存。 ");
    }
    resetReminderForm();
    await refreshAll();
  } catch (error) {
    showToast(`保存提醒失败：${error}`);
  }
}

function reminderFormToInput() {
  const title = els.title.value.trim();
  if (!title) {
    showToast("提醒标题不能为空。 ");
    els.title.focus();
    return null;
  }
  if (!els.due.value) {
    showToast("请选择提醒时间。 ");
    els.due.focus();
    return null;
  }
  return {
    title,
    notes: els.notes.value.trim(),
    due_at: new Date(els.due.value).toISOString(),
    repeat_rule: repeatRuleFromValue(els.repeat.value),
    priority: els.priority.value,
  };
}

function editReminder(reminder) {
  setView("reminders");
  els.editingId.value = reminder.id;
  els.title.value = reminder.title;
  els.notes.value = reminder.notes || "";
  els.due.value = toDateTimeLocal(reminder.due_at);
  els.repeat.value = repeatValueFromRule(reminder.repeat_rule);
  els.priority.value = reminder.priority;
  els.cancelReminderEdit.classList.remove("hidden");
  els.reminderComposer.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetReminderForm() {
  els.reminderForm.reset();
  els.editingId.value = "";
  els.cancelReminderEdit.classList.add("hidden");
  setDefaultDueTime();
}

async function completeReminder(id) {
  try {
    await invoke("complete_reminder", { id });
    showToast("提醒已完成。 ");
    await refreshAll();
  } catch (error) {
    showToast(`完成失败：${error}`);
  }
}

async function archiveReminder(id) {
  try {
    await invoke("archive_reminder", { id });
    showToast("提醒已归档。 ");
    await refreshAll();
  } catch (error) {
    showToast(`归档失败：${error}`);
  }
}

async function toggleFocusMode(enabled) {
  try {
    await invoke("set_focus_mode", { enabled });
    showToast(enabled ? "游戏/免打扰已开启。" : "游戏/免打扰已关闭。");
  } catch (error) {
    els.focusMode.checked = !enabled;
    showToast(`设置失败：${error}`);
  }
}
async function togglePaused(paused) {
  try {
    await invoke("set_reminders_paused", { paused });
    showToast(paused ? "提醒已暂停。" : "提醒已恢复。");
  } catch (error) {
    els.paused.checked = !paused;
    showToast(`设置失败：${error}`);
  }
}
async function toggleAutostart(enabled) {
  try {
    await invoke("set_autostart", { enabled });
    showToast(enabled ? "开机自启已开启。" : "开机自启已关闭。");
  } catch (error) {
    els.autostart.checked = !enabled;
    showToast(`开机自启失败：${error}`);
  }
}

function actionButton(text, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.className = className;
  button.addEventListener("click", onClick);
  return button;
}
function tag(text) {
  const span = document.createElement("span");
  span.className = "badge";
  span.textContent = text;
  return span;
}
function repeatRuleFromValue(value) {
  if (["daily", "weekly", "monthly"].includes(value)) return { kind: value };
  if (value.startsWith("interval_")) return { kind: "interval_minutes", value: Number(value.replace("interval_", "")) };
  return { kind: "none" };
}
function repeatValueFromRule(rule) {
  if (!rule || rule.kind === "none") return "none";
  if (["daily", "weekly", "monthly"].includes(rule.kind)) return rule.kind;
  if (rule.kind === "interval_minutes") return `interval_${rule.value}`;
  return "none";
}
function repeatLabel(rule) {
  if (!rule || rule.kind === "none") return "不重复";
  if (rule.kind === "daily") return "每天";
  if (rule.kind === "weekly") return "每周";
  if (rule.kind === "monthly") return "每月";
  if (rule.kind === "interval_minutes") return `每 ${rule.value} 分钟`;
  return "不重复";
}
function colorLabel(color) {
  return ({ blue: "海盐蓝", amber: "奶油黄", mint: "薄荷绿", rose: "桃粉", violet: "紫藤", slate: "石墨" })[color] || "海盐蓝";
}
function setDefaultDueTime() {
  els.due.value = toDateTimeLocal(new Date(Date.now() + 10 * 60 * 1000).toISOString());
}
function toDateTimeLocal(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function pad(value) { return String(value).padStart(2, "0"); }
function debounce(fn, delay) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
let toastTimer = 0;
function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 2600);
}
