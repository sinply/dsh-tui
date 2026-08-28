/**
 * Content-block primitives shared across the terminal front door: flattening
 * session content to display text and parsing tool-call arguments.
 * @module dsh-tui/components/content
 */
/**
 * Flatten content blocks into a single display string, recursing into
 * tool-result content and naming unknown block types.
 * @param content - Content blocks to flatten.
 * @returns The concatenated display text.
 */
export function contentText(content) {
    const parts = [];
    for (const block of content) {
        switch (block.type) {
            case 'text':
            case 'reasoning':
                parts.push(block.text);
                break;
            case 'tool-call':
                parts.push(`${block.name}(${block.arguments})`);
                break;
            case 'tool-result':
                parts.push(contentText(block.content));
                break;
            default: {
                const rawType = block.type;
                parts.push(`[${typeof rawType === 'string' ? rawType : 'content'}]`);
                break;
            }
        }
    }
    return parts.join('');
}
/**
 * Parse tool-call arguments from their JSON source.
 * @param raw - Raw JSON arguments text.
 * @returns The parsed value, or the raw text with `valid: false` on parse failure.
 */
export function parseArguments(raw) {
    try {
        return { value: JSON.parse(raw), valid: true };
    }
    catch {
        return { value: raw, valid: false };
    }
}
//# sourceMappingURL=content.js.map