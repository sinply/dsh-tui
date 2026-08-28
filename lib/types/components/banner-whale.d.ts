/**
 * Official DeepSeek whale mark as a terminal raster for the startup banner.
 *
 * Source: the official 24×24 DeepSeek icon (`deepseek-color.svg`, fill
 * `#4D6BFE`), rasterized into a square binary mask without redrawing its
 * contour; two source rows pack into one terminal cell via `▀`/`▄`/`█`.
 * The bytes below are copied verbatim from the legacy first-run welcome art
 * (`legacy-launcher/tui-onboarding/tui-first-run-welcome-art.ts`, `full` tier)
 * so the startup banner and the onboarding art stay pixel-identical.
 * Assets contain no ANSI and are never generated at runtime.
 * @module dsh-tui/components/banner-whale
 */
/** The official DeepSeek whale, one Unicode half-block cell per two source rows. */
export declare const WHALE_ART_UNICODE: readonly ["                           ▄", "       ▄▄▄▄▄▄▄▄▄▄███▀      ██▄", "    ▄███████████████▄      ████▄  ▄▄▄▄██", "  ▄███████████████████▄    ████████████▀", " ▄██████████████████████▄   ▀█████████▀", "▄███▀█████████████████████▄   ████▀▀", "███       ▀▀█████████▀▀▀█████████▀", "███          ▀███████▀█  ▀███████", "███▄           ▀███████▄  ▀█████▀", "▀███             ▀██████████████", " ▀███▄            ▀███████████▀", "  ▀███▄      ▄▄▄    ▀████████▀", "    █████▄    ███▄▄   ▀█████▄▄", "      ▀█████████████▄▄▄▄█▀█████▀", "        ▀▀███████████▀▀"];
/** The same official mark, `compact` tier: smaller rows for side-by-side banners. */
export declare const WHALE_ART_COMPACT: readonly ["     ▄▄▄▄▄▄▄██▀    █▄      ▄", "  ▄███████████▄▄   ███▄▄████", " ████████████████▄ ▀██████▀", "██▀▀▀▀▀████████████▄▄██▀", "██       ▀█████▄ ▀█████", "██▄        ▀████▄ ▄████", " ██▄         ████████▀", "  ██▄    ▄▄   ▀█████▀", "   ▀███▄▄▄███▄  ████▄▄", "     ▀▀▀███████▀▀"];
/** The same official mark, `minimal` tier: fewest rows, for compact side-by-side banners. */
export declare const WHALE_ART_MINIMAL: readonly ["   ▄▄▄▄▄▄   ▄▄", " ▄████████▄ ▀████▀", "█▀▀▀▀███████▄██▀", "█▄    ▀███ ▀███", "▀█▄     ▀█████", " ▀█▄▄ █▄▄▀███▄", "    ▀▀▀▀▀▀"];
//# sourceMappingURL=banner-whale.d.ts.map