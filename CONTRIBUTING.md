# 贡献指南

欢迎提 issue 和 PR。这个项目的特点是"界面 + 宿主 + 渲染"三层都在同一个仓库里，改动前先看清要动哪一层。

## 环境

- Node.js ≥ 18
- npm
- 一个能跑 DSH 的环境（桌面端或命令行）
- 可选：装了 Wallpaper Engine 的 Windows 机器，方便验证真实壁纸

```bash
npm ci          # 按 package-lock.json 装依赖
npm run build   # 生成 lib/client.js
```

## 三层结构，改对地方

| 你要改的东西 | 改哪里 | 备注 |
|---|---|---|
| 设置窗口、按钮、样式、玻璃、字体、轮播等界面 | `src/` | 改完必须 `npm run build`，产物是 `lib/client.js` |
| 宿主 HTTP 接口、扫描、转码、缓存、媒体桥、遮挡 | `lib/` | `lib/client.js` 是构建产物，不要手改 |
| 场景渲染页、网页壁纸沙箱适配 | `lib/webwallgl/` | 引擎本体是 npm 依赖 `webwallgl`，不要复制进来改 |
| 内置预设 | `lib/glass-presets/`、`lib/fontsets/` | JSON，保持格式 |
| 测试 | `test/` | 新功能请补一条守卫 |

界面文案统一用 `weT("…")` 包起来，别直接写死字符串。

## 开发循环

1. 用软链把工作区装进 DSH：
   ```bash
   ln -s "$PWD" ~/.dsh/profiles/desktop/node_modules/dsh-we-wallpaper
   ```
2. 改 `src/` → `npm run build` → 在 DSH 里重载界面
3. 改 `lib/` 通常重启 DSH 更稳妥

## 提交前必须通过

```bash
npm run build
npm run verify:all      # 等于 build + verify + docs + smoke
```

只想快速自检：

```bash
npm run verify          # 守卫测试
npm run smoke           # 冒烟
npm run lint            # ESLint
npm run typecheck       # 类型检查
```

CI 会在 Windows 和 Ubuntu 两条腿上都跑一遍；平台相关逻辑（X11 遮挡、Windows 路径、macOS 授权）在另一条腿上可能被跳过，这是预期行为，不是漏测。

## 提 PR

- 一个 PR 只做一件事，标题写清楚"改了什么、为什么"
- 描述里给复现步骤、影响范围、截图（界面改动必须带前后对比）
- 关联相关 issue（`Closes #123`）
- 新增交互请在 Windows 和 macOS 至少各试一次；只改文案的除外
- 不要提交 `node_modules/`、`.test-cache/`、`.npm-cache/`、`lib/client.js`

## 代码约定

- 不引入新依赖前先说明理由；运行时依赖越少越好
- 壁纸文件、上传文件、缓存一律限制在允许的目录内，不要放宽路径校验
- 网页壁纸的沙箱不要为了"方便"打开；需要能力就走已有的属性接口
- 上传大小上限、文件类型白名单改动要同步更新文档和测试
- 性能敏感路径（渲染循环、轮询、频谱）避免每帧分配对象

## 安全

- 不要把 API Key、token、密码、私钥、`.env` 提交进仓库；`.gitignore` 已覆盖常见的密钥文件，但最终以你的自查为准
- 发现漏洞请按 [SECURITY.md](SECURITY.md) 走私密报告，不要开公开 issue
- 涉及路径、上传、沙箱的改动要格外小心，提交前说明影响面

## 许可

提交代码即表示同意以本仓库的 MIT 许可发布，并保留 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 中的署名。
