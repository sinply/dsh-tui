/**
 * pi-tui transcript components: the startup banner, user/assistant messages,
 * per-step timing footer, streaming assistant buffer, tool cards, and the todo
 * panel. Each is a pure function of its inputs and the active palette.
 * @module @deepseek-ai/dsh-tui/components/transcript
 */
import { Container, type Component, type MarkdownTheme } from '@earendil-works/pi-tui';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ContentBlock, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { SessionEvent, TodoItem } from '@deepseek-ai/dsh-session';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { type Palette } from './theme.ts';
import { type ParsedArguments } from './content.ts';
import { type StepPosition, type StepTimingTracker } from '../chat/timing.ts';
/**
 * Borderless startup banner: a big block-letter DEEPSEEK logo (Claude-Code
 * style), the optional configured subtitle, and the session id. No box frame —
 * each line renders as plain left-padded text (matching transcript notices) so
 * it reads on any theme and drag-select copies without stray glyphs.
 */
export declare class HeaderComponent implements Component {
    private readonly agent;
    private readonly subtitle;
    private readonly palette;
    private readonly gradient;
    /** Columns of the banner currently revealed; `undefined` renders it whole. */
    private revealWidth;
    constructor(agent: Agent, subtitle: () => string | undefined, palette: Palette, gradient: boolean);
    /**
     * Clip the banner to `width` columns (the sweep reveal); `undefined` restores it.
     * @param width - Revealed banner width in columns, or `undefined` for the whole banner.
     */
    setRevealWidth(width: number | undefined): void;
    invalidate(): void;
    render(width: number): string[];
}
/**
 * A user or steering prompt in the transcript. An underlined accent role header
 * plus blank-line spacing separate it from surrounding blocks; body lines carry
 * no prefix or indent, so a terminal drag-select copies the prompt verbatim.
 */
export declare class UserMessageComponent extends Container {
    constructor(text: string, palette: Palette, mdTheme: MarkdownTheme, label?: string);
}
/**
 * A step's timing summary, rendered as a self-refreshing footer that stays at
 * the tail of the step's output. Kept separate from the assistant message so
 * the timing line trails any tool cards the step appends after its message.
 */
declare class StepTimingComponent extends Container {
    private readonly position;
    private readonly events;
    private readonly tracker;
    private readonly now;
    private readonly palette;
    private completionTime;
    constructor(position: StepPosition, events: () => readonly SessionEvent[], tracker: StepTimingTracker, now: () => number, palette: Palette);
    complete(time: number): void;
    invalidate(): void;
    private rebuild;
}
/** A live assistant step: streamed reasoning/text blocks until the message settles. */
export declare class StreamingAssistantComponent extends Container {
    /** The step's turn/step coordinates, used to group steps into their turn. */
    readonly position: StepPosition;
    private showReasoning;
    private readonly palette;
    private readonly mdTheme;
    private readonly blocks;
    private settledContent;
    private foldedContinuation;
    /**
     * The step's timing footer. The renderer keeps it at the tail of the chat so
     * it trails any tool cards the step appends after this assistant message; it
     * is not a child of this component.
     */
    readonly timing: StepTimingComponent;
    constructor(
    /** The step's turn/step coordinates, used to group steps into their turn. */
    position: StepPosition, events: () => readonly SessionEvent[], tracker: StepTimingTracker, now: () => number, showReasoning: boolean, palette: Palette, mdTheme: MarkdownTheme);
    /**
     * Replace the streamed blocks with the step's settled content.
     * @param content - The settled assistant content blocks.
     */
    settle(content: readonly ContentBlock[]): void;
    /**
     * Whether this step's assistant message has settled.
     * @returns `true` once {@link settle} has run.
     */
    isSettled(): boolean;
    /**
     * Pin the step's timing footer to its completion time.
     * @param time - Step completion time in epoch milliseconds.
     */
    complete(time: number): void;
    invalidate(): void;
    /**
     * Fold one streamed chunk into the live block buffer and re-render.
     * @param chunk - The streamed assistant chunk.
     */
    update(chunk: StreamChunk): void;
    /**
     * Toggle whether reasoning blocks render, then re-render.
     * @param show - Whether to show reasoning blocks.
     */
    setShowReasoning(show: boolean): void;
    /**
     * Mark this step as a folded continuation of its turn: no `Assistant` header,
     * and no output at all while the step has no visible body. Used while tool
     * cards are hidden so a turn reads as one assistant message.
     * @param folded - Whether to render as a headerless continuation.
     */
    setFoldedContinuation(folded: boolean): void;
    /**
     * Whether the step currently renders visible reasoning or text.
     * @returns `true` when a header-owning render would show a body.
     */
    hasVisibleBody(): boolean;
    /** The settled content when available, otherwise the streamed blocks in model order. */
    private presentedContent;
    private rebuild;
}
/**
 * Ctrl+O card-visibility cycle: `hidden` drops tool cards from the transcript,
 * `collapsed` previews the first body lines, `expanded` shows everything.
 */
export type ToolCardVisibility = 'hidden' | 'collapsed' | 'expanded';
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
declare abstract class CachedCardComponent implements Component {
    private cached;
    /** Discard the cached rows so the next render recomputes them. */
    protected dropLines(): void;
    invalidate(): void;
    render(width: number): string[];
    /**
     * Render the card's rows for `width` without caching.
     * @param width - Render width the rows are wrapped to.
     * @returns The card's rows.
     */
    protected abstract renderLines(width: number): string[];
}
/** A tool call and its result, rendered as a collapsible status card. */
export declare class ToolCardComponent extends CachedCardComponent {
    private readonly name;
    private readonly parsed;
    private readonly definition;
    private readonly maxOutputLines;
    private readonly maxDiffEditLength;
    private readonly palette;
    private readonly mdTheme;
    private result;
    private visibility;
    private callView;
    private resultView;
    private diffBodyCache;
    constructor(name: string, parsed: ParsedArguments, definition: ToolDefinition | undefined, maxOutputLines: number, maxDiffEditLength: number, palette: Palette, mdTheme: MarkdownTheme);
    private presentCall;
    /**
     * Record the tool result and derive its result view.
     * @param event - The `tool/result` event payload.
     */
    updateResult(event: Extract<SessionEvent, {
        type: 'tool/result';
    }>['data']): void;
    /**
     * Set the card's visibility state.
     * @param visibility - Hidden, collapsed preview, or full body.
     */
    setVisibility(visibility: ToolCardVisibility): void;
    protected renderLines(width: number): string[];
    /** The pending terminal call view, when this row is a terminal card. */
    private terminalPending;
    /**
     * The optional header `/ <desc>` segment: a bash (terminal) card's
     * model-authored description. Non-terminal tools contribute no header detail —
     * their presenter title moves into the body instead.
     */
    private headerDescription;
    /**
     * The presenter's title for a non-terminal card, shown as the first body line
     * (a read's `Read src/foo.ts`, a diff's `Edit files`) now that the header is a
     * fixed `Tool / <name>` frame. The result-state title replaces the pending one.
     */
    private bodyTitle;
    private renderBody;
    /**
     * A tool's own output text as dim rows — the card's result-output color, which
     * separates what the tool produced from the card's own framing. A blank row
     * stays the empty string so the terminal branch's blank-row filter still reads
     * it as blank instead of as an ANSI-wrapped value.
     */
    private dimOutput;
    /**
     * Render a generic card's prelude and result as one Markdown document under the
     * dim body tone. Rendering both together preserves the document's own block
     * spacing (Markdown's blank row before a heading); dimming every row keeps the
     * card body one uniform tone, so only the status-colored header carries color.
     */
    private dimBody;
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
export declare class ContextCardComponent extends CachedCardComponent {
    private readonly label;
    private readonly text;
    private readonly maxOutputLines;
    private readonly palette;
    private expanded;
    constructor(label: string, text: string, maxOutputLines: number, palette: Palette);
    /**
     * Expand or collapse the card body.
     * @param expanded - Whether the full body is shown.
     */
    setExpanded(expanded: boolean): void;
    protected renderLines(width: number): string[];
}
/** The plan/todo panel rendered above the prompt. */
export declare class TodoComponent implements Component {
    private readonly palette;
    private todos;
    constructor(palette: Palette);
    /**
     * Replace the rendered plan items.
     * @param todos - The current todo items.
     */
    update(todos: readonly TodoItem[]): void;
    invalidate(): void;
    render(width: number): string[];
}
export {};
//# sourceMappingURL=transcript.d.ts.map