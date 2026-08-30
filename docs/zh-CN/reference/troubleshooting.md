# 故障排查

## `pnpm test` 因浏览器 API 报错

确认在仓库根目录安装了工作区依赖：

```bash
pnpm install
```

## 包解析出错

从仓库根目录运行安装，而不是在子包里。

## Node 版本过旧

使用 Node.js `22+`。

## 终端启动失败

检查你的 shell 环境可用且可执行。

如果启动失败并提示 `Terminal session limit reached`，说明 Octogent 已达到配置的活动 PTY 会话数上限。用 `octogent terminal stop <terminal-id>` 停掉不用的终端，或用 `octogent terminal prune` 清理不活跃的记录。默认上限是 32；在启动 Octogent 前把 `OCTOGENT_MAX_TERMINAL_SESSIONS` 设为正整数即可调整。

## 工作树终端创建失败

确认：

- `git --version` 可用
- 工作区是一个 git 仓库
- 当前用户能在 `.octogent/worktrees/` 下创建工作树

## GitHub 摘要不可用

确认：

```bash
gh auth status
```

## 监控刷新失败

确认你的 X Bearer Token 与 API 访问权限。

## 消息在重启后消失

这是预期行为。通道消息只存在内存中，不会跨 API 重启持久化。

## 终端能撑过页面刷新，却撑不过服务重启

这同样是预期行为。PTY 会话可以在重连窗口内存活，但不会在 API 重启后存活。

重启后，之前持久化为 running 的终端在 Octogent 无法接回内存中的 PTY 会话时会被标记为 `stale`。用 `octogent terminal list` 查看生命周期状态，用 `octogent terminal stop <terminal-id>` 或 `octogent terminal kill <terminal-id>` 处理记录中的进程，用 `octogent terminal prune` 从 UI 中移除 stale、stopped 或 exited 的记录。

> 本文件是 [../../reference/troubleshooting.md](../../reference/troubleshooting.md) 的中文翻译版本。如有歧义，以英文原文为准。
