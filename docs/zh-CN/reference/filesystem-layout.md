# 文件系统布局

Octogent 按所有权划分文件。面向代理的项目上下文留在工作区；运行时拥有的状态放在按项目划分的全局状态目录。

## 项目本地文件

`.octogent/` 创建在工作区中。

主要路径：

- `.octogent/project.json`
- `.octogent/env`（可选）
- `.octogent/tentacles/`
- `.octogent/worktrees/`

`project.json` 保存用于定位全局状态的稳定项目 ID。tentacles 目录用于存放代理可读的 markdown。worktrees 是生成出来的执行检出目录，不应当作上下文存储使用。

`env` 是本项目工作代理的环境：`KEY=VALUE` 行，叠加在本项目每个代理终端的基线环境之上，每次会话启动时重新读取。`octogent init` 会写入起步模板（找到 `.venv/` 或 `venv/` 时直接启用它），且从不覆盖已有文件。它和 `.octogent/` 下的其他内容一样被 git 忽略，只属于当前这份克隆。语法与优先级见 [CLI 参考——工作代理的环境](cli.md#工作代理的环境)。

触手示例：

```text
.octogent/
  tentacles/
    api-backend/
      CONTEXT.md
      todo.md
      routes.md
```

当操作者或规划代理为触手挂上 Claude Code 技能时，`CONTEXT.md` 末尾可能带有一个受管理的 `Suggested Skills` 块。

Deck 也会为触手写入 UI 元数据，但不会写进这些 markdown 文件。颜色、状态、外观、路径和标签存放在全局 Deck 状态中。

项目本地的 Claude Code 技能（如有）位于：

```text
.claude/
  skills/
    some-skill/
      SKILL.md
```

## 全局状态

按项目划分的运行时文件存放在：

```text
~/.octogent/projects/<project-id>/
  logs/
    server.log
    server.log.1
    server.log.2
    server.log.3
  state/
```

`state/` 下值得注意的文件：

- `tentacles.json`
- `deck.json`
- `transcripts/<sessionId>.jsonl`
- `monitor-config.json`
- `monitor-cache.json`
- `code-intel.jsonl`

`tentacles.json` 虽然沿用了历史名称，实际是终端注册表。它保存终端记录、生命周期状态、UI 状态、父子关联、工作区模式、工作树 ID 和显示名。

`deck.json` 保存 Deck 的展示元数据，不属于面向代理的触手文件。

`transcripts/*.jsonl` 独立于 PTY 回滚缓冲保存对话转录事件。回滚缓冲在内存中且有上限；转录会持久化。

`logs/server.log` 记录服务启动信息、运行时摘要和未捕获错误。文件达到 5 MB 时轮转并保留三代；可用 `OCTOGENT_SERVER_LOG` 覆盖或禁用此位置。

## 提示词存储

- 核心提示词从 `prompts/` 同步
- 同步副本位于 `.octogent/prompts/core/`
- 用户提示词位于 `.octogent/prompts/`

## 实用法则

面向代理的上下文，放在触手目录里。

运行时拥有的状态，去全局项目状态目录找。

隔离的执行检出目录在 `.octogent/worktrees/` 下，其分支生命周期应视为创建它的那个终端的一部分。

> 本文件是 [../../reference/filesystem-layout.md](../../reference/filesystem-layout.md) 的中文翻译版本。如有歧义，以英文原文为准。

`transcripts/<terminalId>.screen.txt` 在会话结束时尽力保存最后 200 行处理后的 PTY 文本，供 `terminal screen` 回退读取。
