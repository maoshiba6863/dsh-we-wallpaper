# 壁纸引擎 · DSH 插件

把本机 Wallpaper Engine 的壁纸放到 DeepSeek Harness 界面背后。聊天窗口浮在动态壁纸上面，整个界面按你的喜好调成液态玻璃效果。

- 维护者：[@maoshiba6863](https://github.com/maoshiba6863)
- 许可：MIT
- 支持系统：Windows / macOS / Linux
- 宿主要求：DSH ≥ 0.1.5-rc.1，Node ≥ 18

> 本仓库是在两个开源项目基础上合并改写的版本：
> 原始 DSH 壁纸插件（[@elysia395](https://github.com/elysia395)）＋ WebWallGL 渲染引擎（[@oneincase](https://github.com/oneincase)）。
> 版权与第三方说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
> 本插件与 Wallpaper Engine 官方、Steam、DeepSeek 官方都没有隶属关系。

---

## 收录信息

| 项 | 值 |
|---|---|
| 许可证 | MIT（保留原作者版权声明，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)） |
| 支持的 profile | `desktop`（桌面端）、`web`（浏览器） |
| 环境要求 | DSH ≥ 0.1.5-rc.1，Node ≥ 18 |
| 平台 | Windows / macOS / Linux（部分能力按平台降级，见「平台差异」） |
| 外部服务 | AnySearch（AI 热点，可选）、Hacker News（兜底）。只有出站请求，不上传任何用户数据 |
| 本机权限 | 只读扫描 Wallpaper Engine / Steam 壁纸库；macOS 首次覆盖桌面需要一次性「辅助功能 / 自动化」授权 |
| 数据存放 | `~/.dsh-wallpaper-engine`（设置、缓存、上传、账单），不同步到任何服务器 |
| 安装 | `dsh plugin add <Release 里的 tgz 地址>`，见下方「安装」 |

---

## 它到底能干什么

一句话：**让 DSH 的聊天界面变成"玻璃面板 + 会动的壁纸"**，同时尽量不耗电、不卡、不打扰。

下面按你实际会用的顺序列，全部是已经做好的功能，不是规划。

### 1. 壁纸

- 自动找到本机的 Wallpaper Engine 安装位置和创意工坊壁纸（Windows 读注册表、常见安装目录和 Steam 库配置；Windows 版 Steam 装在别的盘、或在 WSL / macOS 上用，都可以用环境变量 `DSH_WE_STEAM_ROOT` 指定壁纸库根目录）
- 支持四类壁纸：
  - **场景壁纸**：用 WebGL 实时渲染，粒子、骨骼动画、脚本、鼠标交互都能动
  - **视频壁纸**：直接播放 MP4 / WebM 等视频
  - **网页壁纸**：在隔离的沙箱里运行网页壁纸，并提供 Wallpaper Engine 的属性接口
  - **图片壁纸**：自己上传的 JPG / PNG
- 读取 Wallpaper Engine 自带的播放列表，可以按列表轮换，也可以只挑一张
- 背景轮播：设置 → 壁纸库 →「当前壁纸」下方的「背景轮播」按钮，勾选参与轮播的视频（含 WE 视频壁纸），按 1 / 5 / 10 / 30 分钟或 1 小时自动切换；过场（动画 / 方向 / 时长）就在轮播设置里，选择后同时用于手动切换，动画真的作用在视频画面上
- 支持上传自己的图片和视频，上传目录可以改
- 按类型筛选、按内容分级筛选、搜索标题、隐藏不想要的壁纸
- 切换壁纸有 7 种过场：直接切、淡入淡出、推移、擦除、光圈、缩放、百叶，方向和速度都能调
- 定时自动轮换，支持分组；快捷面板里有「下一张」

### 2. 画面效果

- 壁纸模糊、透明度、亮度、对比度、暗化（让字更清楚）
- 四种适配方式：覆盖、填充、居中、拉伸
- 播放倍速
- 水平翻转、垂直翻转
- 场景壁纸和网页壁纸可以开关实时渲染，实时帧率可选 15 / 30 / 60
- 整体帧率上限可选 30 / 60 / 不限制（越低越省电）
- 实时渲染失败会自动降级：先试壁纸自带的视频，再退到静态画面，不会留下一块黑屏
- 抽帧转码：把高帧率视频转成低帧率再播，降低解码压力，转码进度可见
- 自定义画面：可以随时抓一张实时画面，或导入截图/图片替换某张壁纸的画面（用来修掉壁纸里不想要的部分）
- 启动时最长等待时间可调
- 一键清空 GPU 帧缓存

### 3. 省电与桌面配合

- 最小化或切到别的页签时暂停
- 窗口失去焦点时暂停（浏览器形态下有效）
- 使用电池时暂停
- Linux（X11）下额外支持"窗口被别的窗口盖住就暂停"
- 桌面壳启动时铺满屏幕（macOS 需要一次性授权辅助功能与自动化）
- 启动时播放欢迎视频，视频路径可换
- 缓存目录可以改（转码文件、抽帧、缩略图都放这里）
- Edge 兼容模式：视频壁纸改用 canvas 渲染，避免浏览器自带的下载/投屏悬浮条

### 4. 界面外观

- 液态玻璃：整体透明度、模糊、颜色，深色模式可以单独设一套
- 分区域调玻璃：设置窗口、对话框、思考条、浮层、左侧栏、标题栏，每一块都能单独开关和调参
- 侧边栏圆角：统一设置，或四个角分别设成圆角/直角
- 玻璃预设可以导入、导出、删除，内置多套现成配色
- 主题随壁纸：从壁纸里取色，自动决定界面用浅色还是深色，也可以只改主题不改字体
- UI 配色自定义：强调色、发送键、链接、文件图标、页签、深度求索状态、光标颜色，可以一处改全部，也可以逐项改
- 字体：内置字体集预设、读取本机字体、全局默认字族、按角色调字号和字重、按组件覆盖、终端单独设字体；只列出改过的项方便核对
- 会话布局：居中 或 铺开
- 头像（在「扩展」页签）：给自己和助手分别换头像，可调大小和圆角

### 5. 声音与媒体

- 壁纸音轨开关与音量（视频壁纸、带音频的场景壁纸共用）
- 显示系统正在播放的歌曲信息与歌词（由本机媒体桥读取系统播放器提供）
- 声音频谱驱动壁纸的音频可视化，跟随真实音乐而不是随机波动
- macOS 上通过系统音频采集拿到真实频谱，首次使用需要「音频录制」授权；没授权会自动退回模拟频谱

### 6. 费用显示

- 侧边栏底部显示当前会话的用量费用
- 每轮对话末尾显示本轮花费
- 单价区分缓存命中 / 未命中 / 输出，支持高峰与低谷倍率，并显示余额
- 不需要的话可以在「系统 → 费用统计」里关掉

### 7. 其他

- 设置保存在宿主端，不占对话上下文，不消耗 token
- 提供诊断日志和缓存清理入口
- 「扩展」页签目前放头像模块，后续功能也收在这里

---

## 安装

### 前提

1. 已经装好 DSH（桌面端或命令行均可）
2. 想用本机壁纸的话，先装好 Wallpaper Engine 并订阅壁纸（只在 Windows 上能装；其它系统可以自己上传图片/视频，或把壁纸文件放到本机后用 `DSH_WE_STEAM_ROOT` 指向壁纸库）

### 方式一：从 Releases 安装（推荐）

每个版本都会打包成 `.tgz` 放到 [Releases](https://github.com/maoshiba6863/dsh-we-wallpaper/releases)，里面已经包含构建好的 `lib/client.js`，不需要你自己编译。当前最新版本：**v1.1.8**。

```bash
dsh plugin add https://github.com/maoshiba6863/dsh-we-wallpaper/releases/download/v1.1.8/dsh-we-wallpaper-1.1.8.tgz
```

桌面端也可以在插件管理里选「添加插件」，粘贴上面这个地址。

> npm 暂不提供：这个包没有发布到 npm registry，请用 Releases 的 tgz。

### 方式二：用本仓库源码

直接克隆仓库的人要先构建一次（`lib/client.js` 是构建产物，不在仓库里）：

```bash
git clone https://github.com/maoshiba6863/dsh-we-wallpaper.git
cd dsh-we-wallpaper
npm install
npm run build

# 然后把整个目录装进 DSH
dsh plugin add /path/to/dsh-we-wallpaper
```

### 升级 / 卸载

```bash
# 升级：先移除旧版，再装新 tgz
dsh plugin remove dsh-we-wallpaper
dsh plugin add <新版 tgz 地址>

# 卸载
dsh plugin remove dsh-we-wallpaper
```

> 命令行的具体用法以你所用 DSH 版本的 `dsh plugin --help` 为准；桌面端插件管理是同一套能力。

### 开发时用软链安装

把仓库目录链到 DSH 的插件目录，改完代码重新加载就能看到效果：

```bash
ln -s /path/to/dsh-wallpaper-engine-main \
  ~/.dsh/profiles/desktop/node_modules/dsh-we-wallpaper
```

改 `src/` 下的界面代码后要跑 `npm run build` 生成 `lib/client.js`，再重载界面。

---

## 第一次使用

1. 装好插件，重载 DSH 界面
2. 点侧边栏底部的「壁纸引擎设置」（也可以点右上角快捷面板里的「壁纸引擎设置 ›」）
3. 在「壁纸库」页点「扫描 Wallpaper Engine」，等列表出来
4. 挑一张壁纸，点「选择壁纸」；想省电或不想动可以随时暂停、清除
5. 去「外观」页调玻璃和主题，去「播放」页调清晰度和帧率

---

## 设置页说明

设置窗口一共五个页签。

### 壁纸库

- 当前壁纸：封面、标题、播放/暂停、音轨开关、清除
- 壁纸属性：壁纸作者提供的可调参数，改完立即生效（场景和网页壁纸才有）
- 切换过场：类型、方向、速度
- 自定义壁纸：上传图片或视频，指定上传目录
- 列表：类型筛选、内容分级筛选、搜索、隐藏

### 外观

- 主题：浅色 / 深色 / 跟随系统，主题随壁纸取色
- 玻璃：总开关、透明度、模糊、颜色、深色单独设置、分区玻璃、侧边栏圆角
- 玻璃预设：导入、导出、删除
- UI 配色自定义：全局配色 + 五项单独配色
- 字体：字体集、本机字体、全局字族、排版角色、组件字体、终端字体

### 播放

- 出图来源：切换壁纸的取图方式
- 画面：模糊、透明度、亮度、对比度、暗化、适配、翻转
- 播放：倍速、音轨、音量
- 实时渲染：场景 / 网页开关、实时帧率、启动最长等待时间
- 性能：帧率上限、抽帧转码、GPU 帧缓存
- 自定义画面：抓帧、导入截图

### 系统

- 浏览方式：紧凑 CD 架 / 常规网格
- 启动画面：欢迎视频、启动铺满（macOS）、视频路径
- 会话布局：居中 / 铺开
- 费用统计：显示开关
- 兼容性：Edge 兼容、适配目标（自动 / 浏览器 / 桌面社区版 / 桌面官方版）
- 省电：切页暂停、失焦暂停、电池暂停
- 缓存位置：查看、更改

### 扩展

- 头像：「我」和「助手」分别换头像，可调大小与圆角
- 后续新增的功能会以模块形式出现在这里

---

## 平台差异

| 能力 | Windows | macOS | Linux |
|---|---|---|---|
| 自动找 Wallpaper Engine 壁纸库 | 支持 | 无官方版，需 `DSH_WE_STEAM_ROOT` 指路 | WSL 下自动找 Windows 盘里的库；原生 Linux 需指路 |
| 场景壁纸实时渲染 | 支持 | 支持 | 支持 |
| 视频 / 网页 / 图片壁纸 | 支持 | 支持 | 支持 |
| 系统音频频谱 | 支持 | 支持（需「音频录制」授权） | 支持 |
| 窗口被遮挡时暂停 | 靠页面可见性 / 失焦 | 靠页面可见性 / 失焦 | X11 下支持真正的遮挡检测 |
| 启动时铺满屏幕 | 不适用 | 支持（需辅助功能授权） | 不适用 |
| Edge 兼容模式 | 支持 | 不适用 | 不适用 |

> 表格说的是"插件这边能做什么"；实际效果还取决于你的显示环境、浏览器和 DSH 壳版本。

---

## 数据与隐私

- 设置文件保存在宿主端的插件配置里，不写进对话
- 壁纸文件、上传文件、转码缓存都在本机读写，不会上传
- 插件没有自建服务器，也不做统计上报
- 歌曲信息与歌词来自本机媒体桥读取的系统播放器；封面如果播放器给的是在线地址，插件会直接向该地址取图
- 首次使用转码、音频频谱时会从公开地址下载 ffmpeg 与媒体桥（GitHub Releases / npmmirror），下载后在本机运行
- 费用数据来自宿主的用量记录
- 安全边界、报告方式与密钥规范见 [SECURITY.md](SECURITY.md)

---

## 常见问题

**场景壁纸不动 / 一片黑？**
先看壁纸卡片上的提示：实时渲染失败时插件会自动降级到视频或静态画面。可以在「播放 → 实时渲染」里关掉再打开重试；老显卡或驱动问题可以调低实时帧率。

**没有声音？**
检查「壁纸库」里的「🔊 音乐开」是否打开、音量是否为 0，以及系统是否静音。macOS 上系统音频频谱需要「音频录制」授权。

**启动铺满没生效？**
macOS 需要给「辅助功能」和「自动化」授权，设置页里有逐步指引；授权后要完全退出再打开。

**视频壁纸在 Edge 上有下载/投屏悬浮条？**
打开「系统 → 兼容性 → Edge 兼容」。

**找不到壁纸？**
确认 Wallpaper Engine 和创意工坊壁纸在本机；非默认 Steam 库可以用 `DSH_WE_STEAM_ROOT` 指定根目录，或直接上传图片/视频。

**壁纸占内存 / 费电？**
调低帧率上限和实时帧率，打开三种暂停策略，关闭不看的实时渲染。

更多排障步骤见 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。

---

## 开发

```bash
npm install          # 装依赖
npm run build        # 把 src/ 的界面源码打包成 lib/client.js
npm run verify:all   # 构建 + 全部守卫测试 + 冒烟
npm run verify       # 只跑守卫
npm run smoke        # 只跑冒烟
npm run lint         # ESLint
npm run typecheck    # TypeScript 类型检查（不产出文件）
```

目录说明：

| 位置 | 内容 |
|---|---|
| `src/` | 浏览器端界面源码（React 组件、样式、壁纸层、玻璃、字体、轮播等） |
| `lib/` | 宿主端运行时代码；`lib/client.js` 是构建产物，不入库 |
| `lib/routes/` | 宿主 HTTP 接口（设置、壁纸、上传、转码、遮挡、费用等） |
| `lib/occlusion/` | 遮挡检测（X11） |
| `lib/media/` | 媒体桥管理、音频频谱、媒体信息 |
| `lib/webwallgl/` | 场景渲染页与宿主适配层（引擎本体来自 npm 依赖 `webwallgl`） |
| `lib/glass-presets/`、`lib/fontsets/` | 内置预设数据 |
| `test/` | 守卫测试与冒烟脚本 |
| `scripts/` | 构建、打包前准备、兼容性基线等脚本 |

提交前请读 [CONTRIBUTING.md](CONTRIBUTING.md)；问题处理流程见 [docs/TRIAGE.md](docs/TRIAGE.md)。

---

## 反馈与安全

- 装不上、有 bug、想加功能：到 [Issues](https://github.com/maoshiba6863/dsh-we-wallpaper/issues) 提，带日志会快很多
- 安全问题请走私密报告，不要开公开 issue，见 [SECURITY.md](SECURITY.md)

## 致谢与许可

本插件用 MIT 许可发布，保留原作者的版权声明。

- **原始 DSH 壁纸插件**：[@elysia395](https://github.com/elysia395/dsh-wallpaper-engine)，MIT
- **WebWallGL 场景渲染引擎**：[@oneincase](https://github.com/oneincase)，MIT
- **媒体桥 / 内置 ffmpeg 下载源**：由 [@oneincase](https://github.com/oneincase) 发布
- **本仓库改写与维护**：[@maoshiba6863](https://github.com/maoshiba6863)

第三方依赖与各自的许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。完整许可文本见 [LICENSE](LICENSE)。

---

## English summary

A DSH plugin that puts your local Wallpaper Engine wallpapers behind the DeepSeek Harness chat UI. Scene wallpapers render in real time with WebGL (particles, puppet animation, SceneScript, audio reaction, mouse interaction); video, web and image wallpapers are supported too. It adds iOS-style liquid glass surfaces with per-area controls, wallpaper-driven theming, font and accent-color overrides, custom avatars, audio visualization from system playback, rotation with seven transitions, battery-friendly pause rules, and an optional per-session cost readout. Settings live on the host side, so the agent spends no tokens on them.

This repository is a merged rewrite of the original DSH wallpaper plugin by [@elysia395](https://github.com/elysia395) and the WebWallGL engine by [@oneincase](https://github.com/oneincase). Licensed under MIT; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution.
