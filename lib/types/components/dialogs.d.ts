/**
 * pi-tui dialog and selector components for the terminal front door: the status
 * card, prompt-context line, model selector, resume picker, and user-question
 * dialog, plus the model-choice and resume-candidate data they present.
 * @module @deepseek-ai/dsh-tui/components/dialogs
 */
import { type Component, type Focusable } from '@earendil-works/pi-tui';
import type { Context } from '@deepseek-ai/cordis';
import { type Agent, type ModelSelection } from '@deepseek-ai/dsh-agent';
import type { LlmModelReasoningInfo, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { SessionRecord } from '@deepseek-ai/dsh-session-query';
import type { AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions';
import { type Palette } from './theme.ts';
import type { ToolCardVisibility } from './transcript.ts';
import { type TuiPromptTemplateToken } from '../prompt.ts';
/** A selectable model advertised by a provider, with its display name, description, and reasoning metadata. */
export interface ModelChoice extends ModelSelection {
    modelName: string;
    description?: string;
    reasoning?: LlmModelReasoningInfo;
}
/**
 * The provider/model route and selected reasoning effort resolved from a model dialog.
 */
export interface ModelDialogSelection {
    choice: ModelChoice;
    reasoningEffort: ReasoningEffortId | undefined;
}
/**
 * Format a provider/model target as its `provider/model` label.
 * @param target - The LLM target.
 * @returns The `provider/model` label.
 */
export declare function targetLabel(target: ModelSelection): string;
/**
 * Format a target compactly as its model name with any selected reasoning effort appended.
 * @param target - The LLM target.
 * @returns The compact `model [effort]` label.
 */
export declare function compactTargetLabel(target: ModelSelection): string;
/**
 * Resolve the display label for a choice's reasoning effort.
 * @param choice - The model choice carrying advertised reasoning metadata.
 * @param effort - The selected effort, or `undefined` for provider default.
 * @returns The effort's display name, `Default`, or `undefined` when the model has no reasoning metadata.
 */
export declare function targetReasoningLabel(choice: ModelChoice, effort: ReasoningEffortId | undefined): string | undefined;
/**
 * Derive the agent's initial LLM target from its logged request header or options.
 * @param agent - The driven agent.
 * @returns The initial target, or `undefined` when unset.
 */
export declare function initialTarget(agent: Agent): ModelSelection | undefined;
/**
 * List every advertised model across registered providers, appending the current
 * target when a provider does not advertise it.
 * @param ctx - Context supplying the LLM service.
 * @param current - The current target, appended when unadvertised.
 * @returns The model choices, flattened across providers.
 */
export declare function readModelChoices(ctx: Context, current: ModelSelection | undefined): Promise<ModelChoice[]>;
/**
 * Format a diagnostic integer with grouping separators.
 * @param value - Integer to format.
 * @returns The grouped decimal string.
 */
export declare function formatDiagnosticNumber(value: number): string;
/**
 * Format a diagnostic timestamp as an ISO date-time in UTC.
 * @param value - Epoch milliseconds.
 * @returns The formatted UTC timestamp.
 */
export declare function formatDiagnosticTime(value: number): string;
/**
 * Format a pluralized count for a diagnostic row.
 * @param value - Count.
 * @param singular - Singular noun; an `s` is appended for other counts.
 * @returns The formatted count.
 */
export declare function formatDiagnosticCount(value: number, singular: string): string;
/**
 * Render a fixed-width filled meter bar for a percentage.
 * @param percent - Percentage in [0, 100].
 * @param palette - Active role palette.
 * @returns The rendered meter.
 */
export declare function diagnosticMeter(percent: number, palette: Palette): string;
/** One `label: value` row of a status card group. */
export type StatusCardRow = readonly [label: string, value: string];
/** Bordered, grouped field card for one point-in-time status snapshot. */
export declare class StatusCardComponent implements Component {
    private readonly groups;
    private readonly palette;
    constructor(groups: readonly (readonly StatusCardRow[])[], palette: Palette);
    invalidate(): void;
    render(width: number): string[];
}
/** The left/right template line rendered above the editor. */
export declare class PromptContextComponent implements Component {
    private readonly leftTemplate;
    private readonly rightTemplate;
    private readonly resolve;
    constructor(leftTemplate: readonly TuiPromptTemplateToken[], rightTemplate: readonly TuiPromptTemplateToken[], resolve: (name: string) => string | undefined);
    invalidate(): void;
    render(width: number): string[];
}
/** A user's answer to one question: chosen option labels and an optional custom answer. */
export interface QuestionSelection {
    selected: string[];
    custom?: string;
}
/**
 * Render a bordered dialog frame around body lines with a titled top edge.
 * @param title - Dialog title shown in the top border.
 * @param body - Body lines.
 * @param width - Dialog width in columns.
 * @param palette - Active role palette.
 * @returns The framed dialog lines.
 */
export declare function renderDialog(title: string, body: readonly string[], width: number, palette: Palette): string[];
/** Keyboard model selector rendered as a bordered overlay, with a filter box and per-model reasoning-effort cycling. */
export declare class ModelDialog implements Component {
    private readonly maxVisible;
    private readonly palette;
    private readonly done;
    private readonly cancel;
    private list;
    private readonly filter;
    private readonly items;
    private readonly choices;
    private readonly efforts;
    private readonly currentValue;
    constructor(choices: readonly ModelChoice[], current: ModelSelection | undefined, maxVisible: number, palette: Palette, done: (selection: ModelDialogSelection) => void, cancel: () => void);
    /** Build a SelectList over the currently filtered items, selecting `selectValue` when present. */
    private buildList;
    /** Items matching the filter box, as a case-insensitive substring over the label, model name, and description. */
    private filteredItems;
    private confirm;
    private describeChoice;
    private cycleReasoningEffort;
    invalidate(): void;
    handleInput(data: string): void;
    render(width: number): string[];
}
/** Both transcript-detail dimensions, applied immediately on each Tab. */
export interface DetailsSelection {
    readonly visibility: ToolCardVisibility;
    readonly showReasoning: boolean;
}
/**
 * Keyboard toggle over the two transcript-detail entries — tool-card
 * visibility and reasoning display. Tab cycles the highlighted entry's value
 * and applies it immediately, so the transcript behind the dialog is the live
 * preview; Enter, Esc, or Ctrl+C closes.
 */
export declare class DetailsDialog implements Component {
    private visibility;
    private showReasoning;
    private readonly palette;
    private readonly apply;
    private readonly close;
    private readonly list;
    private readonly toolsItem;
    private readonly reasoningItem;
    constructor(visibility: ToolCardVisibility, showReasoning: boolean, palette: Palette, apply: (selection: DetailsSelection) => void, close: () => void);
    private reasoningLabel;
    /** Cycle the highlighted entry one step and apply the new state. */
    private cycle;
    invalidate(): void;
    handleInput(data: string): void;
    render(width: number): string[];
}
/** A resume selector row summarizing one session from metadata and its folded title. */
export interface ResumeCandidate {
    record: SessionRecord;
    title: string;
    /** Last observed change: live last-event time or artifact mtime, falling back to creation. */
    lastActivityAt: number;
    /** Whether the session's workspace is the one the current session runs in, which selects the picker scope that lists it. */
    currentWorkspace: boolean;
    /** The session's own workspace as a prompt-style label; the all-workspaces scope shows it per row. */
    workspaceLabel: string;
    disabledReason?: string;
}
/**
 * Build one resume selector row from a record, its batch-folded title, and a
 * metadata-derived activity time, deriving the workspace scope and any reason
 * the session cannot be resumed here. A workspace other than the current one
 * is a scope, not a disabled reason: resuming it hands the process off into
 * that directory. Rows carry no per-log detail beyond the title — route and
 * replay validity are checked by the Enter-time preflight against the one
 * chosen log.
 * @param record - The session record.
 * @param title - The session's batch-folded title, absent for an untitled log.
 * @param lastActivityAt - Metadata activity time; absent falls back to the header's creation time.
 * @param currentId - The current session id.
 * @param cwd - The CURRENT session's workspace, which decides the picker scope this row falls in.
 * @param formatWorkspace - Renders THIS record's own cwd as its prompt-style label.
 * @returns The summarized resume candidate.
 */
export declare function summarizeResumeCandidate(record: SessionRecord, title: string | undefined, lastActivityAt: number | undefined, currentId: SessionId, cwd: string | undefined, formatWorkspace: (cwd: string | undefined) => string): ResumeCandidate;
/** Which workspaces the resume picker currently lists. */
export type ResumeScope = 'workspace' | 'all';
/**
 * Full-viewport keyboard selector over detached, preflighted resume summaries.
 *
 * Two scopes over one candidate set: `workspace` (the default) lists only the
 * current session's workspace, `all` lists every workspace and labels each row
 * with its own. Tab toggles between them; the search query and selection reset
 * on a scope change so the highlighted row always belongs to the visible list.
 *
 * The picker opens before the session scan settles: an `undefined` candidate
 * set renders a loading placeholder that keeps input away from the editor,
 * and `setCandidates` swaps the scanned rows in without replacing the overlay.
 */
export declare class ResumePicker implements Component, Focusable {
    private readonly maxVisible;
    private readonly workspaceLabel;
    private readonly viewportRows;
    private readonly palette;
    private readonly done;
    private readonly cancel;
    private readonly search;
    private pasteBuffer;
    private selectedIndex;
    private error;
    private scope;
    private candidates;
    focused: boolean;
    constructor(candidates: readonly ResumeCandidate[] | undefined, maxVisible: number, workspaceLabel: string, viewportRows: () => number, palette: Palette, done: (candidate: ResumeCandidate) => void, cancel: () => void);
    invalidate(): void;
    /**
     * Replace the loading placeholder with the scanned candidate set.
     * @param candidates - the summarized rows the finished scan produced.
     */
    setCandidates(candidates: readonly ResumeCandidate[]): void;
    /** Candidates in the active scope, before the search query narrows them. */
    private scoped;
    private filtered;
    private visibleCandidateCount;
    private handleBracketedPaste;
    handleInput(data: string): void;
    /**
     * The scope line under the search box: the active scope with the current
     * workspace it means, and the inactive scope with the count Tab would reveal.
     */
    private renderScopeLine;
    render(width: number): string[];
}
/** Inline dialog for one user question with option or custom-answer modes. */
export declare class QuestionDialog implements Component, Focusable {
    private readonly question;
    private readonly position;
    private readonly total;
    private readonly unanswered;
    private readonly maxVisible;
    private readonly maxHeight;
    private readonly palette;
    private readonly done;
    private readonly cancel;
    private selectedIndex;
    private selected;
    private headerPage;
    private selectedBlockPage;
    private mode;
    private error;
    private readonly input;
    private readonly options;
    focused: boolean;
    constructor(question: AskUserQuestionItem, position: number, total: number, unanswered: number, maxVisible: number, maxHeight: () => number, palette: Palette, done: (selection: QuestionSelection) => void, cancel: () => void);
    invalidate(): void;
    handleInput(data: string): void;
    private submitCustom;
    private selectedOptionLabels;
    /** Page backward through an oversized option, then through question detail. */
    private pageBackward;
    /** Page forward through question detail, then through an oversized option. */
    private pageForward;
    render(width: number): string[];
    /** Render one option as wrapped label and indented description lines. */
    private renderOptionBlock;
    /** Keep the question visible when fixed chrome must be compacted. */
    private compactQuestionHeader;
    /** Keep Page Up / Page Down discoverable when a full pager status cannot fit. */
    private pagerStatus;
    /** Render custom-mode controls on one row when the header must compact. */
    private compactCustomControls;
    /** Render a one-row option footer that retains every mode-specific control. */
    private compactOptionControls;
    /**
     * Choose option blocks that fit while keeping the selected option visible.
     * Omitted blocks are counted at each end for explicit overflow markers.
     */
    private windowBlocks;
}
//# sourceMappingURL=dialogs.d.ts.map