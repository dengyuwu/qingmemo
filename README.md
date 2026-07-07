# 轻备忘 Q Memo

轻备忘是一个本地优先的 Tauri 桌面应用，当前产品形态是「AI 灵感作战桌」：快速捕获灵感和提醒，自动整理成便签墙、今日队列和作战战报，用轻度游戏化反馈帮助用户每天持续推进工作。

## 下载安装

进入 GitHub 右侧 **Releases** 区域，打开最新版本后下载对应系统安装包：

- Windows：下载 `*.exe`，例如 `qingmemo-0.1.3-windows-x86_64-nsis.exe` 或 `轻备忘_0.1.3_x64-setup.exe`。
- macOS Apple Silicon：下载 `aarch64` / `apple-silicon` 的 `.dmg`。
- macOS Intel：下载 `x86_64` / `intel` 的 `.dmg`。

如果 Releases 暂时没有新版本，进入仓库的 **Actions** 页面，打开 `Build desktop installers` 工作流，也可以在 Artifacts 中下载最近一次构建产物。

## 核心功能

- CommandIsland：顶部快速输入，支持便签/提醒模式切换和快捷捕获。
- AI Command Desk：今日主线、队列进度、风险雷达、Focus Score、作战能量、拖延债等指标。
- Canvas 便签墙：拖拽布局、自动整理、分类筛选、关系网模式、缩放和平移视角。
- FocusRail：今日队列、今日战报、成就奖励、数据成长与提醒流。
- AI 能力：DeepSeek API Key 调用，失败时使用本地规则兜底；支持作战计划、扫风险、AI 下一步、叙事化复盘。
- 游戏化系统：等级、XP、连续作战天数、每日任务、成就、主题和便签皮肤。
- 本地提醒：系统通知、重复提醒、托盘常驻、暂停/恢复、开机自启。
- 本地存储：便签、提醒和进度数据优先保存在本机，不依赖云端账号。

## 技术栈

- Tauri 2 + Rust：桌面壳、托盘、通知、开机自启、本地存储与系统集成。
- React 18 + TypeScript + Vite：前端应用、便签墙、作战档案和交互状态。
- Tailwind CSS + Framer Motion：玻璃拟态视觉、动效和反馈。
- SQLite / rusqlite：便签和提醒数据。
- `@tauri-apps/plugin-store`：游戏化进度数据。

## 开发运行

```powershell
npm install
npm run dev
```

## 本地检查

```powershell
npm run test -- --run
npm run typecheck
```

Rust 侧检查：

```powershell
cd src-tauri
cargo test
cargo check
```

## 本地构建

```powershell
npm run build
```

Windows 可执行文件：

```text
src-tauri/target/release/qingmemo-win.exe
```

NSIS 安装包：

```text
src-tauri/target/release/bundle/nsis/轻备忘_0.1.3_x64-setup.exe
```

## 自动发布

`.github/workflows/build-release.yml` 会执行以下流程：

- push 到 `main`：构建 Windows x64、macOS Apple Silicon、macOS Intel，并上传到 Actions Artifacts。
- push `v*` tag：创建 GitHub Release，并把 Windows `.exe` 与 macOS `.dmg` 上传为可直接下载的 Release Assets。
- pull request：运行同一套测试和构建检查，避免合入不可打包代码。

发布新版本示例：

```powershell
git tag v0.1.3
git push origin v0.1.3
```

## 数据位置

提醒和便签数据保存在系统应用数据目录下的 `qingmemo.sqlite3`，路径由 Tauri `app_data_dir` 自动解析。游戏化进度保存在 Tauri Store 的 `progress.json`。
