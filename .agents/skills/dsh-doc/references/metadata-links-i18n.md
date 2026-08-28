# Bilingual links and line alignment

## Summary

dsh-tui's documentation is the root bilingual README pair, and the pair carries no YAML frontmatter: the sibling filenames and the language-switcher line own the pairing, so harness conventions such as a `kind` template selector have no place here. Keep both sides equally authoritative, one-to-one in structure, and aligned line for line. Link syntax must render correctly on GitHub, so repository links stay renderer-valid relative URLs.

## Table of Contents

- [README metadata](#readme-metadata)
- [Bilingual linking](#bilingual-linking)
- [Terminology quality](#terminology-quality)
- [Repository links and path mentions](#repository-links-and-path-mentions)
- [Bilingual line alignment](#bilingual-line-alignment)
- [Dev Note](#dev-note)

## README metadata

Keep dsh-tui READMEs free of YAML frontmatter. The existing pair (`README.md`, `README.zh.md`) opens directly with the H1 title, the language-switcher line, and the third-party notice; GitHub renders these directly. Do not introduce harness conventions the project does not use: no `kind` field selecting a template, no `description` frontmatter, no pairing metadata, no `tags`. The H1, the stable section headings, and full-text search carry retrieval. Keep keys, heading names, and the language-switcher line stable across edits.

## Bilingual linking

Put the language-switcher line directly under the H1 on both sides, exactly as the existing pair does:

English side:

```markdown
**Languages:** English · [简体中文（中文文档）](README.zh.md)
```

Chinese side:

```markdown
**语言：** 简体中文 · [English](README.md)
```

Each side links to its sibling with the other language's display name; the target is the sibling filename, never a locale directory or a content hash. Keep this line mirroring correctly on every edit.

## Terminology quality

Keep one stable term per concept on each side and mirror it in the other language on the corresponding line. Follow the habit the existing pair establishes: technical tokens stay Latin (`/model`, `@file`, `Ctrl+O`, `cordis.patch.yml`, `dsh plugin`), and the Chinese side keeps the Latin form, glossing a term only at first use. When a term has no established Chinese rendering, keep the English term rather than inventing one. Preserve every `must`, `may`, `never`, timing, and exception in translation; never soften a contract to make prose shorter.

## Repository links and path mentions

Keep link destinations machine-checkable and context-relative. Use fragment-only links for the current page's own sections; use full URLs for external resources, such as the DeepSeek Harness repository URL in the third-party notice. Name repository paths such as `src/`, `lib/`, `tests-pre-migration/`, and `cordis.patch.yml` as inline code — a logical path mention needs no link. Do not use leading-slash Markdown URLs: on GitHub they resolve outside the repository and break silently.

## Bilingual line alignment

Keep English and Simplified Chinese equally authoritative. Match heading levels, blank lines, paragraphs, list items, tables, code fences, link targets, and total physical line count one to one. The English side points every relative link at the `.md` target; the Chinese side points it at the `.zh.md` sibling when that counterpart exists and falls back to the `.md` target otherwise. Translate prose naturally within its corresponding line; do not hard-wrap either language. Keep code blocks and tables byte-identical and reposition first-use terminology annotations without changing line structure.

Line equality is a structural check, not proof of faithful meaning. Review still owns completeness, terminology, natural language, and whether each line expresses the same proposition. dsh-tui has no automated pairing gate or sidecar record: after every edit, re-read both sides and confirm line counts and mirroring manually.

## Dev Note

None.