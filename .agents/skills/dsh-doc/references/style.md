# Page style

## Summary

Keep the README pair scannable and hard to misread: a short intro paragraph, controlled technical English on the English side, natural Simplified Chinese on the Chinese side, tables for reference material, and disciplined emphasis. Match the existing pair's conventions — no `-----` separators, no `<details>` folds, no frontmatter — and keep code blocks byte-identical across languages.

## Table of Contents

- [Short intro paragraph](#short-intro-paragraph)
- [Controlled technical English](#controlled-technical-english)
- [Natural Simplified Chinese](#natural-simplified-chinese)
- [Sections and tables](#sections-and-tables)
- [Emphasis discipline](#emphasis-discipline)
- [Dev Note](#dev-note)

## Short intro paragraph

Open the README pair directly after the notice blockquote with two to four sentences stating what the project DOES: an interactive full-screen terminal UI for DeepSeek Harness agents, what it renders, and at what cost — a durable session transcript, one configured agent, keyboard-driven dialogs. Do not start with history or identity narration; the existing pair's opening paragraph is the model.

## Controlled technical English

Use an [ASD-STE100](https://www.asd-ste100.org/)-inspired review pass for the English side that an agent, translator, or non-native reader must parse. This is a clarity discipline, not certified ASD-STE100 compliance; dsh-tui does not reproduce or validate the standard's controlled dictionary.

- Name the actor and action. Prefer active voice when the actor matters.
- Use one stable term for each concept; do not rotate synonyms for variety.
- Prefer direct verbs over nominalizations and ambiguous phrasal verbs.
- Put one instruction in each sentence; use a list for three or more steps or conditions.
- Split semicolons and long clause chains; keep each paragraph on one topic.
- Remove unsupported quality adjectives and stacked hedges; preserve every fact and degree of uncertainty from the source.

Treat 20 words for an instruction and 25 words for a description as review prompts, not mechanical gates. Keep a longer sentence when a split would hide a condition or relationship. Never remove or strengthen `must`, `may`, `never`, timing, exceptions, numbers, or other contract terms to meet a length target. [dsh-prose-standard](../../dsh-prose-standard/SKILL.md) owns the complete-proposition rule.

## Natural Simplified Chinese

Write the Chinese side as natural Simplified Chinese that mirrors the English side line for line — same headings, same table cells, same code, same physical line count — without sounding word-for-word translated. Keep technical tokens and commands in Latin exactly as the English side writes them (`dsh plugin --profile tui add`); gloss a term in Chinese only at first use; keep both sides expressing the same proposition. Never drop a contract term (`必须`, `拒绝`, `≥ 22`) to shorten the line.

## Sections and tables

Keep the existing `##` section set and order; separate sections with a blank line. The pair uses no `-----` horizontal rules — do not introduce them mid-pair. Render keyboard shortcuts, commands, and configuration as GitHub tables, mirroring the existing pair; keep table rows one-to-one across languages and code fences byte-identical. A `-----` rule immediately after a paragraph would parse as a Setext heading; avoid it.

## Emphasis discipline

Reserve bold for the clause that changes behavior or the comparison that matters: the language-switch labels, the UI identity labels (`**You**`, `**❯ Assistant**`, `**Context**`), and the failure condition (`stdin and stdout must be TTYs`). Mirror bold on the corresponding Chinese line. Do not bold section headings, list prefixes, or every feature bullet.

## Dev Note

None.