---
name: dsh-pre-push-checks
description: This skill should be used when checking a dsh-tui branch before pushing, force-pushing, or marking it ready for review (pre-push checks), and immediately after gh stack sync publishes rewritten branches, to run the smallest checks that cover the outgoing or just-published diff without reflexively running the full repository suite.
---

# dsh-tui Pre-Push Checks

> 来源：deepseek-harness 仓库 .agents/skills/dsh-pre-push-checks（master @ cd5ef81481），2026 年按 dsh-tui 项目针对性改造。

Use this skill to run the relevant local checks once before a `dsh-tui` push. The sole ordering exception is `gh stack sync`, which may publish a cascading rebase before the rewritten layers can be validated; validate them immediately afterward and do not merge until the evidence passes.

## Inspect the outgoing change

1. Confirm the checkout and branch.

```sh
git status --short --branch
git rev-parse --show-toplevel
```

2. Verify the live PR base or stack parent, fetch that ref, and inspect the complete scope against it.

```sh
git fetch origin <base-ref>
git diff --stat <base-ref>...HEAD
git log --oneline <base-ref>..HEAD
```

Supply the ref verified from current remote or stack state. After merging a changed base, rerun the comparison, reassess which behavior the combined scope can affect, and rerun only the checks invalidated by the merge.

## Run the project checks

dsh-tui exposes exactly two scripts: `pnpm typecheck` (`tsc -b --noEmit`) and `pnpm build` (`tsc -b && tsdown --config tsdown.config.ts`). Run both before any push, force-push, or ready-for-review marker:

```sh
pnpm typecheck
pnpm build
```

- **Source, configuration, or build changes** (under `src/`, `cordis.patch.yml`, `package.json`, `tsdown.config.ts`): `pnpm typecheck` and `pnpm build` are the whole script-level check surface; `build` also emits the `lib/` artifacts shipped in the package.
- **Historical specs under `tests-pre-migration/`**: the project does not currently wire a test runner (no `test` script in `package.json`), so there is nothing to run for these files; if a runner is added later, run only the spec that owns the changed behavior.
- **README bilingual pair (`README.md` / `README.zh.md`)**: no script validates it; confirm manually that the two files still link to each other and stay aligned.

Do not repeat a check that already passed merely because a commit or push follows.

## Protect history-rewriting pushes

Rebase is allowed for standalone and stacked PR branches, including after review. Before a standalone history rewrite, fetch the current remote branch and record its exact OID; publish with `--force-with-lease=<branch>:<observed-oid>` so a concurrent update aborts the push. `gh stack push` and `gh stack sync` supply lease protection for their managed branches. Raw `--force` is never allowed.

After any rewritten push, fetch the live heads again and re-audit unresolved review threads, approvals, mergeability, and checks. Commit hashes and inline-comment anchors from before the rewrite are not current evidence.

### Post-sync validation

`gh stack sync` fetches, cascade-rebases, and pushes as one operation, so it cannot place local validation between rewrite and publication. Before running it, require a clean worktree and record the official stack order and exact remote heads. After it returns:

1. Re-query every branch head and the official GitHub stack order.
2. Inspect the changed scope of every rewritten layer against its live PR base.
3. Run the relevant checks selected by this skill for each affected layer.
4. Keep every PR unmerged and report validation as pending until all selected checks pass.

If post-sync evidence fails, leave the lease-protected published heads in place, repair the failure, validate the repair, and publish the correction. Do not claim the sync made the stack ready merely because the command succeeded.

## Handle failures

If a relevant check fails before an ordinary push, stop and fix or explain the blocker. Do not push and hope CI differs. For the post-sync exception, block the merge and follow the repair procedure above.

If a failure looks environment-specific, prove it:

- Record the exact command, failing check, and platform-specific mismatch.
- Confirm the relevant non-platform evidence.
- Prefer fixing cross-platform nondeterminism when the check is required.

## Push procedure

For ordinary and standalone rebase pushes:

1. Run `pnpm typecheck` and `pnpm build` once.
2. Commit normally.
3. Push normally, or use the exact lease for an authorized rewritten branch.
4. Verify the remote ref matches local `HEAD`.

```sh
git rev-parse HEAD origin/$(git branch --show-current)
```

For GitHub PRs, inspect remote CI after the push:

```sh
gh pr checks
```

Report pending checks as pending. Inspect failures before attributing them to the branch or the environment.

When `gh pr checks` reports "no checks reported" and `/actions/runs?head_sha=<sha>` returns `total_count: 0`, read mergeability before suspecting the push or a dropped GitHub event:

```sh
gh pr view <number> --json mergeable,mergeStateStatus
```

GitHub creates no `pull_request` workflow runs while a PR is `CONFLICTING`/`DIRTY`, so the absent signal is the conflict, not infrastructure. Resolving the conflict is the only fix; empty commits, `--allow-empty` pushes, draft/ready toggles, and revert-and-restore bounces all leave `total_count` at zero and add junk history. Confirm the conflicting paths with `git merge-tree --write-tree HEAD origin/<base>` when the branch cannot be merged locally yet.

For `gh stack sync`, use the post-sync validation sequence instead of pretending the ordinary order was possible.