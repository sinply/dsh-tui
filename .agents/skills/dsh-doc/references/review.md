# Review criteria

## Summary

Review the README pair by whether a reader completes an outcome, not by whether every template heading exists. Verify prose against code and tests, preserve exact contracts, and keep the two sides useful to users while exposing enough implementation detail for maintainers. Run the repository's standing checks (`pnpm run typecheck`, `pnpm run build`); the existing dsh-tui README pair is the reference example of the format.

## Table of Contents

- [Newcomer test](#newcomer-test)
- [Evidence review](#evidence-review)
- [README pair review](#readme-pair-review)
- [Reference example](#reference-example)
- [Verification](#verification)
- [Dev Note](#dev-note)

## Newcomer test

A professional engineer with no repository context should answer the following from three to five linked pages or sections: what the TUI does, how to install and run it safely, its requirements (Node.js >= 22, interactive TTY), where its state lives (the durable session transcript), how it fails, and where to change it (`src/` layout). If the reader must inspect source merely to discover the public flow, restore the missing explanation. If the reader must absorb unrelated internals, move those details deeper.

## Evidence review

Check each material statement against its strongest owner. Use `package.json` for scripts, dependencies, and the `dsh.bundle.patch` declaration; `cordis.patch.yml` for the profile layer; `src/` types and code for config fields, commands, shortcuts, and behavior; `tests-pre-migration/` for the exercised historical contracts; `README.zh.md` for the Chinese side's mirror correctness. Never treat a prior README, discussion, or report as stronger than current code and tests.

For every operational claim — a CLI command, a config snippet, a default value, an error message, a platform difference — the evidence is running it, not reading it. Execute the exact command or mount the exact configuration before the page may state its behavior; quote only observed output, warnings, and failures. The TUI refuses non-TTY pipes, so verify interactive claims in a real terminal. Claims that depend on unavailable keys or networks name their verification owner instead of asserting behavior. For pre-existing prose, compare against latest `origin/main` and re-verify stale statements against code.

Classify the package before reviewing its install guidance: `dsh.bundle.patch` in `package.json` declares the profile bundle, and the README's `dsh plugin --profile <name> add <tarball>` path is the documented install; never add a different install shape, and never present profile-install guidance where the README documents a plain `npm install` dependency path.

Retain a statement only when it helps the target reader act, reason, or avoid misuse. Move rationale, history, test walkthroughs, duplicate catalogs, and unrelated detail to their owners.

## README pair review

Require the following:

- a short intro and an outcome-oriented `Features` list that state what the TUI does;
- a smallest safe install path (profile bundle, then dependency) with requirements, verified against the current checkout;
- complete, exact reference tables for shortcuts and commands, checked against `src/prompt.ts` and `src/chat/`;
- configuration consistent with the `src/config.ts` schema, defaults stated;
- observable behavior, failure modes (TTY refusal, exits), durability (session transcript), and limits relevant to users;
- current-state prose everywhere except the explicitly historical `Migrations vs. the official removal` section;
- bilingual alignment: headings, lists, tables, code fences, links, and physical line count one to one; terminology mirrored; code blocks byte-identical;
- no hand-copied repository inventories that drift from `src/`.

Reject any user-facing section that narrates internals and any list that enumerates APIs instead of explaining the concept.

## Reference example

The existing README pair at the repository root (`README.md`, `README.zh.md`) is the production example: H1, language-switcher line, third-party notice, a two-to-four-sentence intro, outcome-oriented `Features`, `Install & use` (bundle and dependency paths, requirements), reference tables for shortcuts and commands, `Configuration`, developer-facing `Build from source`, `Repository layout`, `Migrations vs. the official removal`, and `License`. Use its structure, evidence standards, and bilingual alignment as the model for every documentation change; ground every claim the way it grounds its install and requirements statements.

## Verification

Run the smallest focused checks while iterating, then the standing checks:

```sh
pnpm run typecheck
pnpm run build
git diff --check
```

Also compare English/Chinese physical line counts for the pair and re-read the final diff once for factual completeness and once for brevity, navigation, and ownership. Use [dsh-pre-push-checks](../../dsh-pre-push-checks/SKILL.md) before pushing; dsh-tui has no further documentation gates.

## Dev Note

None.