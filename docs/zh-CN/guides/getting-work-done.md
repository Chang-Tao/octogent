# 用 Octogent 完成第一份工作

## 第一部分：十分钟上手

已装好 Octogent、登录 `claude` 或 `codex`？在一个有提交、有 `README.md`、没有未提交改动的 Git 项目中开始，当前应在一个命名分支上，且 Git 提交身份已配置。先做一次小文档修改，通常约十分钟能完成派发和审阅；代理响应速度会影响用时。

### 1. 启动 Octogent

在项目目录的命令行运行下面的命令；`init` 准备项目配置，并把 `.octogent/` 加入 Git 忽略规则。
这一步提交忽略规则，让后续代理从干净的版本开始；`octogent` 启动服务并打开浏览器，保持这个窗口运行。
网页中的 octoboss（大章鱼）是整个项目的总协调入口。

```bash
cd "$(git rev-parse --show-toplevel)"
octogent init
git add .gitignore
git diff --cached --quiet || git commit -m "chore: ignore Octogent workspace"
octogent
```

### 2. 建一个触手

另开一个命令行窗口，进入同一个项目根目录；此后的命令都在这里运行。
触手（tentacle，也叫小章鱼）是保存一条工作线的背景、待办和交接文件的文件夹。
下面建的触手 ID 就是 `first-task`；保存当前分支名，稍后把结果合并回来。

```bash
octogent_base=$(git branch --show-current)
octogent tentacle create first-task --description "第一次派发、审阅和合并"
```

### 3. 派第一个任务给 Claude Code 或 Codex

终端（terminal）是运行一个代理会话的地方；工作树（worktree）是供它单独改文件、提交代码的 Git 副本。
下面用 Claude Code；若只登录了 Codex，把 `claude-code` 换成 `codex`。
`--tentacle-id first-task` 把终端挂到刚建的触手；漏掉它就直属大章鱼，建过触手也不会自动归属。

```bash
octogent terminal create --terminal-id first-worker --name "说明文档小修" \
  --tentacle-id first-task --workspace-mode worktree \
  --agent-provider claude-code --effort standard \
  --initial-prompt "只修改 README.md：根据仓库已有内容，澄清一处首次运行说明，让新人少猜一步。不要发明命令，不改代码。检查 git diff --check，并核对改动涉及的命令确实存在。在自己的分支提交，不要 push。最后总结改了什么、检查结果和疑问。"
```

### 4. 看它干得怎么样

重复运行下面的命令；`running` 是运行中，`awaiting-review`（待审阅）是已有提交、工作树干净，等你检查。
浏览器的 flow view（进度页）显示谁在工作；canvas（代理页）可打开终端，看代理输出和总结。
若是 `stalled`（停滞），先看终端是否在等输入；若出现 `initial prompt not acknowledged`（初始任务未收到确认），先确认任务没开始，再重发。
channel（消息）可追加任务，例如 `octogent channel send first-worker "请报告当前进展和阻塞"`。

```bash
octogent terminal list
```

### 5. 审阅、合并、收尾

看到待审阅后，先运行前三行：读提交、逐行看改动、检查空白错误，并核对 README 中的命令。
不满意就用上一条 channel 命令提修改要求，等代理再次提交；检查通过后才运行合并及其后的命令。
合并把代理分支的提交带回当前分支；`stop` 结束会话，`delete --with-worktree` 删除记录、工作树和分支。
删除前会现场检查是否还有未合并提交；若拒绝，先检查原因。完成这里，你已经审阅并合并了第一份结果。

```bash
git -C .octogent/worktrees/first-worker log --oneline "$octogent_base..HEAD"
git diff "$octogent_base..octogent/first-worker"
git -C .octogent/worktrees/first-worker diff --check "$octogent_base..HEAD"
# 审阅通过后再执行下面三行。
git merge --no-ff octogent/first-worker -m "docs: merge first reviewed task"
octogent terminal stop first-worker
octogent terminal delete first-worker --with-worktree
```

## 第二部分：速查表

`<触手ID>`、`<终端ID>`、`<项目ID>` 和 `<任务书>` 要换成实际值，尖括号也要去掉。Git 示例假设主检出目录当前在 `main`；若用其他分支，替换 `main`。默认工作树 ID 与终端 ID 相同。表中创建命令会创建新终端。

| 想做什么 | 确切命令 |
| --- | --- |
| 建触手 / 查触手 ID | `octogent tentacle create api-work --description "API 工作"` / `octogent tentacle list` |
| 派给 Claude Code | `octogent terminal create --name "API 工人" --tentacle-id <触手ID> --workspace-mode worktree --agent-provider claude-code --initial-prompt "<任务书>"` |
| 派给 Codex | `octogent terminal create --name "API 工人" --tentacle-id <触手ID> --workspace-mode worktree --agent-provider codex --initial-prompt "<任务书>"` |
| 按档位选模型 | `octogent terminal create --tentacle-id <触手ID> --workspace-mode worktree --agent-provider codex --effort heavy --initial-prompt "<任务书>"`；档位为 `light`、`standard`、`heavy`、`max` |
| 指定模型 | `octogent terminal create --tentacle-id <触手ID> --workspace-mode worktree --agent-provider claude-code --model sonnet --initial-prompt "<任务书>"` |
| 列终端 / 查归档记录 | `octogent terminal list` / `octogent terminal list --archived` |
| 看工人的活动转录 | `tail -n 40 ~/.octogent/projects/<项目ID>/state/transcripts/<终端ID>.jsonl` |
| 追加消息 / 核对是否投递 | `octogent channel send <终端ID> "请补充测试结果和疑问"` / `octogent channel list <终端ID>` |
| 停止 / 归档 / 只删记录 | `octogent terminal stop <终端ID>` / `octogent terminal archive <终端ID>` / `octogent terminal delete <终端ID>` |
| 查看提交和差异 | `git -C .octogent/worktrees/<终端ID> log main..HEAD` / `git diff main..octogent/<终端ID>` |
| 审阅通过后合并 | `git merge --no-ff octogent/<终端ID>` |
| 合并后删记录、工作树和分支 | `octogent terminal delete <终端ID> --with-worktree` |
| 预览 / 回收已归档且已合并的工作树 | `octogent worktree gc --dry-run` / `octogent worktree gc` |
| 批量归档完成记录 / 清掉失效记录 | `octogent terminal archive --all-completed` / `octogent terminal prune` |

## 第三部分：进一步

以下按场景查用。示例中的 `first-worker` 代表要操作的终端；第一部分已删除它，后续发消息和审阅时请换成当前工人的 ID。最后一节是一套可独立执行的完整流程。

### 开始之前与启动检查

- 安装要求：Node.js 22+、pnpm 10+、Git、`curl`，以及已登录的 `claude` 和/或 `codex`；Linux 安装还需要编译 `node-pty` 的工具链。还没装好时按[安装指南](../getting-started/installation.md)操作。
- 从有提交的 Git 项目根目录启动；工作树从已提交版本分出，未提交的主目录改动不会带过去。先提交或另行保存自己的修改，并确认 Git 提交身份已配置。
- `octogent init` 创建 `.octogent/` 配置和忽略规则，不启动服务。直接运行 `octogent` 也能启动未初始化项目，但会使用临时状态根并显示初始化卡；无浏览器时先 `init` 最省事。
- 默认从 `127.0.0.1:8787` 开始找空闲端口，占用时继续递增；`OCTOGENT_API_PORT`（或 `PORT`）指定搜索起点。以启动输出的实际地址为准；在已初始化项目中，CLI 会读取服务保存的实际地址。
- 无浏览器时设置 `OCTOGENT_NO_OPEN=1`。把标准输出和错误输出都留到文件，才能事后查启动失败、钩子和重试；只在屏幕上看过的日志无法追溯。下面的日志位置由 `mktemp` 创建并打印，不是 Octogent 固定的日志路径。

```bash
octogent init
octogent_log=$(mktemp)
printf 'Octogent log: %s\n' "$octogent_log"
OCTOGENT_NO_OPEN=1 OCTOGENT_VERBOSE_LOGS=1 octogent >"$octogent_log" 2>&1 &
```

在同一项目另一个命令行窗口验证；若启动输出不是 8787，替换下面的端口。`/api/health` 是服务健康接口；终端列表为空也表示 CLI 已成功连上。

```bash
curl --fail --silent --show-error http://127.0.0.1:8787/api/health
octogent terminal list
```

局域网访问需在启动时设置 `OCTOGENT_ALLOW_REMOTE_ACCESS=1`，默认绑定 `0.0.0.0`。CLI 自动生成访问令牌，并在输出中打印带令牌的局域网链接；其他机器用这个链接进入。也可设置至少 32 字符的高熵 `OCTOGENT_ACCESS_TOKEN`；令牌能控制代理和项目，含令牌的日志只给需要访问的人。`HOST` 可指定绑定地址。

```bash
OCTOGENT_NO_OPEN=1 OCTOGENT_ALLOW_REMOTE_ACCESS=1 octogent
```

以上是不同启动方式，选一种；不要为同一个项目重复启动服务。

### 五句话理解分工

1. octoboss（大章鱼）是总协调入口，你或负责派活和审阅的 AI 协调者在这里把工作分给触手，再交给终端执行。
2. 触手保存一条工作线的上下文、待办和交接文件，位于 `.octogent/tentacles/<触手ID>/`，常用 `CONTEXT.md` 和 `todo.md`，可供多个终端共用。
3. 终端是一条代理会话及其运行记录，负责具体任务；触手 ID 指工作线，终端 ID 指执行者。
4. `worktree` 给终端隔离的工作树和 `octogent/<终端ID>` 分支，适合修改代码和并行任务，代理应在自己的分支提交，由协调者审阅合并。
5. `shared` 是共享工作区，代理直接在主检出目录工作且被告知不要提交，适合只读调查或边界清楚的小改动，多人同时改同一文件仍会冲突。

deck 是管理触手文件和待办的界面；进一步的边界见[心智模型](../concepts/mental-model.md)和[触手](../concepts/tentacles.md)。

### 选择代理、模型和档位

- 用 `--agent-provider claude-code` 或 `--agent-provider codex` 明确选择代理；未指定时采用服务端默认值。
- `--effort` 选择工作档位。以下是本仓库 2026-09-08 模型映射更新后的默认值，`@` 后面是 Codex 推理等级：
  - `light`：Claude `haiku`（Haiku 4.5）；Codex `gpt-5.6-luna@low`。
  - `standard`：Claude `sonnet`（Sonnet 5）；Codex `gpt-5.6-sol@medium`，回退为 `gpt-5.6-terra@medium`。
  - `heavy`：Claude `opus`（Opus 5）；Codex `gpt-6-astra@medium`，回退为 `gpt-5.6-sol@high`。
  - `max`：Claude `fable`（Fable 5.1）；Codex `gpt-6-astra@xhigh`，回退为 `gpt-5.6-sol@xhigh`。
- GPT-6 按账号开放。Octogent 从本地 Codex 模型缓存 `$CODEX_HOME/models_cache.json`（默认 `~/.codex/models_cache.json`）选择可见的候选；缓存不可读或没有候选时仍尝试首选，并不保证账号可用。需要时先在独立 Codex 会话中确认模型可用，再重新创建工人。
- `--model sonnet` 或 `--model gpt-5.6-sol` 显式选模型，优先于 `--effort`。模型标识以字母或数字开头，只能含字母、数字、`.`、`_`、`-`，不能写成 `--model gpt-6-astra@medium`。显式模型走代理自己的默认推理等级；当前实现同时传 `--model` 和 `--effort` 也不会给 Codex 设置档位推理等级。
- 可在启动服务前用 `OCTOGENT_EFFORT_MODELS` 覆盖映射；Codex 值支持 `model@reasoning` 和按偏好排序的候选数组。详见 [CLI 参考](../reference/cli.md)。
- 进度页卡片显示代理和模型；`terminal list` 用 `agent=`、`model=` 显示已知值。未显式选模型时，Claude 的实际模型可从其转录中学到；未知时卡片显示“默认模型”，CLI 暂不显示 `model=`。
- Codex 的默认沙箱是：共享工作区 `workspace-write`，工作树 `danger-full-access`。原因是前者把 `.git` 挂成只读，会阻止工作树代理提交；工作树隔离的是 Git 改动，并不隔离系统权限。可用 `OCTOGENT_CODEX_SANDBOX_MODE` 覆盖。`OCTOGENT_CODEX_APPROVAL_POLICY` 默认 `never`，避免无人值守时卡在批准提示。

### 派活：把任务说明写完整

先建触手，再创建终端；指定 `--name` 方便辨认，`--workspace-mode` 明确改动位置，`--initial-prompt` 给出完整任务。**每次都写 `--tentacle-id`**：CLI 省略它时会明确提示终端直属 octoboss，不会自动选择刚建的触手。

一份可执行的任务书要包含：

- 目标和原因。
- 允许修改的确切文件或区域。
- 必须实现的行为，逐条列出。
- 要添加的测试；纯文档任务写清核对方式。
- 要运行的门禁。本仓库涉及 API 的代码任务用 `pnpm --filter @octogent/api test`、`pnpm lint`、`pnpm build`；其他仓库换成它们自己的检查。
- 工作树任务写明“在自己的分支提交，不要 push”；共享工作区任务改成“不要提交”。
- “最后给出总结和疑问”，包括未完成、未验证项。

下面是本仓库可派发的完整小文档任务；先确认名称未被使用。这段只创建一个 Claude 工人。

```bash
octogent tentacle create install-docs --description "让安装后的第一次启动更明确"
octogent_brief=$(cat <<'TASK'
目标和原因：让刚安装好的用户知道怎样验证 Octogent 已经运行，减少猜测。
范围：只修改 docs/getting-started/installation.md 的 First run behavior 部分。
所需行为：
- 根据 apps/api/src/cli.ts 核对直接启动与 octogent init 的区别，修正不一致的说明。
- 说明端口可能递增，应看启动输出的地址。
- 补充用 /api/health 和 octogent terminal list 验证启动的方法。
验证：这是文档任务，不新增代码测试；逐条对照 CLI 源码，检查所有链接和命令。
门禁：运行 git diff --check 和 pnpm lint；如无法运行，说明原因，不要宣称通过。
在自己的分支提交，不要 push。不要改其他文件。
最后总结改动、验证结果和疑问，列出未验证项。
TASK
)
octogent terminal create --name "核对安装说明" --tentacle-id install-docs \
  --workspace-mode worktree --agent-provider claude-code --effort standard \
  --initial-prompt "$octogent_brief"
```

初始任务现在由代理的 `SessionStart` 钩子触发投递；钩子是代理向 Octogent 报告开始、工具调用或回合结束的回调。若就绪信号迟迟不到，启动代理命令后 15 秒兜底投递；`UserPromptSubmit` 确认已接收。见过就绪钩子但投递后 10 秒还未确认时，仅重试一次，再等 10 秒仍无确认就显示 `initial prompt not acknowledged`。没有就绪钩子时不重试，以免把已经开始的任务发两遍。

出现这个提示先看终端和日志，处理登录、更新或信任提示；确认原任务没有开始，再用 `channel send` 重发任务。晚到的确认会清除提示；这段提示本身不是新的生命周期状态。

### 跟进进展：看状态，也看证据

- `octogent terminal list` 每行给出终端 ID、生命周期、已知的进程 ID（`pid=`）、代理（`agent=`）、模型（`model=`）、原因（`reason=`）和名称；未知或未记录的字段会省略。
- `running`：会话在运行；`stalled`：会话还活着，但超过 `OCTOGENT_TERMINAL_STALL_MS` 没有活动，默认 120000 毫秒。提交任务、工具调用和终端输出都算活动，输出按几秒一次节流计入；停滞可能是在等输入，不能据此认定进程死了。
- `awaiting-review`（待审阅）：工作树干净且有超出基线的未合并提交；`completed`（已完成）：工作树产出已合并，或共享工作区代理结束了一轮。两者都不是“测试一定通过”。新活动可使它们回到 `running`。
- `stopped`：会话被关闭；`exited`：进程已退出。重启后还可能见到 `stale`，表示旧记录无法接回会话。
- flow view 看整体分工和进展，canvas 打开具体终端读输出；进度连线已按实际活动显示，开着会话不代表仍在干活。Codex 对话页目前没有完整转录回放。

默认活动转录在 `~/.octogent/projects/<项目ID>/state/transcripts/<终端ID>.jsonl`；项目 ID 来自 `.octogent/project.json`。下面读取第一部分工人的最近事件；这里使用默认状态目录，若设置了状态路径覆盖变量，按实际配置定位。

```bash
octogent_project_id=$(node -p "JSON.parse(require('node:fs').readFileSync('.octogent/project.json', 'utf8')).projectId")
tail -n 40 "$HOME/.octogent/projects/$octogent_project_id/state/transcripts/first-worker.jsonl"
```

`session_start` 是会话开始，`state_change` 是代理状态变化，`tool_use` 是钩子上报的一次工具调用，`session_end` 是会话结束。它是活动记录，不是完整回答或工具输出；一轮长任务会出现多个 `tool_use`，不必反复出现 `processing`。需要排查钩子时，在启动服务前设置 `OCTOGENT_VERBOSE_LOGS=1`，在服务日志中查 `[Hook] Received hook`。

### 给运行中的工人追加消息

```bash
octogent channel send first-worker "请说明你核对了哪些命令；有疑问先告诉我。"
octogent channel list first-worker
```

- `send` 回显 delivered（已投递）或 queued（已排队）；工人忙时排队，空闲后自动投递。`list` 对应显示 `status=delivered` 或 `status=pending`。已投递只表示写入了终端，不等于任务已完成。
- 若另一终端代发，可加 `--from <发送方终端ID>`；省略时会使用当前环境的 `OCTOGENT_SESSION_ID`（若存在）。
- 带初始任务的工人默认在回合之间保持会话，可以多轮交谈。工作树已判 `completed` 且确认合并时会释放保活；`awaiting-review` 保持会话供审阅。
- `terminal stop` 立即结束会话；归档会释放保活，之后适用 `OCTOGENT_TERMINAL_IDLE_GRACE_MS`，默认五分钟。保留期归档也会释放，`OCTOGENT_TERMINAL_RETENTION_HOURS` 默认 72 小时，只覆盖符合条件的 `completed`、`stopped`、`exited` 记录，不自动归档待审阅记录。
- `OCTOGENT_TERMINAL_RELEASE_AFTER_TURN=1` 会恢复每轮结束释放保活的旧行为；需要连续交谈时不要设置它。
- 消息只在当前服务内存里，重启即丢失，代理会话也不能跨服务重启。重要决定和交接结论写到触手文件。详见[代理间消息传递](inter-agent-messaging.md)。

### 审阅、测试、合并和清理

待审阅是 Git 完成信号，审阅者仍要读总结、逐项检查任务要求、看差异并跑相关测试。在主检出目录审阅；下面假设基线是 `main`，终端是 `first-worker`。测试在工人的工作树中运行，才能测到它的改动。

```bash
git -C .octogent/worktrees/first-worker status --short
git -C .octogent/worktrees/first-worker log main..HEAD
git diff main..octogent/first-worker
# 以下门禁适用于 Octogent 仓库的 API 代码任务。
(
  cd .octogent/worktrees/first-worker
  pnpm install && pnpm --filter @octogent/api test && pnpm lint && pnpm build
)
```

有问题先发消息让工人修正，再审阅新增提交。全部通过后在主检出目录合并；若冲突，先解决并重新检查，不要继续删除工作树。合并后的组合结果也需运行相关门禁。

```bash
git merge --no-ff octogent/first-worker
# 合并与组合结果检查都通过后再清理。
octogent terminal stop first-worker
octogent terminal delete first-worker --with-worktree
```

- `delete --with-worktree` 现场检查相对主检出目录当前分支的未合并提交，并拒绝删除其他终端仍引用的工作树；不要用 `--force` 绕过未合并警告来“收尾”。删除父终端还会连带删除子终端，先审阅整条父子链。
- 想保留记录就用 `terminal archive <终端ID>`；运行中的记录不能归档，必要时先停止。归档隐藏记录、保留转录和总结，并可能立即回收已合并的工作树。
- `worktree gc --dry-run` 预览，`worktree gc` 回收已归档且已合并的工作树及分支：现场查 Git，未提交修改或 Git 确认未合并时保留；Git 无法回答才参考记录。多人共用的工作树须所有关联记录均符合条件。
- `terminal delete <终端ID>` 默认只删记录并保留工作树；`terminal prune` 只移除 `stale`、`stopped`、`exited` 记录，不清磁盘。需要自动回收时，先归档和 gc，再考虑移除记录。

**收尾铁律：未合并工作不应自动删除。** 归档回收与 gc 遵守这条规则，但当前批次清理有例外，不能把它当成全局保证：

- 没有持久触手文件夹的 octoboss 直属终端属于临时终端；它及其子终端的会话均已关闭，且顶层记录是 `completed`、`stopped`、`exited` 或 `stale` 时，下一次顶层派发会直接删除它们，并尝试删除工作树和分支，**没有现场合并检查**。
- 有产出的任务要挂到持久触手下；已有直属任务则先审阅、合并，再停止和派下一批。
- 持久触手下的结束记录走归档回收；任何仍开着会话的工人都不会被下一批清理，无论忙闲。

### 分批和并行派发

- 每条工作线一个触手，同一触手可有多个终端；多条 `terminal create` 命令返回后，工人会同时运行。各工人分清文件范围，代码任务使用工作树，协调者逐个审阅再合并。
- 父终端是负责分工和审阅的代理，子终端是它派出的工人；创建子终端时加 `--parent-terminal-id <父终端ID>`，仍要指定 `--tentacle-id`。每个父终端最多 9 个子终端。
- 服务默认最多 32 个活动终端会话；需要更大批次时在启动前设置 `OCTOGENT_MAX_TERMINAL_SESSIONS`，并考虑主机资源和账号额度。
- 用 `todo.md` 的复选框拆分任务，通过 deck 的单项求解或 swarm（多个工人协作的一批任务）启动；工作期间不要随意重排待办，审阅后再勾选完成。操作细节见[使用待办事项](working-with-todos.md)和[编排子代理](orchestrating-child-agents.md)。

### 试用中遇到的坑：现象 → 原因 → 处理

以下根据 2026-09-05 至 09-08 的 DEIMv2、DiveoDevOps 试用记录，区分当时问题和当前修复。

- **建了触手，工人却挂在大章鱼下面** → 创建终端没传 `--tentacle-id` → 每次显式传触手 ID，检查 CLI 的直属提示；当前提示已补上，归属规则没有改变。
- **在 Octogent 仓库运行 `npm install` 后依赖报错** → npm 不能按本仓库的 pnpm workspace 方式安装 → 在仓库根目录用 `pnpm install`；遗留锁文件和依赖清理按[安装指南](../getting-started/installation.md)。安装全局 CLI 的 `npm install -g .` 是另一步。
- **Claude 已提交，仍一直运行中或停滞** → 旧版在未忽略 `.claude/` 的仓库里，把托管钩子文件当成未完成改动 → 当前完成检测会忽略 `.claude/settings.json`，安装钩子时也把该文件加入仓库的 Git `info/exclude`。检查是否还有其他未提交文件；无需忽略整个 `.claude/`。
- **看不到工具调用，状态不更新** → 钩子可能没到服务 → 启动时开 `OCTOGENT_VERBOSE_LOGS=1`，看动作发生时是否有 `[Hook] Received hook`。Claude 钩子在代理工作目录的 `.claude/settings.json`，Codex 钩子在用户级 `$CODEX_HOME/hooks.json`（默认 `~/.codex/hooks.json`）；检查文件、登录和信任提示，勿把服务日志当成代理完整转录。
- **同一秒或紧挨着建两个工人，启动后一直沉默** → 旧版固定等四秒就粘贴任务，冷启动或更新时输入界面尚未就绪 → 当前改为 `SessionStart` 投递、15 秒兜底及一次有确认检查的重试。找 `reason=initial prompt not acknowledged` 和重试日志；先确认没有已开始的工作，再通过 channel 重发。
- **`channel list` 没有预期消息** → 试用中先查了列表、之后才发送；初始任务和代理回答也不是 channel 消息 → 先确认 `send` 确实成功，再查同一服务的列表；重启前的消息不会保留。
- **把 `stalled` 当成已死，重复派了同一任务** → 混淆“没活动”和“进程退出” → 查终端、活动转录和原因；当前工具调用与输出都刷新活动时间，长回合不再只靠新任务刷新。静默期间仍可能在等输入。
- **第一轮结束五分钟后会话消失，后续任务无人接** → 旧版每轮释放保活 → 当前带初始任务的工人默认跨回合保持会话；检查是否设了 `OCTOGENT_TERMINAL_RELEASE_AFTER_TURN=1`。需要结束时主动 `terminal stop` 或归档，别依赖旧超时。
- **重启时杀错进程，或服务又自动起来** → 工人的 `pid=` 不等于服务进程，服务也可能由父进程管理 → 先查服务的 PID、父 PID 和命令行，例如 `ps -o pid,ppid,args -p <服务PID>`，再对其父 PID 查一次。服务 PID 在项目全局状态目录的 `state/runtime.json`；若由 systemd 管理，按[用户服务指南](../reference/systemd.md)操作。先收尾工人，重启会断开会话；更新构建后也需重启后端才能用到后端修复。
- **一台机器能用 GPT-6，另一台不能** → 账号开放的模型列表不同 → 优先用 `--effort` 让本地模型缓存决定回退，检查 `model=`；显式 `--model` 不会走档位回退，确认该账号可用再指定。

### 继续查阅

- [CLI 参考](../reference/cli.md)：参数、环境变量、模型覆盖配置。
- [故障排查](../reference/troubleshooting.md)：初始任务、停滞、会话与消息问题。
- [文件系统布局](../reference/filesystem-layout.md)与 [API 参考](../reference/api.md)：找持久化数据、接入自己的工具。
- [使用待办事项](working-with-todos.md)、[编排子代理](orchestrating-child-agents.md)、[代理间消息传递](inter-agent-messaging.md)：扩大到多工人工作流。

### 完整的无浏览器协调者示例

以下供人在 Bash 中逐段执行，也供 AI 协调者逐段调用 shell：先读审阅输出，再决定是否执行合并段。使用已有 `README.md`、提交身份已配置的干净 Git 项目，当前项目尚未启动 Octogent，且 `claude`、`codex` 都已登录。示例使用默认全局状态目录，服务环境没有状态目录或 API 地址覆盖配置。不要在正在工作的项目实例旁再启动一份。

第一段：保存日志、等待服务可用、建一个触手并派两个范围互不重叠的小文档任务。变量是本示例的 Bash 变量，后续各段使用同一个 shell。

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
test -f README.md
test -z "$(git status --porcelain)"
octogent_base=$(git branch --show-current)
test -n "$octogent_base"
octogent init
git add .gitignore
git diff --cached --quiet || git commit -m "chore: ignore Octogent workspace"
octogent_log=$(mktemp)
nohup env OCTOGENT_NO_OPEN=1 OCTOGENT_VERBOSE_LOGS=1 octogent >"$octogent_log" 2>&1 < /dev/null &
octogent_server_pid=$!
printf 'Service PID: %s; log: %s\n' "$octogent_server_pid" "$octogent_log"
octogent_project_id=$(node -p "JSON.parse(require('node:fs').readFileSync('.octogent/project.json', 'utf8')).projectId")
octogent_state="$HOME/.octogent/projects/$octogent_project_id/state"
octogent_ready=0
for octogent_attempt in {1..30}; do
  if test -f "$octogent_state/runtime.json"; then
    octogent_api=$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).apiBaseUrl" "$octogent_state/runtime.json")
    octogent_metadata_pid=$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).pid" "$octogent_state/runtime.json")
    if test "$octogent_metadata_pid" = "$octogent_server_pid" && curl --fail --silent --show-error "$octogent_api/api/health"; then
      octogent_ready=1
      break
    fi
  fi
  sleep 1
done
if test "$octogent_ready" != 1; then
  cat "$octogent_log"
  exit 1
fi
octogent terminal list
octogent_batch="docs-batch-$(date +%s)-$$"
octogent_claude="$octogent_batch-claude"
octogent_codex="$octogent_batch-codex"
octogent tentacle create "$octogent_batch" --description "核对首次运行说明和本地目录忽略规则"
octogent terminal create --terminal-id "$octogent_claude" --name "说明文档工人" \
  --tentacle-id "$octogent_batch" --workspace-mode worktree \
  --agent-provider claude-code --effort standard \
  --initial-prompt "只修改 README.md，依据仓库实际配置澄清一处首次运行说明，方便新人启动。不要发明命令，不改代码。核对涉及的命令，运行 git diff --check。在自己的分支提交，不要 push。最后总结改动、验证和疑问。"
octogent terminal create --terminal-id "$octogent_codex" --name "忽略规则说明工人" \
  --tentacle-id "$octogent_batch" --workspace-mode worktree \
  --agent-provider codex --effort light \
  --initial-prompt "只修改 .gitignore：在现有 .octogent 忽略规则旁补一句注释，说明它保存本地代理配置和工作树，不应提交这些运行文件。保持所有忽略规则语义不变。运行 git check-ignore .octogent/project.json 和 git diff --check 验证。在自己的分支提交，不要 push。最后总结改动、验证和疑问。"
```

第二段：发一条补充要求，轮询两名工人。最多观察十分钟；超时后保留会话，查日志和转录再决定续作。队列投递状态不能替代对结果的审阅。

```bash
octogent terminal list
octogent channel send "$octogent_claude" "补充要求：请在提交说明中列出核对过的命令及依据文件，方便无浏览器审阅。"
octogent channel list "$octogent_claude"
octogent_done=0
for octogent_attempt in {1..120}; do
  octogent_snapshot=$(octogent terminal list)
  printf '%s\n' "$octogent_snapshot"
  octogent_done=0
  for octogent_worker in "$octogent_claude" "$octogent_codex"; do
    octogent_lifecycle=$(awk -v id="$octogent_worker" '$1 == id {print $2}' <<< "$octogent_snapshot")
    case "$octogent_lifecycle" in
      awaiting-review|completed) octogent_done=$((octogent_done + 1)) ;;
    esac
  done
  if test "$octogent_done" = 2; then break; fi
  sleep 5
done
octogent channel list "$octogent_claude"
for octogent_worker in "$octogent_claude" "$octogent_codex"; do
  tail -n 20 "$octogent_state/transcripts/$octogent_worker.jsonl"
done
test "$octogent_done" = 2
```

第三段：从主检出目录检查提交和全部差异，逐项对照任务书，也检查补充要求是否满足。这两个任务只改说明文字，下面是相应门禁；派发代码任务时在各工作树安装依赖并运行项目测试，在本仓库可用前文列出的 API 测试、lint 和 build。

```bash
for octogent_worker in "$octogent_claude" "$octogent_codex"; do
  git -C ".octogent/worktrees/$octogent_worker" status --short
  test -z "$(git -C ".octogent/worktrees/$octogent_worker" status --porcelain)"
  git -C ".octogent/worktrees/$octogent_worker" log "$octogent_base..HEAD"
  git diff "$octogent_base..octogent/$octogent_worker"
  git -C ".octogent/worktrees/$octogent_worker" diff --check "$octogent_base..HEAD"
done
git -C ".octogent/worktrees/$octogent_codex" check-ignore .octogent/project.json
```

最后一段只在审阅通过后执行；有问题就先 `channel send` 让对应工人改，再重复观察和审阅。合并冲突或检查失败会停止后续命令，工作树留着供处理。此处结束工人并清理产出工作树，Octogent 服务继续运行，日志仍在第一段打印的位置。

```bash
test "$(git branch --show-current)" = "$octogent_base"
test -z "$(git status --porcelain)"
octogent_review_base=$(git rev-parse HEAD)
git merge --no-ff "octogent/$octogent_claude" -m "docs: merge reviewed startup clarification"
git merge --no-ff "octogent/$octogent_codex" -m "docs: merge reviewed ignore-rule explanation"
git diff --check "$octogent_review_base..HEAD"
git check-ignore .octogent/project.json
for octogent_worker in "$octogent_claude" "$octogent_codex"; do
  git merge-base --is-ancestor "octogent/$octogent_worker" HEAD
  octogent terminal stop "$octogent_worker"
  octogent terminal delete "$octogent_worker" --with-worktree
done
octogent worktree gc --dry-run
octogent terminal list
```
