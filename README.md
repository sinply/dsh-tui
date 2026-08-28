# dsh-tui

**Languages:** English · [简体中文（中文文档）](README.zh.md)

> ⚠️ **Independent third-party maintenance, not an official project.** This
> package restores, migrates, and extends the interactive terminal front door
> (`packages/ui/tui`) that DeepSeek removed from the public
> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) commit
> history before its release (commit `10bb9cbf4a`, "cleanup: remove TUI package
> and legacy dsh entrypoints"). It is derived from that public history and is
> **not affiliated with, endorsed by, or representative of DeepSeek**. Use of
> product names and marks is nominative only.

**dsh-tui** is an interactive full-screen terminal UI for DeepSeek Harness
agents: it renders the durable session transcript, drives one configured
agent, and provides keyboard-driven dialogs — sent messages, assistant stream,
reasoning blocks, tool cards, injected-context cards, model selection, and
session resume.

## Features

- Full-screen terminal chat over a durable session transcript
- Distinct visual separation between **You** (blue), **❯ Assistant** (teal),
  injected **Context** cards, and tool cards, with full-width separators
- Claude-Code-style startup banner: a five-row block-letter `DEEPSEEK` logo
  painted in the DeepSeek brand gradient, revealed row by row
- Default **VSCode Dark+–inspired 24-bit palette** (blue `#569CD6`, teal
  `#4EC9B0`, cold-gray dim `#6E7681`, semantic success/warning/error), with a
  fallback to the adaptive ANSI theme
- Streaming assistant output with per-step timing footers
- `Ctrl+O` cycles tool-card visibility (collapsed → expanded → hidden),
  `Ctrl+R` toggles reasoning blocks
- `/model` selector, `/resume` picker, `/skill:<name>` invocation, `@file`
  completion, `/status` and `/details` diagnostics
- Installs as a dsh profile bundle via the official `dsh plugin` mechanism
  (`dsh.profile.bundles` layer with `dsh.bundle.patch`)

## Install & use

The package ships a built `lib/` and a `cordis.patch.yml` bundle overlay.

### As a dsh profile bundle (recommended)

```bash
# from this repository
pnpm pack --pack-destination /tmp
# create a profile, install the tarball as a plugin
dsh plugin --profile tui add /tmp/dsh-tui-0.1.0.tgz
# boot into the interactive TUI
dsh --profile tui
```

The bundle patch also configures a `main` agent (`sessionId: main`,
`provider: deepseek-official`, `model: deepseek-v4-pro`, cwd = invoking
directory) and the DeepSeek adapter on top of `@deepseek-ai/dsh-base`. Rows
whose ids no longer exist in a future base are skipped with a Loader warning
by design.

### As a dependency

```bash
npm install dsh-tui
# or from a tarball
npm install dsh-tui-0.1.0.tgz
```

Then reference it in a dsh profile patch:

```yaml
- insert:
    - id: tui-prompt
      name: 'dsh-tui/prompt'
    - id: ui-tui
      name: 'dsh-tui'
```

### Requirements

- Node.js ≥ 22 and an interactive TTY (the plugin refuses pipes: *"both
  stdin and stdout must be TTYs"*)
- Peer packages installed by the hosting dsh installation (agents, sessions,
  commands, user-questions, tools, llm, system-prompt, token-meter)

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Enter | Send |
| Shift/Alt+Enter | Newline |
| Up/Down | Prompt history |
| Esc | Cancel the running turn |
| Ctrl+O | Cycle tool cards: collapsed → expanded → hidden |
| Ctrl+R | Toggle reasoning blocks |
| Ctrl+L | Redraw |
| Ctrl+C | Cancel while running; clear input / exit while idle |
| Ctrl+D | Exit |

## Commands

`/model [provider/]model` · `/resume` · `/skill:<name> [instructions]` ·
`/details [collapsed|expanded|hidden] [reasoning [on|off]]` · `/status` ·
`/palette` · `/help` · `/exit` `/quit`

## Configuration

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
      truecolor: false   # banner brand gradient (auto-detects COLORTERM)
      inputPrompt: '${symbol} ${indicator}'
```

## Build from source

```bash
pnpm install          # installs deps and the peer packages for typecheck
pnpm run build        # tsc (lib/types) + tsdown (lib/*.js)
```

## Repository layout

```
src/                     migrated source (current DeepSeek Harness APIs)
lib/                     built bundles (included for drop-in use)
cordis.patch.yml         dsh bundle patch (profile layer)
legacy-launcher/         the upstream launcher glue (reference only, not built)
tests-pre-migration/     upstream test suite archive, not yet migrated (not built)
```

## Migrations vs. the official removal

The upstream `packages/ui/tui` predates several DeepSeek Harness API changes;
this repository migrates it, including:

- `AgentLlmTarget`/`installAgentLlmTarget` → `ModelSelection`/
  `installModelSelection` (`dsh-agent`)
- `dsh-user-interaction` → `dsh-user-questions` (`UserQuestionService`),
  `dsh-compact` → `dsh-compaction`, `SkillService` → `SkillRegistry`,
  `SessionReferenceService` → `SessionReferenceResolver`,
  `SessionQueryService` → `SessionQueryEngine`, `cordis` →
  `@deepseek-ai/cordis`
- session event drift: `turn/end` reason shapes, `compact/*` →
  `compaction/*`, payload-style agent events, automatic `@` reference
  resolution via `agent/pre-step`
- `@earendil-works/pi-tui` upstream patch surfaced as the `frame`/`prompt`
  editor options and `setPrompt` (restored in the migrated `HintEditor`)
- new banner art, VSCode-inspired theme, transcript separators

## License

BSD-3-Clause — see [LICENSE](LICENSE). The original source is derived from the
public DeepSeek Harness commit history; this repository is an independent
re-packaging and carries no official status.