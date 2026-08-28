---
name: record-browser-gif
description: This skill should be used when the user asks to record a demo of dsh-tui, make or generate a GIF, record the TUI, or create a demo recording — the primary scenario captures a terminal session of the dsh-tui TUI (TTY via script or asciinema) and encodes deterministic frames, and the secondary scenario demonstrates dsh-tui behavior in the harness Web GUI or a related Web interface. Every pull request that changes user-visible behavior MUST include a GIF recorded from the pull request's real build and runtime flow, published via a dedicated assets branch.
---

> 来源：deepseek-harness 仓库 .agents/skills/record-browser-gif（master @ cd5ef81481），2026 年按 dsh-tui 项目针对性改造。

# Record dsh-tui Demo GIFs

Produce a short, truthful demonstration of dsh-tui as a local GIF — the primary scenario records a terminal session of the dsh-tui TUI and encodes deterministic frames; the secondary scenario demonstrates dsh-tui behavior in the harness Web GUI or a related Web interface. Publish through the assets-branch workflow only when the task includes attaching the GIF to a pull request. Keep state-based frame capture for repeatable timing, dimensions, and size, and use the bundled encoder to verify the result.

## Every pull request with visible behavior changes includes a GIF

A pull request that changes user-visible behavior — the TUI's rendering, layout, colors, transcript, dialogs, prompts, or a Web GUI surface the change touches — MUST include a demonstration GIF recorded with this skill and embedded in the pull request body via the assets-branch workflow.

The recording itself is part of the evidence: capture it from that pull request's branch tree built with `pnpm build`, running on the real harness runtime with a real model round. Never substitute fixture queries, mock transports, synthetic event injection, or test-only hooks unless the user explicitly asked for a fixture recording. Next to the embed, state the exact demonstrated commit SHA, the tree and origin that served it, any mode flags or state exceptions, and whether a real model round ran, so reviewers know exactly what the recording proves.

## Keep recording separate from publication

- Recording produces frame images and one local `.gif` artifact only; it never mutates remote state.
- Publication — pushing the GIF to an assets branch and embedding it in a pull request body — is the separate final step, performed only when the task includes attaching the GIF to a pull request. It never touches the pull request's own branch.
- Preserve the requested recording conditions. A real-runtime demo must not use fixture queries, mock transports, synthetic event injection, or test-only hooks. If credentials or the runtime are unavailable, report that limitation instead of substituting a fixture.
- Never read or expose credential values. Use the application's normal configuration path and a benign demonstration prompt.

## Stage the build

A GIF for a specific pull request demonstrates that pull request's tree, so stage per pull request:

1. Require a clean worktree, record its exact commit with `git rev-parse HEAD`, then build that recorded tree with `pnpm build`. A GIF captured against another commit's build misattributes the evidence. Run `pnpm typecheck` first when the change touches types.
2. Launch one runtime instance per pull request from that tree with fresh scratch state — a fresh `DSH_HOME`, workspace, and session state — and a real model route. Give the terminal a fresh TTY/PTY. If the browser path reuses an existing profile, clear that origin's cookies and site storage before navigation so persisted client state cannot affect the evidence. Source credentials through the application's normal configuration path; never echo them.
3. Treat one storyboard as one evidence run: every published frame comes from that instance, those state roots, and the model-backed scenario run. If capture automation fails, discard its frames and rerun from fresh roots; never splice frames from separate runs.
4. When switching between pull requests, stop the old instance by PID or an exact match on its command line. A broad `pkill -f` pattern can match and kill the shell that launched it — including your own.

## Record a terminal session (primary scenario)

1. Record the TTY session with `script` (typescript plus timing file) or `asciinema` (cast file) while driving one real scenario: launch dsh-tui from the recorded tree and run a benign demonstration prompt against the real harness runtime.
2. Choose three to six states that tell one story, such as typed, running, settled, and detail. Prefer semantic state changes over continuous capture; omit loading churn that does not help the viewer.
3. Wait for a concrete UI condition before capturing each state — a settled transcript line, an enabled control or prompt echo, a changed status bar — never a fixed delay as proof that the application reached the state.
4. Convert the cast into one frame per state: render it with a cast-to-GIF tool such as `agg`, or replay it in a terminal emulator at a fixed geometry and capture a screenshot at each state boundary. Alternatively capture screenshots directly while the session runs.
5. Keep one viewport and crop for every frame, and name frames lexically: `00-initial.png`, `01-typed.png`, and so on.
6. Store frames in one dedicated directory outside tracked paths — a gitignored `gif-frames-<label>/` subdirectory when the repository provides one, otherwise a temp directory — and create it first (`mkdir -p …`), so capture never fails with ENOENT at write time.
7. Capture a transient state (running row, spinner) by driving a slow foreground operation — for example, a `sleep 15` bash command — and polling a concrete marker in the terminal output (a status line or pane prefix) inside one capture-script call that also grabs the frame. State polled across separate tool calls is lost, because the turn settles between calls.
8. Engineer the prompt so the state actually occurs: instruct the model to wait in the foreground when it would otherwise background a slow command, and give it a settle sentinel such as "reply with the single word done" to anchor the completion predicate.
9. Make completion predicates match exact text — a transcript line whose trimmed text equals the expected reply — never a substring check, which the echo of the user's own prompt also satisfies.
10. When the claim involves a tool call, rejection, or recovery, include a detail or trajectory frame that shows the tool identity, status or stable error code, and the downstream result. A chat-only outcome does not prove why the tool path behaved that way.
11. Capture no secrets, personal data, unrelated panes, or transient notifications. Stop any unnecessarily long real-API run after the demonstrated state is visible.

## Record a browser or Web UI session (secondary scenario)

Use this path when demonstrating dsh-tui behavior in the harness Web GUI or another Web interface — for example, a web surface the change renders or touches.

1. Use the available browser automation: an installed browser-control skill, or a repository-declared Playwright dependency in an isolated headless browser. Never install another driver or launch the user's browser without authorization. If no automation is available, report the limitation and fall back to the terminal-session path. State the source in the provenance.
2. Before recording, identify the exact origin, whether the app is built or in development, the transport, and any fixture or mock mode. Record only claims that the observed setup supports.
3. When a production default opens a native operating-system surface that headless automation cannot drive, select an official browser-operable production backend through the application's normal configuration. State the override in the provenance; a fixture, mock transport, or test-only hook is not an acceptable substitute.
4. Choose three to six states that tell one story, then keep one viewport and crop for every frame and name frames lexically (`00-initial.png`, `01-typed.png`, and so on).
5. Store frames under a dedicated gitignored or temp directory. Browser-tool screenshots can only be written under the tool's allowed roots, and relative filenames resolve against the working directory. Create the frame subdirectory first (`mkdir -p .gif-frames-<label>`); writing into a missing directory fails with ENOENT at capture time.
6. Before each screenshot, wait for a concrete UI condition such as a unique label, enabled control, changed document title, or completed response. Require the locator to resolve exactly one element; for accessible-name locators, use `exact: true` when equality is intended because descendant text or a prompt echo can otherwise create a false match. Do not use a fixed delay as proof that the application reached the state.
7. Make completion predicates match an exact-text element — for example, an element whose trimmed text equals the expected reply — never a substring check such as `body.textContent.includes(...)`, which the echo of the user's own prompt also satisfies.
8. When the claim involves a tool call, rejection, or recovery, include a detail or trajectory frame that shows the tool identity, status or stable error code, and the downstream result. A chat-only outcome does not prove why the tool path behaved that way.
9. Capture a transient state (spinner, running row) by driving a slow foreground operation and polling a concrete DOM marker (a `data-*` attribute) inside one browser-script call that also takes the screenshot. State polled across separate tool calls is lost, because the turn settles between calls.
10. Capture no secrets, personal data, unrelated tabs, or transient notifications.

Use the browser's own screenshot API. When it returns image bytes, save those bytes directly; the encoder detects image content independently of the filename extension.

## Encode the GIF

Require `python3`, `ffmpeg`, and `ffprobe`. If either media binary is missing, report the dependency instead of installing software without authorization.

Export `GIF_SKILL_DIR` as this skill's absolute directory on its own line before the python command — an inline `GIF_SKILL_DIR=... python3 "$GIF_SKILL_DIR/..."` assignment fails, because the argument expands before the assignment takes effect:

```sh
export GIF_SKILL_DIR=/absolute/path/to/this/skill
python3 "$GIF_SKILL_DIR/scripts/encode_gif.py" \
  /absolute/path/to/frames \
  /absolute/path/to/demo.gif \
  --durations 1.5,1.5,1.5,3.5 \
  --fps 10 \
  --max-width 1200 \
  --colors 128
```

One duration applies to every frame; otherwise provide one comma-separated positive duration per frame, holding the final settled state longest. The encoder rejects fewer than two frames, mismatched dimensions or durations, invalid limits, accidental overwrite, unexpected duration, and output above `--max-bytes`.

For a large artifact, reduce `--max-width` first, then `--colors` or `--fps`; retain readable text and the final state long enough to inspect. Use `--force` only after resolving the exact output path.

## Verify the artifact

1. Read the encoder's JSON summary and confirm the output path, source and encoded frame counts, dimensions, duration, and byte size.
2. Visually read the encoded GIF itself, not only the source frames. Confirm that the transition is legible, the last state is held long enough, and no sensitive content appears. If the viewer renders only the first frame, decode representative frames from the encoded GIF with `ffmpeg` and inspect those; the pre-encode frames do not prove the encoded order, palette, or final hold.
3. Run `git status --short` and confirm frames and the artifact landed only under ignored or untracked temp paths.
4. Return the absolute GIF path, render it when the client supports local media, and state whether the recording used a real model round, a fixture, or another transport. When the task does not include attaching the GIF to a pull request, stop here.

## Publish to an assets branch

Perform this step only when the task includes attaching the GIF to a pull request.

Never commit a GIF to the pull request's own branch or any branch that merges into a long-lived branch: binary media committed there bloats the repository history for every future clone. GIFs live on a dedicated orphan assets branch — a branch with no parent commit and nothing but media — and one assets branch serves a whole pull request series (named `<series>-assets`; list existing ones with `git ls-remote --heads origin '*assets*'`).

Before either workflow below pushes, verify that the assets branch contains media only and that the staged GIF's checksum matches the verified local artifact.

For an existing assets branch, work in a shallow single-branch scratch clone so the publication cannot touch your working tree:

```sh
git clone --branch <assets-branch> --single-branch --depth 1 <repo-url> /tmp/assets-checkout
cp /absolute/path/to/demo.gif /tmp/assets-checkout/<name>.gif
cd /tmp/assets-checkout
git add <name>.gif
git commit -m "assets: <what it shows> gif (#<pr>)"
git push origin <assets-branch>
```

For a new series, make a fresh shallow scratch clone (`git clone --depth 1 <repo-url> /tmp/assets-checkout`), create the orphan branch with `git switch --orphan <assets-branch>`, then add the GIF, commit, and push the same way.

After pushing, use authenticated GitHub API or raw requests to confirm the remote path, byte size, checksum, `200` response, and `image/gif` content type. An anonymous `404` does not disprove a private-repository asset; authenticate the verification instead. This proves the repository-member review path, not public availability.

Immediately before editing the pull-request body, re-read its live head and compare it with the commit recorded next to the GIF. Stop and re-record when it moved. After the edit, re-read the live head and require it to remain at that recorded commit. Separately, render the body through GitHub's Markdown API and confirm that the expected `<img>` is present.

Embed the GIF in the pull request body with the raw blob URL; the `?raw=true` suffix is required, because the plain blob URL renders GitHub's file page instead of the image:

```markdown
![<alt text>](https://github.com/<owner>/<repo>/blob/<assets-branch>/<name>.gif?raw=true)
```

Never delete or rewrite an assets branch, and never force-push it: merged pull request bodies reference its URLs forever. Append new commits only.