---
name: dsh-trim-cot-leakage
description: This skill should be used when auditing prose for chain-of-thought (Cot) leakage, removing leaked reasoning, or fixing text that reads like a reasoning transcript — dead design-session citations such as (decision N), audit item codes, or §N of uncommitted drafts; change narration such as "used to", "no longer", "this cut"; stack or review vantage ("a later PR in this stack", "rejected in review"); reviewer-addressed justifications; control-flow narration; or hedged planning residue in comments, JSDoc, or the README pair.
---

> 来源：deepseek-harness 仓库 .agents/skills/dsh-trim-cot-leakage（master @ cd5ef81481），2026 年按 dsh-tui 项目针对性改造。

# Trimming Chain-of-Thought Leakage

Chain-of-thought leakage is prose whose vantage is the authoring session rather than the repository: it cites artifacts only that session could see, narrates the change instead of the state, or argues with a reviewer who has left. Never delete alone when a passage carries factual clauses — restate each so it stands at HEAD, then delete the transcript around it; a passage carrying none (an audit code, control-flow narration) is deleted outright. **REQUIRED BACKGROUND:** [dsh-prose-standard](../dsh-prose-standard/SKILL.md) owns the complete-proposition rule this skill applies. Treat this skill as guidance, not a script.

## The one test

For every suspect passage ask: **could a reader at HEAD, with no access to any session transcript, PR thread, or uncommitted draft, resolve every reference and verify every claim?** If no, restate the surviving facts from the repository's vantage and delete the rest. If yes, it is not leakage, however historical it sounds — but resolvability only clears this skill's bar: on current-state surfaces (READMEs, JSDoc) a resolvable change story is still change narration, and class 3 routes it to its sanctioned home.

## Taxonomy

1. **Dead design-session citations** — `(decision 7)`, `(audit C2)`, `design §4.7`, `plan §1.4`, phase labels (`T4`, `W3`, `P-I`), "the design ledger", "(B ruling)". If the decision has a committed owner, cite it by name and path; otherwise delete the citation and restate its factual clause to stand alone.
2. **Stack and PR vantage** — "a later PR in this stack", "this PR adds", "the previous commit". State the shipped mechanism or the extension point; deferred work moves to a `TODO` marker or an issue reference.
3. **Change narration and version stamps** — "used to", "no longer", "the old X", and indexical stamps ("v1", "this cut", "today", "now" contrasting with a past state). State the present behavior; a fixed regression becomes a present-tense counterfactual ("without X, Y happens"), never repo history ("used to Y").
4. **Review choreography** — "Rejected in review:", "the reviewer confirmed", draft ordinals ("v5 of this note"), round attributions. Keep the surviving decision and rationale as plain fact; delete who said it when.
5. **Reviewer-addressed justification** — "the cast is safe — it simply…", "this is correct because…". A comment arguing its own correctness addresses a reviewer, not a maintainer. State the invariant that makes the code safe, or delete the comment if the code shows it.
6. **Restatement and derivation transcripts** — control-flow narration ("first we X, then we Y"), test walkthroughs, proofs of obvious branches. Delete; keep only a non-obvious contract or invariant.
7. **Hedges and planning residue** — "probably fine for now", "should be enough", deferrals with no marker. Promote to `TODO`/`FIXME` or restate as the actual bound; delete the hedge.
8. **Authoring-language slips** — untranslated working-language fragments (端, 设计稿, `---- 私有 ----` separators) in prose whose language is otherwise English, or the reverse in a zh counterpart. Translate or delete.

## What is not leakage

Unaided citation passes fail in both directions by deleting durable references and keeping dead ones. Apply these keep rules as written; [examples](references/examples.md) calibrates each:

- **Issue references** — `#1470`, `TODO(name):`, "issue #N owns the follow-up" resolve at HEAD; keep them on any surface, including READMEs. Deferred work belongs in such markers — dsh-tui has no Agent Note archive to relocate it into.
- **Merged-PR and issue citations as evidence** — issue numbers and merged-PR references are sanctioned citation wherever a surface calls for evidence; the ban is adopting a PR's vantage about the code, not naming the PR. dsh-tui has no Agent Notes or documentation standard, so keep such citations on the surface that resolves them.
- **Suppression justifications** — `oxlint-disable … -- reason`, coverage-ignore reasons, empty-catch explanations are required prose; fix a false reason, never delete it.
- **Counterfactual-present regression pins** — "without X, Y happens", "a naive X would…".
- **Measured bounds** — "(measured: 512 nests ≈ 0.15s)" calibrating a constant; the provenance word "measured" is load-bearing.
- **Runtime old/new states** — "the old connection drains before the new one accepts" is runtime lifecycle, not change history.
- **Historical stage names inside a change-story section** — inside a section that owns its change story (a postmortem, a design doc), "the first cut shipped X" is current-state-safe; indexical stamps ("this cut") stay banned everywhere.
- **External references that resolve outside the repo by design** — standards sections (RFC 9110 §10.1.5), Figma frame names; the §-ban covers uncommitted internal drafts, not external standards or committed docs that own their §-numbering.
- **Project voice and genre forms** — "we" as project voice; a document's Alternatives-considered section.

## Workflow

1. **Scope and exclusions** per [dsh-prose-standard](../dsh-prose-standard/SKILL.md): require an explicit scope. The audited surfaces are `src/` (comments and JSDoc), the README pair (`README.md` / `README.zh.md`), and `tests-pre-migration/`. Never touch the skill's own directory. Recorded fixtures and snapshots (`tests-pre-migration/`) are derivatives, not prose targets: change the owning source or scenario and regenerate them only when an authorized behavior change requires new evidence.
2. **Audit read-only first**: run the [recall batteries](references/recall-batteries.md), calibrating each probe against a known positive and a near-miss negative before trusting its output, then judge every hit semantically. The batteries are probes, not the definition — they miss cases by nature, so also read the densest prose in scope (module JSDoc in `src/`, the README pair) without a pattern in hand.
3. **Fix owner-first per surface**: bilingual fences → fix the original block once, then copy the corrected verbatim fence byte-for-byte into both README sides per [dsh-doc](../dsh-doc/SKILL.md); bilingual prose → update the counterpart minimally so the pair stays in sync (dsh-tui has no doc-sync; keep the pair aligned by hand); generated artifacts → fix the owning source JSDoc or generator template, then regenerate every derivative (dsh-tui commits no generated catalogs today — apply the principle wherever a derivative appears); model- or user-visible strings → route through [dsh-prose-standard](../dsh-prose-standard/SKILL.md) and change only with owning behavior evidence, otherwise leave unchanged and report the deferral.
4. **Before deleting anything**, enumerate the passage's propositions (per prose-standard) and check the [overcorrection traps](references/examples.md#overcorrection-traps): trims that flip an obligation into an endorsement, promote a hypothetical to a shipped feature, delete a true fact, or drop provenance.
5. **Verify**: re-run the batteries expecting only sanctioned keeps plus this skill's own directory; confirm every remaining citation resolves at HEAD; confirm the README pair stays aligned (code fences byte-identical, prose in sync); after touching `src/`, re-run `pnpm typecheck` — the project's only static gate.