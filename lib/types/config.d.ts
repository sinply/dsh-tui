/**
 * Serializable configuration and defaults for the pi-tui terminal mode. Loader
 * schema validation normally fills defaults; {@link resolveTuiConfig} applies
 * the same defaults for direct callers that bypass the Loader.
 * @module dsh-tui/config
 */
import z from 'schemastery';
/** Theme and prompt-template settings for the pi-tui terminal mode. */
export interface TuiThemeConfig {
    /** Apply the built-in ANSI color palette. */
    color?: boolean;
    /** Enable 24-bit truecolor output; brand art (the startup whale and marks) uses the official DeepSeek blue. */
    truecolor?: boolean;
    /** Use the fixed 24-bit VSCode Dark+-inspired blue palette when color is on. */
    vscode?: boolean;
    /** Left-aligned template on the row above the editor. */
    leftPrompt?: string;
    /** Right-aligned template on the row above the editor. */
    rightPrompt?: string;
    /** Template used as the editor's first-line prefix. */
    inputPrompt?: string;
    /** Static placeholder shown in an empty editor while the agent is running. */
    inputPlaceholder?: string;
}
/** Interaction and presentation settings for the pi-tui terminal mode. */
export interface TuiConfig {
    /** Render model reasoning blocks. */
    showReasoning?: boolean;
    /** Maximum tool-card body lines retained in its collapsed head/tail preview. */
    maxToolOutputLines?: number;
    /** Maximum added and removed lines explored while deriving an exact line diff. */
    maxDiffEditLength?: number;
    /** Maximum options visible at once in a user-question panel. */
    maxQuestionOptions?: number;
    /** Maximum models visible at once in the model selector. */
    maxModelOptions?: number;
    /** Maximum sessions visible at once in the resume selector. */
    maxResumeOptions?: number;
    /** Maximum concurrent cold projection reads in one resume scan. */
    resumeScanConcurrency?: number;
    /** User-question panel width in terminal columns, clamped to the terminal. */
    questionDialogWidth?: number;
    /** User-question panel maximum height in terminal rows. */
    questionDialogMaxHeight?: number;
    /** Model-selector width in terminal columns. */
    modelDialogWidth?: number;
    /** Model-selector maximum height in terminal rows. */
    modelDialogMaxHeight?: number;
    /** Transcript-details selector width in terminal columns. */
    detailsDialogWidth?: number;
    /** Maximum fuzzy file candidates displayed for one `@` query. */
    fileSearchMaxResults?: number;
    /** Maximum paths retained in one `@` workspace index. */
    fileSearchMaxEntries?: number;
    /** Directory basenames excluded from `@` traversal and completion. */
    fileSearchExcludedDirectories?: string[];
    /** Show the terminal's hardware cursor at the pi editor's IME marker. */
    showHardwareCursor?: boolean;
    /** Color and prompt-template settings. */
    theme?: TuiThemeConfig;
    /** Terminal window title while the UI is mounted; a logged session title prefixes it. */
    title?: string;
}
/** Schemastery schema for presentation settings embedded by app bundles. */
export declare const TuiConfigSchema: z<TuiConfig>;
/** Serializable plugin configuration. */
export interface Config extends TuiConfig {
    /** Banner subtitle line. When absent, the banner has no subtitle and sweeps in on start. */
    welcome?: string;
    /** Exact shared agent/session identity driven by this terminal. Defaults to `main`. */
    sessionId?: string;
    /**
     * Skill name auto-invoked as this session's first user turn, exactly as if
     * the user typed `/skill:<name>`. Set only by a launcher for a fresh
     * skill-guided session (`dsh migrate`/`dsh upgrade`); absent
     * leaves the first turn to the user.
     */
    initialSkill?: string;
}
/** Schemastery schema for the full plugin configuration. */
export declare const Config: z<Config>;
/** Fully defaulted TUI theme settings. */
export interface ResolvedTuiThemeConfig {
    color: boolean;
    truecolor: boolean;
    vscode: boolean;
    leftPrompt: string;
    rightPrompt: string;
    inputPrompt: string;
    inputPlaceholder: string;
}
/** Fully defaulted TUI presentation settings. */
export interface ResolvedTuiConfig {
    showReasoning: boolean;
    maxToolOutputLines: number;
    maxDiffEditLength: number;
    maxQuestionOptions: number;
    maxModelOptions: number;
    maxResumeOptions: number;
    resumeScanConcurrency: number;
    questionDialogWidth: number;
    questionDialogMaxHeight: number;
    modelDialogWidth: number;
    modelDialogMaxHeight: number;
    detailsDialogWidth: number;
    fileSearchMaxResults: number;
    fileSearchMaxEntries: number;
    fileSearchExcludedDirectories: string[];
    showHardwareCursor: boolean;
    theme: ResolvedTuiThemeConfig;
    title: string;
}
/**
 * Apply direct-call defaults after Loader schema validation has normally run.
 *
 * @param config - Deployment-provided terminal presentation settings.
 * @returns Complete settings consumed by the TUI renderer.
 */
export declare function resolveTuiConfig(config: TuiConfig | undefined): ResolvedTuiConfig;
//# sourceMappingURL=config.d.ts.map