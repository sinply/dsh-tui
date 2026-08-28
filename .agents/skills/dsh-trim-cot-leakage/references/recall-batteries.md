# Recall batteries

Probes for [the taxonomy](../SKILL.md#taxonomy). Every hit needs semantic judgment — the batteries over-match by design, and they under-match by nature: each review round of the original purge-style exercise found cases no battery caught, so pair them with an unpatterned read of the densest prose in scope.

## Corpus and invocation rules

- Scope the hunt to the prose surfaces dsh-tui actually keeps: `src/` (code comments and JSDoc), `README.md` and `README.zh.md` (the bilingual doc pair), and `tests-pre-migration/` (recorded fixtures and snapshots — derivatives, so judge hits there as quoted evidence of the owning source, not as usage).
- Exclude what a repo search does not own: build output (`lib/`), `node_modules/`, `.git/`, and the skill's own directory `.agents/skills/dsh-trim-cot-leakage/**` (its files quote leaked wording as calibration material). dsh-tui has no `vendor/`, no `.agents/notes/`, and nothing else that needs excluding — keep the exclusion list to what actually exists.
- Natural-language lines carry `-i` so sentence-initial capitals hit ("This PR adds…", "Probably fine…"); the first line, which matches code patterns, stays case-sensitive — `-i` would turn `\bT\d\b` and `\bP-I\b` into noise.
- Bound complete phrases. `\bthis PR\b` must match "this PR adds" without matching "this project", "this process", or "this provider".
- A zero-hit pattern proves nothing until it matches a known positive, and a noisy pattern proves nothing until it rejects a near-miss negative. Calibrate both before trusting a corpus result.
- Target authoring-language probes at the opposite-language surface: search Chinese residue in otherwise-English Markdown and code comments/JSDoc, and search Chinese change narration within `*.zh.md`. A generic ASCII search for English residue in Chinese prose is too noisy around code and identifiers; compare the prose additions against their counterpart instead.

## English battery

```sh
rg -n '\(decision \d|\(audit [A-Z]\d|design §|plan §|design ledger|\(B ruling|\bP-I\b|\bW\d\b|\bT\d\b' src README.md README.zh.md tests-pre-migration -g '!lib/**' -g '!node_modules/**' -g '!.git/**' -g '!.agents/**'
rg -n -i '\bthis PR\b|\bthis branch\b|\bthis stack\b|\blater PRs?\b|\bprevious commits?\b|\bthis commit\b' src README.md README.zh.md tests-pre-migration -g '!lib/**' -g '!node_modules/**' -g '!.git/**' -g '!.agents/**'
rg -n -i '\bused to\b|\bno longer\b|\bpreviously\b|\bthe old\b|\bwas renamed\b|\bwas moved\b' src README.md README.zh.md tests-pre-migration -g '!lib/**' -g '!node_modules/**' -g '!.git/**' -g '!.agents/**'
rg -n -i '\bv1\b|this cut|\bcut \d|\btoday\b|\bfor now\b|roadmap' src README.md README.zh.md tests-pre-migration -g '!lib/**' -g '!node_modules/**' -g '!.git/**' -g '!.agents/**'
rg -n -i 'rejected in review|review round|reviewer|as of v\d' src README.md README.zh.md tests-pre-migration -g '!lib/**' -g '!node_modules/**' -g '!.git/**' -g '!.agents/**'
rg -n -i 'probably |should be enough|should suffice|it simply|is safe —|is safe --' src README.md README.zh.md tests-pre-migration -g '!lib/**' -g '!node_modules/**' -g '!.git/**' -g '!.agents/**'
rg -n '§\d' src README.md README.zh.md tests-pre-migration -g '!lib/**' -g '!node_modules/**' -g '!.git/**' -g '!.agents/**'
```

## Chinese batteries

```sh
# Change or review narration in Chinese counterparts.
rg -n '评审|上一?轮|旧版|老的|不再|以前|本版|遗留' README.zh.md tests-pre-migration -g '*.zh.md' -g '!lib/**' -g '!node_modules/**' -g '!.git/**' -g '!.agents/**'

# Chinese authoring-language slips in English Markdown.
rg -n '设计稿|评审|上一?轮|旧版|老的|不再|以前|本版|遗留|私有|(^|[^a-zA-Z])端([^a-zA-Z]|$)' src README.md tests-pre-migration -g '*.md' -g '!*.zh.md' -g '!lib/**' -g '!node_modules/**' -g '!.git/**' -g '!.agents/**'

# Chinese authoring-language slips in English code comments and JSDoc.
rg -n '(^[[:space:]]*(//|/\*|\*)|//|/\*)[^\r\n]*(设计稿|评审|上一?轮|旧版|老的|不再|以前|本版|遗留|私有|端)' src -g '*.{ts,tsx,js,jsx,mjs,cjs,css}' -g '!lib/**' -g '!node_modules/**' -g '!.git/**' -g '!.agents/**'
```

## Known false-positive families

Judged and kept during the original purge; expect them again:

- **Instrumental "used to"** — "the key used to sign requests" is instrumental, not temporal. The temporal form has a subject state before it ("colors used to come from…").
- **Runtime old/new** — "the old connection drains before the new one accepts" names live objects during handover, not repo states.
- **"This PR" in process docs** — documentation *about* PR workflow ("the PR body should…", templates) legitimately says "PR"; the ban is on a doc adopting one PR's vantage about the code.
- **`v1` as protocol or path segment** — `/v1/chat` endpoints and wire-format names are identifiers, not version stamps.
- **`§N` with a committed owner** — external standards (RFC 9110 §10.1.5) and committed docs that own their §-numbering stay citable by section.
- **Contrastive "actually" and noun "wait"** — ordinary English, not hedging; no committed line probes them, so they surface only when the battery is extended with broader hedging patterns.
- **Runtime "today" and recorded timestamps** — prompts or tests that ask for the current date use natural time, not a repository version stamp; recorded CLI output keeps its voice. Wording that reaches a model or user still follows the behavior-evidence rule before any edit.
- **本版本 in zh prose** — a legitimate rendering of "this release" in versioned-artifact contexts; the banned indexical is 本版 as a bare stamp mirroring "this cut".
- **Alternatives-considered sections** — "rejected" inside a document's alternatives genre slot is the sanctioned home, not review choreography.