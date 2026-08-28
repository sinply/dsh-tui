---
name: dsh-code-review
description: This skill should be used when reviewing a pull request in the dsh-tui repo (review a pull request, review PR, review changes in dsh-tui) — it orients the reviewer to dsh-tui's actual sources of truth (package.json scripts and peer dependencies, cordis.patch.yml bundle patch, the bilingual README pair, src/ layout, tests-pre-migration/, LICENSE) and the review-specific checks that code alone cannot show
---

# Reviewing a dsh-tui PR

> 来源：deepseek-harness 仓库 .agents/skills/dsh-code-review（master @ cd5ef81481），2026 年按 dsh-tui 项目针对性改造。

**This skill is guidance, not a complete checklist.** Verify and fetch the PR's live base and exact head refs, then read the diff plus enough surrounding code to understand the design. Semantic review outranks checklist coverage: a short review with one substantiated blocker is better than a list of nits. Prioritize correctness, lifecycle, security, and broken required behavior over style.

## Sources of truth

- `package.json`: build (`pnpm build` = `tsc -b && tsdown --config tsdown.config.ts`) and typecheck (`pnpm typecheck` = `tsc -b --noEmit`) scripts, the four runtime dependencies, and the `@deepseek-ai/dsh-*` peerDependencies. `peerDependenciesMeta` marks `session-persistence`, `session-query`, and `skills` optional: code must read those through `ctx.get(...)`, never through a hard `inject` entry.
- `cordis.patch.yml`: the dsh profile bundle patch that mounts the TUI. Rows configure `agent-loop` (agent `main`, `sessionId: main`), `system-prompt`, `llm-deepseek`, `fs-sandbox`, `tools`, then insert `tui-prompt` and `ui-tui`. A patch change must stay valid against the shared `@deepseek-ai/dsh-base` bundle; rows missing from the base are skipped by design.
- `README.md` and `README.zh.md`: the only documentation — a line-aligned bilingual pair that link to each other. `LICENSE` is BSD-3-Clause (upstream DeepSeek AI + sinply independent packaging).
- `src/`: `config.ts`, `index.ts`, `invariant.ts`, `prompt.ts`, `runtime.ts`, plus `chat/` (autocomplete, helpers, questions, resume, skill-invocation, timing, tokens), `components/` (content, dialogs, text, theme, transcript, xml-tool-output), `extension/` (overlay-manager, types).
- `tests-pre-migration/`: historical specs and snapshot fixtures (chat-helpers, extension, file-autocomplete, plugin-shape, prompt, timing-tracker, transcript-card-cache, tui, xml-tool-output; `snapshots/*.expected.txt`). Not wired to any runner script — run the affected spec when the current toolchain can execute it, and say plainly when it cannot.
- [dsh-prose-standard](../dsh-prose-standard/SKILL.md): required coverage and editorial judgment for comments, docs, prompts, and visible strings.

## Cordis plugin essentials for dsh-tui

- The package is one Cordis plugin (`name = 'ui-tui'`) with a declared `inject` list; optional peers (`skills`, `sessionQuery`, `loader`) are read non-throwingly through `ctx.get(...)` so the TUI never hard-requires an optional peer.
- `mountTui` waits for the configured `main` agent, then opens the channel inside `ctx.effect(() => { const controller = createTuiChat(ctx, config, runtime); return () => controller.dispose() }, 'ui-tui')` — the effect disposer owns the whole TUI lifecycle. Sibling resources (commands, the file-reference prompt section, the private `tui` service) live in scoped fibers (`agent.ctx.inject(...)`, `ctx.inject([], ...)`) disposed at teardown.
- Every `ctx.on(...)` handler returns a disposer; `detachListeners()` runs them in order before `ui.stop()`. Timers (`setInterval`) are owned and cleared by `clearStatus`/`stopBannerReveal`; overlay sessions are effect-owned and closed through `overlayManager.dispose()`; `disposeRootAndExit` bounds root disposal before process exit.
- `src/invariant.ts` ships an empty invariant installer with a package-specific reason (no durable package-local event stream); keep invariant changes semantic and never grow the installer without a real runtime relationship.

## Blocking requirements

1. **New prose receives semantic review.** Apply [dsh-prose-standard](../dsh-prose-standard/SKILL.md) to every added or changed Markdown passage, JSDoc, comment, prompt, description, diagnostic, and visible string. Automated checks do not establish required coverage, accuracy, placement, or editorial quality.
2. **Docs match the code.** Config, defaults, errors, wire fields, events, and public behavior update the README pair (`README.md` + `README.zh.md`) in the same diff, line-aligned. Comments state non-obvious contracts; flag implementation narration, test walkthroughs, review history, and duplicated rationale for deletion.
3. **Registrations clean up.** Verify each new Cordis consumer — `ctx.on(...)` registration, `ctx.effect(...)` region, `setInterval`/banner timer, overlay session, scoped fiber — has a disposer that runs on teardown. Extend the shipped `mountTui` effect, `detachListeners()`, and `shutdown()` patterns; do not bypass them.
4. **Invariant companions are semantic.** For every touched `./invariant` (`src/invariant.ts`), require an owner event-stream or mutable-data relationship observable at the point the package can observe it; service or method presence, plugin metadata or effects, and fixed pure examples belong in type, load, or unit tests. Accept an empty installer when its package-specific reason establishes that no plausible runtime relationship exists; do not demand an invented check merely to eliminate emptiness.
5. **Required evidence exists.** Verify the author ran `pnpm typecheck` and `pnpm build` for the diff, plus the changed-area spec from `tests-pre-migration/` when runnable; review the semantic gaps neither can detect.
6. **User-visible copy matches the README pair.** TUI surface strings — notices, `/command` descriptions, prompt placeholders and values, theme output — must agree with the documented behavior. Reject copy that contradicts `README.md`/`README.zh.md` or drifts between the two sides; dsh-tui has no locale layer, so the bilingual pair is the single user-facing documentation seat.

## Manual checks

- **Intent and interface contracts:** trace both sides of every changed interface, including errors, cancellation, ownership, and disposal. Confirm the implementation matches the PR and the stated design.
- **Lifecycle and concurrency:** apply Cordis disposer discipline — listeners detach before `ui.stop()`, pending questions are rejected, in-flight commands abort, disposal settles before exit (`disposeRootAndExit` bounded fallback). Check races before publication, cancellation during awaits, independent error reporting, containment on reentry, complete detach cleanup, and quiescent disposal.
- **Capability and consumer fit:** trace every current consumer of a changed surface (`tui` service, `tuiPrompt` values, `tuiResumeHost`, `tuiInitialSkill`/`MAIN_SESSION_ID_KEY` context keys, `TuiExtensionService.openOverlay`), then flag consumer-specific behavior leaking into an interface others share. Flag the inverse too: a new public method on a peer service whose only caller is one internal consumer is an unnecessary API expansion — require a private capability closure handed to that consumer at construction (as `TuiExtensionServiceImpl` is mounted on a private `tuiServiceFiber`).
- **Scope, ownership, and necessity:** map each abstraction, state machine, option, defensive copy, and compatibility path to its current contract, production consumer, and owning module. Challenge unrelated features and speculative generality. A new runtime dependency must earn its place against the four-dependency floor; a new peer dependency needs a declared optionality decision in `peerDependenciesMeta` and a non-throwing `ctx.get` read when optional.
- **Configuration and public choices:** ask what current-consumer evidence or prior art supports each default, public operation set, format, or imported external concept. `resolveTuiConfig` defaults, the prompt-template grammar, the theme/vscode palette selection, and `cordis.patch.yml` row placement are public choices — require an explicit decision or deferral when evidence is absent.
- **Model perspective:** inspect the exact prompts, tool schemas, results, and diagnostics the model receives across affected modes — the `ui:tui-file-reference` system-prompt section, rendered prompt values, `renderSkillInvocation` skill bodies, `/skill:<name>` instruction delivery. Flag concepts outside the model's task, then verify stable text verbatim.
- **Enforcement:** follow every denial path to the operation that executes it: the TTY guard in `apply()` (throws when stdin/stdout are not TTYs), optional-service fallbacks (`skills === undefined` notices, the `sessionQuery` fiber-state check, `loader` absence warns for the experimental `/reload`), and `agent/disposed` handling. Exercise direct and alternate callers that can bypass them.
- **Borrowed and derived state:** determine whether each retained value is borrowed or owned under the package contract (prompt value handles, session events, token counters), then trace notifications and every cache (`toolCards`, `allToolCards`, `assistantSteps`, `contextCards`, `stepTimingTracker`, `fileSearch`, autocomplete providers) to the authoritative source — `agent.session.events` — and its documented invalidation points.
- **Bounds cover the final operation:** locate the owner of the complete emitted or retained result, including wrappers and metadata (`maxToolOutputLines`, `maxDiffEditLength`, file-search limits, dialog height clamps, `InlineModalComponent` sizing). Probe tiny and exact limits, oversized single chunks, and multibyte text for byte and visible-width limits (`visibleWidth`).
- **Real entry path:** tests exercise the shipped entry (`apply`/`mountTui` in `src/index.ts`, or the headless-terminal harness in `tests-pre-migration/`) where relevant; `plugin-shape.spec.ts` covers the export surface. A hand-mounted component does not catch Loader or patch wiring (`cordis.patch.yml`).
- **Test strength:** assertions fail on the intended regression and verify external state, rendered output, snapshots (`tests-pre-migration/snapshots/*.expected.txt`, `tui.snapshot.ts`), or disposal rather than restating the implementation. Coverage is necessary but not evidence that the scenario is correct.
- **Invariant lifecycle and negative controls:** verify candidate observations are rejected before publication where possible, and a deliberately invalid case fails through the real runner for the intended rule.
- **Transcript changes:** editor-visible or model-visible changes update the affected `tests-pre-migration` snapshots or explain why no snapshot applies. Review expected-output diffs as behavior changes, not formatting noise.
- **Bilingual changes:** compare meaning and terminology on both sides of `README.md`/`README.zh.md`; matching line counts or paragraph shapes do not prove translation quality.

## Verification

Run `pnpm typecheck` and `pnpm build` for the diff; run the changed-area spec from `tests-pre-migration/` if the current toolchain can execute it (they are not wired to a runner script — report when they cannot). Review the semantic gaps neither can detect.

## Reporting findings

State the defect, location, impact, and evidence. Place a localized defect inline on the tightest relevant diff range; use a PR-level comment for cross-cutting architecture, scope, or review-wide synthesis. Separate blockers from suggestions, and omit issues already enforced by a green gate. Use the existing GitHub review thread for replies. When receiving review, verify each claim and fix or rebut it on technical grounds without performative agreement.