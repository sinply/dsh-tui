# Template: readme-pair (dsh-tui)

Frame every dsh-tui documentation change as one root bilingual pair: `README.md` and `README.zh.md`, aligned line for line. The existing pair at the repository root is the worked example — keep its section names and order unless the change genuinely relocates content.

## English side skeleton

```markdown
# dsh-tui

**Languages:** English · [简体中文（中文文档）](README.zh.md)

> ⚠️ third-party notice — keep the existing disclaimer wording.

**dsh-tui** is an interactive full-screen terminal UI for DeepSeek Harness
agents: two to four sentences stating what the project DOES — transcript,
agent driving, dialogs — never its internal identity.

## Features

- outcome-oriented bullets; bold the UI identity labels (**You**,
  **❯ Assistant**, **Context**)

## Install & use

### As a dsh profile bundle (recommended)

the verified `dsh plugin` install path and the boot command

### As a dependency

`npm install` plus the profile patch rows

### Requirements

Node.js ≥ 22, interactive TTY, peer packages

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| …   | …      |

## Commands

the `/command` reference

## Configuration

accepted YAML fields with defaults, consistent with `src/config.ts`

## Build from source

the `pnpm run build` flow

## Repository layout

the source map for `src/`, `lib/`, `cordis.patch.yml`, `tests-pre-migration/`

## Project skills

the ten repo-local skills under `.agents/skills/` and their cwd-scoped discovery rule

## Migrations vs. the official removal

historical migration facts only — the one explicitly historical section

## License

BSD-3-Clause — see [LICENSE](LICENSE)
```

## Chinese side skeleton

```markdown
# dsh-tui

**语言：** 简体中文 · [English](README.md)

> ⚠️ 第三方独立维护说明 —— 与英文侧同一段声明对应翻译。

**dsh-tui** 是 DeepSeek Harness 智能体的交互式全屏终端界面：与英文侧逐句
对应……

## 功能
## 安装与使用
### 作为 dsh profile bundle（推荐）
### 作为依赖
### 环境要求
## 快捷键
## 命令
## 配置
## 从源码构建
## 仓库结构
## 项目技能
## 相对官方移除时的迁移
## 许可证
```

## Alignment rules

- Match headings, blank lines, paragraphs, list items, tables, code fences, link targets, and total physical line count one to one.
- Keep the language-switcher line directly under the H1 on both sides; the English side targets `.md`, the Chinese side targets the `.zh.md` sibling and falls back to `.md` when no counterpart exists.
- Keep code blocks and tables byte-identical across the pair; translate naturally within the line, never hard-wrap.
- Keep the standing section order stable; change section names only when content moves, and repair every inbound link in the same change.
- Add no YAML frontmatter, no `-----` separators, no `<details>` folds, and no Dev Note — the pair's format is the existing pair's format.