# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-07-07
- Primary product surfaces: 轻备忘桌面端「AI 灵感作战桌」、便签活地图、提醒/时间流、复盘战报、编辑抽屉、AI 指挥官弹窗。
- Evidence reviewed:
  - `src/App.tsx`: 当前单页工作台、HeroPanel、MetricDock、CanvasStage、FocusRail、AI 弹窗、编辑抽屉。
  - `src/app-model.ts`: 今日队列、风险雷达、复盘、清理建议、统计模型。
  - `src/features/sticky-wall/StickyWall.tsx`: 便签墙、探索模式、关系网入口、卡片动作。
  - `src/features/daily-loop/DailyBrief.tsx`: 启动简报雏形。
  - `src-tauri/src/ai.rs`: DeepSeek/本地 AI 兜底支持的 assist modes。
  - `src-tauri/src/app.rs` and `src-tauri/src/store.rs`: 本地便签/提醒/事件/备份边界。

## Brand
- Personality: 聪明、会催、带一点傲娇但可靠；像一个桌面上的 AI 作战秘书，不是普通便签本。
- Trust signals: 本地优先、提醒可靠、可撤销、操作后有明确反馈、AI 结果可执行而不是强制自动修改。
- Avoid: 大而全知识库、普通任务清单、过多无关联按钮、廉价科技感、纯装饰动画、只生成文字的 AI 弹窗。

## Product goals
- Goals:
  - 把零散便签、提醒、AI 建议串成「捕获 -> 识别 -> 推进 -> 提醒 -> 复盘 -> 清理」闭环。
  - 用户每天打开后 5 秒内知道今天该先处理什么。
  - 数据汇总从数量统计升级为动机反馈：推进率、拖延债、转化率、清爽度。
  - AI 功能表现为可执行的指挥官，而不是一组孤立生成按钮。
- Non-goals:
  - 不做 Notion 式数据库、Obsidian 式 Markdown 知识库、TickTick 式完整日历套件。
  - 不引入新 UI 组件库或重写后端数据模型。
- Success signals:
  - 首屏能看到今日作战目标、风险、下一步和数据能量。
  - AI 输出至少提供一个可执行动作入口。
  - 便签墙不同模式能改变用户判断，而不只是筛选。
  - 复盘面板能让用户看到继续使用的正反馈。

## Personas and jobs
- Primary personas: 桌面高频工作者、自由职业者、小团队负责人、容易把灵感/待办混在一起的人。
- User jobs:
  - 快速丢下一条想法，不被表单打断。
  - 让 AI 帮忙判断这条东西是灵感、行动项、等反馈还是提醒。
  - 每天打开后按 3 件事推进，不被满墙便签压垮。
  - 晚上看到完成、拖延、清理建议和明日优先级。
- Key contexts of use: Windows/macOS 桌面常驻、碎片化输入、工作间隙快速整理、提醒到点处理。

## Information architecture
- Primary navigation: 顶部 CommandIsland 负责输入和动效；首屏主轴为 CommandDeck + CanvasStage + MissionRail。
- Core screens:
  - 今日作战台: 作战标题、AI 指挥官、能量指标、下一条提醒。
  - 便签活地图: 全景、今日挑战、等反馈、缺下一步、关系网、风险视图。
  - 时间流: 提醒列表、过期/今日/重复、提醒历史。
  - 复盘战报: 今日完成、拖延债、灵感转行动率、清爽度、清理建议。
- Content hierarchy:
  1. 今日主线和 AI CTA。
  2. 三个核心能量指标。
  3. 左侧大画布承载便签/提醒/重点。
  4. 右侧按「今日 / 时间 / 复盘」组织所有动作。

## Design principles
- Principle 1: 每个 AI 结果都必须能落地到便签、提醒、归档或选择。
- Principle 2: 数据只展示会改变行为的指标。
- Principle 3: 炫酷来自信息结构、动效节奏和反馈，而不是堆颜色。
- Principle 4: 默认给用户下一步，不让用户自己在功能堆里找入口。
- Tradeoffs: 保留现有单页架构以快速落地；暂不拆完整路由，但新增模型和 UI 边界要可测试。

## Visual language
- Color: 白/玻璃基底 + zinc 文字；主色使用 sky/emerald/violet/amber/rose 分别表达推进、完成、AI、时间、风险。避免整页单一紫蓝或高饱和赛博风。
- Typography: 紧凑但有层级；主标题 24-30px，卡片标题 13-18px，仪表盘数字使用 tabular nums。
- Spacing/layout rhythm: 大屏 2 列主布局；右侧栏模块密度更高，避免卡片套卡片。
- Shape/radius/elevation: 面板 24-30px；重复小项 16-22px；按钮以 pill 或 icon button 为主。
- Motion: wild 模式允许仪表盘脉冲、扫描线、连接线呼吸；calm 模式保留可读性并关闭循环强动效。
- Imagery/iconography: 继续使用轻量符号，不新增图标依赖；连接线、扫描光、环形进度用 CSS/SVG 原生实现。

## Components
- Existing components to reuse:
  - `CommandIsland`, `CanvasStage`, `StickyWall`, `ReminderList`, `EditorDrawer`, `AiInsightDialog`。
- New/changed components:
  - `MissionControlPanel`: 替代旧 HeroPanel 的今日作战台。
  - `EnergyDock`: 替代 MetricDock，展示作战能量、拖延债、灵感转行动率。
  - `AiCommanderPanel`: 右侧 AI 指挥入口，围绕今日、风险、整理、复盘组织。
  - `ReviewDashboard`: 数据汇总战报页面。
  - `MissionMetric`: 可复用仪表盘小组件。
- Variants and states: empty/loading/error/success/busy/selected/critical/completed/reduced-motion。
- Token/component ownership: 先落在 `src/App.tsx`，模型函数放 `src/app-model.ts`，后续文件过大再拆。

## Accessibility
- Target standard: 桌面应用基础可访问性，按钮有 `type`, `aria-label` 或清晰文本。
- Keyboard/focus behavior: 命令面板、抽屉、弹窗继续支持 ESC；主要动作按钮可 Tab 到达。
- Contrast/readability: 数字和状态文字避免低透明度；渐变背景上使用深色或白色高对比文本。
- Screen-reader semantics: 弹窗保留 `role="dialog"`；数据模块使用可读 label。
- Reduced motion: `calm` 模式不做持续旋转/扫描，仅保留轻微 hover。

## Responsive behavior
- Supported breakpoints/devices: 桌面优先；<=1180px 单列，右侧栏下沉。
- Layout adaptations: EnergyDock 在窄屏三列压缩；MissionRail 保持最小可读高度。
- Touch/hover differences: 关键动作不依赖 hover 才能发现；hover 只增强反馈。

## Interaction states
- Loading: 今日队列和提醒流显示轻量空态。
- Empty: 空工作区给出创建便签/提醒入口。
- Error: 保留 Toast，并在 AI fallback 中显示本地建议。
- Success: 成功反馈应说明动作结果，例如「AI 建议已变成提醒」。
- Disabled: AI busy 时按钮显示分析中，但不阻断其他本地动作。
- Offline/slow network: DeepSeek 失败时必须有本地 AI 文案和可执行动作。

## Content voice
- Tone: 中文简短、有推动力；本小姐语气用于反馈和空态，核心操作文案保持清晰。
- Terminology: AI 指挥官、今日作战、灵感墙、风险雷达、复盘战报、拖延债、灵感转行动。
- Microcopy rules: 避免解释功能如何使用；直接告诉用户现在该做什么。

## Implementation constraints
- Framework/styling system: React 18 + TypeScript + Tailwind CSS + Framer Motion + Tauri v2。
- Design-token constraints: 不新增 UI 库；不新增后端数据库表。
- Performance constraints: 模型计算使用 `useMemo`; SVG 连接线只针对可见便签。
- Compatibility constraints: Windows WebView2 和 macOS Tauri 打包。
- Test/screenshot expectations: 模型 Vitest、StickyWall/insight action tests、TypeScript、Vite build 必须通过。

## Open questions
- [ ] 后续是否需要真正的周/月日历视图 / owner: product / impact: 可能需要新数据聚合和布局。
- [ ] 是否需要用户自定义 AI 人设强度 / owner: product / impact: AI 提示词和设置页复杂度。