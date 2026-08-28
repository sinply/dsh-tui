---
name: dsh-archive-agent-notes
description: This skill should be used when adding, auditing, pruning, archiving, or reviewing Agent Notes in the dsh-tui project. It applies only once the dsh-tui project adopts an Agent Note convention（当前未启用）; when active, it classifies notes by future decision value, applies frozen archival to completed decisions, and never edits archived notes.
---

# Archive dsh-tui Agent Notes（预备技能）

> 来源：deepseek-harness 仓库 .agents/skills/dsh-archive-agent-notes（master @ cd5ef81481），2026 年按 dsh-tui 项目针对性改造。

> **预备技能（当前未启用）**：dsh-tui 目前没有 `.agents/notes` 机制。本技能仅在项目未来引入 Agent Note 约定（`.agents/notes/<lifecycle>/<kind>/yyyy-mm-dd-topic.md`，`<lifecycle>` 为 implemented / proposed / rejected，`<kind>` 为自定类别，文件名取日期加主题）后适用。在此之前：不调用本技能，也不要在 dsh-tui 中创建或维护任何 Agent Note 目录与文件。

## Universal archival principles

Reduce the active decision corpus without erasing history that can still guide work. Judge every note semantically; word count and age are discovery aids, never archive criteria.

Classify each note by future decision value:

- **Implemented — keep active:** retain when rationale, alternatives, negative guarantees, ownership boundaries, security rules, or reintroduction conditions are likely to guide a future change. Length does not matter.
- **Implemented — archive:** archive when the decision is complete and the body is unlikely to guide future work, such as one-off UI chrome, a narrow adapter, a minor closed bug, superseded implementation detail, or process history whose current behavior is obvious elsewhere.
- **Proposed — never archive:** keep a live proposal active; if it is no longer worth pursuing, reject it with an honest reason.
- **Rejected — keep only as a guardrail:** retain a rejection only when the losing proposal remains a tempting, meaningful mistake and the note explains why it loses.
- **Rejected — delete:** delete when the rejected idea is obsolete, superseded, no longer plausible, or unlikely to prevent re-litigation. Repair or delete inbound links.

## Check supersession when adding a note

Every new Agent Note triggers a scoped audit of active notes covering the same decision, mechanism, or rejected alternative. Classify each full or partial supersession while writing the new note: archive qualifying completed notes in the same change, retain and cross-link partial supersessions or independently useful rationale, reject obsolete proposals, and delete rejected notes that no longer prevent a plausible mistake. When the new note absorbs every unique proposition, consolidate; do not defer a known match to a later corpus audit.

## Archive and freeze

1. Move the completed note into the frozen archive area, organized by kind.
2. Make no body edits. If the convention stamps dates, insert only `Archived: YYYY-MM-DD` with the archival date.
3. Search active notes for inbound links; redirect them to current authority, retarget them to the archived note only when the historical snapshot is intentionally cited, or delete them. Never verify or repair links inside the archived note.
4. After archival, never edit, move, translate, reformat, or delete the note. Archived notes remain valid inbound-link targets but are historical snapshots, not authority for current behavior.

## Manage by kind

Maintain a small, stable set of `<kind>` categories across the convention. Classify analogous notes under one principle, use best judgment for close cases, and record genuinely borderline decisions for the handoff. Never archive toward a quota.

## Validate and report

Before merging, run `pnpm typecheck`, `pnpm build`, and `git diff --check`; select any additional evidence through [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md).

Report active implemented notes kept, implemented notes archived, rejected notes kept/deleted, proposed notes rejected if any, and every genuinely borderline case with its word count and chosen outcome.