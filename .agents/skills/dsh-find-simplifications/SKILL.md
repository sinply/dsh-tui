---
name: dsh-find-simplifications
description: 'This skill should be used when working in the dsh-tui repository to find simplifications, simplify this code, remove redundant code, reduce over-engineering, or fold worthwhile simplification ideas from another PR; it turns a broad request into evidence-backed candidates on dead, duplicated, speculative, over-built, added-then-removed, or hand-rolled-where-a-dependency-exists surfaces, expressed as GitHub issues, PR descriptions, or inline TODO/FIXME/XXX comments.'
---

# Finding dsh-tui Simplifications

> 来源：deepseek-harness 仓库 .agents/skills/dsh-find-simplifications（master @ cd5ef81481），2026 年按 dsh-tui 项目针对性改造。

Turn a broad "find things to simplify" request into evidence-backed candidates that remove or collapse existing dsh-tui surface area. Treat this as guidance, not a checklist: follow the code, keep judgment active, and prefer a few well-proven candidates over a pile of thin guesses. Express durable, design-level proposals as a GitHub issue or a PR description section; keep small local cleanups as inline TODO/FIXME/XXX comments.

## Start with repository context

Read the repository conventions first. dsh-tui has no `docs/` directory and no `.agents/notes` mechanism; intentional-architecture rationale lives in `src/invariant.ts`, the bilingual README pair (`README.md` / `README.zh.md`), and the Cordis bundle patch (`cordis.patch.yml`).

Skim the source layout before judging anything: the `src/` core files (`config.ts`, `index.ts`, `invariant.ts`, `prompt.ts`, `runtime.ts`), `src/chat/` (autocomplete, channel, file-autocomplete, helpers, model-command, questions, resume, skill-invocation, timing, tokens), `src/components/` (content, dialogs, text, theme, transcript, xml-tool-output), and `src/extension/` (overlay-manager, types). Simplifications that fight the service-map or event-taxonomy conventions of the `@deepseek-ai/dsh-*` peer services need extra evidence.

Treat the `@deepseek-ai/dsh-*` peer services and the `@earendil-works/pi-tui` rendering layer as intentional seams by default; do not propose removing either as "low effort" unless the user explicitly overrides that constraint. Removing an unused method or hook inside a protected seam can still be valid if it does not collapse the protected design.

## What counts as a strong candidate

A strong candidate removes, folds, or demotes something real and has clear evidence that the current design costs more than it buys:

- A public method, event, config knob, callback, helper, module, or exported symbol has no production consumer.
- Tests or docs are the only consumers, and the behavior they pin is not load-bearing.
- Two representations mirror the same fact — for example, duplicated state or assembly logic between `src/chat/` helpers and `src/components/` transcript rendering, or between `src/prompt.ts` and runtime prompt building.
- A seam (service interface, renderer contract, overlay API) has members every implementation must support but no consumer uses.
- A module or file exists only for demo/support code and adds maintenance overhead without a consumer.
- A feature implements speculative product generality — unused session-resume variants, alternate rendering backends, or dead config branches in `src/config.ts` — with no product owner.
- An invariant, rollback path, set of expected outputs, or special-case handler exists only to protect an unused API.
- Hand-rolled code reimplements what a well-maintained npm package, a Node builtin at the engine floor, or an existing dsh-tui dependency already provides, and the swap would delete the implementation plus its dedicated tests.
- The simplified behavior may differ slightly, but the new behavior is still reasonable and easier to explain.

Thin candidates are not enough: deleting one typo, flagging "this looks complex" without call-site proof, or removing an intentionally documented seam counts as thin.

## Survey broadly

Use parallel subagents when the user asks for breadth or many candidates. Give each agent a domain and require evidence, not guesses. Useful dsh-tui domains:

- Runtime and session threading: `src/runtime.ts`, `src/chat/resume.ts`, `src/chat/timing.ts` — turn boundaries, abort/cancel, session resume, timing bookkeeping.
- Input and autocomplete: `src/chat/autocomplete.ts`, `src/chat/file-autocomplete.ts`, `src/chat/questions.ts`, `src/chat/channel.ts` — completion state, file-path matching, question flow.
- Model and token handling: `src/chat/model-command.ts`, `src/chat/tokens.ts`, `src/config.ts` — model config knobs, token accounting, unused defaults.
- Rendering and components: `src/components/` — transcript, content, text, theme, dialogs, xml-tool-output.
- Extension overlay: `src/extension/` — overlay-manager and its types.
- Docs, tests, and bundle: the README bilingual pair, `tests-pre-migration/`, `cordis.patch.yml`.

If subagents are unavailable, simulate the same breadth yourself. Do not let the first good candidate stop the survey. Start with the largest production-code deltas: a survey that stops after obvious unused symbols can miss the files where duplicated lifecycle or defensive machinery carries most of the cost.

## Simplify prose with the code

Treat comments and documentation as maintained surface area. Apply [dsh-prose-standard](../dsh-prose-standard/SKILL.md) when a survey includes prose:

- Delete comments that restate code or explain behavior owned elsewhere; keep required local contracts (for example, the invariants enforced in `src/invariant.ts`).
- Keep docs at their owning level: the README pair documents user-visible behavior; omit implementation details and rare cases unless they change a maintained contract.

## Audit trust and lifecycle boundaries

For every defensive copy, freeze, validator, and callback capture, name where the value came from and who owns it next. Same-process typed service/plugin calls through Cordis (`ctx.get('skills')`, `@deepseek-ai/dsh-*` services) ordinarily borrow readonly values; parsers (`saxes` XML-tool output), config loaders (`src/config.ts`), queues, model/tool JSON, workers, processes, and wire decoders own or validate their data. Tests built around hostile getters, fake typed objects, callback replacement, or mutation after a same-process handoff are evidence of a potentially speculative contract, not automatic justification for keeping it.

For complex asynchronous code, draw the ownership graph and map each sentinel, readiness promise, cancellation path, disposer (`ctx.effect()`/`ctx.on()`), and state flag to a distinct owner or transition. When several mechanisms mirror the same liveness or settlement fact, propose one transaction or lifecycle controller instead. Preserve separate machinery where it protects synchronous publication and rollback, callback containment, first-terminal-outcome arbitration, worker/process ownership, or dispose-to-quiescence.

## Hand-rolled code versus a dependency

Introducing a dependency is a valid simplification move, not a policy exception — but dsh-tui has no written dependency policy, so apply the project's de-facto lean-dependency discipline: the runtime dependency list is only four packages (`@earendil-works/pi-tui`, `diff`, `saxes`, `schemastery`) plus the `@deepseek-ai/dsh-*` peers, and a new dependency must earn its place. When surveying, ask of protocol parsers, framers, retry/backoff loops, glob matchers, diff engines, and similar infrastructure: does a well-maintained npm package, a Node builtin at the engine floor, or an existing dsh-tui dependency already do this?

Prove a dependency-swap candidate like any other, plus:

- Read the hand-rolled implementation and name the exact surface the package covers; residual semantics the package does not cover count against the swap.
- Check the package's health honestly (maintenance, adoption, transitive footprint) and prefer builtins when the engine floor has them.
- Check the recorded seams first: `schemastery`, `saxes`, `pi-tui`, and the `@deepseek-ai/dsh-*` peers are settled choices — a swap that collapses one needs to beat the recorded rationale, not just cite it.
- Weigh net deletion: implementation plus dedicated tests plus docs, minus the glue that remains. A wrapper that relocates the same complexity is not a win.

## Prove or reject each candidate

For every symbol or behavior, classify consumers before writing:

- Production corpus: `src/` (all runtime code), `cordis.patch.yml`, and package metadata (files, peerDependencies, scripts).
- Non-production corpus: `tests-pre-migration/`, `README.md`/`README.zh.md`, and comments.
- Ambiguous corpus: README-documented behavior that users may rely on. User-facing TUI behavior described in the bilingual README is product surface — inspect before classifying.

Use `rg` first. Good searches include the exact symbol, event name, config key, and method name with both `.name(` and `name(`, plus any wire strings. Then read the call sites.

Reject or downgrade a candidate when:

- A production caller exists and the simplification would be a feature decision rather than a cleanup.
- The API is explicitly justified by `src/invariant.ts`, a documented README convention, or a hard-won defensive pattern, and the new evidence does not beat that reason.
- The removal would force unrelated churn without actually reducing the public API or required behavior.
- The idea is correct but tiny: write a targeted TODO/FIXME/XXX comment instead of a durable proposal.

## Expressing candidates

Express durable, design-level simplification proposals as a GitHub issue, or as a clearly marked section of a PR description when implementing the change in the same PR. Structure such a proposal so an implementing PR can follow the trail:

- `Problem`: name the current API or surface, cite the relevant files, and state the consumer evidence. Separate production callers from tests/docs.
- `Proposal`: say exactly what to remove, fold, demote, or rehome; include tests, READMEs, JSDoc, and snapshot cleanup when relevant.
- `Why not keep it?` / `What we give up`: make the strongest counterargument legible.
- `Acceptance criteria`: observable end state and gates.
- `Risks`: public API changes, behavior changes, future product wants, and why the tradeoff is still reasonable.

Do not file issues or PR sections for vague "simplify this package" ideas. When a new proposal overlaps an existing issue or PR, fold the useful details into the existing one rather than creating a duplicate.

## Inline TODO/FIXME/XXX comments

Use inline TODO/FIXME/XXX only for small, local cleanups that are clearly useful but not durable design decisions. Keep them short and actionable:

- Name the smell with a stable tag, e.g. `TODO(double-default)` or `XXX(unused-default)`.
- Explain why it is safe to revisit and what action would simplify it.
- Do not add TODOs for speculative complaints or for behavior that needs a design-level decision.

## When folding another PR or branch

Diff the sibling branch against `origin/main`, not against the current PR branch, so you see its independent contribution. For each item:

- Port non-overlapping candidates (issues, PR sections, TODOs) that meet the quality bar.
- Consolidate overlapping material into the existing issue or PR that owns the topic.
- Do not port duplicate or lower-confidence proposals just to preserve the count.
- Update the PR body so reviewers see the true candidate count and scope.
- Close the duplicate PR only when the user asked you to, or when you clearly own that housekeeping.

## Validation and PR hygiene

Run `pnpm typecheck` and `pnpm build` for any code-adjacent change, plus `git diff --check` for whitespace errors. There is no doc-sync or lint script in dsh-tui; for README changes, verify the bilingual pair stays in sync (README.md / README.zh.md describe the same behavior).

When opening or updating a PR, summarize:

- How many candidates were proposed, consolidated, or rejected, and where each was recorded (issue, PR description, inline TODO/FIXME).
- The main areas surveyed.
- What was intentionally excluded.
- Which checks passed.

Use a draft PR while the survey is still expanding; mark ready only when the candidate set, review responses, and validation are settled.