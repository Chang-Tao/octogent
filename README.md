<div align="center">

<img width="1500" height="500" alt="Octogent header" src="./static/images/octogent-header.png" />
<br/>
<br/>

<strong>too many terminals, not enough tentacles</strong>
<br />
<br />

中文 | [English](README.en.md)
<br />
<br />

![Last Update](https://img.shields.io/github/last-commit/Chang-Tao/octogent?label=Last%20Update&style=flat-square)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-5FA04E?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

## 关于本 Fork

本仓库 fork 自 [hesamsheikh/octogent](https://github.com/hesamsheikh/octogent)。原项目已停止维护；本 fork 在相同的 MIT 许可证下独立继续开发。

感谢 [@hesamsheikh](https://github.com/hesamsheikh) 创造了 Octogent，也感谢以下上游贡献者——他们的 Pull Request 已合并进本仓库：

- [#4](https://github.com/hesamsheikh/octogent/pull/4) 类型强制转换的测试覆盖 — @KomalSrinivasan
- [#5](https://github.com/hesamsheikh/octogent/pull/5) 错误边界与 UI 状态冲刷（部分移植） — @carson24wilson-cmyk
- [#7](https://github.com/hesamsheikh/octogent/pull/7) 远程访问绑定与环境变量文档（部分移植） — @KomalSrinivasan
- [#14](https://github.com/hesamsheikh/octogent/pull/14) Deck 路由集成测试（测试提交） — @directorsambasivagroup
- [#15](https://github.com/hesamsheikh/octogent/pull/15) PTY 泄漏修复、停滞代理检测、触手尺寸上限 — @Alecbdc
- [#17](https://github.com/hesamsheikh/octogent/pull/17) pnpm 构建脚本白名单（部分） — @TechIntegrationLabs
- [#22](https://github.com/hesamsheikh/octogent/pull/22) 兼容 Corepack 的构建脚本 — @kingmarh-hash
- [#24](https://github.com/hesamsheikh/octogent/pull/24) Windows 下 `pnpm dev` 修复 — @dcx010591-code

# Octogent

同时开着**十个 Claude Code 会话**，在它们之间来回切换、努力想起每一个当初要做什么——这一点也不好玩。当一个代理在写文档、一个在动数据库、一个在改 API、还有一个在前端的某个角落时，*事情很快就糊成一团*。**Octogent** 试图解决这个问题：给每项工作独立的<u>作用域上下文、笔记和任务清单</u>，同时让 Claude Code 能够**生成其他 Claude Code 代理**、给它们派活并与它们通信。

## 愿景

这个仓库是一次个人探索：当终端编码代理被当作更大编排层的组成部分、而不是最终界面本身时，AI 编码环境会是什么样子。重点不是把 **Claude Code** 藏在抽象后面，而是让*多代理协作在真实代码库上对开发者不再混乱*。

## 截图

<div align="center">
<table>
<tr>
<td><img src="./static/images/preview_1.jpg" alt="Screenshot 1" width="100%"/></td>
<td><img src="./static/images/preview_2.jpg" alt="Screenshot 2" width="100%"/></td>
</tr>
<tr>
<td><img src="./static/images/preview_3.jpg" alt="Screenshot 3" width="100%"/></td>
<td><img src="./static/images/preview_4.jpg" alt="Screenshot 4" width="100%"/></td>
</tr>
<tr>
<td><img src="./static/images/preview_5.jpg" alt="Screenshot 5" width="100%"/></td>
<td><img src="./static/images/preview_6.jpg" alt="Screenshot 6" width="100%"/></td>
</tr>
</table>
</div>

## Octogent 能为你做什么

- **把触手当作上下文层来创建**，让代理使用作用域内的 markdown 文件工作，而不是宽泛混乱的聊天上下文
- **把 `todo.md` 用作执行面**，让任务保持可见、可跟踪、随时可以委派
- **同时运行多个 Claude Code 终端**，让一个开发者能协调多个编码会话
- **从待办项生成子代理**，让并行工作有具体的事实来源
- **支持代理间消息传递**，让工作代理与协调者能报告完成、阻塞和交接说明
- **把面向代理的上下文保存在文件里**，让系统比单条提示词线程更持久
- **提供本地 API 与 UI**，覆盖终端生命周期、持久化、WebSocket 传输和编排

**触手（tentacle）**是 `.octogent/tentacles/<tentacle-id>/` 下的一个文件夹，存放代理可读的 markdown，例如 `CONTEXT.md`、`todo.md`，以及该代码库切片所需的其他笔记。

章鱼的比喻是字面意义的：*一只章鱼、许多触手、不同的工作同时发生*。

## 触手

**触手**是一个有作用域的工作容器。它给一片工作独立的文件、笔记和 `todo.md`，让代理不必从聊天历史里重建整个代码库的上下文。

它的作用：

- 把上下文局限在一个区域，比如文档、数据库、API 变更或前端工作
- 给代理可读可更新的持久文件
- 通过待办项提供自然的委派来源

完整模型见[触手](docs/zh-CN/concepts/tentacles.md)与[使用待办事项](docs/zh-CN/guides/working-with-todos.md)。

## 上下文、笔记与任务清单

在 Octogent 里，触手不只是任务桶，也是这项工作存放本地上下文的地方——可以包含关于某部分代码库的笔记、实现细节、交接文件，以及跟踪剩余工作的 `todo.md`。Claude Code 代理可以随着工作推进读取并更新这些文件。

这意味着你可以：

- 把文档、数据库、API 或前端工作分到不同的工作上下文里
- 存放帮助代理理解那部分代码库的笔记
- 为一个具体事项生成一个代理
- 把大任务拆成多个事项
- 启动一个集群，让多个代理并行消化清单
- 把触手内的文件当作"哪些已完成、哪些还剩下"的共享事实来源

完整模型见[触手](docs/zh-CN/concepts/tentacles.md)与[使用待办事项](docs/zh-CN/guides/working-with-todos.md)。

## 用 Claude Code 管理 Claude Code

这里的核心想法之一：**Claude Code** 不应只被当作一个等着人类输入提示词的终端会话。在 Octogent 里，一个 Claude Code 代理可以协调其他 Claude Code 代理、给它们指派具体工作、并与它们交换简短消息，而人类停留在编排层。

这与 Claude Code 自带的子代理生成不同——你可以直接看到并控制每个工作代理在做什么。

因此 Octogent 不只是多终端的仪表盘，它也是一种围绕作用域任务和共享上下文文件来组织父子代理行为的方式。

当前模型见[编排子代理](docs/zh-CN/guides/orchestrating-child-agents.md)与[代理间消息传递](docs/zh-CN/guides/inter-agent-messaging.md)。

## 工作原理

Octogent 把通常混在一堆终端里的三种关注点分开：

1. **上下文**位于 `.octogent/tentacles/<tentacle-id>/`。`CONTEXT.md` 解释该区域，`todo.md` 提供可执行的工作项，其余 markdown 文件存放笔记或交接。
2. **执行**位于本地 API 管理的终端记录与 PTY 会话中。终端可以挂载到已有触手，集群工作时多个终端可以共享一个触手。
3. **隔离**是可选的。共享终端在主工作区运行；工作树终端在 `.octogent/worktrees/<worktree-id>/` 下的 `octogent/<worktree-id>` 分支上运行。

Deck 直接读取触手文件，从 `todo.md` 解析复选框项，并用未完成项生成工作代理的提示词。Claude 钩子把代理状态、转录和空闲事件喂给 API，让 UI 能展示比原始终端输出更多的信息。

## 快速开始

<details>
<summary><strong>本地开发</strong></summary>

```bash
pnpm install
pnpm dev
```

这会启动本地开发用的 API 和 Web 应用。

</details>

<details open>
<summary><strong>当前安装状态</strong></summary>

```bash
Octogent 尚未发布到 npm registry。
```

本地开发：

```bash
pnpm install
pnpm dev
```

从克隆仓库安装全局 CLI：

```bash
pnpm install
pnpm build
npm install -g .
octogent
```

`npm install -g octogent` 的安装方式要等包发布之后才可用。

</details>

首次运行时，**Octogent** 会从 `8787` 起挑选一个可用的本地 API 端口，并在未设置 `OCTOGENT_NO_OPEN=1` 时打开 UI。在尚未初始化的目录里，它会先运行在临时状态根目录上并提示你执行 `octogent init`——该命令创建本地 `.octogent/` 脚手架、分配稳定的项目 ID，并接管此前创建的所有内容。

## 环境要求

- Node.js `22+`
- 安装 `claude`（受支持的代理工作流）
- `git`（工作树终端）
- `gh`（GitHub Pull Request 功能）
- `curl`（当前的 Claude 钩子回调流程）

如果 `claude` 和其他受支持的提供方二进制都未安装，启动会失败。当前文档只覆盖 **Claude Code**。

## 什么会持久化

- `.octogent/` 保存项目本地脚手架与工作树
- `~/.octogent/projects/<project-id>/state/` 保存运行时状态、转录、监控缓存和元数据
- `.octogent/tentacles/<tentacle-id>/` 保存代理读取的上下文文件与待办

PTY 会话能在空闲宽限期内撑过浏览器刷新，但**不会**在 API 重启后存活。启动时无法接回活动 PTY 会话的终端记录会被标记为 `stale`；用 `octogent terminal list`、`stop`、`kill` 和 `prune` 来检查与清理。Octogent 默认把活动 PTY 会话上限设为 32 以保护主机；把 `OCTOGENT_MAX_TERMINAL_SESSIONS` 设为正整数可为更大规模的编排调整该上限。

## 文档

- [文档首页](docs/zh-CN/index.md)
- [安装](docs/zh-CN/getting-started/installation.md)
- [快速入门](docs/zh-CN/getting-started/quickstart.md)
- [心智模型](docs/zh-CN/concepts/mental-model.md)
- [触手](docs/zh-CN/concepts/tentacles.md)
- [运行时与 API](docs/zh-CN/concepts/runtime-and-api.md)
- [使用待办事项](docs/zh-CN/guides/working-with-todos.md)
- [编排子代理](docs/zh-CN/guides/orchestrating-child-agents.md)
- [代理间消息传递](docs/zh-CN/guides/inter-agent-messaging.md)
- [CLI 参考](docs/zh-CN/reference/cli.md)
- [文件系统布局](docs/zh-CN/reference/filesystem-layout.md)
- [API 参考](docs/zh-CN/reference/api.md)
- [实验性功能](docs/zh-CN/reference/experimental-features.md)
- [故障排查](docs/zh-CN/reference/troubleshooting.md)
- [贡献指南](CONTRIBUTING.zh-CN.md)

英文原版文档位于 [docs/](docs/index.md)。中文译文如与英文原文有歧义，以英文为准。

## 贡献者须知

Octogent 目前不会活跃地评审 Pull Request。如果你仍要提交，且有代码由 AI 编写，请披露所用的编码代理与模型。贡献流程与期望见[贡献指南](CONTRIBUTING.zh-CN.md)。
