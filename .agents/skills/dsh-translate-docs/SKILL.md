---
name: dsh-translate-docs
description: 'This skill should be used when the user asks to translate the README, update the Chinese README, or work on bilingual docs — the manual dsh-tui README-pair workflow: generated briefings, delegated prose translation, whole-document translation, and scoped pairing verification.'
disable-model-invocation: true
user-invocable: true
---

> 来源：deepseek-harness 仓库 .agents/skills/dsh-translate-docs（master @ cd5ef81481），2026 年按 dsh-tui 项目针对性改造。

# Translating dsh-tui docs

## Invocation boundary

Run this extended workflow only when the user explicitly invokes `dsh-translate-docs` by name. Never select or load it for ordinary documentation work, from another skill, or from an inferred translation need; routine one-off translation of short passages is a single one-shot, one-pass edit, not this workflow.

## What this skill is

**This skill is guidance, not a translation memory.** It is the workflow map for keeping the dsh-tui README pair — `README.md ↔ README.zh.md` — consistent and natural in both languages. Both languages carry equal authority: a change is authored in either side, and that side is the source for that update. The translator's phrasing judgment is free within the rules below; terminology is not — a term's rendering is decided by precedent, never invented inline.

## Triage by change type — this decides everything else

- **Update** (pair exists, one side edited): follow [the update path](#the-update-path-briefing-driven). It is briefing-driven and deliberately cheap: no corpus re-reading, no git archaeology, smallest counterpart edit. Never re-translate a whole document to apply an update — a minimal update preserves the reviewed phrasing of everything that didn't change; a re-translation throws that review away.
- **New pair** (no counterpart yet): follow [the whole-document path](#the-whole-document-path-new-pairs).
- **Deleted or renamed doc**: rename or delete the counterpart to match; never leave the pair with a lone side.

## The update path (briefing-driven)

1. **Generate the briefing.** Derive the change with `git diff` / `git status` on the README pair, then map it at the narrowest safely aligned granularity — changed Markdown units (paragraph, table row, list item, heading), then whole heading sections, then the whole document. Record per changed unit: the last-confirmed source, the current source, the current counterpart text, the terminology the change touches, first-occurrence movement notes, and a digest of the binding update rules below.
2. **Mechanical-only diff? Splice it.** When every change lies inside code fences the pair shares byte-identically, splice the edited fences into the counterpart directly and structure-validate the result (heading depths, fence balance, table row/column counts) before writing — no subagent, no hand-editing.
3. **Prose diff? Delegate to a subagent, passing the briefing.** The briefing is the translator's whole working set: the subagent does not re-read the README pair from scratch and does not re-derive the diff. Escalate to the whole-document path's sources of truth only when the briefing leaves a specific decision genuinely unanswerable — an unlisted term with no precedent in the README pair, or a whole-document briefing (both sides changed, or neither units nor sections align), which means reconciling by hand under this skill's translation rules.
4. **Apply the smallest edit that covers the diff.** Preserve the reviewed phrasing of everything the diff does not touch, then verify the changed hunks clause by clause against the source: nothing added, nothing dropped, terminology per the README pair's habitual usage, code spans verbatim.
5. **Verify scoped.** Re-run the pairing checklist over the touched units only: heading depth alignment, fence blocks, table row and column counts, list kinds and ordered-list starts, link locales and semantic targets, propositions both ways. A corpus-wide re-check belongs at PR level, not inside each update task.

## The whole-document path (new pairs)

When a side must be written from scratch, the orchestrating agent does not translate: spawn a subagent for the translation work. The translator reads the sources of truth below first, then translates the whole file into the other language — section by section for long documents, locking each section's structure to the source as it proceeds rather than fixing structure at the end.

### Sources of truth (read, don't re-summarize)

- **The existing README pair itself** — the pairing contract: both sides' structures, the language-switcher lines (`**Languages:** English · [简体中文（中文文档）](README.zh.md)` and `**语言：** 简体中文 · [English](README.md)`), and the scope — the pair is the entire bilingual corpus; nothing else in the repository is translation work.
- **The habitual terminology maintained in the README pair** — there is no separate terminology file; the glossary lives in how the two sides render recurring terms today (`agent` → `智能体`, `session` → `会话`, `tool card` → `工具卡片`, `reasoning block` → `推理块`, `profile bundle` → `profile bundle`). Load the existing renderings BEFORE translating, not when a term feels uncertain; the terms that go unnoticed are the ones that drift.
- **The translation rules in this skill** — faithfulness, structure preservation, terminology discipline, typography. They are binding for every agent-authored translation.
- **[dsh-prose-standard](../dsh-prose-standard/SKILL.md)** — required prose coverage and editorial judgment. Apply it to both sides without adding or dropping source propositions.

### Translate

- **Pass 1 — write, don't transpose.** Read a semantic unit, then restate it as a native technical author in the register of the existing counterpart — the README pair's own prose is the register sample. Preserve the required frame without forcing sentence-by-sentence correspondence.
- **Pass 2 — verify against the source, clause by clause.** Fidelity is checked here, not written in: confirm nothing was added or dropped, every term follows the pair's habitual usage, and each code span survived verbatim. Fix by rewriting the sentence natively, not by patching words into it.
- **Read the completed counterpart alone.** After the source comparison, read the translated file without the source beside it and rewrite phrasing whose awkwardness only becomes visible in isolation.
- Write only the final text to the file, never drafts or notes.
- Every term renders exactly as the README pair renders it today. For a Chinese target, use the Chinese side's rendering; an unlisted term needs a citable Chinese OSS/vendor precedent or stays English under 「待定术语」. For an English target, use the established English technical term; preserve an ambiguous source term with a short gloss and list it as pending. Never invent a rendering inline.
- Code blocks are byte-identical across the pair, comments included. Repository-relative document links keep the same semantic target and exact query/fragment suffix: links between the pair use `.md` on the English side and `.zh.md` on the Chinese side, and the language switcher is the only cross-locale exception.
- Verify in Pass 2: list and table order, noncanonical list numbering, inline code, emphasis, meaning, terminology, and tone.

## Find the work

- The work list is the pair itself: `git status` / `git diff` on `README.md` and `README.zh.md` shows which side changed. A changed side needs its counterpart updated in the same change.
- dsh-tui has no pairing manifest or consistency-recording script: the manual pairing verification above is the only gate, and it is run by the translator, not by a tool.

## Finish the pair

1. **Switcher**: `**Languages:** English · [简体中文（中文文档）](README.zh.md)` after the English file's H1, `**语言：** 简体中文 · [English](README.md)` after the Chinese file's H1 — the existing pair already has both; add them if the pair is new.
2. **Consistency record**: no script records blob hashes in dsh-tui. The reviewer-visible statement "these two say the same thing" is the diff itself plus the scoped verification that produced it; never claim verification that was not actually run.
3. **No manifest entry**: dsh-tui has no translation-pairing manifest, so there is nothing to register.
4. **Before the PR**: for README-only changes, the scoped pairing verification above is the gate. If the change also touches code, `pnpm typecheck` and `pnpm build` apply at PR level per [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md), not inside each translation task.
5. **Keep the PR reviewable**: state which side is new versus minimally updated and list 「待定术语」 prominently.

## How to respond to translation review

Follow the [code-review reporting guidance](../dsh-code-review/SKILL.md#reporting-findings): evaluate each comment on its merits. For terminology comments, remember the terminology lives in the README pair's habitual usage — apply a reviewer's rendering decision to that usage across the pair, not only to one file.