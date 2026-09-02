/**
 * Running token accounting for the terminal footer. Usage is keyed per
 * turn/step so replayed or re-emitted usage replaces rather than double-counts.
 * @module dsh-tui/chat/tokens
 */
/**
 * Fold one step's usage into the running totals, replacing any prior usage
 * logged for the same turn/step.
 * @param totals - Running totals mutated in place.
 * @param turn - Turn index of the usage.
 * @param step - Step index of the usage.
 * @param usage - The step's token usage.
 */
export function recordTokenUsage(totals, turn, step, usage) {
    const key = `${turn}:${step}`;
    const previous = totals.byStep.get(key);
    if (previous !== undefined) {
        totals.input -= previous.inputTokens;
        totals.output -= previous.outputTokens;
        totals.cacheRead -= previous.cacheReadTokens ?? 0;
        totals.cacheWrite -= previous.cacheWriteTokens ?? 0;
    }
    totals.byStep.set(key, usage);
    totals.input += usage.inputTokens;
    totals.output += usage.outputTokens;
    totals.cacheRead += usage.cacheReadTokens ?? 0;
    totals.cacheWrite += usage.cacheWriteTokens ?? 0;
}
/**
 * Fold a usage-bearing session event into the running totals.
 * @param totals - Running totals mutated in place.
 * @param event - Session event; ignored when it carries no usage.
 */
export function recordEventUsage(totals, event) {
    if (event.type === 'assistant/chunk' && event.data.chunk.type === 'usage') {
        recordTokenUsage(totals, event.data.turn, event.data.step, event.data.chunk.usage);
    }
    else if (event.type === 'assistant/message' && event.data.usage !== undefined) {
        recordTokenUsage(totals, event.data.turn, event.data.step, event.data.usage);
    }
}
/**
 * Share of billed input (prompt) tokens served from the provider cache, as an
 * integer percent, or `undefined` before any input is billed (avoids 0/0 and a
 * meaningless rate on an empty session).
 * @param totals - Running totals to measure.
 * @returns The cache hit rate percent, or `undefined` when no input is billed.
 */
export function cacheHitRate(totals) {
    const billedInput = totals.input + totals.cacheRead + totals.cacheWrite;
    if (billedInput === 0)
        return undefined;
    return Math.round((totals.cacheRead / billedInput) * 100);
}
/**
 * Fold every usage-bearing event in a session into fresh totals.
 * @param session - Session whose events supply usage.
 * @returns The accumulated token totals.
 */
export function sessionTokens(session) {
    const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, byStep: new Map() };
    for (const event of session.snapshotEvents()) {
        recordEventUsage(totals, event);
    }
    return totals;
}
/**
 * Format a token count with a compact k/m suffix for the footer.
 * @param value - Token count.
 * @returns The compact display string.
 */
export function formatTokens(value) {
    if (value < 1_000)
        return String(value);
    if (value < 10_000)
        return `${(value / 1_000).toFixed(1)}k`;
    if (value < 1_000_000)
        return `${Math.round(value / 1_000)}k`;
    return `${(value / 1_000_000).toFixed(1)}m`;
}
//# sourceMappingURL=tokens.js.map