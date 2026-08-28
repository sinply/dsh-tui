/**
 * Host-workspace discovery for TUI `@file` completion. The index contains
 * paths only: selected values remain ordinary prompt text and file contents
 * stay behind the model-facing `read` tool.
 *
 * @module @deepseek-ai/dsh-tui/chat/file-autocomplete
 */
/** Default maximum file and directory candidates rendered for one query. */
export declare const DEFAULT_FILE_SEARCH_MAX_RESULTS = 20;
/** Default maximum entries retained in one workspace search index. */
export declare const DEFAULT_FILE_SEARCH_MAX_ENTRIES = 10000;
/** Directory basenames omitted from traversal unless the deployment overrides them. */
export declare const DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES: readonly [".git", "node_modules"];
/** Resolved limits and exclusions for one TUI workspace index. */
export interface FileSearchConfig {
    /** Maximum ranked candidates returned for one query. */
    maxResults: number;
    /** Maximum indexed files and directories. */
    maxEntries: number;
    /** Directory basenames never traversed or offered. */
    excludedDirectories: readonly string[];
}
/** One path-only completion candidate inside the session cwd. */
export interface FileSearchCandidate {
    /** User-facing path accepted by the normal prompt and filesystem tools. */
    path: string;
    /** Directories keep completion open; files finish the mention. */
    kind: 'file' | 'directory';
}
/** Active `@` token ending at the editor cursor. */
export interface ActiveAtToken {
    /** Complete token replaced when the user accepts a completion. */
    prefix: string;
    /** Path query after `@` or `@"`. */
    query: string;
    /** Whether the user opened a quoted path. */
    quoted: boolean;
}
/**
 * Extract an `@path` or `@"path with spaces` token at the cursor. An `@`
 * inside another token, such as an email address, is not a completion trigger.
 * @param line - current editor line.
 * @param cursorCol - cursor column within that line.
 * @returns the active token, or `undefined` outside an `@` token.
 */
export declare function activeAtToken(line: string, cursorCol: number): ActiveAtToken | undefined;
/**
 * Format a selected path as prompt text. Whitespace uses Pi's quoted
 * `@"path"` grammar; directories retain a trailing slash so completion can
 * descend another level.
 * @param candidate - selected file or directory.
 * @param preserveQuote - retain an explicitly opened quote even when unnecessary.
 * @returns the insertion value, or `undefined` for a path the editor grammar cannot represent safely.
 */
export declare function formatFileMention(candidate: FileSearchCandidate, preserveQuote: boolean): string | undefined;
/**
 * Cancellable, reusable fuzzy index rooted at one agent working directory.
 * Directory-scoped queries list live state; bare fuzzy queries share one
 * bounded traversal until the `@` interaction ends or a tool result invalidates it.
 */
export declare class WorkspaceFileSearch {
    private readonly root;
    private readonly config;
    private readonly excludedDirectories;
    private generation;
    private disposed;
    constructor(root: string, config: FileSearchConfig);
    /**
     * Return ranked path candidates for the current token.
     * @param rawQuery - path text following `@` or `@"`.
     * @param signal - cancels this caller's wait without killing an index shared by a newer query.
     * @returns at most `maxResults` deterministic candidates.
     */
    list(rawQuery: string, signal: AbortSignal): Promise<FileSearchCandidate[]>;
    /** Discard the current index so the next bare query observes a fresh tree. */
    invalidate(): void;
    /** Abort traversal and make later queries return no candidates. */
    dispose(): void;
    private ensureIndex;
    private scanWorkspace;
    private listDirectory;
}
//# sourceMappingURL=file-autocomplete.d.ts.map