# 轻备忘

轻量后台提醒和便签墙软件。当前版本以 Windows 桌面体验为主，同时通过 GitHub Actions 自动打包 macOS 版本：托盘常驻、系统通知、低资源调度、SQLite 本地存储、免打扰/游戏模式、开机自启、便签墙和提醒清单。

## 技术栈

- Tauri 2 + Rust：后台调度、托盘、通知、开机自启。
- React 18 + Vite：负责前端交互、便签墙和提醒工作台。
- SQLite / rusqlite：本地存储提醒和便签数据。

## 当前功能

- 便签墙：新增、编辑、置顶、归档、颜色分类、搜索。
- 提醒清单：新增、编辑、完成、归档、搜索。
- 重复提醒：一次性、每天、每周、每月、每 30/60 分钟。
- 今日工作台：提醒数、高优先级数、便签数统计。
- 后台 Rust 调度器：按最近提醒等待，不做忙轮询。
- 关闭窗口隐藏到托盘，托盘可打开、快速新增、暂停/恢复、退出。
- 免打扰/游戏模式：仅高优先级提醒弹出，普通提醒保留到模式关闭后处理。
- 开机自启开关。
- Release 主程序使用 Windows GUI 子系统，不再弹出 cmd 控制台窗口。
- UI 参考苹果式留白、圆角、磨砂玻璃和柔和阴影，但保留彩色 Bento 卡片和便签色彩。

## 开发运行

```powershell
npm install
npm run dev
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
src-tauri/target/release/bundle/nsis/轻备忘_0.1.0_x64-setup.exe
```

## macOS 自动打包

推送到 `main` 分支后，GitHub Actions 会在 macOS runner 上分别构建 Apple Silicon 和 Intel 版本：

- `qingmemo-macos-apple-silicon`
- `qingmemo-macos-intel`

在 GitHub 仓库页面进入 `Actions`，打开 `Build macOS app` 工作流运行记录，即可在 `Artifacts` 区域下载 `.app` / `.dmg` 打包产物。

## 测试与检查

```powershell
cd src-tauri
cargo test
cargo check
```

## 数据位置

提醒和便签数据保存在系统应用数据目录下的 `qingmemo.sqlite3`，路径由 Tauri `app_data_dir` 自动解析。
