/**
 * Editor autocomplete provider merging path-only file candidates and optional
 * session-reference snapshots with the base slash-command completions.
 * @module @deepseek-ai/dsh-tui/chat/autocomplete
 */
import { CombinedAutocompleteProvider, type AutocompleteItem, type AutocompleteProvider, type AutocompleteSuggestions } from '@earendil-works/pi-tui';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type SessionReferenceResolver } from '@deepseek-ai/dsh-session-reference';
import { WorkspaceFileSearch } from './file-autocomplete.ts';
/** Merge path-only file candidates and optional session snapshots with commands. */
export declare class ReferenceAutocompleteProvider implements AutocompleteProvider {
    private readonly base;
    private readonly files;
    private readonly sessions;
    private readonly agent;
    constructor(base: CombinedAutocompleteProvider, files: WorkspaceFileSearch, sessions: SessionReferenceResolver | undefined, agent: Agent);
    getSuggestions(lines: string[], cursorLine: number, cursorCol: number, options: {
        signal: AbortSignal;
        force?: boolean;
    }): Promise<AutocompleteSuggestions | null>;
    applyCompletion(lines: string[], cursorLine: number, cursorCol: number, item: AutocompleteItem, prefix: string): {
        lines: string[];
        cursorLine: number;
        cursorCol: number;
    };
    shouldTriggerFileCompletion(lines: string[], cursorLine: number, cursorCol: number): boolean;
}
//# sourceMappingURL=autocomplete.d.ts.map