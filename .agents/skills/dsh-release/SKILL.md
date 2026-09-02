---
name: dsh-release
description: This skill should be used when releasing a new dsh-tui version, lifting the build baseline to a newer DeepSeek Harness channel (alpha/rc), migrating dsh-tui to breaking harness API changes, or publishing the release package — the full cycle from baseline bump through typecheck/build, pack, profile install, tag, GitHub release, and push.
---

# dsh-tui release cycle

> 来源：dsh-tui 自身运营实践（2026，dsh 0.1.2-alpha.2 → alpha.3 迁移与 v0.1.4/v0.1.5 发布验证），固化为可复用流程。

## Summary

dsh-tui tracks the DeepSeek Harness channel the deployment actually runs. Each release: (1) align the build baseline (`pnpm-workspace.yaml` overrides) with the target channel, (2) migrate any breaking API drift until `tsc -b --force` is clean, (3) rebuild, pack, install into the `tui` profile, (4) sync the bilingual README, (5) tag and publish a GitHub release, (6) push. Keep every step verifiable; run only the commands this skill lists.

## Table of Contents

- [When to use](#when-to-use)
- [Baseline alignment](#baseline-alignment)
- [Compatibility gate](#compatibility-gate)
- [Migration surfaces](#migration-surfaces)
- [Release package](#release-package)
- [Documentation sync](#documentation-sync)
- [Git and GitHub release](#git-and-github-release)
- [Verification checklist](#verification-checklist)
- [Dev Note](#dev-note)

## When to use

Use this skill for any of: a new dsh-tui version bump, a "can dsh-tui work on harness version X" question, a failing typecheck after the harness channel moved, or a release with no tag yet. First record which channel the deployment runs (`dsh --version`, `npm view @deepseek-ai/dsh dist-tags`) and which dsh-* versions that channel pins.

## Baseline alignment

1. Read the channel: `dsh --version`; `npm view @deepseek-ai/dsh dist-tags`; `npm view @deepseek-ai/dsh-base dist-tags`. Target the channel that matches the deployment (usually `alpha`).
2. For each `@deepseek-ai/dsh-*` peer in `package.json`, confirm the channel version is published: `npm view @deepseek-ai/<pkg> versions` (a leaf sometimes lags the channel; keep it at its highest published version).
3. Rewrite every override in `pnpm-workspace.yaml` to the target version (map form `'@pkg': version`; pnpm 11 ignores any `pnpm.overrides` in package.json). Note: pnpm may prepend a managed `minimumReleaseAgeExclude` block — leave it.
4. `pnpm install`. Treat `ERR_PNPM_NO_MATCHING_VERSION` as a real gap; treat transient `UND_ERR_DESTROYED` fetches as flakiness — retry once before concluding a package is missing.
5. Update the README `Build from source` note and the `Migrations` bullet to the new baseline version — both languages, same physical line count.

## Compatibility gate

Run, in order; stop and fix at the first failure:

```bash
node node_modules/typescript/bin/tsc -b --force --noEmit   # full rebuild typecheck
pnpm build                                                  # tsc -b && tsdown
git diff --check                                            # whitespace hygiene
```

`tsc -b` without `--force` may replay a stale `.tsbuildinfo`; always force. Type-only imports (`import type`) from the dsh packages are erased at runtime, so a clean typecheck against the channel version is the migration contract.

To probe a channel WITHOUT touching the repo baseline, mirror `src/` + `tsconfig.json` + `package.json` + `pnpm-workspace.yaml` (overrides set to the probe channel) into a scratch dir, `pnpm install`, and run the gate there; drop in `@types/node`, `typescript`, `tsdown` as devDependencies on first probe.

## Migration surfaces

Pre-release channels break APIs freely (harness AGENTS.md: no compatibility promise). The known drift surfaces as of dsh 0.1.2-alpha.4, in order of likelihood:

- **user-questions**: `ctx.userQuestions.registerProvider(...)` is gone; compose an answerer on the Agent-scoped waterfall — `ctx.on('user-questions/request', (request, next) => …)`; claim by returning the answer promise, delegate with `next()`.
- **session event access** (alpha.4): `Session.events` is gone — call `session.snapshotEvents()`. Surface messages no longer share a `.data.message` envelope: `user/message` is a `UserMessage`, `assistant/message`/`tool/result` carry `message` directly — read them through `deriveEventMessage(event)`.
- **session exports**: `JsonValue`/`TodoItem` left `@deepseek-ai/dsh-session`; import `JsonValue` from `@deepseek-ai/dsh-util-values` and `TodoItem` from `@deepseek-ai/dsh-tool-todo` (the latter also carries the `todo/write` SessionEventMap augmentation, so the `todo/write` switch case typechecks again).
- **projection cache**: `coldSnapshot` and `cachedSnapshot` identities need the durable fork-lineage cut (`SessionLogOffset`) a listed record does not carry — leave persisted cold reads to the query engine: live titles from the projections snapshot, persisted titles from one `readTitleSnapshots` batch.
- **exhaustiveness guards**: `assertNever` was removed from `@deepseek-ai/dsh-llm`; keep a local two-argument helper.
- **new peers**: any module the migration imports becomes a peer — add `@deepseek-ai/dsh-*` to `peerDependencies` (+ `peerDependenciesMeta.optional`, and a workspace override).

Read the replacement contract at its source before editing: `git -C <harness-clone> show origin/master:packages/<group>/<pkg>/src/index.ts` is the fastest way to see the new shape.

## Release package

1. `package.json`: bump `version` (patch). `pnpm pack --pack-destination .` produces `dsh-tui-<version>.tgz`.
2. Remove the previous tarball; keep only the latest (`*.tgz` is gitignored).
3. Install into the running profile: `dsh plugin --profile tui add .\dsh-tui-<version>.tgz` (forwards to pnpm in the profile dir; `Packages: +1` + `Done` confirm). The profile resolves harness packages from the global `dsh` — verify `dsh --version` matches the baseline before trusting the run.
4. Verify the installed artifact: `Select-String -Path <profile>\node_modules\dsh-tui\lib\index.js -Pattern <marker>` with `-Encoding UTF8` (console output of UTF-8 files is otherwise GBK-mangled on this machine — always pass `-Encoding UTF8` or use ripgrep). Check migration markers present and old call sites absent.

## Documentation sync

The README pair is the single documentation surface (`dsh-doc`): headings, bullets, tables, and total physical line counts stay one-to-one between `README.md` and `README.zh.md`. After any feature change: update both sides in the same pass, keep every paragraph one physical line, and verify `(Get-Content README.md -Encoding UTF8).Count -eq (Get-Content README.zh.md -Encoding UTF8).Count`. Add a `Migrations` bullet (both sides) for API-baseline moves; update the `Project skills` table (both sides) when the skill set changes. Tarball version examples in the README install sections must point at the current release.

## Git and GitHub release

```bash
git add -A && git commit -m "<scope>: <summary>"   # e.g. "feat: migrate to the dsh 0.1.2-alpha.2 API baseline"
git push origin main
git tag v<version> && git push origin v<version>
gh release create v<version> .\dsh-tui-<version>.tgz --repo sinply/dsh-tui --title "dsh-tui <version> — <summary>" --generate-notes
gh release view v<version> --repo sinply/dsh-tui   # confirm asset + changelog range
```

Release only after the tarball is installed and the profile composition loads (`dsh --profile tui --dump-config` resolves `tui-prompt`/`ui-tui`). Changelog notes cover the last tag's range automatically.

## Verification checklist

- `tsc -b --force --noEmit` exit 0; `pnpm build` exit 0.
- Installed profile lib carries the new markers; no old-call-site residue.
- `dsh --profile tui --dump-config` exit 0, rows resolved.
- README pair line counts equal; version strings current in Build note, Migrations, install examples, and the skills table.
- tag + GitHub release exist with the tarball asset.
- Working tree clean; `git status -sb` shows `## main...origin/main`.
- Runtime smoke is owner-verified in a real TTY (`dsh --profile tui` boots, answer dialogs and todo panel behave).

## Dev Note

None.