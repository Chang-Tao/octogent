# CLI 参考

## 启动工作面板

```bash
octogent
```

为当前项目启动本地 API，并在存在打包好的 Web 资源时打开 UI。

如果当前目录尚未初始化，工作面板依然会启动，但会运行在一个临时状态根目录之上，并显示一张引导卡片提示你运行 `octogent init`。本地 `.octogent/` 脚手架由 `octogent init`（或引导卡片上的**初始化工作区**操作）创建，工作面板本身不会创建。初始化之前创建的任何内容都会在初始化时迁移进项目。

### 环境变量

- `HOST`：绑定的主机地址（默认 `127.0.0.1`；当 `OCTOGENT_ALLOW_REMOTE_ACCESS=1` 时默认 `0.0.0.0`）
- `OCTOGENT_API_PORT` 或 `PORT`：监听端口（默认 `8787`）
- `OCTOGENT_ALLOW_REMOTE_ACCESS`：设为 `1` 允许其他机器访问；会放宽 host/origin 校验，并且在未显式设置 `HOST` 时绑定 `0.0.0.0` 而非 `127.0.0.1`
- `OCTOGENT_WORKSPACE_CWD`：覆盖工作区目录
- `OCTOGENT_HOME`：覆盖全局状态根目录（默认 `~/.octogent`）
- `OCTOGENT_PROJECT_STATE_DIR`：覆盖项目状态目录
- `OCTOGENT_PROMPTS_DIR`：覆盖提示词目录
- `OCTOGENT_WEB_DIST_DIR`：覆盖 Web UI 产物目录
- `OCTOGENT_LOCALE`：UI/CLI 语言（`en` 或 `zh-CN`）
- `OCTOGENT_MAX_TERMINAL_SESSIONS`：并发运行终端会话的上限
- `OCTOGENT_TERMINAL_STALL_MS`：运行中的终端在多少毫秒无转录活动后被标记为 `stalled`（默认 `120000`）
- `OCTOGENT_CLAUDE_USAGE_SOURCE`：Claude 用量数据源：`auto`（OAuth 优先、CLI PTY 回退）、`oauth`、`cli`，或 `off` 禁用采集（默认 `auto`）

无界面服务器示例：

```bash
OCTOGENT_ALLOW_REMOTE_ACCESS=1 octogent
# 或指定自定义主机
HOST=192.168.1.100 octogent
```

## 初始化项目

```bash
octogent init [project-name]
```

在当前目录创建或更新 `.octogent/` 脚手架，但不启动工作面板。

当你想显式初始化项目，或提前设置项目显示名时使用它。日常使用中，在代码库里直接运行 `octogent` 就足以完成初始化并启动应用。

## 列出已注册项目

```bash
octogent projects
```

## 创建触手

```bash
octogent tentacle create <name> --description "API runtime and routes"
```

此命令要求 Octogent 已经在运行。

## 列出触手

```bash
octogent tentacle list
```

## 创建终端

```bash
octogent terminal create [options]
```

选项：

- `--name`、`-n`：终端显示名
- `--workspace-mode`、`-w`：`shared` 或 `worktree`
- `--initial-prompt`、`-p`：初始提示词原文
- `--terminal-id`：显式指定终端 ID
- `--tentacle-id`：要挂载到的已有触手 ID
- `--worktree-id`：显式指定工作树 ID
- `--parent-terminal-id`：子终端的父终端 ID
- `--prompt-template`：提示词模板名称
- `--prompt-variables`：提示词模板变量的 JSON 对象

## 列出终端

```bash
octogent terminal list
```

显示每个终端的 ID、生命周期状态、可用时的进程 ID、生命周期原因和显示名。

## 停止或杀死终端

```bash
octogent terminal stop <terminal-id>
octogent terminal kill <terminal-id>
```

`stop` 关闭活动会话，或对 stale 终端记录的进程发送 `SIGTERM`；`kill` 使用 `SIGKILL`。

## 清理不活跃的终端记录

```bash
octogent terminal prune
```

移除生命周期状态为 `stale`、`stopped` 或 `exited` 的终端记录。不会移除活动会话。

## 发送消息

```bash
octogent channel send <terminal-id> "message"
```

代表某个工作代理或父终端发送时，使用 `--from <terminal-id>`。省略 `--from` 时，若命令运行在 Octogent 托管的终端里，CLI 会回退使用 `OCTOGENT_SESSION_ID`。

## 列出消息

```bash
octogent channel list <terminal-id>
```

> 本文件是 [../../reference/cli.md](../../reference/cli.md) 的中文翻译版本。如有歧义，以英文原文为准。
