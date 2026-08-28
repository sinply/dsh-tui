/**
 * Theme-agnostic ANSI palette and derived pi-tui themes for the terminal front
 * door. The palette is built from the standard 16-color ANSI set plus SGR
 * attributes so every terminal remaps it to its active color scheme.
 * @module @deepseek-ai/dsh-tui/components/theme
 */
/** Names of the palette's color roles, in the order `/palette` prints them. */
export const COLOR_ROLES = ['text', 'dim', 'accent', 'brand', 'code', 'success', 'warning', 'error'];
/** Names of the palette's attribute roles, in the order `/palette` prints them. */
export const ATTRIBUTE_ROLES = ['bold', 'italic', 'underline', 'strike', 'selected'];
/**
 * Every SGR code the TUI is allowed to emit, keyed by role. This table is the
 * single source: {@link createPalette} derives the wrappers from it and
 * `/palette` prints it, so a role cannot exist in one and not the other, and no
 * component hand-writes an escape.
 *
 * Only the standard 16-color set and SGR attributes appear here. Terminals remap
 * those to the user's active theme, so the TUI stays legible on any background;
 * a fixed 24-bit color would not. The startup gradient and exact official mark
 * color are the two deliberate brand exceptions ({@link gradientText},
 * {@link brandText}).
 *
 * @param scheme - Active terminal color scheme; only `code` differs between them.
 * @returns The SGR spec for every color and attribute role.
 */
export function paletteSpec(scheme) {
    return {
        colors: {
            // The terminal's own foreground, emitted as no escape at all: ordinary body
            // text must inherit whatever the user's theme uses.
            text: { open: '', close: '', purpose: 'Body text, the terminal default foreground' },
            // SGR 2 over an explicit default foreground, closing both groups it sets.
            // The attribute fades relative to whatever the terminal's own foreground is,
            // which is the only way to land *below* `text` on both schemes: ANSI 90
            // (bright black) is a fixed hue that many light themes render heavier than
            // their default foreground, which made every "dim" surface the most
            // prominent text on screen.
            dim: { open: '2;39', close: '22;39', purpose: 'The one recessed tone: tool bodies, chrome, footers' },
            accent: { open: '95', close: '39', purpose: 'The one emphasis color: role headers, prompt, borders' },
            brand: { open: '34', close: '39', purpose: 'DeepSeek brand art when truecolor is unavailable' },
            // ANSI 36 (cyan) is difficult to read on a light background — use ANSI 34
            // (blue) which is legible on both light and dark schemes.
            code: scheme === 'light'
                ? { open: '34', close: '39', purpose: 'Inline code and code blocks in prose' }
                : { open: '36', close: '39', purpose: 'Inline code and code blocks in prose' },
            success: { open: '32', close: '39', purpose: 'Succeeded calls, and a diff\'s added lines' },
            warning: { open: '33', close: '39', purpose: 'Pending calls and warnings' },
            error: { open: '31', close: '39', purpose: 'Failures, signals, and a diff\'s removed lines' },
        },
        attributes: {
            bold: { open: '1', close: '22', purpose: 'Emphasis; composes with any color' },
            italic: { open: '3', close: '23', purpose: 'Reasoning text' },
            underline: { open: '4', close: '24', purpose: 'Role-header banding' },
            strike: { open: '9', close: '29', purpose: 'Struck-through Markdown' },
            selected: { open: '7', close: '27', purpose: 'Reverse video for the active selection' },
        },
    };
}
/**
 * Wrap text in an SGR pair, or pass it through when color is disabled.
 * An empty `open` emits nothing, so the `text` role costs no escape.
 */
function ansi(spec, enabled) {
    if (!enabled || spec.open === '')
        return text => text;
    return text => `\x1b[${spec.open}m${text}\x1b[${spec.close}m`;
}
/**
 * Theme-agnostic palette derived from {@link paletteSpec}. Body `text` stays the
 * terminal's default foreground so it reads on light and dark backgrounds alike;
 * grouping uses foreground-only bold, underlined role headers and reverse video
 * rather than fixed background fills or per-line prefixes, so a transcript
 * drag-select copies message text without stray glyphs.
 *
 * @param enabled - Whether ANSI is emitted at all.
 * @param scheme - Active terminal color scheme; adjusts the code role.
 * @returns The role palette for the given scheme.
 */
export function createPalette(enabled, scheme = 'dark') {
    const spec = paletteSpec(scheme);
    const roles = {};
    for (const name of COLOR_ROLES)
        roles[name] = ansi(spec.colors[name], enabled);
    for (const name of ATTRIBUTE_ROLES)
        roles[name] = ansi(spec.attributes[name], enabled);
    return roles;
}
/**
 * A VSCode Dark+-inspired fixed 24-bit palette (`#569CD6` emphasis blue, cyan
 * code, cold-gray dim, classic VSCode success/warning/error hues) with the
 * DeepSeek brand blue for brand art. Unlike {@link createPalette} it emits
 * truecolor foregrounds directly, so the theme looks identical on any terminal
 * that supports 24-bit color (Windows Terminal, VS Code, iTerm2, …); callers
 * gate it behind the `theme.vscode` preference and fall back to the adaptive
 * palette when color is disabled.
 *
 * @param enabled - Whether ANSI truecolor is emitted at all.
 * @returns The VSCode-blue role palette.
 */
export function createVscodePalette(enabled) {
    const rgb = (hex) => {
        const value = Number.parseInt(hex, 16);
        return `38;2;${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}`;
    };
    const spec = {
        colors: {
            text: { open: '', close: '', purpose: 'Body text, the terminal default foreground' },
            dim: { open: rgb('6e7681'), close: '39', purpose: 'The one recessed tone: tool bodies, chrome, footers' },
            accent: { open: rgb('569cd6'), close: '39', purpose: 'The one emphasis color: role headers, prompt, borders' },
            brand: { open: rgb('4d6bfe'), close: '39', purpose: 'DeepSeek brand ink' },
            code: { open: rgb('4ec9b0'), close: '39', purpose: 'Inline code and code blocks in prose' },
            success: { open: rgb('89d185'), close: '39', purpose: 'Succeeded calls, and a diff\'s added lines' },
            warning: { open: rgb('dcdcaa'), close: '39', purpose: 'Pending calls and warnings' },
            error: { open: rgb('f14c4c'), close: '39', purpose: 'Failures, signals, and a diff\'s removed lines' },
        },
        attributes: {
            bold: { open: '1', close: '22', purpose: 'Emphasis; composes with any color' },
            italic: { open: '3', close: '23', purpose: 'Reasoning text' },
            underline: { open: '4', close: '24', purpose: 'Role-header banding' },
            strike: { open: '9', close: '29', purpose: 'Struck-through Markdown' },
            selected: { open: '7', close: '27', purpose: 'Reverse video for the active selection' },
        },
    };
    const roles = {};
    for (const name of COLOR_ROLES)
        roles[name] = ansi(spec.colors[name], enabled);
    for (const name of ATTRIBUTE_ROLES)
        roles[name] = ansi(spec.attributes[name], enabled);
    return roles;
}
/**
 * DeepSeek brand gradient stops (indigo → light blue) taken from the
 * deepseek.com logo, painted across the startup banner's product name on
 * truecolor terminals. Fixed brand identity, deliberately outside the
 * theme-adaptive {@link Palette}.
 */
const BRAND_GRADIENT = [
    [77, 107, 254], // #4D6BFE
    [57, 130, 255], // #3982FF
    [36, 152, 255], // #2498FF
];
/** Official DeepSeek icon ink from the shipped 24x24 SVG. */
const DEEPSEEK_BRAND_RGB = BRAND_GRADIENT[0];
/**
 * Paint trusted static DeepSeek brand art with the official `#4D6BFE` ink.
 * @param text - Static brand text or raster cells.
 * @returns text wrapped in the official truecolor foreground and a foreground reset.
 */
export function brandText(text) {
    const [r, g, b] = DEEPSEEK_BRAND_RGB;
    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}
/**
 * Sample {@link BRAND_GRADIENT} at fraction `t` via piecewise-linear
 * interpolation across its stops.
 *
 * @param t - Position along the gradient; clamped to [0, 1].
 * @returns The interpolated `[r, g, b]` channels, each rounded to 0–255.
 */
function brandColorAt(t) {
    const span = Math.min(Math.max(t, 0), 1) * (BRAND_GRADIENT.length - 1);
    const index = Math.min(Math.floor(span), BRAND_GRADIENT.length - 2);
    const local = span - index;
    // `index` is clamped to a valid adjacent pair, so both lookups are in-bounds.
    const from = BRAND_GRADIENT[index];
    const to = BRAND_GRADIENT[index + 1];
    return [
        Math.round(from[0] + (to[0] - from[0]) * local),
        Math.round(from[1] + (to[1] - from[1]) * local),
        Math.round(from[2] + (to[2] - from[2]) * local),
    ];
}
/**
 * Paint `text` left-to-right in the DeepSeek brand gradient with per-character
 * 24-bit foreground codes, resetting to the default foreground at the end.
 * Foreground-only, so it stays legible on any terminal background; the caller
 * gates it on truecolor support and wraps it in bold.
 *
 * @param text - Text to colorize; sampled once per character.
 * @returns `text` wrapped in truecolor SGR foreground codes.
 */
export function gradientText(text) {
    const glyphs = Array.from(text);
    const last = Math.max(1, glyphs.length - 1);
    let painted = '';
    for (let index = 0; index < glyphs.length; index += 1) {
        const [r, g, b] = brandColorAt(index / last);
        painted += `\x1b[38;2;${r};${g};${b}m${glyphs[index]}`;
    }
    return `${painted}\x1b[39m`;
}
/**
 * Derive the pi-tui Markdown theme from a role palette.
 * @param palette - Active role palette.
 * @returns The Markdown theme wired to palette roles.
 */
export function markdownTheme(palette) {
    return {
        heading: text => palette.accent(text),
        link: text => palette.accent(text),
        // pi-tui requires this URL slot but its current Markdown renderer does not invoke it.
        /* v8 ignore next */
        linkUrl: text => palette.dim(text),
        code: text => palette.code(text),
        codeBlock: text => palette.code(text),
        // pi-tui presents both fence rows through this callback. Keep the opening
        // language label, but hide Markdown syntax and the otherwise-empty close.
        codeBlockBorder: text => palette.dim(text.slice(3)),
        quote: text => palette.dim(text),
        quoteBorder: text => palette.accent(text),
        hr: text => palette.dim(text),
        listBullet: text => palette.accent(text),
        bold: text => palette.bold(text),
        italic: text => palette.italic(text),
        strikethrough: text => palette.strike(text),
        underline: text => palette.underline(text),
    };
}
/**
 * Derive the pi-tui select-list theme from a role palette.
 * @param palette - Active role palette.
 * @returns The select-list theme wired to palette roles.
 */
export function selectTheme(palette) {
    return {
        selectedPrefix: palette.accent,
        selectedText: palette.accent,
        description: palette.dim,
        scrollInfo: palette.dim,
        noMatch: palette.warning,
    };
}
/**
 * Derive the reverse-video dialog select-list theme from a role palette.
 * @param palette - Active role palette.
 * @returns The dialog select-list theme with a reverse-video selection.
 */
export function dialogSelectTheme(palette) {
    return {
        ...selectTheme(palette),
        selectedText: text => palette.selected(palette.accent(text)),
    };
}
/** Sample text every `/palette` row renders, long enough to judge a tone against its neighbours. */
const PALETTE_SAMPLE = 'The quick brown fox 0123';
/**
 * Render every palette role as a labelled sample row, each painted by the role
 * it names, so a reader compares the actual tones their terminal produces rather
 * than reading SGR numbers. Colors print first and attributes second because the
 * two groups compose in that order; every row shows its SGR pair so a mismatch
 * between the table and the screen is visible.
 *
 * @param palette - Active role palette, used to paint each sample.
 * @param scheme - Active color scheme, reported in the heading and selecting the spec.
 * @param colorEnabled - Whether ANSI is emitted; reported so an unstyled listing is not confusing.
 * @returns The rendered rows, without a trailing blank.
 */
export function renderPalette(palette, scheme, colorEnabled) {
    const spec = paletteSpec(scheme);
    const width = Math.max(...[...COLOR_ROLES, ...ATTRIBUTE_ROLES].map(name => name.length));
    // Two rows per role: the painted sample beside its name and SGR pair, then the
    // purpose indented under it. Splitting the purpose onto its own row keeps every
    // sample on one visual line at the narrow widths a side-by-side pane gives.
    const head = (name, role, sample) => {
        const pair = role.open === '' ? 'no escape' : `ESC[${role.open}m ESC[${role.close}m`;
        return `  ${sample}  ${palette.dim(`${name.padEnd(width)} ${pair}`)}`;
    };
    const purpose = (role) => `  ${palette.dim(`    ${role.purpose}`)}`;
    const rows = [
        palette.bold(palette.accent('Palette')),
        palette.dim(`${scheme} scheme · color ${colorEnabled ? 'on' : 'off'}`),
        '',
        palette.dim('Colors — exactly one per span; they never nest inside each other.'),
    ];
    for (const name of COLOR_ROLES) {
        rows.push(head(name, spec.colors[name], palette[name](PALETTE_SAMPLE)), purpose(spec.colors[name]));
    }
    rows.push('', palette.dim('Attributes — compose with any color, in either order.'));
    for (const name of ATTRIBUTE_ROLES) {
        rows.push(head(name, spec.attributes[name], palette[name](PALETTE_SAMPLE)), purpose(spec.attributes[name]));
    }
    return rows;
}
//# sourceMappingURL=theme.js.map