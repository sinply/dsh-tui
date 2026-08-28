/**
 * pi-tui transcript components: the startup banner, user/assistant messages,
 * per-step timing footer, streaming assistant buffer, tool cards, and the todo
 * panel. Each is a pure function of its inputs and the active palette.
 * @module dsh-tui/components/transcript
 */
import { Container, Markdown, Spacer, Text, truncateToWidth, wrapTextWithAnsi, } from '@earendil-works/pi-tui';
import { diffLines as compareLines } from 'diff';
import { preview, renderUnknownXml } from "./xml-tool-output.js";
import { displayInlineText, displayText } from "./text.js";
import { brandText } from "./theme.js";
import { WHALE_ART_COMPACT } from "./banner-whale.js";
import { contentText } from "./content.js";
import { formatCompletionTime, formatTimingTotals, } from "../chat/timing.js";
/** Concatenate the text of every block of one type, separated by blank lines. */
function textBlocks(content, type) {
    return content
        .filter((block) => block.type === type)
        .map(block => block.text)
        .join('\n\n');
}
/** Render a value as terminal-safe text: strings escaped, other values as pretty JSON. */
function pretty(value) {
    if (typeof value === 'string')
        return displayText(value);
    // JSON.stringify is typed to return string but yields undefined for e.g. symbols.
    const serialized = JSON.stringify(value, null, 2);
    return displayText(serialized ?? String(value));
}
/**
 * A side's content lines under the terminator rule the Web DiffBlock also
 * applies: empty text is zero lines, a trailing newline terminates the last
 * line, and an interior blank line survives.
 */
function diffContentLines(text) {
    if (text === '')
        return [];
    const body = text.endsWith('\n') ? text.slice(0, -1) : text;
    return body.split('\n');
}
/**
 * A file diff whose unchanged context stays neutral and does not affect exact
 * change totals. Comparisons beyond the edit-distance budget fall back to
 * whole-side rendering so a model-authored pending edit cannot stall the TUI.
 */
function renderDiff(diff, maxDiffEditLength, palette) {
    // The card header is a fixed `Tool / <name>` frame that never names a file, so
    // each hunk always carries its own path header (no redundancy to suppress).
    const lines = [palette.bold(displayText(diff.path))];
    let added = 0;
    let removed = 0;
    if (diff.oldText === null) {
        const newLines = diffContentLines(displayText(diff.newText));
        added = newLines.length;
        for (const line of newLines)
            lines.push(palette.success(`+ ${line}`));
        return { lines, added, removed, approximate: false };
    }
    const changes = compareLines(diff.oldText, diff.newText, { maxEditLength: maxDiffEditLength });
    if (changes === undefined) {
        const oldLines = diffContentLines(displayText(diff.oldText));
        const newLines = diffContentLines(displayText(diff.newText));
        lines.push(palette.dim(`[exact line diff omitted: >${maxDiffEditLength} changed lines]`));
        removed = oldLines.length;
        added = newLines.length;
        for (const line of oldLines)
            lines.push(palette.error(`- ${line}`));
        for (const line of newLines)
            lines.push(palette.success(`+ ${line}`));
        return { lines, added, removed, approximate: true };
    }
    for (const change of changes) {
        const changedLines = diffContentLines(displayText(change.value));
        if (change.added) {
            added += changedLines.length;
            for (const line of changedLines)
                lines.push(palette.success(`+ ${line}`));
        }
        else if (change.removed) {
            removed += changedLines.length;
            for (const line of changedLines)
                lines.push(palette.error(`- ${line}`));
        }
        else {
            for (const line of changedLines)
                lines.push(palette.dim(`  ${line}`));
        }
    }
    return { lines, added, removed, approximate: false };
}
/**
 * A message's bold, underlined role header in the role color. The underline
 * bands each role without a background fill or per-line prefix, so it reads on
 * any theme and a body drag-select copies the message text verbatim.
 */
function messageHeader(label, color, palette) {
    return palette.bold(palette.underline(color(`❯ ${displayText(label)}`)));
}
/** Brand name and one-line introduction for the banner's right column (the README's own words). */
const STARTUP_TITLE = 'DeepSeek Harness';
const STARTUP_DESCRIPTOR = 'open-source agent harness by DeepSeek AI';
/** Claude-Code-style hints shown on a fresh start (when no welcome subtitle is set). */
const STARTUP_TIPS = [
    'Type /help for a list of commands',
    'Ctrl+C to interrupt · Ctrl+D to exit',
];
/**
 * Borderless startup banner: the compact official DeepSeek whale mark on the
 * left (official `#4D6BFE` blue), with a DeepSeek Harness introduction and
 * fresh-start hints beside it; a configured welcome or session title renders as
 * a line below. No box frame — each line renders as plain left-padded text
 * (matching transcript notices) so it reads on any theme and drag-select
 * copies without stray glyphs.
 */
export class HeaderComponent {
    agent;
    subtitle;
    palette;
    /** Columns of the banner currently revealed; `undefined` renders it whole. */
    revealWidth;
    constructor(agent, subtitle, palette) {
        this.agent = agent;
        this.subtitle = subtitle;
        this.palette = palette;
    }
    /**
     * Clip the banner to `width` columns (the sweep reveal); `undefined` restores it.
     * @param width - Revealed banner width in columns, or `undefined` for the whole banner.
     */
    setRevealWidth(width) {
        this.revealWidth = width;
    }
    invalidate() { }
    render(width) {
        const usable = Math.max(1, width - 2);
        // Side-by-side banner: the compact whale on the left, the introduction and
        // hints on the right. Truncate the PLAIN text before painting: every
        // ANSI-aware width function counts escape sequences as visible characters,
        // so a colored long line truncates to almost nothing.
        const art = WHALE_ART_COMPACT;
        const artWidth = Math.max(...art.map(row => row.length));
        const subtitle = this.subtitle();
        const rightText = [
            [STARTUP_TITLE, text => this.palette.bold(brandText(text))],
            [STARTUP_DESCRIPTOR, text => this.palette.text(text)],
            ...subtitle === undefined
                ? STARTUP_TIPS.map(tip => [tip, (text) => this.palette.dim(text)])
                : [],
            [displayText(this.agent.session.id), text => this.palette.dim(text)],
        ];
        const textStart = Math.max(0, Math.floor((art.length - rightText.length) / 2));
        const textColumn = Math.max(1, usable - artWidth - 2);
        const header = art.flatMap((row, index) => {
            const painted = this.palette.bold(brandText(truncateToWidth(row, usable, '')));
            const entry = rightText[index - textStart];
            if (entry === undefined)
                return [painted];
            const [text, paint] = entry;
            const clipped = truncateToWidth(text, textColumn, '');
            return clipped.length === 0 ? [painted] : [`${painted}  ${paint(clipped)}`];
        });
        const lines = [
            ...header,
            ...subtitle === undefined ? [] : ['', this.palette.dim(displayText(subtitle))],
        ]
            .flatMap((line, index) => index < header.length ? [line] : wrapTextWithAnsi(line, usable))
            .map(line => ` ${truncateToWidth(line, usable, '')}`);
        // The reveal animation is row-based: it reveals one banner line at a time.
        if (this.revealWidth === undefined)
            return lines;
        return lines.slice(0, Math.min(this.revealWidth, lines.length));
    }
}
/**
 * A user or steering prompt in the transcript. An underlined accent role header
 * plus blank-line spacing separate it from surrounding blocks; body lines carry
 * no prefix or indent, so a terminal drag-select copies the prompt verbatim.
 */
export class UserMessageComponent extends Container {
    constructor(text, palette, mdTheme, label = 'You') {
        super();
        this.addChild(new Text(messageHeader(label, palette.accent, palette), 0, 0));
        this.addChild(new Markdown(displayText(text), 0, 0, mdTheme, { color: value => palette.text(value) }, {
            preserveOrderedListMarkers: true,
            preserveBackslashEscapes: true,
        }));
    }
}
/**
 * Children of a settled assistant message: optional reasoning block then the
 * response text. A folded continuation (a later step of a turn while tool cards
 * are hidden) drops the `Assistant` header and renders nothing when it has no
 * visible body, so tool-only steps leave no blank segment behind.
 */
function assistantMessageChildren(content, showReasoning, foldedContinuation, palette, mdTheme) {
    const reasoning = displayText(textBlocks(content, 'reasoning').trim());
    const text = displayText(textBlocks(content, 'text').trim());
    const showsReasoning = reasoning !== '' && showReasoning;
    if (foldedContinuation && !showsReasoning && text === '')
        return [];
    const children = [new Spacer(1)];
    if (!foldedContinuation) {
        // `code` (cyan / VSCode teal) separates the assistant role from the user's
        // `accent` (blue) header on every palette.
        children.push(new Text(messageHeader('Assistant', palette.code, palette), 0, 0));
    }
    if (showsReasoning) {
        children.push(new Text(palette.italic(palette.dim('Reasoning')), 0, 0), new Markdown(reasoning, 0, 0, mdTheme, { color: value => palette.dim(value), italic: true }));
    }
    if (text)
        children.push(new Markdown(text, 0, 0, mdTheme, { color: value => palette.text(value) }));
    return children;
}
/**
 * A step's timing summary, rendered as a self-refreshing footer that stays at
 * the tail of the step's output. Kept separate from the assistant message so
 * the timing line trails any tool cards the step appends after its message.
 */
class StepTimingComponent extends Container {
    position;
    events;
    tracker;
    now;
    palette;
    completionTime;
    constructor(position, events, tracker, now, palette) {
        super();
        this.position = position;
        this.events = events;
        this.tracker = tracker;
        this.now = now;
        this.palette = palette;
        this.rebuild();
    }
    complete(time) {
        this.completionTime = time;
        this.rebuild();
    }
    invalidate() {
        this.rebuild();
        super.invalidate();
    }
    rebuild() {
        this.clear();
        const totals = this.tracker.totalsAt(this.events(), this.position, this.completionTime ?? this.now());
        const timing = formatTimingTotals(totals, true);
        const header = this.completionTime === undefined
            ? timing
            : `${timing} · Completed ${formatCompletionTime(this.completionTime)}`;
        this.addChild(new Text(this.palette.dim(header), 0, 0));
    }
}
/** A live assistant step: streamed reasoning/text blocks until the message settles. */
export class StreamingAssistantComponent extends Container {
    position;
    showReasoning;
    palette;
    mdTheme;
    blocks = new Map();
    settledContent;
    foldedContinuation = false;
    /**
     * The step's timing footer. The renderer keeps it at the tail of the chat so
     * it trails any tool cards the step appends after this assistant message; it
     * is not a child of this component.
     */
    timing;
    constructor(
    /** The step's turn/step coordinates, used to group steps into their turn. */
    position, events, tracker, now, showReasoning, palette, mdTheme) {
        super();
        this.position = position;
        this.showReasoning = showReasoning;
        this.palette = palette;
        this.mdTheme = mdTheme;
        this.timing = new StepTimingComponent(position, events, tracker, now, palette);
        this.rebuild();
    }
    /**
     * Replace the streamed blocks with the step's settled content.
     * @param content - The settled assistant content blocks.
     */
    settle(content) {
        this.settledContent = content;
        this.rebuild();
    }
    /**
     * Whether this step's assistant message has settled.
     * @returns `true` once {@link settle} has run.
     */
    isSettled() {
        return this.settledContent !== undefined;
    }
    /**
     * Pin the step's timing footer to its completion time.
     * @param time - Step completion time in epoch milliseconds.
     */
    complete(time) {
        this.timing.complete(time);
    }
    invalidate() {
        this.rebuild();
        this.timing.invalidate();
        super.invalidate();
    }
    /**
     * Fold one streamed chunk into the live block buffer and re-render.
     * @param chunk - The streamed assistant chunk.
     */
    update(chunk) {
        if (chunk.type === 'block-start') {
            this.blocks.set(chunk.index, { type: chunk.blockType, text: '' });
        }
        else if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') {
            const type = chunk.type === 'text-delta' ? 'text' : 'reasoning';
            const block = this.blocks.get(chunk.index) ?? { type, text: '' };
            block.text += chunk.text;
            this.blocks.set(chunk.index, block);
        }
        else if (chunk.type === 'block-end' && (chunk.block.type === 'text' || chunk.block.type === 'reasoning')) {
            this.blocks.set(chunk.index, { type: chunk.block.type, text: chunk.block.text });
        }
        this.rebuild();
        this.timing.invalidate();
    }
    /**
     * Toggle whether reasoning blocks render, then re-render.
     * @param show - Whether to show reasoning blocks.
     */
    setShowReasoning(show) {
        this.showReasoning = show;
        this.rebuild();
    }
    /**
     * Mark this step as a folded continuation of its turn: no `Assistant` header,
     * and no output at all while the step has no visible body. Used while tool
     * cards are hidden so a turn reads as one assistant message.
     * @param folded - Whether to render as a headerless continuation.
     */
    setFoldedContinuation(folded) {
        if (this.foldedContinuation === folded)
            return;
        this.foldedContinuation = folded;
        this.rebuild();
    }
    /**
     * Whether the step currently renders visible reasoning or text.
     * @returns `true` when a header-owning render would show a body.
     */
    hasVisibleBody() {
        const content = this.presentedContent();
        return textBlocks(content, 'text').trim() !== ''
            || (this.showReasoning && textBlocks(content, 'reasoning').trim() !== '');
    }
    /** The settled content when available, otherwise the streamed blocks in model order. */
    presentedContent() {
        return this.settledContent ?? [...this.blocks.entries()]
            .sort(([left], [right]) => left - right)
            .flatMap(([, block]) => {
            if (block.type === 'text')
                return [{ type: 'text', text: block.text }];
            if (block.type === 'reasoning')
                return [{ type: 'reasoning', text: block.text }];
            return [];
        });
    }
    rebuild() {
        this.clear();
        const children = assistantMessageChildren(this.presentedContent(), this.showReasoning, this.foldedContinuation, this.palette, this.mdTheme);
        for (const child of children)
            this.addChild(child);
    }
}
/**
 * Transcript card with a width-keyed rendered-row cache. pi-tui re-renders
 * every component each frame and relies on per-component line caches (its own
 * `Text`/`Markdown` do this); a card that rebuilds rows inside `render(width)`
 * would re-wrap its output every frame
 * ([rationale](../../../../../.agents/notes/implemented/bug-fix/2026-08-03-tui-long-session-render-costs.md)).
 * Subclasses render through {@link renderLines} and call {@link dropLines}
 * from every state mutator; with `invalidate()` (pi-tui's tree-wide cascade)
 * also dropping, a state change always re-renders.
 */
class CachedCardComponent {
    cached;
    /** Discard the cached rows so the next render recomputes them. */
    dropLines() {
        this.cached = undefined;
    }
    invalidate() {
        this.cached = undefined;
    }
    render(width) {
        if (this.cached?.width !== width)
            this.cached = { width, lines: this.renderLines(width) };
        return this.cached.lines;
    }
}
/** A tool call and its result, rendered as a collapsible status card. */
export class ToolCardComponent extends CachedCardComponent {
    name;
    parsed;
    definition;
    maxOutputLines;
    maxDiffEditLength;
    palette;
    mdTheme;
    result;
    visibility = 'collapsed';
    callView;
    resultView;
    diffBodyCache;
    constructor(name, parsed, definition, maxOutputLines, maxDiffEditLength, palette, mdTheme) {
        super();
        this.name = name;
        this.parsed = parsed;
        this.definition = definition;
        this.maxOutputLines = maxOutputLines;
        this.maxDiffEditLength = maxDiffEditLength;
        this.palette = palette;
        this.mdTheme = mdTheme;
        this.callView = this.presentCall();
    }
    presentCall() {
        if (this.parsed.valid && this.definition?.presentCall) {
            try {
                const view = this.definition.presentCall(this.parsed.value);
                if (view !== undefined)
                    return view;
            }
            catch (error) {
                return { card: 'generic', title: displayText(this.name), rawInput: `Presenter failed: ${String(error)}` };
            }
        }
        return { card: 'generic', title: displayText(this.name), rawInput: this.parsed.value };
    }
    /**
     * Record the tool result and derive its result view.
     * @param event - The `tool/result` event payload.
     */
    updateResult(event) {
        this.diffBodyCache = undefined;
        this.dropLines();
        const result = event.message.content[0];
        this.result = {
            content: [...result.content],
            isError: result.isError === true,
            ...event.meta !== undefined ? { meta: event.meta } : {},
        };
        if (this.parsed.valid && this.definition?.presentResult) {
            try {
                const view = this.definition.presentResult(this.parsed.value, this.result);
                if (view !== undefined)
                    this.resultView = view;
            }
            catch (error) {
                this.resultView = { card: 'generic', content: [{ type: 'text', text: `Presenter failed: ${String(error)}` }] };
            }
        }
    }
    /**
     * Set the card's visibility state.
     * @param visibility - Hidden, collapsed preview, or full body.
     */
    setVisibility(visibility) {
        this.visibility = visibility;
        this.dropLines();
    }
    renderLines(width) {
        // Hidden renders nothing — not even the leading gap — so the transcript
        // keeps only the conversation, the way Codex hides tool calls.
        if (this.visibility === 'hidden')
            return [];
        const isError = this.result?.isError ?? false;
        // A ring marker: hollow while the call is pending, filled once it settles;
        // the header color (warning/success/error) tells pending from ok from error.
        const glyph = this.result === undefined ? '○' : '●';
        const rawBody = this.renderBody();
        const view = this.resultView ?? this.callView;
        // A generic card's own content, a read card's `content` fallback (the
        // envelope-stripped file text — the TUI has no dedicated read rendering, so a
        // read renders exactly as before the read card existed), or a search/web
        // card's fallback to the raw result content (neither the `search` nor the
        // `web` view carries a `content` copy), all render as one dim Markdown block
        // below, so links/lists/headings keep the unified dim styling rather than
        // reading as bare text. A search card thus stays byte-identical to the
        // pre-search-card generic fallback. Terminal and diff cards own their body
        // styling, so they are excluded (mirrors renderBody's post-terminal/diff fallback).
        const markdownContent = view.card === 'generic' || view.card === 'read'
            ? view.content ?? this.result?.content
            : view.card === 'search'
                ? this.result?.content
                : view.card === 'web'
                    // A web resultView is only assigned alongside this.result (the result
                    // handler sets both) and the pending callView is never a web card, so
                    // the optional-chain undefined side is unreachable here.
                    /* v8 ignore next */
                    ? this.result?.content
                    : undefined;
        const unknownXml = this.definition === undefined && markdownContent !== undefined
            ? renderUnknownXml(displayText(contentText(markdownContent)), this.maxOutputLines, this.visibility === 'expanded', displayText, text => this.palette.dim(text), text => this.palette.dim(text), 
            /* v8 ignore next -- renderUnknownXml calls the collapsed summary only when hidden XML children exceed this card's limit. */
            count => this.palette.dim(`  … +${count} lines (Ctrl+O to expand)`))
            : undefined;
        // A generic card renders title and result as one Markdown document, so the
        // document's own block spacing is preserved, then dims every row — the whole
        // card body reads as one dim block under the status-colored header.
        const body = unknownXml ?? (markdownContent !== undefined && rawBody.lines.length > 0
            ? this.dimBody(rawBody, width)
            : [...rawBody.prelude, ...rawBody.lines]);
        const visibleBody = unknownXml !== undefined || this.visibility === 'expanded'
            ? body
            : preview(body, this.maxOutputLines, count => this.palette.dim(`… +${count} lines (Ctrl+O to expand)`));
        // The header is a fixed `Tool / <name>` frame in the status color (warning
        // pending / success ok / error), flat — no bold or underline, so one color
        // reads consistently across the whole row. Every tool-specific detail (a
        // read's path, a diff, command output) lives in the body below; the sole
        // header extra is a bash card's model-authored description, appended as a
        // `/ <desc>` segment. The body stays unprefixed so a drag-select copies only
        // the tool text; body lines pass through Text so overlong output wraps.
        const statusColor = this.result === undefined
            ? this.palette.warning
            : isError ? this.palette.error : this.palette.success;
        // The header is a single card row: collapse an embedded newline in the
        // description to an inline escape so it cannot break onto extra rows and
        // collide with the body lines that follow.
        const desc = this.headerDescription();
        const headerText = `${glyph} Tool / ${displayText(this.name)}${desc === undefined ? '' : ` / ${displayInlineText(desc)}`}`;
        const header = truncateToWidth(headerText, Math.max(1, width - 2), '');
        // The blank first row is the card's own paragraph gap (no external Spacer),
        // so the hidden state removes the gap together with the card.
        const lines = ['', statusColor(header)];
        if (visibleBody.length > 0)
            lines.push(...new Text(visibleBody.join('\n'), 0, 0).render(width));
        return lines;
    }
    /** The pending terminal call view, when this row is a terminal card. */
    terminalPending() {
        return this.callView.card === 'terminal' ? this.callView : undefined;
    }
    /**
     * The optional header `/ <desc>` segment: a bash (terminal) card's
     * model-authored description. Non-terminal tools contribute no header detail —
     * their presenter title moves into the body instead.
     */
    headerDescription() {
        const description = this.terminalPending()?.description;
        return description !== undefined && description !== '' ? description : undefined;
    }
    /**
     * The presenter's title for a non-terminal card, shown as the first body line
     * (a read's `Read src/foo.ts`, a diff's `Edit files`) now that the header is a
     * fixed `Tool / <name>` frame. The result-state title replaces the pending one.
     */
    bodyTitle() {
        return this.resultView?.title ?? this.callView.title;
    }
    renderBody() {
        const view = this.resultView ?? this.callView;
        if (view.card === 'terminal') {
            const pending = this.terminalPending();
            const prelude = [];
            const lines = [];
            // The command shows as a $-line here whenever it is not the header: either a
            // description headlines the row (the command still belongs somewhere) or the row
            // is a pending undescribed call (the classic running-command echo). A completed
            // undescribed row keeps the command only in the header.
            // The command and cwd are each a single card row, so escape a multi-line
            // command inline (displayInlineText) — a real newline would break onto extra
            // rows and collide with the output below.
            const headlined = pending?.description !== undefined && pending.description !== '';
            const commandInBody = pending !== undefined && (headlined || this.result === undefined);
            if (commandInBody)
                prelude.push(this.palette.dim(`$ ${displayInlineText(pending.title)}`));
            if (pending?.cwd)
                prelude.push(this.palette.dim(displayInlineText(pending.cwd)));
            if (this.resultView?.card === 'terminal') {
                if (this.resultView.output)
                    lines.push(...this.dimOutput(this.resultView.output));
                if (this.resultView.exitCode !== undefined)
                    lines.push(this.palette.dim(`[exit ${this.resultView.exitCode}]`));
                if (this.resultView.signal !== undefined) {
                    lines.push(this.palette.error(`[signal ${displayText(this.resultView.signal)}]`));
                }
            }
            else if (this.result !== undefined) {
                lines.push(...this.dimOutput(contentText(this.result.content)));
            }
            return { prelude: prelude.filter(Boolean), lines: lines.filter(Boolean) };
        }
        if (view.card === 'diff') {
            if (this.diffBodyCache?.view === view)
                return this.diffBodyCache.body;
            // The header no longer names the file, so each diff keeps its own path
            // header. A trailing footer summarizes the exact changed rows when the
            // bounded comparison succeeds (`+A -R · N file(s)`).
            const renderedDiffs = view.diffs.map(diff => renderDiff(diff, this.maxDiffEditLength, this.palette));
            const added = renderedDiffs.reduce((total, rendered) => total + rendered.added, 0);
            const removed = renderedDiffs.reduce((total, rendered) => total + rendered.removed, 0);
            const approximate = renderedDiffs.some(rendered => rendered.approximate);
            const hunks = renderedDiffs.flatMap((rendered, index) => {
                return [...index > 0 ? [''] : [], ...rendered.lines];
            });
            const files = new Set(view.diffs.map(diff => diff.path)).size;
            const footer = this.palette.dim(`└ +${added} -${removed} · ${files} file${files === 1 ? '' : 's'}${approximate ? ' · approximate' : ''}`);
            // A diff's own `+`/`-` colors carry its meaning, so it renders verbatim
            // rather than under the dim result-output color.
            const body = { prelude: [...hunks, footer], lines: [] };
            this.diffBodyCache = { view, body };
            return body;
        }
        // A generic or read card carries its own envelope-stripped `content`; a
        // search or web card carries no `content` copy and falls back to the raw
        // result content here. (Mirrors the `markdownContent` selection in render();
        // a read card has no dedicated TUI rendering, so its `content` takes the same
        // body path, keeping read output as it was before the read card existed, and
        // a search card stays byte-identical to the pre-search-card fallback.)
        const content = (view.card === 'generic' || view.card === 'read' ? view.content : undefined) ?? this.result?.content;
        const prelude = [];
        const lines = [];
        // The presenter title headlines the body now that the header is a fixed
        // `Tool / <name>` frame (a terminal card keeps its command $-line instead).
        // Skip it when it only repeats the tool name (the fallback presenter for a
        // tool with no presentCall, or an unknown tool), which the header already shows.
        const bodyTitle = this.bodyTitle();
        if (bodyTitle !== displayText(this.name))
            prelude.push(displayInlineText(bodyTitle));
        if (content !== undefined)
            lines.push(...displayText(contentText(content)).split('\n'));
        const rawInput = this.result === undefined && this.callView.card === 'generic'
            ? this.callView.rawInput
            : undefined;
        if (rawInput !== undefined)
            lines.push(...pretty(rawInput).split('\n'));
        // Blank-line trimming spans the whole body, so the title counts as a row:
        // interior blanks (a result's own paragraph break) survive while the body's
        // leading and trailing ones are dropped.
        const total = prelude.length + lines.length;
        return {
            prelude,
            lines: lines.filter((line, index) => {
                const row = prelude.length + index;
                return line.length > 0 || (row > 0 && row < total - 1);
            }),
        };
    }
    /**
     * A tool's own output text as dim rows — the card's result-output color, which
     * separates what the tool produced from the card's own framing. A blank row
     * stays the empty string so the terminal branch's blank-row filter still reads
     * it as blank instead of as an ANSI-wrapped value.
     */
    dimOutput(text) {
        return displayText(text).split('\n').map(line => line === '' ? line : this.palette.dim(line));
    }
    /**
     * Render a generic card's prelude and result as one Markdown document under the
     * dim body tone. Rendering both together preserves the document's own block
     * spacing (Markdown's blank row before a heading); dimming every row keeps the
     * card body one uniform tone, so only the status-colored header carries color.
     */
    dimBody(body, width) {
        const rows = new Markdown([...body.prelude, ...body.lines].join('\n'), 0, 0, this.mdTheme, {
            color: value => this.palette.text(value),
        }).render(width);
        // A whitespace-only row carries no output to dim; leaving it unwrapped keeps
        // Markdown's padding out of the styled ranges.
        return rows.map(row => row.trim() === '' ? row : this.palette.dim(row));
    }
}
/**
 * Matches a lone reminder-frame tag on its own line, capturing the element name.
 * Producers emit the frame as whole lines (`workspace-context`, `dsh-tool-skill`),
 * so anchoring the whole line keeps a tag mentioned inside prose from matching.
 */
const REMINDER_FRAME_LINE = /^<(\/?)([a-zA-Z][\w:.-]*)>$/u;
/**
 * Drop a producer's outer reminder frame, keeping the instruction body verbatim.
 * The card header already names the source, so the frame lines carry nothing.
 * Only a matched open/close pair on the first and last lines is removed, so a
 * body that merely starts with a tag-like line is left intact.
 * @param text - Complete model-facing context text.
 * @returns The body without its outer frame lines, trimmed of the blank lines they leave.
 */
function stripReminderFrame(text) {
    // A frame needs an open line and a distinct close line, so anything shorter than
    // two lines is already frameless.
    const [first = '', ...rest] = text.split('\n');
    const last = rest.at(-1);
    if (last === undefined)
        return text;
    const open = REMINDER_FRAME_LINE.exec(first.trim());
    const close = REMINDER_FRAME_LINE.exec(last.trim());
    if (open?.[1] !== '' || close?.[1] !== '/' || open[2] !== close[2])
        return text;
    return rest.slice(0, -1).join('\n').replace(/^\n+|\n+$/gu, '');
}
/**
 * Injected context (plugin/goal source, e.g. `workspace-context`), rendered as a
 * collapsible dim card that shares the tool-card `Ctrl+O` toggle. The header is
 * `Context · <label>`; the body is the message text as dim prose, one tone with
 * the header and the fold marker, folded to `maxOutputLines`, with a surrounding
 * reminder frame stripped because the source label already names the context.
 *
 * Injected context is prose, not markup, so this card does not parse it. The
 * `<system-reminder>` frame is a prompting convention no model is trained on
 * ([envelope rationale](../../../../../.agents/notes/implemented/simplification/2026-07-20-unwrap-injected-content-envelopes.md)),
 * and instruction bodies legitimately contain a raw `&` or angle-bracket
 * placeholders (`packages/<group>/<pkg>/`, `-t <name>`) that are prose rather than
 * elements. Tree-rendering such a payload depended on whether it happened to be
 * well-formed XML, which made both the fold and the frame-line suppression
 * content-dependent.
 */
export class ContextCardComponent extends CachedCardComponent {
    label;
    text;
    maxOutputLines;
    palette;
    expanded = false;
    constructor(label, text, maxOutputLines, palette) {
        super();
        this.label = label;
        this.text = text;
        this.maxOutputLines = maxOutputLines;
        this.palette = palette;
    }
    /**
     * Expand or collapse the card body.
     * @param expanded - Whether the full body is shown.
     */
    setExpanded(expanded) {
        this.expanded = expanded;
        this.dropLines();
    }
    renderLines(width) {
        const header = this.palette.dim(`Context · ${displayText(this.label)}`);
        // Emptiness is decided on the stripped text: styling a blank body would yield
        // one escape-only row, which reads as a stray blank line under the header.
        const stripped = stripReminderFrame(this.text);
        if (stripped === '')
            return [header];
        const body = stripped.split('\n')
            .map(line => line === '' ? line : this.palette.dim(displayText(line)));
        const visibleBody = this.expanded
            ? body
            : preview(body, this.maxOutputLines, count => this.palette.dim(`… +${count} lines (Ctrl+O to expand)`));
        return [header, ...new Text(visibleBody.join('\n'), 0, 0).render(width)];
    }
}
/** The plan/todo panel rendered above the prompt. */
export class TodoComponent {
    palette;
    todos = [];
    constructor(palette) {
        this.palette = palette;
    }
    /**
     * Replace the rendered plan items.
     * @param todos - The current todo items.
     */
    update(todos) {
        this.todos = todos;
    }
    invalidate() { }
    render(width) {
        if (this.todos.length === 0)
            return [];
        const lines = [this.palette.bold(this.palette.accent('Plan'))];
        for (const todo of this.todos) {
            const prefix = todo.status === 'completed'
                ? this.palette.success('✓')
                : todo.status === 'in_progress'
                    ? this.palette.warning('●')
                    : this.palette.dim('○');
            const content = displayText(todo.content);
            const text = todo.status === 'completed' ? this.palette.dim(content) : content;
            lines.push(truncateToWidth(`  ${prefix} ${text}`, width, ''));
        }
        return ['', ...lines];
    }
}
//# sourceMappingURL=transcript.js.map