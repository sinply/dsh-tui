/**
 * Zero-state helpers for the interactive chat channel: prompt-directory and
 * Git-branch formatting, transcript/tool-call derivations over the session log,
 * session-reference context cards, the placeholder editor, and banner-reveal
 * timing constants. None of these close over channel state.
 * @module @deepseek-ai/dsh-tui/chat/helpers
 */
import { Editor } from '@earendil-works/pi-tui';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
/** Editor that shows a placeholder without making it editable content. */
export declare class HintEditor extends Editor {
    /** Placeholder shown in the empty input row; `undefined` hides it. */
    hint: string | undefined;
    /** Prompt text rendered before the placeholder, matching the live prompt width. */
    hintPrefix: string;
    /**
     * Update the rendered input prompt after a prompt-template value changed.
     * @param prompt - first-line prefix and continuation filler for wrapped lines.
     */
    setPrompt(prompt: {
        first: string;
        continuation: string;
    }): void;
    render(width: number): string[];
}
/**
 * Format the session working directory as a prompt label: `~` for home,
 * `~/rel` for a home-relative path, the raw path otherwise.
 * @param cwd - operational working directory from the session header.
 * @returns unescaped prompt label.
 */
export declare function formatCwd(cwd: string | undefined): string;
/**
 * Resolve the current Git branch for the prompt context line.
 * @param cwd - operational working directory to query.
 * @returns branch name, or `undefined` outside a worktree or on any failure.
 */
export declare function gitBranch(cwd: string): string | undefined;
/**
 * Tool-call ids whose owning assistant message is append-origin, so its tool
 * cards stay paired in the transcript after a replacement shadowed the message
 * on the model surface.
 * @param session - session whose events to scan.
 * @returns the set of transcript tool-call ids.
 */
export declare function transcriptToolCallIds(session: Session): Set<string>;
/**
 * Whether an event is a landed compaction checkpoint. Recognition goes through
 * {@link isCompactCheckpointSource} — the compaction seam's backend-independent
 * contract for the source every backend stamps on its replacement user message —
 * rather than the shape of the replacement. Other replacements (a pruned
 * `tool/result`, a regenerated `assistant/message`) rewrite one node for the
 * model and mark no boundary in the conversation.
 *
 * Both current call sites already test the replacement themselves. The check
 * keeps the exported predicate true to its name for a third caller, rather than
 * making that caller repeat it.
 * @param event - event to test.
 * @returns true when the event compacted a surface range.
 */
export declare function isCompactCheckpoint(event: SessionEvent): boolean;
/**
 * Read a session-reference context card's display labels from an event source.
 * @param source - event source to inspect.
 * @returns per-reference labels, or `undefined` when the source is not a reference card.
 */
export declare function sessionReferenceCard(source: unknown): string[] | undefined;
/** Milliseconds between banner sweep-reveal frames (~60 fps). */
export declare const BANNER_REVEAL_INTERVAL_MS = 15;
/** Number of sweep frames the banner reveal spreads the terminal width over. */
export declare const BANNER_REVEAL_STEPS = 24;
//# sourceMappingURL=helpers.d.ts.map