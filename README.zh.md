# dsh-tui

**语言：** 简体中文 · [English](README.md)

> ⚠️ **第三方独立维护，并非官方项目。** 本包从公开的
> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
> 提交历史中恢复了其在正式发布前移除的交互式终端前门（`packages/ui/tui`，
> 对应提交 `10bb9cbf4a`，信息为 "cleanup: remove TUI package and legacy dsh
> entrypoints"），并进行了 API 迁移与改进。本仓库基于该公开历史，
> **与 DeepSeek 无关联、未经其认可，也不代表 DeepSeek 的任何立场**；文中出现的产品名称与商标仅作提名性引用。

**dsh-tui** 是 DeepSeek Harness 智能体的交互式全屏终端界面：渲染持久化的会话对话记录、驱动一个配置好的智能体，并提供键盘驱动的各类对话框——发送消息、助手流式输出、推理块、工具卡片、注入上下文卡片、模型选择与会话恢复。

![dsh-tui 启动横幅：DeepSeek Harness 鲸鱼与介绍、提示](assets/startup-banner.png)

## 功能

TUI 呈现完整会话：对话记录、工具卡片、推理块与模型切换。

- 基于持久化会话记录的全屏终端聊天
- **You**（蓝）/ **❯ Assistant**（青绿）/ 注入的 **Context** 卡片 / 工具卡片之间有明确区分，并带全宽分隔线
- 官方 DeepSeek 小鲸鱼启动横幅：由官方 24×24 图标光栅化，以品牌蓝 `#4D6BFE` 绘制，逐行揭示，鲸鱼右侧带 DeepSeek Harness 介绍与起始提示
- 默认 **VSCode Dark+ 风格 24-bit 配色**（蓝 `#569CD6`、青绿 `#4EC9B0`、冷灰 `#6E7681`、语义化的成功/警告/错误色），并保留自适应 ANSI 主题作为回退
- 助手流式输出带按步骤的耗时统计
- `Ctrl+O` 循环工具卡片可见性（折叠 → 展开 → 隐藏），`Ctrl+R` 切换推理块
- `/model` 选择器、`/resume` 选择器、`/skill:<名>` 调用、`@文件` 补全、`/status` 与 `/details` 诊断
- 通过官方 `dsh plugin` 机制以 profile bundle 方式安装（`dsh.profile.bundles` 层 + `dsh.bundle.patch`）

## 安装与使用

本包随附构建产物 `lib/` 与 bundle 覆盖文件 `cordis.patch.yml`。

### 作为 dsh profile bundle（推荐）

```bash
# from this repository
pnpm pack --pack-destination /tmp
# create a profile, install the tarball as a plugin
dsh plugin --profile tui add /tmp/dsh-tui-0.1.4.tgz
# boot into the interactive TUI
dsh --profile tui
```

bundle patch 还会在 `@deepseek-ai/dsh-base` 之上配置一个 `main` 智能体（`sessionId: main`、`provider: deepseek-official`、`model: deepseek-v4-pro`，cwd 为启动目录）；若未来 base 中不再存在对应行 id，Loader 会按设计给出跳过警告。

### 作为依赖

```bash
npm install dsh-tui
# or from a tarball
npm install dsh-tui-0.1.4.tgz
```

随后在 dsh profile patch 中引用：

```yaml
- insert:
    - id: tui-prompt
      name: 'dsh-tui/prompt'
    - id: ui-tui
      name: 'dsh-tui'
```

### 环境要求

- Node.js ≥ 22，且 stdin/stdout 必须是交互式 TTY（插件会拒绝管道模式：*"both stdin and stdout must be TTYs"*）
- 由宿主 dsh 安装提供的 peer 依赖（agents、sessions、commands、user-questions、tools、llm、system-prompt、token-meter）

## 快捷键

多数快捷键在编辑器与对话框中通用；Esc 取消进行中的回合。

| 按键 | 功能 |
|------|------|
| Enter | 发送 |
| Shift/Alt+Enter | 换行 |
| Up/Down | 输入历史 |
| Esc | 取消进行中的回合 |
| Ctrl+O | 循环工具卡片：折叠 → 展开 → 隐藏 |
| Ctrl+R | 切换推理块 |
| Ctrl+L | 重绘 |
| Ctrl+C | 运行中取消；空闲时清空输入 / 退出 |
| Ctrl+D | 退出 |

## 命令

在提示符输入命令，即可用键盘驱动 TUI。

`/model [provider/]model` · `/resume` · `/skill:<名> [指令]` · `/details [collapsed|expanded|hidden] [reasoning [on|off]]` · `/status` · `/palette` · `/help` · `/exit` `/quit`

## 配置

`ui-tui` 行接受以下字段；字段缺省时使用默认值。

```yaml
- id: ui-tui
  name: 'dsh-tui'
  config:
    title: 'My Agent'
    showReasoning: true
    maxToolOutputLines: 6
    theme:
      color: true        # master color switch; false = plain text
      vscode: true       # VSCode Dark+–inspired 24-bit palette (default)
      truecolor: false   # 24-bit output; brand art uses the official DeepSeek blue
      inputPrompt: '${symbol} ${indicator}'
```

## 从源码构建

用 pnpm 构建；产物输出到 `lib/`。

```bash
pnpm install          # installs deps and the peer packages for typecheck
pnpm run build        # tsc (lib/types) + tsdown (lib/*.js)
```

`pnpm-workspace.yaml` 将 `@deepseek-ai/dsh-*` peer 包固定到精确版本 `0.1.1-rc.2`——npm 上只发布预发布版，裸 `>=0.0.1` 范围不匹配。

## 仓库结构

每个顶层条目只保有一种事实。

```
src/                     已迁移源码（当前 DeepSeek Harness API）
lib/                     构建产物（随包提供，可即取即用）
cordis.patch.yml         dsh bundle patch（profile 层）
legacy-launcher/         上游启动胶水（仅作参考，不参与构建）
tests-pre-migration/     上游测试套件存档，尚未迁移（不参与构建）
.agents/skills/           项目级技能（供在本仓库内工作的 dsh 会话使用）
```

## 项目技能

`dsh-tui/.agents/skills/` 下携带十个项目级技能，由 deepseek-harness 仓库自身的技能集（master @ `cd5ef81481`，2026）针对本项目改造而来——仅限仓库本地，不打进 npm 包。

cwd 位于本仓库内的 dsh 会话会自动发现它们（项目 `agents/skills` 根），任务匹配描述时按需加载；其他项目中不可见。

| 技能 | 用途 |
|---|---|
| `dsh-doc` | README 双语对文档标准与逐行对齐 |
| `dsh-prose-standard` | 契约保全的注释、文档、提示词与可见文案 |
| `dsh-trim-cot-leakage` | 清除推理转写泄漏的文案 |
| `dsh-code-review` | 对照本仓库实际约定的 PR 审查 |
| `dsh-pre-push-checks` | 推送前最小本地校验（`pnpm typecheck`、`pnpm build`） |
| `dsh-merging-stacked-prs` | GitHub 官方 PR stack 落地流程 |
| `dsh-find-simplifications` | 证据导向的简化候选（issue/PR/TODO） |
| `dsh-archive-agent-notes` | 预备——仅当本仓库引入 Agent Note 约定后适用 |
| `dsh-translate-docs` | 扩展双语 README 工作流——仅手动调用（`/skill:dsh-translate-docs`） |
| `record-browser-gif` | UI 演示 GIF：终端会话（主场景）与浏览器/Web UI |

改造后的正文已清除所有 deepseek-harness 专属命令与相对链接；整套技能同置一处，技能间的交叉引用保持可解析。

## 相对官方移除时的迁移

上游 `packages/ui/tui` 早于 DeepSeek Harness 的多项 API 变更，本仓库对其进行了迁移，包括：

- `AgentLlmTarget`/`installAgentLlmTarget` → `ModelSelection`/`installModelSelection`（`dsh-agent`）
- `dsh-user-interaction` → `dsh-user-questions`（`UserQuestionService`）、`dsh-compact` → `dsh-compaction`、`SkillService` → `SkillRegistry`、`SessionReferenceService` → `SessionReferenceResolver`、`SessionQueryService` → `SessionQueryEngine`、`cordis` → `@deepseek-ai/cordis`
- 会话事件演进：`turn/end` 结束原因形态、`compact/*` → `compaction/*`、payload 风格的 agent 事件、经 `agent/pre-step` 自动解析 `@` 引用
- `@earendil-works/pi-tui` 上游补丁对应的 `frame`/`prompt` 编辑器选项与 `setPrompt`（已并入迁移后的 `HintEditor`）
- 官方 DeepSeek 小鲸鱼启动横幅（由官方 24×24 图标光栅化）、VSCode 风格主题、对话分隔线

## 许可证

BSD-3-Clause —— 见 [LICENSE](LICENSE)。原始源码派生自公开的 DeepSeek Harness 提交历史；本仓库为独立再打包，不具任何官方身份。