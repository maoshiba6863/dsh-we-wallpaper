# Issue 分诊与认领

本文说明 issue 从提交到关闭的流程，以及每个标签的含义。

## 标签

| 标签 | 含义 | 谁来打 |
|---|---|---|
| `bug` | 可复现的功能错误 | 提交时自动 / 维护者确认 |
| `enhancement` | 新功能或体验改进建议 | 提交时自动 |
| `question` | 使用问题、配置咨询 | 维护者 |
| `status:needs-triage` | 新提交，还没人看过 | 表单自动打 |
| `status:accepted` | 维护者已确认要做/要修，等待认领 | 维护者 |
| `status:blocked` | 卡在外部条件（上游 bug、缺设备复现） | 维护者 |
| `duplicate` | 与已有 issue 重复 | 维护者 |
| `wontfix` | 明确不做，或不符合项目方向 | 维护者 |

## 流程

1. **提交**：用模板提 issue，务必填版本、系统、壁纸类型。缺这些信息的大概率会被要求补。
2. **分诊**：维护者判断是否可复现、是否属于本项目。
   - 能复现、要做 → 去掉 `status:needs-triage`，加 `status:accepted`
   - 不能复现 → 追问步骤，保留 `status:needs-triage`
   - 重复 / 不做 → 说明理由后关闭，打 `duplicate` 或 `wontfix`
3. **认领**：只有带 `status:accepted` 的 issue 能认领。在 issue 下评论：
   - `/assign` —— 认领，成功后你会被指派
   - `/unassign` —— 释放；只有当前认领人或维护者能释放
   - 一个 issue 同时只有一个认领人
4. **开发**：按 [CONTRIBUTING.md](CONTRIBUTING.md) 准备环境，改完跑 `npm run verify:all`，然后发 PR 引用该 issue。
5. **关闭**：PR 合并即关闭；确认修好的 bug 由维护者关闭并说明版本。

## 维护者做什么

- 每天过一遍 `status:needs-triage`
- 给可复现的 bug 补上复现环境说明，必要时自己复现
- 受理后打 `status:accepted`，并给出预期方向
- 处理 `/assign` 冲突、改派、清理僵尸认领
- 发布时更新版本号与说明，回填相关 issue

## 加快处理的小技巧

- 附日志：`DSH_WE_LOG_LEVEL=info` 后复现，贴 `[wallpaper-engine]` 开头的行
- 附系统与版本：DSH 版本、插件版本、系统版本、浏览器/桌面端
- 说明壁纸来源：Steam 创意工坊 / 本地工程 / 上传文件
- 场景壁纸问题附上壁纸卡片上的报错文字（首帧超时、运行中断、加载失败等）
