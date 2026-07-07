# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-07-05
- Primary product surfaces: Windows 11 桌面端 Aurora Desk「今日工作台」、便签墙、提醒流、右侧抽屉编辑器。
- Evidence reviewed:
  - `src/App.tsx`：当前 React 工作台入口，存在常驻快速新增与编辑面板。
  - `src/features/sticky-wall/StickyWall.tsx`：便签墙、拖拽、空状态与布局持久化入口。
  - `src/app-model.ts`：Tauri note 数据映射边界。
  - `src-tauri/src/app.rs`、`src-tauri/src/store.rs`：便签/提醒 Tauri commands 与 SQLite 存储边界。
  - `docs/superpowers/plans/2026-07-05-sticky-wall-react-migration.md`：React sticky wall 迁移计划。

## Brand
- Personality: 轻盈、温暖、聪明、有一点傲娇可爱；不是企业后台。
- Trust signals: 本地存储、Windows 原生常驻、提醒可靠、操作反馈清晰。
- Avoid: 拥挤表单、双编辑器常驻、廉价高饱和渐变、传统管理后台布局。

## Product goals
- Goals:
  - 打开即呈现「今日工作台」的高级感与呼吸感。
  - 便签墙成为视觉主角，提醒清单作为强辅助。
  - 新增/编辑通过按需抽屉完成，减少页面常驻噪音。
- Non-goals:
  - 本轮不新增复杂富文本、日历视图或完整提醒规则设计器。
  - 不引入额外 UI 组件库，优先使用现有 React + Tailwind + Framer Motion。
- Success signals:
  - 页面首屏有明确层级：导航 → 统计 → 便签墙/提醒。
  - 用户无需滚动即可看到更大的便签墙和提醒清单。
  - 抽屉打开/关闭自然、支持 ESC、保存后有反馈。

## Personas and jobs
- Primary personas: Windows 桌面用户、需要轻量记录和准时提醒的个人使用者。
- User jobs:
  - 快速记录灵感便签。
  - 快速创建待办提醒。
  - 今天打开后立刻知道重点、提醒和便签状态。
- Key contexts of use: 桌面常驻、工作间隙快速输入、关闭窗口后后台继续提醒。

## Information architecture
- Primary navigation: 顶部单栏导航，无左侧常驻大导航。
- Core routes/screens: 单页今日工作台。
- Content hierarchy:
  1. CommandIsland：Logo、搜索、主操作。
  2. HeroPanel + MetricDock：品牌化今日说明、下一条提醒、便签/提醒/高优先级指标。
  3. MainGrid：左侧大画布便签墙，右侧 FocusRail（快捷启动 + 提醒流）。
  4. EditorDrawer：右侧按需编辑。

## Design principles
- Principle 1: 展示优先，编辑按需出现。
- Principle 2: 便签墙是主角，提醒清单是可靠助手。
- Tradeoffs: 为高级感保留留白，不在首屏塞满所有字段；复杂提醒规则保持轻量默认。

## Visual language
- Color: 界面基底克制（白 + zinc 中性色 + hairline 边框），主色蓝仅用于焦点/选中/保存主按钮；便签色板为奶油/晴空/薄荷/蜜桃/薰衣草/石墨六色柔和渐变。
- Typography: Microsoft YaHei UI / Segoe UI；标题 bold、正文 medium/semibold，避免整页 black 字重。
- Spacing/layout rhythm: 24px 页面边距，卡片 16-28px 内边距，模块间 24px；表单字段间距 24px。
- Shape/radius/elevation: 面板 24-28px 圆角、控件 14-16px；阴影为「hairline + 低透明大扩散」双层，不用厚重投影。
- Motion: 使用 Framer Motion variants/stagger 做页面分区逐层进入；`AnimatePresence` 做抽屉/遮罩/Toast；Metric 卡、快捷操作、提醒卡有 hover 浮动；背景 aurora blob 做慢速呼吸漂移。
- Imagery/iconography: 使用轻量符号图标（◷ ⚑ ✦），避免依赖新图标库；便签墙背景为 26px 点阵纹理。

## Components
- Existing components to reuse:
  - `StickyWall`：继续负责便签视觉、拖拽和布局持久化。
  - `ColorPicker` 思路：保留颜色选择但放进抽屉。
- New/changed components:
  - `CommandIsland`
  - `HeroPanel`
  - `MetricDock`
  - `CanvasStage`
  - `FocusRail`
  - `ReminderList`
  - `EditorDrawer`
  - `NoteForm`
  - `ReminderForm`
- Variants and states: loading、empty、error、active filter、saving、drawer open/closed。
- Token/component ownership: 当前由 `src/App.tsx` 局部组件承载，若继续增长再拆文件。

## Accessibility
- Target standard: 桌面应用基础可访问性。
- Keyboard/focus behavior: 抽屉支持 ESC 关闭；按钮保留 focus ring；表单字段有可见标签。
- Contrast/readability: 文本优先使用 zinc-900/zinc-600，渐变卡片避免低对比文字。
- Screen-reader semantics: 抽屉使用 `role="dialog"` 与 `aria-modal`。
- Reduced motion and sensory considerations: 动画短、自然，不使用强闪烁。

## Responsive behavior
- Supported breakpoints/devices: Windows 桌面优先，窄宽度下主内容允许纵向堆叠。
- Layout adaptations: 大屏左右 68/32；中等宽度（<=1100px）转单列。
- Touch/hover differences: 以鼠标 hover/focus 为主，按钮面积保持舒适。

## Interaction states
- Loading: 右侧提醒/便签区域显示温和文案。
- Empty: 保留可爱傲娇语气，并配柔和图标/容器。
- Error: 轻量玫瑰色提示条，不阻断主体布局。
- Success: 保存后短暂「已保存」/「安排好了」反馈。
- Disabled: 主按钮降低透明度。
- Offline/slow network: 本地 Tauri 调用失败时展示错误文本。

## Content voice
- Tone: 温暖、轻松、带少量「本小姐/笨蛋」可爱语气。
- Terminology: 便签、提醒、今日工作台、灵感卡片。
- Microcopy rules: 空状态可爱但不冗长；操作按钮明确动词。

## Implementation constraints
- Framework/styling system: React 18 + TypeScript + Tailwind CSS + Framer Motion + Tauri v2。
- Design-token constraints: 不新增 UI 库；使用 Tailwind 原子类与现有 CSS 背景。
- Performance constraints: 窗口隐藏时不引入前端轮询；刷新由用户操作和初次加载触发。
- Compatibility constraints: Windows WebView2 / Tauri production build。
- Test/screenshot expectations: 至少通过 Vitest 模型测试、TypeScript、Vite build、Rust tests/check、Tauri build。

## Open questions
- [ ] 后续是否需要完整提醒规则编辑器 / owner: product / impact: reminder drawer complexity
