# 安装

Octogent 是一个本地 Node.js 项目，包含本地 API 和 Web UI。

## 系统要求

- Node.js `22+`
- `claude`（用于支持的 workflow）
- `git`（用于工作树终端）
- `gh`（用于 GitHub 拉取请求功能）
- `curl`（用于当前的 Claude 钩子回调流程）

当前文档以 Claude Code 为主。代码库中存在一些其他供应商的管道代码，但尚不是受支持的主要方案。

## 本地开发安装

```bash
pnpm install
pnpm dev
```

## 从克隆仓库进行本地全局 CLI 安装

```bash
pnpm install
pnpm build
npm install -g .
```

## npm 注册表安装

Octogent 尚未发布到 npm 注册表，因此 `npm install -g octogent` 会失败并返回 `404`。

## 首次运行行为

在项目目录中运行 `octogent` 将会：

- 如果 `.octogent/` 不存在则创建它
- 将 `.octogent` 添加到 `.gitignore`，如果 `.gitignore` 不存在则创建它
- 将稳定的项目 ID 写入 `.octogent/project.json`
- 在 `~/.octogent/projects.json` 中注册该项目
- 将运行时状态移至 `~/.octogent/projects/<project-id>/state/`
- 从 `8787` 开始选择一个可用的本地 API 端口
- 除非设置了 `OCTOGENT_NO_OPEN=1`，否则打开浏览器
- 显示 Deck 设置卡片，直到创建第一个触手

## 启动规则

- 如果 `claude` 或其他受支持的供应商二进制文件不可用，启动将失败
- 当缺少 `git`、`gh` 或 `curl` 等可选集成时，启动会发出警告

## 下一步

- [快速入门](quickstart.md)

> 本文件是 [../../getting-started/installation.md](../../getting-started/installation.md) 的中文翻译版本。如有歧义，以英文原文为准。
