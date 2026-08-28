# Distilled prose examples

Use these examples to identify the governing principle, not as text templates. "Balanced" preserves every load-bearing proposition with the least explanation needed at that location.

> 说明：以下示例基于 dsh-tui 的 `src/` 注释与 `README.md` 改写。标注「示意」的文本为示意改写，非逐字引用；仅用于说明行文原则，不代表对既有代码注释的评判。

## Preserve every factual clause（示意）

**Over-trimmed:** "Hands the session off to a new process."

**Balanced:** "Disposes the current app and replaces it with a runtime for `sessionId` in `cwd`. A host may reject before it commits teardown; after commit it owns fatal reporting and process exit."

Remove decoration and repetition, not propositions. The pre-commit rejection window, the post-commit ownership, the target `cwd`, and the "success does not return" consequence are separate facts.

## Explicit skill scope is functional

**Over-trimmed:** "Read the sources and use judgment."

**Balanced:** "This skill is guidance, not a complete checklist. Use judgment beyond the named checks; documented requirements still apply."

**Over-detailed:** Several paragraphs defending why lists cannot replace independent reasoning.

Keep the explicit limitation because it changes how an agent applies the workflow. Trim repeated persuasion, not the guardrail. dsh-tui invokes skills manually via `/skill:<name>`; a concise, scoped skill body is easier to honor from a terminal session.

## A how-to keeps action and verification（示意）

Based on the README "Install & use" section:

**Over-trimmed:** "Install dsh-tui."

**Balanced:** "Pack the tarball, install it into a profile with `dsh plugin --profile tui add <tarball>`, then boot `dsh --profile tui`. The plugin refuses pipes — both stdin and stdout must be TTYs — so a non-TTY invocation fails with that message; verify on such an invocation."

**Over-detailed:** A walkthrough of every flag and loader warning already visible in the command output.

Keep prerequisites, required action, the real entry path, and observable verification. Remove flag narration.

## Preserve ownership and timing（示意）

Based on `src/prompt.ts` (`TuiPromptService`):

**Over-trimmed:** "Prompt value changes redraw the prompt."

**Balanced:** "A registration, mutation, or disposal schedules one coalesced notification to the subscribed renderer, so a value that changes on its own schedule still redraws. Notification is a direct in-service callback, not a Cordis event."

**Over-detailed:** A chronological account of every microtask and set-membership check used to implement coalescing.

The trigger points, the coalescing guarantee, and the non-event delivery mechanism are separate factual clauses.

## Module JSDoc preserves boundary timing（示意）

Based on `src/chat/file-autocomplete.ts`:

**Over-trimmed:** "Builds the `@file` completion index."

**Balanced:** "Directory-scoped queries list live state; bare fuzzy queries share one bounded traversal until the `@` interaction ends or a tool result invalidates it."

**Over-detailed:** A walkthrough of the queue, cancellation controller, and promise fields that implement the ordering.

The scope distinction and its invalidation triggers are TUI-visible behavior, not implementation narration.

## Orient complicated code without narrating it（示意）

Based on `src/invariant.ts`:

**Over-trimmed:** "Invariant companion."

**Balanced:** "Owns this package's invariant registration. No runtime invariant: this presentation adapter owns no durable package-local event stream; boundary and replay tests (when active) cover its protocol mapping."

**Over-detailed:** A paragraph-by-paragraph preview of the registration call the code already shows.

Keep the module's role, dependencies, and the non-obvious "intentionally empty" explanation, which prevents a reader from assuming a missing registration is a bug. Let the code show local control flow.

## Public JSDoc includes failures（示意）

Based on `TuiPromptValueHandle` in `src/prompt.ts`:

**Over-trimmed:** "Sets the prompt fragment."

**Balanced:** "Replaces the current fragment and schedules a coalesced change notification so the owning renderer redraws. Setting the current value again is a no-op; calling `set` after `dispose()` throws."

**Over-detailed:** The internal `active` flag branches and the notification queue fields that lead to each outcome.

Idempotence and post-disposal failure are caller-visible contract facts.

## Keep a concise implementation mapping（示意）

Based on `renderTuiPromptTemplate` in `src/prompt.ts`:

**Over-trimmed:** "Renders the prompt template."

**Balanced:** "Interpolates one parsed prompt while removing horizontal separators adjacent only to unavailable values."

**Over-detailed:** A token-by-token restatement of the loop, including branches with identical names and obvious assignments.

Keep mapping details that explain where the renderer drops or alters content.

## Link rationale while keeping the local contract（示意）

dsh-tui has no `docs/` archive: architecture rationale lives in the `@module` block comment or the README "Migrations vs. the official removal" section.

**Over-trimmed:** "Disposal is documented in the module comment."

**Balanced:** "Disposal unregisters the value and later `set` calls fail. See the `TuiPromptService` module comment for the coalescing rationale."

**Over-detailed:** Repeating the microtask choreography and rejected delivery models beside every handle.

Keep the behavior and completion guarantee where callers need them. Link aggressively for rationale; a link cannot replace the local contract.

## A named gap stays a named gap（示意）

Based on the README repository-layout and migrations sections:

**Over-trimmed:** Deleting the `tests-pre-migration/` note because that directory is not built.

**Balanced:** "`tests-pre-migration/` — upstream test suite archive, not yet migrated (not built)."

**Over-detailed:** A file-by-file inventory of the archived specs with no behavioral distinction.

Keep shippable reality and named coverage gaps. Remove migration planning checklists, not the note that pins what is currently true.

## An access boundary may need one concrete example（示意）

Based on `src/chat/file-autocomplete.ts`:

**Over-trimmed:** "@file completion only indexes paths."

**Balanced:** "The index contains paths only: selected values remain ordinary prompt text and file contents stay behind the model-facing `read` tool."

**Over-detailed:** A list of every directory the traversal could visit and every hypothetical prompt route.

Keep one example when it makes an otherwise abstract access limit operationally clear.

## Delete reasoning transcripts entirely

**Over-detailed:** "First the loop checks whether the value is absent. If it is absent, the next branch returns early. Otherwise it continues, which is why the final assertion is safe."

**Balanced:** No comment when the code already expresses those branches. If the early return protects a non-obvious invariant, state only that invariant.

Do not compress a reasoning transcript into shorter narration; remove it.

## Configuration comments explain what the tree cannot（示意）

Based on `src/config.ts`:

**Over-detailed:** "This line turns on color, and the following line turns on the VSCode palette, and the next one auto-detects truecolor," when the adjacent schema lines already show those defaults.

**Balanced:** "No default: an unset `truecolor` auto-detects from `COLORTERM` in `apply`. Default on: the VSCode-blue 24-bit palette is the shipped look."

Keep the consequence of an unset value, a surprising scope rule, or a security boundary. Let the configuration schema show its own inventory.

## Do not trim for word count alone（示意）

**Current:** "Cancellable, reusable fuzzy index rooted at one agent working directory. Directory-scoped queries list live state; bare fuzzy queries share one bounded traversal until the `@` interaction ends or a tool result invalidates it."

**Shorter but worse:** "The file index is bounded."

**Balanced decision:** Keep the current sentence unless a link or surrounding contract already lists the scope distinction and invalidation triggers. The shorter version loses the consequence and distinctions without improving structure.

## Model-visible and user-visible text follows ownership（示意）

**Over-trimmed:** "The prompt shows errors."

**Over-detailed:** Copying every template default and dialog string from `src/config.ts` and the components into the README.

**Balanced:** "Prompt defaults are owned by `src/config.ts` and referenced by components by name; the README config sample quotes them and must stay in sync. State only local conditions or deltas elsewhere."

Wording that reaches the model or the terminal is behavior, but duplication still drifts. Exactness belongs at the owner.

A prose-only audit may identify suspect wording but must not silently change it when the owning component is out of scope. Leave it unchanged and report the deferral, or expand the authorized change to include the owner.

## Generated artifacts must be regenerated at the owner（示意）

Based on the `lib/` build:

**Over-trimmed:** Hand-editing `lib/` to fix a comment or string.

**Balanced:** "Edit `src/`, then rebuild with `pnpm build`; `lib/` is a derivative and any hand edit is lost on the next build."

**Over-detailed:** Repeating the build command sequence inside every changed comment.

Know what the build produces and regenerate from the owner. dsh-tui has no generated model-visible catalog; the same principle applies to the `lib/` output.

## Limitations are contracts, not debt inventories（示意）

Based on the README "Requirements" section:

**Over-trimmed:** Omitting the TTY requirement.

**Over-detailed:** Listing every loader warning and private helper cleanup with no user consequence.

**Balanced:** "Node.js ≥ 22 and an interactive TTY (the plugin refuses pipes: *"both stdin and stdout must be TTYs"*). Peer packages installed by the hosting dsh installation."

Retain gaps and non-obvious constraints that affect use or safe maintenance. A README is not a backlog dump.