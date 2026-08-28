/**
 * Serializable configuration and defaults for the pi-tui terminal mode. Loader
 * schema validation normally fills defaults; {@link resolveTuiConfig} applies
 * the same defaults for direct callers that bypass the Loader.
 * @module dsh-tui/config
 */
import z from 'schemastery';
import { DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES, DEFAULT_FILE_SEARCH_MAX_ENTRIES, DEFAULT_FILE_SEARCH_MAX_RESULTS, } from "./chat/file-autocomplete.js";
const showReasoningSchema = z.boolean().default(true);
const maxToolOutputLinesSchema = z.number().step(1).min(1).default(6);
const maxDiffEditLengthSchema = z.number().step(1).min(1).default(1000);
const maxQuestionOptionsSchema = z.number().step(1).min(1).default(8);
const maxModelOptionsSchema = z.number().step(1).min(1).default(8);
const maxResumeOptionsSchema = z.number().step(1).min(1).default(8);
const resumeScanConcurrencySchema = z.number().step(1).min(1).default(4);
const questionDialogWidthSchema = z.number().step(1).min(20).default(200);
const questionDialogMaxHeightSchema = z.number().step(1).min(6).default(20);
const modelDialogWidthSchema = z.number().step(1).min(20).default(76);
const modelDialogMaxHeightSchema = z.number().step(1).min(6).default(20);
const detailsDialogWidthSchema = z.number().step(1).min(20).default(72);
const fileSearchMaxResultsSchema = z.number().step(1).min(1).default(DEFAULT_FILE_SEARCH_MAX_RESULTS);
const fileSearchMaxEntriesSchema = z.number().step(1).min(1).default(DEFAULT_FILE_SEARCH_MAX_ENTRIES);
const fileSearchExcludedDirectoriesSchema = z.array(z.string()).default([...DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES]);
const showHardwareCursorSchema = z.boolean().default(false);
const colorSchema = z.boolean().default(true);
// No default: an unset value auto-detects truecolor from COLORTERM in `apply`.
const truecolorSchema = z.boolean();
// Default on: the VSCode-blue 24-bit palette is the shipped look.
const vscodeSchema = z.boolean().default(true);
const DEFAULT_LEFT_PROMPT = '${cwd}${git/worktree}${model}${token_meter/cache_hit_rate}${context}';
const DEFAULT_RIGHT_PROMPT = '${queued}';
const DEFAULT_INPUT_PROMPT = '${symbol} ${indicator}';
const DEFAULT_INPUT_PLACEHOLDER = 'press enter to steer and esc to cancel';
const TuiThemeConfigSchema = z.object({
    color: colorSchema,
    truecolor: truecolorSchema,
    vscode: vscodeSchema,
    leftPrompt: z.string().default(DEFAULT_LEFT_PROMPT),
    rightPrompt: z.string().default(DEFAULT_RIGHT_PROMPT),
    inputPrompt: z.string().default(DEFAULT_INPUT_PROMPT),
    inputPlaceholder: z.string().default(DEFAULT_INPUT_PLACEHOLDER),
});
const titleSchema = z.string().default('DeepSeek Harness');
const tuiConfigSchemaFields = {
    showReasoning: showReasoningSchema,
    maxToolOutputLines: maxToolOutputLinesSchema,
    maxDiffEditLength: maxDiffEditLengthSchema,
    maxQuestionOptions: maxQuestionOptionsSchema,
    maxModelOptions: maxModelOptionsSchema,
    maxResumeOptions: maxResumeOptionsSchema,
    resumeScanConcurrency: resumeScanConcurrencySchema,
    questionDialogWidth: questionDialogWidthSchema,
    questionDialogMaxHeight: questionDialogMaxHeightSchema,
    modelDialogWidth: modelDialogWidthSchema,
    modelDialogMaxHeight: modelDialogMaxHeightSchema,
    detailsDialogWidth: detailsDialogWidthSchema,
    fileSearchMaxResults: fileSearchMaxResultsSchema,
    fileSearchMaxEntries: fileSearchMaxEntriesSchema,
    fileSearchExcludedDirectories: fileSearchExcludedDirectoriesSchema,
    showHardwareCursor: showHardwareCursorSchema,
    theme: TuiThemeConfigSchema,
    title: titleSchema,
};
/** Schemastery schema for presentation settings embedded by app bundles. */
export const TuiConfigSchema = z.object(tuiConfigSchemaFields);
/** Schemastery schema for the full plugin configuration. */
export const Config = z.object({
    welcome: z.string(),
    sessionId: z.string().default('main'),
    initialSkill: z.string(),
    showReasoning: tuiConfigSchemaFields.showReasoning,
    maxToolOutputLines: tuiConfigSchemaFields.maxToolOutputLines,
    maxDiffEditLength: tuiConfigSchemaFields.maxDiffEditLength,
    maxQuestionOptions: tuiConfigSchemaFields.maxQuestionOptions,
    maxModelOptions: tuiConfigSchemaFields.maxModelOptions,
    maxResumeOptions: tuiConfigSchemaFields.maxResumeOptions,
    questionDialogWidth: tuiConfigSchemaFields.questionDialogWidth,
    questionDialogMaxHeight: tuiConfigSchemaFields.questionDialogMaxHeight,
    modelDialogWidth: tuiConfigSchemaFields.modelDialogWidth,
    modelDialogMaxHeight: tuiConfigSchemaFields.modelDialogMaxHeight,
    detailsDialogWidth: tuiConfigSchemaFields.detailsDialogWidth,
    fileSearchMaxResults: tuiConfigSchemaFields.fileSearchMaxResults,
    fileSearchMaxEntries: tuiConfigSchemaFields.fileSearchMaxEntries,
    fileSearchExcludedDirectories: tuiConfigSchemaFields.fileSearchExcludedDirectories,
    showHardwareCursor: tuiConfigSchemaFields.showHardwareCursor,
    theme: tuiConfigSchemaFields.theme,
    title: tuiConfigSchemaFields.title,
});
/**
 * Apply direct-call defaults after Loader schema validation has normally run.
 *
 * @param config - Deployment-provided terminal presentation settings.
 * @returns Complete settings consumed by the TUI renderer.
 */
export function resolveTuiConfig(config) {
    return {
        showReasoning: config?.showReasoning ?? true,
        maxToolOutputLines: config?.maxToolOutputLines ?? 6,
        maxDiffEditLength: config?.maxDiffEditLength ?? 1000,
        maxQuestionOptions: config?.maxQuestionOptions ?? 8,
        maxModelOptions: config?.maxModelOptions ?? 8,
        maxResumeOptions: config?.maxResumeOptions ?? 8,
        resumeScanConcurrency: config?.resumeScanConcurrency ?? 4,
        questionDialogWidth: config?.questionDialogWidth ?? 200,
        questionDialogMaxHeight: config?.questionDialogMaxHeight ?? 20,
        modelDialogWidth: config?.modelDialogWidth ?? 76,
        modelDialogMaxHeight: config?.modelDialogMaxHeight ?? 20,
        detailsDialogWidth: config?.detailsDialogWidth ?? 72,
        fileSearchMaxResults: config?.fileSearchMaxResults ?? DEFAULT_FILE_SEARCH_MAX_RESULTS,
        fileSearchMaxEntries: config?.fileSearchMaxEntries ?? DEFAULT_FILE_SEARCH_MAX_ENTRIES,
        fileSearchExcludedDirectories: [...(config?.fileSearchExcludedDirectories ?? DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES)],
        showHardwareCursor: config?.showHardwareCursor ?? false,
        theme: {
            color: config?.theme?.color ?? true,
            truecolor: config?.theme?.truecolor ?? false,
            vscode: config?.theme?.vscode ?? true,
            leftPrompt: config?.theme?.leftPrompt ?? DEFAULT_LEFT_PROMPT,
            rightPrompt: config?.theme?.rightPrompt ?? DEFAULT_RIGHT_PROMPT,
            inputPrompt: config?.theme?.inputPrompt ?? DEFAULT_INPUT_PROMPT,
            inputPlaceholder: config?.theme?.inputPlaceholder ?? DEFAULT_INPUT_PLACEHOLDER,
        },
        title: config?.title ?? 'DeepSeek Harness',
    };
}
//# sourceMappingURL=config.js.map