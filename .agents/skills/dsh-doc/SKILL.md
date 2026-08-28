---
name: dsh-doc
description: Create, update, structure, review, or audit dsh-tui Markdown documentation and the bilingual README pair (README.md / README.zh.md) using audience-first hierarchy, Summary and Table of Contents, user-to-developer progression, line-aligned bilingual pages, and single fact ownership. Use for write docs, update README, bilingual README changes, or document the project tasks.
---

# dsh-tui documentation

> 来源：deepseek-harness 仓库 .agents/skills/dsh-doc（master @ cd5ef81481），2026 年按 dsh-tui 项目针对性改造。

## Summary

Keep dsh-tui readable and exact for newcomers, agents, and maintainers through one root documentation surface: the bilingual README pair `README.md` and `README.zh.md`. Apply an audience-first hierarchy — a short front door, `Summary` and `Table of Contents` once the page grows long enough to need navigation, and a user-to-developer progression — with every fact owned by exactly one place: source, tests, and README each keep their own kind of truth. Treat the existing dsh-tui README pair as the reference example of the format.

## Table of Contents

- [Workflow](#workflow)
- [Fact-check procedure: test, do not assume](#fact-check-procedure-test-do-not-assume)
- [Documentation scope and template](#documentation-scope-and-template)
- [Voice rules](#voice-rules)
- [Quality criteria](#quality-criteria)
- [Audit the documentation](#audit-the-documentation)
- [Detailed references](#detailed-references)
- [Validation](#validation)
- [Dev Note](#dev-note)

## Workflow

Follow this sequence for each requested scope. Keep the common reader path brief, but do not delete failures, ownership, limitations, or other required contracts merely to reduce words.

1. Read the current README pair (`README.md`, `README.zh.md`), the source and tests behind each claim, and `package.json` for scripts, peer dependencies, and the `dsh.bundle.patch` declaration. dsh-tui has no `AGENTS.md` and no `docs/` tree; this skill is the documentation standard.
2. Classify the document job and reader: product quick start, user task guide, configuration reference, or migration note.
3. Define the reader's starting state, observable outcome, likely failure, recovery path, and next useful depth before writing details.
4. Write content in this order where the format permits: `Summary`, `Table of Contents`, user-facing content, developer-facing content.
5. Update the bilingual counterpart in the same pass. Keep headings, lists, tables, code, links, and physical line count aligned one to one; the English side targets `.md` and the Chinese side targets the `.zh.md` sibling.
6. Verify every claim against code, tests, or observed behavior — run the operations the page instructs, per the fact-check procedure below.
7. Run `pnpm run typecheck` and `pnpm run build`, re-read the complete diff once for correctness, then once for brevity and repository fit.

## Fact-check procedure: test, do not assume

Docs state how the product behaves today, and the only admissible evidence for an operation claim is having run it. Apply this procedure to every new paragraph that claims a command, shortcut, default, config field, error, or platform difference.

1. **Classify the subject before writing install guidance.** Read the facts, never the folder name: `package.json` for the `dsh.bundle.patch` declaration and `cordis.patch.yml` for the profile-layer content; `src/config.ts` for accepted configuration fields; `src/prompt.ts` and `src/chat/` for commands and shortcuts; `src/runtime.ts` and `src/components/` for transcript and rendering behavior.
2. **Run every claimed operation against the current checkout.** Execute each CLI command, config snippet, and TUI interaction exactly as the document will show it. The plugin refuses non-TTY pipes, so run the TUI in a real terminal. Record only what you observed, including the exact output, warnings, and failure modes. If a claim depends on a key or a network you do not have, say so and name the verification owner instead of asserting the behavior.
3. **Delete what you could not reproduce.** Never carry a command, field, default value, or behavior from memory, analogy, or the neighboring `legacy-launcher/` code. When a claim fails to reproduce, fix the claim — not the test.
4. **Check old docs against latest `main`.** Before revising pre-existing prose, `git fetch origin` and compare the section against `origin/main`; a stale statement on main is still wrong — correct it against the code, not the old prose.
5. **Re-check the pair after every edit.** dsh-tui has no automated pairing gate or sidecar record; re-read both sides and confirm structure, terminology, and line alignment manually after either language changes.

## Documentation scope and template

dsh-tui's documentation surface is the root README pair only: no website projection, no `docs/` tree, no per-package READMEs. Direct every documentation change at `README.md` and `README.zh.md`. Open the single working skeleton [templates/readme-pair.md](templates/readme-pair.md) before writing and follow its structure. Add no YAML frontmatter and no `kind` system: these READMEs carry no frontmatter, and the sibling filenames plus the language-switcher line already own the pairing.

## Voice rules

Apply these rules to every authored README line; they bind with particular force on both sides of the pair.

- **Intro and features say what the subject does.** The opening paragraph and `Features` describe outcomes a user or agent gets — install, drive, resume, configure — never the project's internal identity or type. "dsh-tui is an interactive full-screen terminal UI for DeepSeek Harness agents" states function; a paragraph narrating event streams states mechanism.
- **Developer sections explain, never enumerate.** `Build from source` and `Repository layout` cover the build flow and the source map at concept level and name the owning files; include no API catalogs, exhaustive field lists, or JSDoc restatement.
- **Current state only, unless the section says otherwise.** Keep every section current-state prose; confine migration and removal history to the README's own `Migrations vs. the official removal` section.
- **Controlled technical English on the English side.** Give each sentence an explicit actor and one main action when ambiguity can change behavior; reuse one term per concept; prefer direct verbs; split stacked instructions and conditions; preserve modality and exceptions. Apply the non-certified, ASD-STE100-inspired discipline in [the page-style reference](references/style.md#controlled-technical-english). Do not force a shorter sentence when precision would fall.
- **Natural Simplified Chinese on the Chinese side.** Mirror each English line's proposition in natural Simplified Chinese; keep code, tables, keys, and links byte-identical across sides.

## Quality criteria

Use these definitions in review. Open each substantive section with a short orienting paragraph before tables or exhaustive detail.

- **Brief:** the common path contains only facts needed for its outcome; exhaustive truth stays one direct link or section away.
- **Intuitive:** prerequisites precede dependent concepts, one next action is obvious, and headings use terms readers search for.
- **Friendly:** readers can recognize success, understand risk before acting (TTY requirement, exits), recover from likely failure, and choose whether to continue deeper.
- **Accurate:** each durable claim has one owner (`package.json`, `cordis.patch.yml`, `src/`, `tests-pre-migration/`) and a verification path proportionate to its risk.
- **Agent-readable:** stable headings, anchors, terminology, ownership, and current-state statements support targeted retrieval without loading source.
- **Newcomer-complete:** a professional engineer with no repository context can install, run, configure, and extend the TUI through the README pair plus the named `src/` files.

Do not apply a universal word limit. Measure entry-path length, unrelated material scanned for one lookup, largest section, heading count, and page size; split or move detail into the owning section or file when retrieval cost is high.

## Audit the documentation

Read, do not re-summarize, the owning contracts: the current README pair for structure and terminology, `package.json` for scripts and the bundle declaration, and `src/` for behavior. dsh-tui has no Agent Note mechanism; nothing stands outside the pair as frozen history to exclude.

Apply the authoring order to every human-facing document in scope: locate the document and state its own subject; set the permitted detail level and move deeper explanations to owning files with links; classify tutorial or reference from intended use, not section name; for a tutorial, order concepts by prerequisite and difficulty; split substantial mixed forms. Then check placement constraints: a paired change costs a counterpart update in the same pass; a move is atomic with every inbound link repaired in the same change.

After the structural pass, hunt the slop checklist with the cheapest probes first. Use [dsh-trim-cot-leakage](../dsh-trim-cot-leakage/SKILL.md) for reasoning-transcript leakage; grep distinctive phrases to find duplicated rules; replace hand-written status inventories with their authoritative owners in `src/`; and remove future-tense spec language from current-state sections while leaving the explicitly historical `Migrations` section intact. If removing prose changes a promised behavior rather than its explanation, propose the behavior change first (follow [dsh-find-simplifications](../dsh-find-simplifications/SKILL.md)). Keep every load-bearing rule, preferably as one to three lines plus a link to its rationale; do not create a new explanation merely to relocate disposable reasoning.

## Detailed references

Load only the reference needed for the task. Each reference links directly from this file so the skill has no deep reference chain.

- [Bilingual links and line alignment](references/metadata-links-i18n.md): the language-switcher convention, `.md`/`.zh.md` target rules, terminology discipline, and one-to-one line alignment for the pair.
- [Page structure and hierarchy](references/structure-hierarchy.md): the README section order, user-to-developer progression, and where deep detail lives when the page runs out of room.
- [Page style](references/style.md): short intro paragraph, controlled technical English, tables for reference material, and emphasis discipline.
- [Review criteria](references/review.md): newcomer test, evidence checks, the pair review checklist, and verification commands.

The single [templates/readme-pair.md](templates/readme-pair.md) is the working skeleton for both sides; open it before writing. Use [dsh-prose-standard](../dsh-prose-standard/SKILL.md) for sentence-level contract coverage. Seasoned bilingual passes belong to the explicitly invoked [dsh-translate-docs](../dsh-translate-docs/SKILL.md) flow. The existing README pair at the repository root (`README.md`, `README.zh.md`) is the reference example of the format.

## Validation

Validate the affected material, not merely Markdown syntax. dsh-tui ships no documentation gates, so run these checks by hand.

- README links: resolve every relative link against the repository (`README.md` ↔ `README.zh.md` ↔ `LICENSE`); keep external links, such as the DeepSeek Harness URL in the notice, as full URLs.
- Bilingual pair: compare structure, physical line counts, terminology, and link parity between the two sides.
- Usage claims: exercise the documented entry path — `dsh --profile tui` from a real TTY — or name an explicit manual verification owner.
- Config and command claims: confirm every field against `src/config.ts` and every shortcut and command against `src/prompt.ts` and `src/chat/`.
- Merge hygiene: run `pnpm run typecheck` and `pnpm run build`, then `git diff --check`; re-read the final diff once for factual completeness and once for brevity, navigation, and ownership.

## Dev Note

None.