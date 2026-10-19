# 第三方声明与致谢

本仓库是在两个开源项目的基础上合并、改写的成果。这里列出所有需要保留的署名、许可证和来源。

## 1. 原始 DSH 壁纸插件

- 作者：[@elysia395](https://github.com/elysia395)
- 项目：https://github.com/elysia395/dsh-wallpaper-engine
- 许可证：MIT

本仓库的主体结构、DSH 插件接入方式、玻璃外观、字体与配色系统、费用显示、遮挡与省电逻辑等，来自这个项目。

## 2. WebWallGL 渲染引擎

- 作者：[@oneincase](https://github.com/oneincase)
- 项目：https://github.com/oneincase/webwallgl
- 许可证：MIT
- 使用方式：以 npm 依赖 `webwallgl@^3.0.0` 引入，本仓库不复制其源码

场景壁纸的实时渲染（图层、效果、粒子、模型、SceneScript、用户属性、音频可视化）以及网页壁纸沙箱由它提供。

## 3. 媒体桥（media-bridge）

- 作者：[@oneincase](https://github.com/oneincase)
- 项目：https://github.com/oneincase/media-bridge
- 使用方式：首次需要时从该项目的 Releases 下载对应平台的二进制文件，并做 SHA-256 校验

负责读取系统正在播放的媒体信息、歌词和音频频谱。各平台二进制由该项目自行发布并遵循其许可。

## 4. ffmpeg

- 来源：https://github.com/eugeneware/ffmpeg-static （Releases 中的静态构建）
- 使用方式：只在你触发视频转码时下载，并做 SHA-256 校验；不随本仓库分发

ffmpeg 的许可取决于具体构建（GPL / LGPL）。如果你要再分发本插件并附带转码能力，请自行确认并遵守所选构建的许可证要求。

## 5. npm 依赖

运行时依赖：

| 包 | 用途 | 许可证 |
|---|---|---|
| `webwallgl` | 场景 / 网页壁纸渲染 | MIT |
| `x11` | Linux X11 遮挡检测 | MIT |

宿主侧对等依赖（由 DSH 提供，不在本仓库分发）：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-host-webserver`、`react`。

## 6. 维护者

- 当前维护者：[@maoshiba6863](https://github.com/maoshiba6863)
- 维护范围：合并改写、日常修复、发布

## 7. 许可证文本

本仓库整体以 MIT 许可发布，完整文本见 [LICENSE](LICENSE)。原项目的版权声明随代码一并保留；任何再分发都必须保留这些声明。

```
MIT License

Copyright (c) 2026 elysia395
Copyright (c) 2026 oneincase (WebWallGL / media-bridge, 以依赖形式使用)
Copyright (c) 2026 maoshiba6863 (合并改写与维护)
```

> 说明：上面的三行署名用于说明本仓库的组成来源。实际授权以 [LICENSE](LICENSE) 全文为准；WebWallGL、媒体桥、ffmpeg 的许可以其各自仓库为准。
