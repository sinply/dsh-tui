# Page structure and hierarchy

## Summary

dsh-tui keeps one root documentation surface — the bilingual README pair — and no `docs/` tree. The README gives a newcomer a short front door (title, language switch, notice, intro) before operational depth (features, install and use, shortcuts, commands, configuration) and developer depth (build, layout, migrations, license). When a section would outgrow the README, move the detail into the owning source file or test contract rather than a second documentation page.

## Table of Contents

- [Page order](#page-order)
- [Section progression](#section-progression)
- [Documentation hierarchy](#documentation-hierarchy)
- [Small documents](#small-documents)
- [When to grow the README](#when-to-grow-the-readme)
- [Dev Note discipline](#dev-note-discipline)
- [Dev Note](#dev-note)

## Page order

Use this order for the README pair, matching the existing pages:

1. H1 title.
2. Language-switcher line (`**Languages:** English · [简体中文（中文文档）](README.zh.md)` and the Chinese mirror).
3. Optional notice blockquote — the existing third-party maintenance disclaimer.
4. Short intro paragraph stating what the project does (two to four sentences).
5. `## Features` — outcome-oriented user-facing bullets.
6. `## Install & use` (Chinese: `## 安装与使用`) — profile-bundle install, dependency install, requirements.
7. Reference material: `## Keyboard shortcuts` and `## Commands`.
8. `## Configuration` — the accepted YAML fields with defaults.
9. Developer-facing sections: `## Build from source`, `## Repository layout`, `## Migrations vs. the official removal`.
10. `## License` — the BSD-3-Clause line linked to `LICENSE`.

Add a `Summary` paragraph and a `Table of Contents` only when the page grows long enough that one lookup requires scanning: the current compact pair has neither, and adding a navigation section to a short page is optional, not required. Keep the existing section names and their order stable across edits so anchors, links, and muscle memory keep working; change names only when content genuinely moves, and repair every inbound link in the same change.

## Section progression

Open every substantive section with a short orienting sentence before tables, code, or subsections; do not restart its whole content. Within the page, order content by reader depth:

1. Basic use: what the TUI does, when to choose it, install, shortest safe run (`dsh --profile tui`), observable success, and recovery (Esc, Ctrl+C, Ctrl+D).
2. Operation: shortcuts, commands, configuration choices, and limits.
3. Developer detail: build, repository layout, migrations.

Developer detail stays concept-level: the build flow (`tsc` + `tsdown`), the source map, and the migration story — enough to understand how the project works. Include no API inventories, exhaustive field lists, or JSDoc restatement; name the owning files (`src/config.ts`, `src/prompt.ts`, `src/runtime.ts`, `src/components/`) and let the code carry exact detail.

## Documentation hierarchy

Repository-wide, respect the fact-owner rule: the README pair owns user- and maintainer-facing documentation; `src/` owns implementation truth in types, defaults, and comments; `tests-pre-migration/` owns the historical test contracts; `package.json` and `cordis.patch.yml` own packaging and profile-layer facts. Never copy a code inventory into the README if the code can change without the README changing — link or name the owner instead. dsh-tui has no `docs/` directory today; if new documentation ever appears, keep it as close to its owner as the README is to the repository root, and keep it in the same bilingual discipline.

## Small documents

Do not fragment rules into small files without a real owner: dsh-tui's rules live in the README sections that own them. Add a standalone Markdown file only when a rule has its own change cadence and inbound links; if one ever appears, write it in the same pair pattern (`<file>.md` + `<file>.zh.md`), link it from the README, and align it line for line.

## When to grow the README

Grow a section before creating a new page, and keep the common path short. When one lookup requires scanning unrelated groups, split by the existing domain owner: keyboard material stays in `Keyboard shortcuts`, command syntax stays in `Commands`, configuration stays in `Configuration`. If a new subsystem needs more than a section, propose the split in the same change that writes it, keep the bilingual pair intact, and name the split in the PR description.

## Dev Note discipline

The final section of the README is `License`, as the existing pair shows; do not append a Dev Note or scratch section to the published README. Keep working hypotheses, undecided directions, and disused ideas out of the pair entirely — record them in the PR description, not in committed docs.

## Dev Note

None.