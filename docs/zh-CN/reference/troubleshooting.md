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

## 正在忙的终端被标成 `stalled`，转录也不再增长

Octogent 的转录（`state/transcripts/<terminal>.jsonl`）记录的是状态**变化**（idle → processing 及其反向），以及代理 PreToolUse 钩子上报的每次工具调用（`tool_use` 事件）。因此一轮很长的任务在转录里表现为一串 `tool_use` 事件，而不是反复的 `processing` 行。停滞检测所认的"活动"包括提交 prompt、工具调用和 PTY 输出（每几秒记一次），所以肉眼可见在干活的代理不会被判 `stalled`；这个判定只留给活着却在 `OCTOGENT_TERMINAL_STALL_MS` 内毫无输出的 PTY。

如果代理明明在干活却仍被判 stalled，检查它的钩子是否到达了 API：用 `OCTOGENT_VERBOSE_LOGS=1` 启动 API，代理动作时应能看到 `[Hook] Received hook` 日志。Claude 的钩子在 `<workspace>/.claude/settings.json`，Codex 的在用户层 `$CODEX_HOME/hooks.json`。

## `channel send` 提示消息已排队

目标代理正忙时这就是正常回应。channel 消息只在目标会话空闲（由钩子和输出检测共同判断）时注入；在此之前它留在队列里，`octogent channel list <terminal-id>` 会显示 `status=pending`，代理当前一轮结束后自动投递。注意 `channel list` 只知道发给当前正在运行的这个 API 进程的消息。

## 终端能撑过页面刷新，却撑不过服务重启

这同样是预期行为。PTY 会话可以在重连窗口内存活，但不会在 API 重启后存活。

重启后，之前持久化为 running 的终端在 Octogent 无法接回内存中的 PTY 会话时会被标记为 `stale`。用 `octogent terminal list` 查看生命周期状态，用 `octogent terminal stop <terminal-id>` 或 `octogent terminal kill <terminal-id>` 处理记录中的进程，用 `octogent terminal prune` 从 UI 中移除 stale、stopped 或 exited 的记录。

> 本文件是 [../../reference/troubleshooting.md](../../reference/troubleshooting.md) 的中文翻译版本。如有歧义，以英文原文为准。
