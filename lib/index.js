import { TuiPromptService, parseTuiPromptTemplate, renderTuiPromptTemplate } from "./prompt.js";
import { CURSOR_MARKER, CombinedAutocompleteProvider, Container, Editor, Input, Key, Markdown, ProcessTerminal, SelectList, Spacer, TUI, Text, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { Service } from "@deepseek-ai/cordis";
import { assembleContextFor, installModelSelection } from "@deepseek-ai/dsh-agent";
import { LlmError, createUserMessage, errorChain } from "@deepseek-ai/dsh-llm";
import { renderPrompt } from "@deepseek-ai/dsh-system-prompt";
import { SessionId, deriveEventMessage, isAppendSurfaceEvent, isReplacementSurfaceEvent } from "@deepseek-ai/dsh-session";
import { foldGoal } from "@deepseek-ai/dsh-goal";
import { foldSessionTitle } from "@deepseek-ai/dsh-session-title";
import z from "schemastery";
import { lstat, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { diffLines } from "diff";
import { SaxesParser } from "saxes";
import { assertNever } from "@deepseek-ai/dsh-util-values";
import { formatSessionReferenceMention } from "@deepseek-ai/dsh-session-reference";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { isCompactCheckpointSource } from "@deepseek-ai/dsh-compaction";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
import { UserQuestionError } from "@deepseek-ai/dsh-user-questions";
//#region lib/types/extension/overlay-manager.js
/**
* Private bridge between the public TUI extension contract and pi-tui.
*
* The manager serializes modal ownership, guards extension callbacks, and
* settles every queued or active operation before terminal teardown.
* @module dsh-tui/extension/overlay-manager
*/
/** Turn a close reason into its immutable public outcome. */
function outcome(reason) {
	return Object.freeze({ reason });
}
/** Retain only supported layout fields before a queued request returns to its caller. */
function retainOptions(options) {
	return Object.freeze({
		...options.width === void 0 ? {} : { width: options.width },
		...options.minWidth === void 0 ? {} : { minWidth: options.minWidth },
		...options.maxHeight === void 0 ? {} : { maxHeight: options.maxHeight },
		...options.anchor === void 0 ? {} : { anchor: options.anchor },
		...options.margin === void 0 ? {} : { margin: typeof options.margin === "object" ? Object.freeze({ ...options.margin }) : options.margin }
	});
}
/** Guard plugin component methods while preserving focus and key-release state. */
var GuardedOverlayComponent = class {
	component;
	fail;
	constructor(component, fail) {
		this.component = component;
		this.fail = fail;
	}
	get focused() {
		try {
			return this.component.focused ?? false;
		} catch (error) {
			this.fail(error);
			return false;
		}
	}
	set focused(value) {
		try {
			if ("focused" in this.component) this.component.focused = value;
		} catch (error) {
			this.fail(error);
		}
	}
	get wantsKeyRelease() {
		try {
			return this.component.wantsKeyRelease ?? false;
		} catch (error) {
			this.fail(error);
			return false;
		}
	}
	render(width) {
		try {
			return this.component.render(width);
		} catch (error) {
			this.fail(error);
			return [];
		}
	}
	handleInput(data) {
		try {
			this.component.handleInput?.(data);
		} catch (error) {
			this.fail(error);
		}
	}
	invalidate() {
		try {
			this.component.invalidate();
			return true;
		} catch (error) {
			this.fail(error);
			return false;
		}
	}
};
/** FIFO modal owner for one mounted TUI. */
var TuiOverlayManager = class {
	driver;
	queue = [];
	active;
	accepting = true;
	disposeTask;
	constructor(driver) {
		this.driver = driver;
	}
	/**
	* Whether one extension or built-in overlay currently owns terminal focus.
	* @returns `true` while an overlay is active.
	*/
	hasActiveOverlay() {
		return this.active !== void 0;
	}
	/** Reject new work while the TUI unloads dependent extension fibers. */
	beginShutdown() {
		this.accepting = false;
	}
	/**
	* Queue one modal without assigning Cordis ownership.
	* @param request - component factory, constraints, and request signal.
	* @param placement - terminal overlay for extensions, or inline for the built-in question panel.
	* @returns an internal session that can close with an ownership reason.
	*/
	open(request, placement = "overlay") {
		if (!this.accepting) throw new Error("TUI is shutting down");
		const requestSignal = request.signal;
		const retainedRequest = Object.freeze({
			create: request.create,
			...request.options === void 0 ? {} : { options: retainOptions(request.options) },
			...requestSignal === void 0 ? {} : { signal: requestSignal }
		});
		const controller = new AbortController();
		const signal = requestSignal === void 0 ? controller.signal : AbortSignal.any([requestSignal, controller.signal]);
		const deferred = Promise.withResolvers();
		const session = {
			get state() {
				return entry.state;
			},
			closed: deferred.promise,
			close: () => this.close(entry, outcome("closed")),
			closeWith: (reason) => this.close(entry, outcome(reason))
		};
		const entry = {
			request: retainedRequest,
			controller,
			signal,
			closed: deferred.promise,
			resolveClosed: deferred.resolve,
			session,
			placement,
			state: "queued"
		};
		if (requestSignal?.aborted === true) {
			this.close(entry, outcome("aborted"));
			return session;
		}
		if (requestSignal !== void 0) {
			const onAbort = () => {
				this.close(entry, outcome("aborted"));
			};
			requestSignal.addEventListener("abort", onAbort, { once: true });
			entry.removeRequestAbort = () => {
				requestSignal.removeEventListener("abort", onAbort);
			};
		}
		this.queue.push(entry);
		this.activateNext();
		return session;
	}
	/** Stop accepting work and settle every active or queued overlay. */
	dispose() {
		if (this.disposeTask !== void 0) return this.disposeTask;
		this.beginShutdown();
		const entries = [...this.active === void 0 ? [] : [this.active], ...this.queue];
		return this.disposeTask = Promise.all(entries.map((entry) => this.close(entry, outcome("tui-disposed")))).then(() => {});
	}
	activateNext() {
		if (!this.accepting || this.active !== void 0) return;
		const entry = this.queue.shift();
		if (entry === void 0) return;
		this.active = entry;
		entry.state = "active";
		const host = this.host(entry);
		let component;
		try {
			component = entry.request.create(host);
		} catch (error) {
			this.fail(entry, error);
			return;
		}
		if (this.active !== entry) return;
		const guarded = new GuardedOverlayComponent(component, (error) => {
			this.fail(entry, error);
		});
		entry.component = guarded;
		try {
			const handle = this.driver.show(guarded, entry.request.options, entry.placement);
			if (this.active !== entry) {
				this.hide(handle);
				return;
			}
			entry.handle = handle;
			this.driver.invalidate();
		} catch (error) {
			this.fail(entry, error);
		}
	}
	host(entry) {
		const driver = this.driver;
		return Object.freeze({
			get signal() {
				return entry.signal;
			},
			get viewport() {
				return Object.freeze({ ...driver.viewport() });
			},
			get theme() {
				return driver.theme();
			},
			display: (value) => this.driver.display(value),
			invalidate: () => {
				if (this.active !== entry || entry.component === void 0 || entry.failing === true) return;
				if (!entry.component.invalidate() || this.active !== entry) return;
				try {
					this.driver.invalidate();
				} catch (error) {
					this.fail(entry, error);
				}
			},
			close: () => {
				this.close(entry, outcome("closed"));
			}
		});
	}
	fail(entry, error) {
		if (entry.state === "closed" || entry.failing === true) return;
		entry.failing = true;
		this.report(error);
		queueMicrotask(() => {
			this.close(entry, Object.freeze({
				reason: "error",
				error
			}));
		});
	}
	report(error) {
		try {
			this.driver.reportError(error);
		} catch {}
	}
	hide(handle) {
		try {
			handle.hide();
		} catch (error) {
			this.report(error);
		}
	}
	close(entry, result) {
		if (entry.outcome !== void 0) return entry.closed;
		entry.outcome = result;
		entry.state = "closed";
		entry.removeRequestAbort?.();
		delete entry.removeRequestAbort;
		if (!entry.controller.signal.aborted) entry.controller.abort(result);
		const queuedIndex = this.queue.indexOf(entry);
		if (queuedIndex >= 0) this.queue.splice(queuedIndex, 1);
		if (this.active === entry) {
			this.active = void 0;
			if (entry.handle !== void 0) this.hide(entry.handle);
			delete entry.handle;
		}
		delete entry.component;
		entry.resolveClosed(result);
		try {
			this.driver.invalidate();
		} catch (error) {
			this.report(error);
		}
		queueMicrotask(() => {
			this.activateNext();
		});
		return entry.closed;
	}
};
/** Cordis service whose method effects bind to the calling plugin fiber. */
var TuiExtensionServiceImpl = class extends Service {
	agent;
	overlays;
	constructor(ctx, agent, overlays) {
		super(ctx, "tui");
		this.agent = agent;
		this.overlays = overlays;
	}
	/** @inheritdoc */
	openOverlay(request) {
		let operation;
		const disposeOwner = this.ctx.effect(() => () => operation?.closeWith("owner-disposed"), "tui.openOverlay()");
		try {
			operation = this.overlays.open(request);
		} catch (error) {
			disposeOwner();
			throw error;
		}
		operation.closed.then(() => {
			disposeOwner();
		});
		return operation;
	}
};
//#endregion
//#region lib/types/components/text.js
/**
* Terminal text sanitization shared across the pi-tui front door. External text
* (model output, tool results, clipboard) is escaped or stripped of C0/C1
* controls before the TUI adds its own application-owned ANSI.
* @module dsh-tui/components/text
*/
const TERMINAL_CONTROL_PATTERN = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/gu;
const TERMINAL_OSC_PATTERN = /(?:\u001B\]|\u009D)(?:(?!\u0007|\u001B\\)[\s\S])*(?:\u0007|\u001B\\|$)/gu;
const TERMINAL_CSI_PATTERN = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/gu;
const TERMINAL_ESCAPE_PATTERN = /\u001B[@-_]/gu;
/** Bracketed-paste start marker emitted by terminals around pasted content. */
const BRACKETED_PASTE_START = "\x1B[200~";
/** Bracketed-paste end marker emitted by terminals around pasted content. */
const BRACKETED_PASTE_END = "\x1B[201~";
/**
* Escape external C0/C1 controls before pi-tui adds application-owned ANSI.
* Line feeds remain structural so transcript and tool output retain their layout.
* @param text - Untrusted text to render.
* @returns The text with control characters escaped as `\xNN`.
*/
function displayText(text) {
	return text.replace(TERMINAL_CONTROL_PATTERN, (control) => `\\x${control.charCodeAt(0).toString(16).padStart(2, "0")}`);
}
/**
* Escape external controls for terminal fields that must remain on one line.
* @param text - Untrusted text to render inline.
* @returns The escaped text with newlines rendered as `\x0a`.
*/
function displayInlineText(text) {
	return displayText(text).replaceAll("\n", "\\x0a");
}
/**
* Remove terminal controls from clipboard text before an editable field stores it.
* @param text - Raw pasted clipboard text.
* @returns The text stripped of OSC, CSI, escape, and control sequences.
*/
function sanitizePastedText(text) {
	return text.replace(TERMINAL_OSC_PATTERN, "").replace(TERMINAL_CSI_PATTERN, "").replace(TERMINAL_ESCAPE_PATTERN, "").replace(TERMINAL_CONTROL_PATTERN, "");
}
//#endregion
//#region lib/types/components/theme.js
/**
* Theme-agnostic ANSI palette and derived pi-tui themes for the terminal front
* door. The palette is built from the standard 16-color ANSI set plus SGR
* attributes so every terminal remaps it to its active color scheme.
* @module dsh-tui/components/theme
*/
/** Names of the palette's color roles, in the order `/palette` prints them. */
const COLOR_ROLES = [
	"text",
	"dim",
	"accent",
	"brand",
	"code",
	"success",
	"warning",
	"error"
];
/** Names of the palette's attribute roles, in the order `/palette` prints them. */
const ATTRIBUTE_ROLES = [
	"bold",
	"italic",
	"underline",
	"strike",
	"selected"
];
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
function paletteSpec(scheme) {
	return {
		colors: {
			text: {
				open: "",
				close: "",
				purpose: "Body text, the terminal default foreground"
			},
			dim: {
				open: "2;39",
				close: "22;39",
				purpose: "The one recessed tone: tool bodies, chrome, footers"
			},
			accent: {
				open: "95",
				close: "39",
				purpose: "The one emphasis color: role headers, prompt, borders"
			},
			brand: {
				open: "34",
				close: "39",
				purpose: "DeepSeek brand art when truecolor is unavailable"
			},
			code: scheme === "light" ? {
				open: "34",
				close: "39",
				purpose: "Inline code and code blocks in prose"
			} : {
				open: "36",
				close: "39",
				purpose: "Inline code and code blocks in prose"
			},
			success: {
				open: "32",
				close: "39",
				purpose: "Succeeded calls, and a diff's added lines"
			},
			warning: {
				open: "33",
				close: "39",
				purpose: "Pending calls and warnings"
			},
			error: {
				open: "31",
				close: "39",
				purpose: "Failures, signals, and a diff's removed lines"
			}
		},
		attributes: {
			bold: {
				open: "1",
				close: "22",
				purpose: "Emphasis; composes with any color"
			},
			italic: {
				open: "3",
				close: "23",
				purpose: "Reasoning text"
			},
			underline: {
				open: "4",
				close: "24",
				purpose: "Role-header banding"
			},
			strike: {
				open: "9",
				close: "29",
				purpose: "Struck-through Markdown"
			},
			selected: {
				open: "7",
				close: "27",
				purpose: "Reverse video for the active selection"
			}
		}
	};
}
/**
* Wrap text in an SGR pair, or pass it through when color is disabled.
* An empty `open` emits nothing, so the `text` role costs no escape.
*/
function ansi(spec, enabled) {
	if (!enabled || spec.open === "") return (text) => text;
	return (text) => `\x1b[${spec.open}m${text}\x1b[${spec.close}m`;
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
function createPalette(enabled, scheme = "dark") {
	const spec = paletteSpec(scheme);
	const roles = {};
	for (const name of COLOR_ROLES) roles[name] = ansi(spec.colors[name], enabled);
	for (const name of ATTRIBUTE_ROLES) roles[name] = ansi(spec.attributes[name], enabled);
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
function createVscodePalette(enabled) {
	const rgb = (hex) => {
		const value = Number.parseInt(hex, 16);
		return `38;2;${value >> 16 & 255};${value >> 8 & 255};${value & 255}`;
	};
	const spec = {
		colors: {
			text: {
				open: "",
				close: "",
				purpose: "Body text, the terminal default foreground"
			},
			dim: {
				open: rgb("6e7681"),
				close: "39",
				purpose: "The one recessed tone: tool bodies, chrome, footers"
			},
			accent: {
				open: rgb("569cd6"),
				close: "39",
				purpose: "The one emphasis color: role headers, prompt, borders"
			},
			brand: {
				open: rgb("4d6bfe"),
				close: "39",
				purpose: "DeepSeek brand ink"
			},
			code: {
				open: rgb("4ec9b0"),
				close: "39",
				purpose: "Inline code and code blocks in prose"
			},
			success: {
				open: rgb("89d185"),
				close: "39",
				purpose: "Succeeded calls, and a diff's added lines"
			},
			warning: {
				open: rgb("dcdcaa"),
				close: "39",
				purpose: "Pending calls and warnings"
			},
			error: {
				open: rgb("f14c4c"),
				close: "39",
				purpose: "Failures, signals, and a diff's removed lines"
			}
		},
		attributes: {
			bold: {
				open: "1",
				close: "22",
				purpose: "Emphasis; composes with any color"
			},
			italic: {
				open: "3",
				close: "23",
				purpose: "Reasoning text"
			},
			underline: {
				open: "4",
				close: "24",
				purpose: "Role-header banding"
			},
			strike: {
				open: "9",
				close: "29",
				purpose: "Struck-through Markdown"
			},
			selected: {
				open: "7",
				close: "27",
				purpose: "Reverse video for the active selection"
			}
		}
	};
	const roles = {};
	for (const name of COLOR_ROLES) roles[name] = ansi(spec.colors[name], enabled);
	for (const name of ATTRIBUTE_ROLES) roles[name] = ansi(spec.attributes[name], enabled);
	return roles;
}
/** Official DeepSeek icon ink from the shipped 24x24 SVG. */
const DEEPSEEK_BRAND_RGB = [
	[
		77,
		107,
		254
	],
	[
		57,
		130,
		255
	],
	[
		36,
		152,
		255
	]
][0];
/**
* Paint trusted static DeepSeek brand art with the official `#4D6BFE` ink.
* @param text - Static brand text or raster cells.
* @returns text wrapped in the official truecolor foreground and a foreground reset.
*/
function brandText(text) {
	const [r, g, b] = DEEPSEEK_BRAND_RGB;
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}
/**
* Derive the pi-tui Markdown theme from a role palette.
* @param palette - Active role palette.
* @returns The Markdown theme wired to palette roles.
*/
function markdownTheme(palette) {
	return {
		heading: (text) => palette.accent(text),
		link: (text) => palette.accent(text),
		/* v8 ignore next */
		linkUrl: (text) => palette.dim(text),
		code: (text) => palette.code(text),
		codeBlock: (text) => palette.code(text),
		codeBlockBorder: (text) => palette.dim(text.slice(3)),
		quote: (text) => palette.dim(text),
		quoteBorder: (text) => palette.accent(text),
		hr: (text) => palette.dim(text),
		listBullet: (text) => palette.accent(text),
		bold: (text) => palette.bold(text),
		italic: (text) => palette.italic(text),
		strikethrough: (text) => palette.strike(text),
		underline: (text) => palette.underline(text)
	};
}
/**
* Derive the pi-tui select-list theme from a role palette.
* @param palette - Active role palette.
* @returns The select-list theme wired to palette roles.
*/
function selectTheme(palette) {
	return {
		selectedPrefix: palette.accent,
		selectedText: palette.accent,
		description: palette.dim,
		scrollInfo: palette.dim,
		noMatch: palette.warning
	};
}
/**
* Derive the reverse-video dialog select-list theme from a role palette.
* @param palette - Active role palette.
* @returns The dialog select-list theme with a reverse-video selection.
*/
function dialogSelectTheme(palette) {
	return {
		...selectTheme(palette),
		selectedText: (text) => palette.selected(palette.accent(text))
	};
}
/** Sample text every `/palette` row renders, long enough to judge a tone against its neighbours. */
const PALETTE_SAMPLE = "The quick brown fox 0123";
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
function renderPalette(palette, scheme, colorEnabled) {
	const spec = paletteSpec(scheme);
	const width = Math.max(...[...COLOR_ROLES, ...ATTRIBUTE_ROLES].map((name) => name.length));
	const head = (name, role, sample) => {
		const pair = role.open === "" ? "no escape" : `ESC[${role.open}m ESC[${role.close}m`;
		return `  ${sample}  ${palette.dim(`${name.padEnd(width)} ${pair}`)}`;
	};
	const purpose = (role) => `  ${palette.dim(`    ${role.purpose}`)}`;
	const rows = [
		palette.bold(palette.accent("Palette")),
		palette.dim(`${scheme} scheme · color ${colorEnabled ? "on" : "off"}`),
		"",
		palette.dim("Colors — exactly one per span; they never nest inside each other.")
	];
	for (const name of COLOR_ROLES) rows.push(head(name, spec.colors[name], palette[name](PALETTE_SAMPLE)), purpose(spec.colors[name]));
	rows.push("", palette.dim("Attributes — compose with any color, in either order."));
	for (const name of ATTRIBUTE_ROLES) rows.push(head(name, spec.attributes[name], palette[name](PALETTE_SAMPLE)), purpose(spec.attributes[name]));
	return rows;
}
//#endregion
//#region lib/types/components/content.js
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
function contentText(content) {
	const parts = [];
	for (const block of content) switch (block.type) {
		case "text":
		case "reasoning":
			parts.push(block.text);
			break;
		case "tool-call":
			parts.push(`${block.name}(${block.arguments})`);
			break;
		case "tool-result":
			parts.push(contentText(block.content));
			break;
		default: {
			const rawType = block.type;
			parts.push(`[${typeof rawType === "string" ? rawType : "content"}]`);
			break;
		}
	}
	return parts.join("");
}
/**
* Parse tool-call arguments from their JSON source.
* @param raw - Raw JSON arguments text.
* @returns The parsed value, or the raw text with `valid: false` on parse failure.
*/
function parseArguments(raw) {
	try {
		return {
			value: JSON.parse(raw),
			valid: true
		};
	} catch {
		return {
			value: raw,
			valid: false
		};
	}
}
//#endregion
//#region lib/types/chat/tokens.js
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
function recordTokenUsage(totals, turn, step, usage) {
	const key = `${turn}:${step}`;
	const previous = totals.byStep.get(key);
	if (previous !== void 0) {
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
function recordEventUsage(totals, event) {
	if (event.type === "assistant/chunk" && event.data.chunk.type === "usage") recordTokenUsage(totals, event.data.turn, event.data.step, event.data.chunk.usage);
	else if (event.type === "assistant/message" && event.data.usage !== void 0) recordTokenUsage(totals, event.data.turn, event.data.step, event.data.usage);
}
/**
* Share of billed input (prompt) tokens served from the provider cache, as an
* integer percent, or `undefined` before any input is billed (avoids 0/0 and a
* meaningless rate on an empty session).
* @param totals - Running totals to measure.
* @returns The cache hit rate percent, or `undefined` when no input is billed.
*/
function cacheHitRate(totals) {
	const billedInput = totals.input + totals.cacheRead + totals.cacheWrite;
	if (billedInput === 0) return void 0;
	return Math.round(totals.cacheRead / billedInput * 100);
}
/**
* Fold every usage-bearing event in a session into fresh totals.
* @param session - Session whose events supply usage.
* @returns The accumulated token totals.
*/
function sessionTokens(session) {
	const totals = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		byStep: /* @__PURE__ */ new Map()
	};
	for (const event of session.snapshotEvents()) recordEventUsage(totals, event);
	return totals;
}
/**
* Format a token count with a compact k/m suffix for the footer.
* @param value - Token count.
* @returns The compact display string.
*/
function formatTokens(value) {
	if (value < 1e3) return String(value);
	if (value < 1e4) return `${(value / 1e3).toFixed(1)}k`;
	if (value < 1e6) return `${Math.round(value / 1e3)}k`;
	return `${(value / 1e6).toFixed(1)}m`;
}
//#endregion
//#region lib/types/chat/timing.js
/** Milliseconds for one full brightness throb of the active status glyph. */
const STATUS_PULSE_PERIOD_MS = 1400;
/**
* Muted-gray foreground the truecolor status glyph fades through, from the
* near-background trough (opacity 0) to the settled dim gray (opacity 1). Same
* hue-free gray as the idle caret, so the glyph reads as the caret dimly
* appearing rather than a colored indicator. Foreground-only, matching the
* brand gradient, so it stays legible on any terminal background.
*/
const STATUS_FADE_GRAY = {
	trough: [
		43,
		43,
		43
	],
	settled: [
		136,
		136,
		136
	]
};
const TIMING_BUCKET_LABELS = {
	ttft: "Model wait",
	thinking: "Thinking",
	responding: "Response",
	tools: "Tools"
};
const TIMING_BUCKETS = [
	"ttft",
	"thinking",
	"responding",
	"tools"
];
function emptyTimingTotals() {
	return {
		ttft: 0,
		thinking: 0,
		responding: 0,
		tools: 0
	};
}
function timingState(startedAt) {
	return {
		totals: emptyTimingTotals(),
		/* v8 ignore next -- production timing state always begins at a logged step timestamp. */
		active: startedAt === void 0 ? void 0 : {
			bucket: "ttft",
			since: startedAt
		}
	};
}
function sameStep(event, position) {
	return typeof event.data === "object" && "turn" in event.data && "step" in event.data && event.data.turn === position.turn && event.data.step === position.step;
}
function closeTimingBucket(state, at) {
	if (state.active === void 0) return;
	state.totals[state.active.bucket] += Math.max(0, at - state.active.since);
	state.active = void 0;
}
function enterTimingBucket(state, bucket, at) {
	if (state.active?.bucket === bucket) return;
	closeTimingBucket(state, at);
	if (bucket !== void 0) state.active = {
		bucket,
		since: at
	};
}
function advanceStepTiming(state, event) {
	if (event.type === "assistant/chunk") {
		const chunk = event.data.chunk;
		if (state.active?.bucket === "ttft") enterTimingBucket(state, void 0, event.time);
		if (chunk.type === "reasoning-delta" || chunk.type === "block-start" && chunk.blockType === "reasoning") enterTimingBucket(state, "thinking", event.time);
		else if (chunk.type === "text-delta" || chunk.type === "block-start" && chunk.blockType === "text") enterTimingBucket(state, "responding", event.time);
	} else if (event.type === "tool/call") enterTimingBucket(state, "tools", event.time);
	else closeTimingBucket(state, event.time);
}
function timingTotalsAt(state, at) {
	const totals = { ...state.totals };
	if (state.active !== void 0 && at !== void 0) totals[state.active.bucket] += Math.max(0, at - state.active.since);
	return totals;
}
function stepKey(position) {
	return `${position.turn}:${position.step}`;
}
/**
* Incremental per-step timing accumulator shared by every step's timing footer
* in one transcript. One forward pass over the append-only session log serves
* all steps' totals: each query advances a cursor over the events appended
* since the previous query, so a transcript of S steps costs O(events) in
* total instead of the O(S × events) of replaying the whole log per footer
* ([rationale](../../../../../.agents/notes/implemented/bug-fix/2026-08-03-tui-long-session-render-costs.md)).
*
* The log must be append-only with stable indices (the session `seq = log
* length` contract). Event times are consumed as logged: a backward wall-clock
* step clamps each bucket at zero rather than cutting the scan off at the
* query clock. The open bucket is accumulated to the query clock at lookup,
* never during the scan.
*/
var StepTimingTracker = class {
	scanned = 0;
	steps = /* @__PURE__ */ new Map();
	/**
	* Advance over events appended since the previous query, then return one
	* step's accumulated per-phase timing up to clock `at`.
	* @param events - Current session event log (append-only).
	* @param position - Turn/step coordinates of the queried step.
	* @param at - Render clock to accumulate the open bucket up to.
	* @returns The step's per-phase totals; empty when the step never started.
	*/
	totalsAt(events, position, at) {
		for (; this.scanned < events.length; this.scanned += 1) {
			const event = events[this.scanned];
			if (event.type === "step/start") {
				const key = stepKey(event.data);
				if (!this.steps.has(key)) this.steps.set(key, {
					...timingState(event.time),
					closed: false
				});
			} else if (event.type === "assistant/chunk" || event.type === "tool/call" || event.type === "step/end") {
				const state = this.steps.get(stepKey(event.data));
				if (state !== void 0 && !state.closed) {
					advanceStepTiming(state, event);
					if (event.type === "step/end") state.closed = true;
				}
			}
		}
		const state = this.steps.get(stepKey(position));
		return state === void 0 ? emptyTimingTotals() : timingTotalsAt(state, at);
	}
};
/**
* The turn index of the currently open turn, or `undefined` when none is open.
* @param events - Session events to scan from the tail.
* @returns The open turn index, or `undefined`.
*/
function openTurn(events) {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event.type === "turn/end") return void 0;
		if (event.type === "turn/start") return event.data.turn;
	}
}
/**
* Phase-specific status glyph, keyed by the running step's active timing bucket.
* `ttft` is the pre-first-token wait a running turn falls back to between steps.
*/
const TIMING_BUCKET_GLYPHS = {
	ttft: "◍",
	thinking: "✻",
	responding: "●",
	tools: "⚙"
};
/** Status glyph for a live standalone compaction bracket. */
const COMPACTING_GLYPH = "⊙";
/**
* Derive the currently open step's active timing bucket, or `undefined` when no
* step is open. The open step is the last `step/start` with no later matching
* `step/end`; its bucket is replayed with the same rules as {@link StepTimingTracker}.
* @param events - Session events to scan.
* @returns The open step's active bucket, or `undefined`.
*/
function openStepPhase(events) {
	let startIndex = -1;
	let start;
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event.type === "step/end") return void 0;
		if (event.type === "step/start") {
			startIndex = index;
			start = event;
			break;
		}
		if (event.type === "turn/end") return void 0;
	}
	if (start === void 0) return void 0;
	const position = start.data;
	const state = timingState(start.time);
	for (let index = startIndex + 1; index < events.length; index += 1) {
		const event = events[index];
		if ((event.type === "assistant/chunk" || event.type === "tool/call" || event.type === "step/end") && sameStep(event, position)) advanceStepTiming(state, event);
	}
	return state.active?.bucket;
}
/**
* The active status glyph, or `undefined` when idle. A running turn takes
* precedence over standalone compaction and falls back to the pre-first-token
* wait when no step is open. The caller applies the shared fade and throb
* animation (see {@link fadeGlyph}).
* @param events - Session events to derive the phase from.
* @param running - Whether the agent is currently running.
* @param compacting - Whether a live standalone compaction bracket is open.
* @returns The active status glyph, or `undefined` when idle.
*/
function runningPhaseGlyph(events, running, compacting) {
	if (running) {
		const bucket = openStepPhase(events) ?? "ttft";
		return TIMING_BUCKET_GLYPHS[bucket];
	}
	return compacting ? COMPACTING_GLYPH : void 0;
}
/**
* The status throb's brightness at continuous clock `nowMs`: a cosine between
* {@link STATUS_PULSE_FLOOR} and 1 over {@link STATUS_PULSE_PERIOD_MS}, so the
* dim glyph breathes bold→dim→bold without ever blinking off. Multiplied by the
* fade envelope, which alone drives appear/disappear at work boundaries.
*
* @param nowMs - Monotonic render clock in milliseconds.
* @returns Brightness fraction in [{@link STATUS_PULSE_FLOOR}, 1].
*/
function pulseLevel(nowMs) {
	const phase = nowMs % STATUS_PULSE_PERIOD_MS / STATUS_PULSE_PERIOD_MS;
	return 0 + 1 * (.5 - .5 * Math.cos(2 * Math.PI * phase));
}
/**
* One frame of the status glyph at fade `opacity` (0 = near-background trough
* gray, 1 = settled dim gray). The character and its width never change — only
* the gray fades — so the prompt caret column stays fixed and the glyph reads as
* the caret dimly breathing, never a colored indicator.
*
* With truecolor the glyph's 24-bit gray foreground interpolates continuously
* between {@link STATUS_FADE_GRAY}'s trough and settled stops, so both the fade
* and the status throb render as a smooth, symmetric brightness swing with no
* hard cutoff to clip the trough into a blank. Without truecolor there is no
* per-frame gray, so `visible` (driven by the fade envelope, not the opacity)
* shows the glyph in the palette's muted role or leaves a blank column — a
* single dim appear/disappear at fixed width, still dim rather than accent, and
* no throb-driven blink. With color off entirely a visible glyph is bare,
* holding the caret column on a monochrome terminal.
*
* @param glyph - The status glyph to paint.
* @param palette - Active palette supplying the muted (dim gray) role.
* @param colorEnabled - Whether ANSI is emitted at all.
* @param truecolor - Whether the terminal accepts 24-bit foreground codes.
* @param opacity - Brightness fraction in [0, 1] for the truecolor gray.
* @param visible - Whether the non-truecolor fallback shows the glyph at all.
* @returns The gray glyph at this opacity, or a single space when hidden.
*/
function fadeGlyph(glyph, palette, colorEnabled, truecolor, opacity, visible) {
	if (truecolor && colorEnabled) {
		const o = Math.min(Math.max(opacity, 0), 1);
		const [tr, tg, tb] = STATUS_FADE_GRAY.trough;
		const [sr, sg, sb] = STATUS_FADE_GRAY.settled;
		return `\x1b[38;2;${Math.round(tr + (sr - tr) * o)};${Math.round(tg + (sg - tg) * o)};${Math.round(tb + (sb - tb) * o)}m${glyph}\x1b[39m`;
	}
	if (!visible) return " ";
	return colorEnabled ? palette.dim(glyph) : glyph;
}
/**
* Format a non-negative elapsed span at 100 ms resolution.
* @param elapsedMs - Elapsed milliseconds.
* @returns The formatted duration (e.g. `1.5s`, `2m03.4s`).
*/
function formatStatusDuration(elapsedMs) {
	const seconds = Math.floor(Math.max(0, elapsedMs) / 100) / 10;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m${(seconds - minutes * 60).toFixed(1).padStart(4, "0")}s`;
}
/**
* Format the non-zero timing buckets of one step as a middot-joined summary.
* @param totals - Per-phase totals to format.
* @param includeModelWait - Whether to always include the model-wait bucket.
* @returns The formatted timing summary.
*/
function formatTimingTotals(totals, includeModelWait = false) {
	return TIMING_BUCKETS.filter((bucket) => totals[bucket] > 0 || includeModelWait && bucket === "ttft").map((bucket) => `${TIMING_BUCKET_LABELS[bucket]} ${formatStatusDuration(totals[bucket])}`).join(" · ");
}
/**
* Format the queued-steering badge shown on the running status line.
* @param queued - Number of queued steering messages.
* @returns The badge text, or `undefined` when nothing is queued.
*/
function formatQueuedStatus(queued) {
	return queued > 0 ? `${queued} queued` : void 0;
}
/**
* Format a completion timestamp as `YYYY-MM-DD HH:MM:SS` in local time.
* @param time - Epoch milliseconds.
* @returns The formatted local timestamp.
*/
function formatCompletionTime(time) {
	const date = new Date(time);
	const parts = [
		date.getFullYear().toString().padStart(4, "0"),
		(date.getMonth() + 1).toString().padStart(2, "0"),
		date.getDate().toString().padStart(2, "0")
	];
	const clock = [
		date.getHours(),
		date.getMinutes(),
		date.getSeconds()
	].map((value) => value.toString().padStart(2, "0")).join(":");
	return `${parts.join("-")} ${clock}`;
}
//#endregion
//#region lib/types/chat/file-autocomplete.js
/**
* Host-workspace discovery for TUI `@file` completion. The index contains
* paths only: selected values remain ordinary prompt text and file contents
* stay behind the model-facing `read` tool.
*
* @module dsh-tui/chat/file-autocomplete
*/
/** Default maximum file and directory candidates rendered for one query. */
const DEFAULT_FILE_SEARCH_MAX_RESULTS = 20;
/** Default maximum entries retained in one workspace search index. */
const DEFAULT_FILE_SEARCH_MAX_ENTRIES = 1e4;
/** Directory basenames omitted from traversal unless the deployment overrides them. */
const DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES = [".git", "node_modules"];
/**
* Extract an `@path` or `@"path with spaces` token at the cursor. An `@`
* inside another token, such as an email address, is not a completion trigger.
* @param line - current editor line.
* @param cursorCol - cursor column within that line.
* @returns the active token, or `undefined` outside an `@` token.
*/
function activeAtToken(line, cursorCol) {
	const beforeCursor = line.slice(0, cursorCol);
	const quoted = /(?:^|\s)(@"([^"]*))$/u.exec(beforeCursor);
	if (quoted?.[1] !== void 0 && quoted[2] !== void 0) return {
		prefix: quoted[1],
		query: quoted[2],
		quoted: true
	};
	const plain = /(?:^|\s)(@([^\s]*))$/u.exec(beforeCursor);
	if (plain?.[1] === void 0 || plain[2] === void 0) return void 0;
	return {
		prefix: plain[1],
		query: plain[2],
		quoted: false
	};
}
/**
* Format a selected path as prompt text. Whitespace uses Pi's quoted
* `@"path"` grammar; directories retain a trailing slash so completion can
* descend another level.
* @param candidate - selected file or directory.
* @param preserveQuote - retain an explicitly opened quote even when unnecessary.
* @returns the insertion value, or `undefined` for a path the editor grammar cannot represent safely.
*/
function formatFileMention(candidate, preserveQuote) {
	const path = candidate.kind === "directory" ? `${candidate.path}/` : candidate.path;
	if (/[\u0000-\u001f\u007f-\u009f"]/u.test(path)) return void 0;
	if (!(preserveQuote || /\s/u.test(path))) return `@${path}`;
	return `@"${path}"`;
}
/**
* Cancellable, reusable fuzzy index rooted at one agent working directory.
* Directory-scoped queries list live state; bare fuzzy queries share one
* bounded traversal until the `@` interaction ends or a tool result invalidates it.
*/
var WorkspaceFileSearch = class {
	root;
	config;
	excludedDirectories;
	generation;
	disposed = false;
	constructor(root, config) {
		this.root = root;
		this.config = config;
		if (!Number.isSafeInteger(config.maxResults) || config.maxResults <= 0) throw new Error("file search maxResults must be a positive safe integer");
		if (!Number.isSafeInteger(config.maxEntries) || config.maxEntries <= 0) throw new Error("file search maxEntries must be a positive safe integer");
		if (config.excludedDirectories.some((name) => name.length === 0 || name.includes("/") || name.includes("\\"))) throw new Error("file search excludedDirectories entries must be non-empty directory basenames");
		this.excludedDirectories = new Set(config.excludedDirectories);
	}
	/**
	* Return ranked path candidates for the current token.
	* @param rawQuery - path text following `@` or `@"`.
	* @param signal - cancels this caller's wait without killing an index shared by a newer query.
	* @returns at most `maxResults` deterministic candidates.
	*/
	async list(rawQuery, signal) {
		signal.throwIfAborted();
		if (this.disposed) return [];
		const query = rawQuery.replaceAll("\\", "/");
		const slash = query.lastIndexOf("/");
		if (query === "" || slash >= 0) {
			const directory = slash < 0 ? "" : query.slice(0, slash + 1);
			const fragment = slash < 0 ? "" : query.slice(slash + 1);
			return this.listDirectory(directory, fragment, signal);
		}
		return rankCandidates((await waitForPromise(this.ensureIndex(), signal)).filter((candidate) => visibleForGlobalQuery(candidate.path, query)), query, this.config.maxResults);
	}
	/** Discard the current index so the next bare query observes a fresh tree. */
	invalidate() {
		this.generation?.controller.abort(/* @__PURE__ */ new Error("file search index invalidated"));
		this.generation = void 0;
	}
	/** Abort traversal and make later queries return no candidates. */
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.invalidate();
	}
	ensureIndex() {
		if (this.generation !== void 0) return this.generation.promise;
		const controller = new AbortController();
		const generation = {
			controller,
			promise: Promise.resolve([])
		};
		generation.promise = this.scanWorkspace(controller.signal).catch((error) => {
			/* v8 ignore next -- every owned abort clears `generation` synchronously; this only protects an unexpected scan failure */
			if (this.generation === generation) this.generation = void 0;
			throw error;
		});
		this.generation = generation;
		return generation.promise;
	}
	async scanWorkspace(signal) {
		const indexed = [];
		const directories = [{
			absolute: this.root,
			relative: ""
		}];
		for (let cursor = 0; cursor < directories.length && indexed.length < this.config.maxEntries; cursor += 1) {
			signal.throwIfAborted();
			const directory = directories[cursor];
			/* v8 ignore next 3 -- cursor is bounded by this exact queue's length. */
			if (directory === void 0) throw new Error("file search selected a missing directory");
			const entries = await readDirectory(directory.absolute, signal);
			for (const entry of entries) {
				signal.throwIfAborted();
				const path = directory.relative === "" ? entry.name : `${directory.relative}/${entry.name}`;
				if (entry.isDirectory()) {
					if (this.excludedDirectories.has(entry.name)) continue;
					indexed.push({
						path,
						kind: "directory"
					});
					directories.push({
						absolute: join(directory.absolute, entry.name),
						relative: path
					});
				} else if (entry.isFile()) indexed.push({
					path,
					kind: "file"
				});
				if (indexed.length >= this.config.maxEntries) break;
			}
		}
		return indexed;
	}
	async listDirectory(displayDirectory, fragment, signal) {
		if (displayDirectory.split("/").some((segment) => this.excludedDirectories.has(segment))) return [];
		const absolute = await resolveDisplayDirectory(this.root, displayDirectory, signal);
		if (absolute === void 0) return [];
		const entries = await readDirectory(absolute, signal);
		const candidates = [];
		for (const entry of entries) {
			if (entry.name.startsWith(".") && !fragment.startsWith(".")) continue;
			if (entry.isDirectory()) {
				if (this.excludedDirectories.has(entry.name)) continue;
				candidates.push({
					path: `${displayDirectory}${entry.name}`,
					kind: "directory"
				});
			} else if (entry.isFile()) candidates.push({
				path: `${displayDirectory}${entry.name}`,
				kind: "file"
			});
		}
		return rankCandidates(candidates, fragment, this.config.maxResults);
	}
};
async function resolveDisplayDirectory(root, displayDirectory, signal) {
	const resolvedRoot = resolve(root);
	const absolute = resolve(resolvedRoot, displayDirectory === "" ? "." : displayDirectory);
	const fromRoot = relative(resolvedRoot, absolute);
	if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) return void 0;
	/* v8 ignore next -- only Windows can produce a cross-volume absolute relative path */
	if (isAbsolute(fromRoot)) return void 0;
	let current = resolvedRoot;
	for (const segment of fromRoot.split(sep).filter(Boolean)) {
		signal.throwIfAborted();
		current = join(current, segment);
		try {
			const status = await lstat(current);
			signal.throwIfAborted();
			if (status.isSymbolicLink() || !status.isDirectory()) return void 0;
		} catch (_error) {
			signal.throwIfAborted();
			return;
		}
	}
	return absolute;
}
async function readDirectory(absolute, signal) {
	signal.throwIfAborted();
	try {
		const entries = await readdir(absolute, { withFileTypes: true });
		signal.throwIfAborted();
		return entries.sort((left, right) => compareText(left.name, right.name));
	} catch (_error) {
		signal.throwIfAborted();
		return [];
	}
}
function visibleForGlobalQuery(path, query) {
	if (query.startsWith(".") || query.includes("/.")) return true;
	return !path.split("/").some((segment) => segment.startsWith("."));
}
function rankCandidates(candidates, query, limit) {
	const ranked = [];
	for (const candidate of candidates) {
		const score = scoreCandidate(candidate, query);
		if (score !== void 0) ranked.push({
			candidate,
			score
		});
	}
	ranked.sort((left, right) => right.score - left.score || kindRank(left.candidate.kind) - kindRank(right.candidate.kind) || (query === "" ? 0 : left.candidate.path.length - right.candidate.path.length) || compareText(left.candidate.path, right.candidate.path));
	return ranked.slice(0, limit).map((entry) => entry.candidate);
}
function scoreCandidate(candidate, query) {
	if (query === "") return 0;
	const path = candidate.path.toLowerCase();
	const name = path.slice(path.lastIndexOf("/") + 1);
	const needle = query.toLowerCase();
	const directoryBonus = candidate.kind === "directory" ? 25 : 0;
	if (name === needle) return 1e3 + directoryBonus;
	if (name.startsWith(needle)) return 900 + directoryBonus;
	if (name.includes(needle)) return 700 + directoryBonus;
	if (path.includes(needle)) return 500 + directoryBonus;
	const subsequence = subsequenceScore(path, needle);
	return subsequence === void 0 ? void 0 : 300 + subsequence + directoryBonus;
}
function subsequenceScore(target, query) {
	let targetIndex = 0;
	let gap = 0;
	for (const character of query) {
		const found = target.indexOf(character, targetIndex);
		if (found < 0) return void 0;
		gap += found - targetIndex;
		targetIndex = found + 1;
	}
	return Math.max(0, 100 - gap);
}
function kindRank(kind) {
	return kind === "directory" ? 0 : 1;
}
function compareText(left, right) {
	/* v8 ignore next -- entries and candidates are unique; host enumeration
	* order determines which comparison direction sort requests. */
	return left < right ? -1 : left > right ? 1 : 0;
}
function waitForPromise(promise, signal) {
	/* v8 ignore next -- `list()` checks this signal immediately before its synchronous call into this helper */
	if (signal.aborted) return Promise.reject(errorReason(signal.reason, "file search aborted"));
	return new Promise((resolvePromise, rejectPromise) => {
		const onAbort = () => {
			rejectPromise(errorReason(signal.reason, "file search aborted"));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolvePromise(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			rejectPromise(errorReason(error, "file search index failed"));
		});
	});
}
function errorReason(reason, fallback) {
	return reason instanceof Error ? reason : new Error(fallback, { cause: reason });
}
//#endregion
//#region lib/types/config.js
/**
* Serializable configuration and defaults for the pi-tui terminal mode. Loader
* schema validation normally fills defaults; {@link resolveTuiConfig} applies
* the same defaults for direct callers that bypass the Loader.
* @module dsh-tui/config
*/
const showReasoningSchema = z.boolean().default(true);
const maxToolOutputLinesSchema = z.number().step(1).min(1).default(6);
const maxDiffEditLengthSchema = z.number().step(1).min(1).default(1e3);
const maxQuestionOptionsSchema = z.number().step(1).min(1).default(8);
const maxModelOptionsSchema = z.number().step(1).min(1).default(8);
const maxResumeOptionsSchema = z.number().step(1).min(1).default(8);
const resumeScanConcurrencySchema = z.number().step(1).min(1).default(4);
const questionDialogWidthSchema = z.number().step(1).min(20).default(200);
const questionDialogMaxHeightSchema = z.number().step(1).min(6).default(20);
const modelDialogWidthSchema = z.number().step(1).min(20).default(76);
const modelDialogMaxHeightSchema = z.number().step(1).min(6).default(20);
const detailsDialogWidthSchema = z.number().step(1).min(20).default(72);
const fileSearchMaxResultsSchema = z.number().step(1).min(1).default(20);
const fileSearchMaxEntriesSchema = z.number().step(1).min(1).default(DEFAULT_FILE_SEARCH_MAX_ENTRIES);
const fileSearchExcludedDirectoriesSchema = z.array(z.string()).default([...DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES]);
const showHardwareCursorSchema = z.boolean().default(false);
const colorSchema = z.boolean().default(true);
const truecolorSchema = z.boolean();
const vscodeSchema = z.boolean().default(true);
const DEFAULT_LEFT_PROMPT = "${cwd}${git/worktree}${model}${token_meter/cache_hit_rate}${context}";
const DEFAULT_RIGHT_PROMPT = "${queued}";
const DEFAULT_INPUT_PROMPT = "${symbol} ${indicator}";
const DEFAULT_INPUT_PLACEHOLDER = "press enter to steer and esc to cancel";
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
	theme: z.object({
		color: colorSchema,
		truecolor: truecolorSchema,
		vscode: vscodeSchema,
		leftPrompt: z.string().default(DEFAULT_LEFT_PROMPT),
		rightPrompt: z.string().default(DEFAULT_RIGHT_PROMPT),
		inputPrompt: z.string().default(DEFAULT_INPUT_PROMPT),
		inputPlaceholder: z.string().default(DEFAULT_INPUT_PLACEHOLDER)
	}),
	title: z.string().default("DeepSeek Harness")
};
/** Schemastery schema for presentation settings embedded by app bundles. */
const TuiConfigSchema = z.object(tuiConfigSchemaFields);
/** Schemastery schema for the full plugin configuration. */
const Config = z.object({
	welcome: z.string(),
	sessionId: z.string().default("main"),
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
	title: tuiConfigSchemaFields.title
});
/**
* Apply direct-call defaults after Loader schema validation has normally run.
*
* @param config - Deployment-provided terminal presentation settings.
* @returns Complete settings consumed by the TUI renderer.
*/
function resolveTuiConfig(config) {
	return {
		showReasoning: config?.showReasoning ?? true,
		maxToolOutputLines: config?.maxToolOutputLines ?? 6,
		maxDiffEditLength: config?.maxDiffEditLength ?? 1e3,
		maxQuestionOptions: config?.maxQuestionOptions ?? 8,
		maxModelOptions: config?.maxModelOptions ?? 8,
		maxResumeOptions: config?.maxResumeOptions ?? 8,
		resumeScanConcurrency: config?.resumeScanConcurrency ?? 4,
		questionDialogWidth: config?.questionDialogWidth ?? 200,
		questionDialogMaxHeight: config?.questionDialogMaxHeight ?? 20,
		modelDialogWidth: config?.modelDialogWidth ?? 76,
		modelDialogMaxHeight: config?.modelDialogMaxHeight ?? 20,
		detailsDialogWidth: config?.detailsDialogWidth ?? 72,
		fileSearchMaxResults: config?.fileSearchMaxResults ?? 20,
		fileSearchMaxEntries: config?.fileSearchMaxEntries ?? 1e4,
		fileSearchExcludedDirectories: [...config?.fileSearchExcludedDirectories ?? DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES],
		showHardwareCursor: config?.showHardwareCursor ?? false,
		theme: {
			color: config?.theme?.color ?? true,
			truecolor: config?.theme?.truecolor ?? false,
			vscode: config?.theme?.vscode ?? true,
			leftPrompt: config?.theme?.leftPrompt ?? DEFAULT_LEFT_PROMPT,
			rightPrompt: config?.theme?.rightPrompt ?? DEFAULT_RIGHT_PROMPT,
			inputPrompt: config?.theme?.inputPrompt ?? DEFAULT_INPUT_PROMPT,
			inputPlaceholder: config?.theme?.inputPlaceholder ?? DEFAULT_INPUT_PLACEHOLDER
		},
		title: config?.title ?? "DeepSeek Harness"
	};
}
//#endregion
//#region lib/types/components/xml-tool-output.js
/**
* Conservative readable-tree rendering for model-facing text containing one XML
* document, used by the transcript's tool cards for unknown tool results. Injected
* context is prose and is not parsed; only {@link preview} is shared with its card.
* @module dsh-tui/components/xml-tool-output
*/
function parseXml(source, display) {
	const parser = new SaxesParser({ xmlns: false });
	const stack = [];
	let root;
	const state = { invalid: false };
	const reject = () => {
		state.invalid = true;
	};
	parser.on("opentag", (tag) => {
		const element = {
			name: tag.name,
			attributes: Object.entries(tag.attributes).map(([name, value]) => ({
				name,
				value: display(value)
			})),
			children: []
		};
		const parent = stack.at(-1);
		if (parent === void 0) {
			if (root !== void 0) reject();
			root = element;
		} else parent.children.push(element);
		stack.push(element);
	});
	parser.on("text", (text) => {
		const parent = stack.at(-1);
		if (parent === void 0) {
			if (text.trim() !== "") reject();
		} else parent.children.push(display(text));
	});
	parser.on("cdata", (text) => {
		const parent = stack.at(-1);
		if (parent === void 0) reject();
		else parent.children.push(display(text));
	});
	parser.on("closetag", () => {
		stack.pop();
	});
	parser.on("xmldecl", reject);
	parser.on("processinginstruction", reject);
	parser.on("doctype", reject);
	parser.on("comment", reject);
	parser.on("error", reject);
	parser.write(source).close();
	return state.invalid ? void 0 : root;
}
function elementLabel(element) {
	const attributes = element.attributes.map((attribute) => `${attribute.name}=${JSON.stringify(attribute.value)}`).join(" ");
	return attributes === "" ? element.name : `${element.name} (${attributes})`;
}
function meaningfulChildren(element) {
	return element.children.filter((child) => typeof child !== "string" || child.trim() !== "");
}
function textBlock(text, depth, body) {
	return text.replace(/^\n|\n$/gu, "").split("\n").map((line) => line === "" ? line : `${"  ".repeat(depth)}${body(line)}`);
}
function treeLines(element, depth, label, body) {
	const indent = "  ".repeat(depth);
	const children = meaningfulChildren(element);
	if (children.length === 0) return [`${indent}${label(elementLabel(element))}`];
	if (children.length === 1 && typeof children[0] === "string" && !children[0].includes("\n")) return [`${indent}${label(`${elementLabel(element)}:`)} ${body(children[0].trim())}`];
	const lines = [`${indent}${label(elementLabel(element))}`];
	for (const child of children) if (typeof child === "string") lines.push(...textBlock(child, depth + 1, body));
	else lines.push(...treeLines(child, depth + 1, label, body));
	return lines;
}
/**
* Collapse `lines` to a head/tail preview around one omitted-count marker.
* The single fold rule for every transcript card, so a card's fold never depends
* on how its body was rendered: tool cards share it with their tree output and
* context cards apply it to prose rows.
* @param lines - Fully rendered body rows.
* @param limit - Maximum retained rows, excluding the marker.
* @param omitted - Renders the marker for the omitted row count.
* @returns `lines` unchanged when within `limit`, else head rows, the marker, and tail rows.
*/
function preview(lines, limit, omitted) {
	if (lines.length <= limit) return [...lines];
	const head = Math.ceil(limit / 2);
	const tail = limit - head;
	return [
		...lines.slice(0, head),
		omitted(lines.length - limit),
		...lines.slice(lines.length - tail)
	];
}
/**
* Render a complete XML document as an indented tree, or decline without changing partial/mixed text.
* @param source - Raw model-facing text from an unknown tool result.
* @param maxChildLines - Collapsed budget independently applied to each top-level child's lines and
* to the number of top-level children, so many siblings cannot grow the collapsed card without bound.
* @param expanded - Whether to retain every rendered child line.
* @param display - Escapes parsed text and attribute values for terminal output; character references
* can expand to control characters that pre-parse escaping never saw.
* @param label - Styles element names and attributes.
* @param body - Styles the text content under those elements; the card's body tone, so tree
* content matches the surrounding card rows instead of falling back to the default foreground.
* @param omitted - Renders the omitted-line marker for a collapsed child or child range.
* @returns Tree rows, or `undefined` when `source` is not one supported complete XML document.
*/
function renderUnknownXml(source, maxChildLines, expanded, display, label, body, omitted) {
	const root = parseXml(source, display);
	if (root === void 0) return void 0;
	const blocks = meaningfulChildren(root).map((child) => typeof child === "string" ? textBlock(child, 1, body) : treeLines(child, 1, label, body));
	const rootLine = label(elementLabel(root));
	if (expanded) return [rootLine, ...blocks.flat()];
	const previewed = blocks.map((block) => preview(block, maxChildLines, omitted));
	if (previewed.length <= maxChildLines) return [rootLine, ...previewed.flat()];
	const head = Math.ceil(maxChildLines / 2);
	const tail = maxChildLines - head;
	const hidden = blocks.slice(head, blocks.length - tail).reduce((total, block) => total + block.length, 0);
	return [
		rootLine,
		...previewed.slice(0, head).flat(),
		omitted(hidden),
		...previewed.slice(previewed.length - tail).flat()
	];
}
Object.freeze([
	"                           ▄",
	"       ▄▄▄▄▄▄▄▄▄▄███▀      ██▄",
	"    ▄███████████████▄      ████▄  ▄▄▄▄██",
	"  ▄███████████████████▄    ████████████▀",
	" ▄██████████████████████▄   ▀█████████▀",
	"▄███▀█████████████████████▄   ████▀▀",
	"███       ▀▀█████████▀▀▀█████████▀",
	"███          ▀███████▀█  ▀███████",
	"███▄           ▀███████▄  ▀█████▀",
	"▀███             ▀██████████████",
	" ▀███▄            ▀███████████▀",
	"  ▀███▄      ▄▄▄    ▀████████▀",
	"    █████▄    ███▄▄   ▀█████▄▄",
	"      ▀█████████████▄▄▄▄█▀█████▀",
	"        ▀▀███████████▀▀"
]);
Object.freeze([
	"     ▄▄▄▄▄▄▄██▀    █▄      ▄",
	"  ▄███████████▄▄   ███▄▄████",
	" ████████████████▄ ▀██████▀",
	"██▀▀▀▀▀████████████▄▄██▀",
	"██       ▀█████▄ ▀█████",
	"██▄        ▀████▄ ▄████",
	" ██▄         ████████▀",
	"  ██▄    ▄▄   ▀█████▀",
	"   ▀███▄▄▄███▄  ████▄▄",
	"     ▀▀▀███████▀▀"
]);
/** The same official mark, `minimal` tier: fewest rows, for compact side-by-side banners. */
const WHALE_ART_MINIMAL = Object.freeze([
	"   ▄▄▄▄▄▄   ▄▄",
	" ▄████████▄ ▀████▀",
	"█▀▀▀▀███████▄██▀",
	"█▄    ▀███ ▀███",
	"▀█▄     ▀█████",
	" ▀█▄▄ █▄▄▀███▄",
	"    ▀▀▀▀▀▀"
]);
//#endregion
//#region lib/types/components/transcript.js
/**
* pi-tui transcript components: the startup banner, user/assistant messages,
* per-step timing footer, streaming assistant buffer, tool cards, and the todo
* panel. Each is a pure function of its inputs and the active palette.
* @module dsh-tui/components/transcript
*/
/** Concatenate the text of every block of one type, separated by blank lines. */
function textBlocks(content, type) {
	return content.filter((block) => block.type === type).map((block) => block.text).join("\n\n");
}
/** Render a value as terminal-safe text: strings escaped, other values as pretty JSON. */
function pretty(value) {
	if (typeof value === "string") return displayText(value);
	return displayText(JSON.stringify(value, null, 2) ?? String(value));
}
/**
* A side's content lines under the terminator rule the Web DiffBlock also
* applies: empty text is zero lines, a trailing newline terminates the last
* line, and an interior blank line survives.
*/
function diffContentLines(text) {
	if (text === "") return [];
	return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
}
/**
* A file diff whose unchanged context stays neutral and does not affect exact
* change totals. Comparisons beyond the edit-distance budget fall back to
* whole-side rendering so a model-authored pending edit cannot stall the TUI.
*/
function renderDiff(diff, maxDiffEditLength, palette) {
	const lines = [palette.bold(displayText(diff.path))];
	let added = 0;
	let removed = 0;
	if (diff.oldText === null) {
		const newLines = diffContentLines(displayText(diff.newText));
		added = newLines.length;
		for (const line of newLines) lines.push(palette.success(`+ ${line}`));
		return {
			lines,
			added,
			removed,
			approximate: false
		};
	}
	const changes = diffLines(diff.oldText, diff.newText, { maxEditLength: maxDiffEditLength });
	if (changes === void 0) {
		const oldLines = diffContentLines(displayText(diff.oldText));
		const newLines = diffContentLines(displayText(diff.newText));
		lines.push(palette.dim(`[exact line diff omitted: >${maxDiffEditLength} changed lines]`));
		removed = oldLines.length;
		added = newLines.length;
		for (const line of oldLines) lines.push(palette.error(`- ${line}`));
		for (const line of newLines) lines.push(palette.success(`+ ${line}`));
		return {
			lines,
			added,
			removed,
			approximate: true
		};
	}
	for (const change of changes) {
		const changedLines = diffContentLines(displayText(change.value));
		if (change.added) {
			added += changedLines.length;
			for (const line of changedLines) lines.push(palette.success(`+ ${line}`));
		} else if (change.removed) {
			removed += changedLines.length;
			for (const line of changedLines) lines.push(palette.error(`- ${line}`));
		} else for (const line of changedLines) lines.push(palette.dim(`  ${line}`));
	}
	return {
		lines,
		added,
		removed,
		approximate: false
	};
}
/**
* A message's bold, underlined role header in the role color. The underline
* bands each role without a background fill or per-line prefix, so it reads on
* any theme and a body drag-select copies the message text verbatim.
*/
function messageHeader(label, color, palette) {
	return palette.bold(palette.underline(color(`❯ ${displayText(label)}`)));
}
/** Brand name and one-line introduction for the banner's right column (the README's own words). */
const STARTUP_TITLE = "DeepSeek Harness";
const STARTUP_DESCRIPTOR = "open-source agent harness by DeepSeek AI";
/** Claude-Code-style hints shown beside the mark on every start. */
const STARTUP_TIPS = ["Type /help for a list of commands", "Ctrl+C to interrupt · Ctrl+D to exit"];
/**
* Borderless startup banner: the compact official DeepSeek whale mark on the
* left (official `#4D6BFE` blue), with a DeepSeek Harness introduction and
* fresh-start hints beside it; a configured welcome or session title renders as
* a line below. No box frame — each line renders as plain left-padded text
* (matching transcript notices) so it reads on any theme and drag-select
* copies without stray glyphs.
*/
var HeaderComponent = class {
	agent;
	subtitle;
	palette;
	/** Columns of the banner currently revealed; `undefined` renders it whole. */
	revealWidth;
	constructor(agent, subtitle, palette) {
		this.agent = agent;
		this.subtitle = subtitle;
		this.palette = palette;
	}
	/**
	* Clip the banner to `width` columns (the sweep reveal); `undefined` restores it.
	* @param width - Revealed banner width in columns, or `undefined` for the whole banner.
	*/
	setRevealWidth(width) {
		this.revealWidth = width;
	}
	invalidate() {}
	render(width) {
		const usable = Math.max(1, width - 2);
		const art = WHALE_ART_MINIMAL;
		const artWidth = Math.max(...art.map((row) => row.length));
		const subtitle = this.subtitle();
		const rightText = [
			[STARTUP_TITLE, (text) => this.palette.bold(brandText(text))],
			[STARTUP_DESCRIPTOR, (text) => this.palette.text(text)],
			...STARTUP_TIPS.map((tip) => [tip, (text) => this.palette.dim(text)]),
			[displayText(this.agent.session.id), (text) => this.palette.dim(text)]
		];
		const textStart = Math.max(0, Math.floor((art.length - rightText.length) / 2));
		const textColumn = Math.max(1, usable - artWidth - 2);
		const padTo = Math.min(artWidth, usable);
		const header = art.flatMap((row, index) => {
			const whale = this.palette.bold(brandText(truncateToWidth(row, usable, "").padEnd(padTo)));
			const entry = rightText[index - textStart];
			if (entry === void 0) return [whale];
			const [text, paint] = entry;
			const clipped = truncateToWidth(text, textColumn, "");
			return clipped.length === 0 ? [whale] : [`${whale}  ${paint(clipped)}`];
		});
		const lines = [...header, ...subtitle === void 0 ? [] : ["", this.palette.dim(displayText(subtitle))]].flatMap((line, index) => index < header.length ? [line] : wrapTextWithAnsi(line, usable)).map((line) => ` ${truncateToWidth(line, usable, "")}`);
		if (this.revealWidth === void 0) return lines;
		return lines.slice(0, Math.min(this.revealWidth, lines.length));
	}
};
/**
* A user or steering prompt in the transcript. An underlined accent role header
* plus blank-line spacing separate it from surrounding blocks; body lines carry
* no prefix or indent, so a terminal drag-select copies the prompt verbatim.
*/
var UserMessageComponent = class extends Container {
	constructor(text, palette, mdTheme, label = "You") {
		super();
		this.addChild(new Text(messageHeader(label, palette.accent, palette), 0, 0));
		this.addChild(new Markdown(displayText(text), 0, 0, mdTheme, { color: (value) => palette.text(value) }, {
			preserveOrderedListMarkers: true,
			preserveBackslashEscapes: true
		}));
	}
};
/**
* Children of a settled assistant message: optional reasoning block then the
* response text. A folded continuation (a later step of a turn while tool cards
* are hidden) drops the `Assistant` header and renders nothing when it has no
* visible body, so tool-only steps leave no blank segment behind.
*/
function assistantMessageChildren(content, showReasoning, foldedContinuation, palette, mdTheme) {
	const reasoning = displayText(textBlocks(content, "reasoning").trim());
	const text = displayText(textBlocks(content, "text").trim());
	const showsReasoning = reasoning !== "" && showReasoning;
	if (foldedContinuation && !showsReasoning && text === "") return [];
	const children = [new Spacer(1)];
	if (!foldedContinuation) children.push(new Text(messageHeader("Assistant", palette.code, palette), 0, 0));
	if (showsReasoning) children.push(new Text(palette.italic(palette.dim("Reasoning")), 0, 0), new Markdown(reasoning, 0, 0, mdTheme, {
		color: (value) => palette.dim(value),
		italic: true
	}));
	if (text) children.push(new Markdown(text, 0, 0, mdTheme, { color: (value) => palette.text(value) }));
	return children;
}
/**
* A step's timing summary, rendered as a self-refreshing footer that stays at
* the tail of the step's output. Kept separate from the assistant message so
* the timing line trails any tool cards the step appends after its message.
*/
var StepTimingComponent = class extends Container {
	position;
	events;
	tracker;
	now;
	palette;
	completionTime;
	constructor(position, events, tracker, now, palette) {
		super();
		this.position = position;
		this.events = events;
		this.tracker = tracker;
		this.now = now;
		this.palette = palette;
		this.rebuild();
	}
	complete(time) {
		this.completionTime = time;
		this.rebuild();
	}
	invalidate() {
		this.rebuild();
		super.invalidate();
	}
	rebuild() {
		this.clear();
		const timing = formatTimingTotals(this.tracker.totalsAt(this.events(), this.position, this.completionTime ?? this.now()), true);
		const header = this.completionTime === void 0 ? timing : `${timing} · Completed ${formatCompletionTime(this.completionTime)}`;
		this.addChild(new Text(this.palette.dim(header), 0, 0));
	}
};
/** A live assistant step: streamed reasoning/text blocks until the message settles. */
var StreamingAssistantComponent = class extends Container {
	position;
	showReasoning;
	palette;
	mdTheme;
	blocks = /* @__PURE__ */ new Map();
	settledContent;
	foldedContinuation = false;
	/**
	* The step's timing footer. The renderer keeps it at the tail of the chat so
	* it trails any tool cards the step appends after this assistant message; it
	* is not a child of this component.
	*/
	timing;
	constructor(position, events, tracker, now, showReasoning, palette, mdTheme) {
		super();
		this.position = position;
		this.showReasoning = showReasoning;
		this.palette = palette;
		this.mdTheme = mdTheme;
		this.timing = new StepTimingComponent(position, events, tracker, now, palette);
		this.rebuild();
	}
	/**
	* Replace the streamed blocks with the step's settled content.
	* @param content - The settled assistant content blocks.
	*/
	settle(content) {
		this.settledContent = content;
		this.rebuild();
	}
	/**
	* Whether this step's assistant message has settled.
	* @returns `true` once {@link settle} has run.
	*/
	isSettled() {
		return this.settledContent !== void 0;
	}
	/**
	* Pin the step's timing footer to its completion time.
	* @param time - Step completion time in epoch milliseconds.
	*/
	complete(time) {
		this.timing.complete(time);
	}
	invalidate() {
		this.rebuild();
		this.timing.invalidate();
		super.invalidate();
	}
	/**
	* Fold one streamed chunk into the live block buffer and re-render.
	* @param chunk - The streamed assistant chunk.
	*/
	update(chunk) {
		if (chunk.type === "block-start") this.blocks.set(chunk.index, {
			type: chunk.blockType,
			text: ""
		});
		else if (chunk.type === "text-delta" || chunk.type === "reasoning-delta") {
			const type = chunk.type === "text-delta" ? "text" : "reasoning";
			const block = this.blocks.get(chunk.index) ?? {
				type,
				text: ""
			};
			block.text += chunk.text;
			this.blocks.set(chunk.index, block);
		} else if (chunk.type === "block-end" && (chunk.block.type === "text" || chunk.block.type === "reasoning")) this.blocks.set(chunk.index, {
			type: chunk.block.type,
			text: chunk.block.text
		});
		this.rebuild();
		this.timing.invalidate();
	}
	/**
	* Toggle whether reasoning blocks render, then re-render.
	* @param show - Whether to show reasoning blocks.
	*/
	setShowReasoning(show) {
		this.showReasoning = show;
		this.rebuild();
	}
	/**
	* Mark this step as a folded continuation of its turn: no `Assistant` header,
	* and no output at all while the step has no visible body. Used while tool
	* cards are hidden so a turn reads as one assistant message.
	* @param folded - Whether to render as a headerless continuation.
	*/
	setFoldedContinuation(folded) {
		if (this.foldedContinuation === folded) return;
		this.foldedContinuation = folded;
		this.rebuild();
	}
	/**
	* Whether the step currently renders visible reasoning or text.
	* @returns `true` when a header-owning render would show a body.
	*/
	hasVisibleBody() {
		const content = this.presentedContent();
		return textBlocks(content, "text").trim() !== "" || this.showReasoning && textBlocks(content, "reasoning").trim() !== "";
	}
	/** The settled content when available, otherwise the streamed blocks in model order. */
	presentedContent() {
		return this.settledContent ?? [...this.blocks.entries()].sort(([left], [right]) => left - right).flatMap(([, block]) => {
			if (block.type === "text") return [{
				type: "text",
				text: block.text
			}];
			if (block.type === "reasoning") return [{
				type: "reasoning",
				text: block.text
			}];
			return [];
		});
	}
	rebuild() {
		this.clear();
		const children = assistantMessageChildren(this.presentedContent(), this.showReasoning, this.foldedContinuation, this.palette, this.mdTheme);
		for (const child of children) this.addChild(child);
	}
};
/**
* Transcript card with a width-keyed rendered-row cache. pi-tui re-renders
* every component each frame and relies on per-component line caches (its own
* `Text`/`Markdown` do this); a card that rebuilds rows inside `render(width)`
* would re-wrap its output every frame
* ([rationale](../../../../../.agents/notes/implemented/bug-fix/2026-08-03-tui-long-session-render-costs.md)).
* Subclasses render through {@link renderLines} and call {@link dropLines}
* from every state mutator; with `invalidate()` (pi-tui's tree-wide cascade)
* also dropping, a state change always re-renders.
*/
var CachedCardComponent = class {
	cached;
	/** Discard the cached rows so the next render recomputes them. */
	dropLines() {
		this.cached = void 0;
	}
	invalidate() {
		this.cached = void 0;
	}
	render(width) {
		if (this.cached?.width !== width) this.cached = {
			width,
			lines: this.renderLines(width)
		};
		return this.cached.lines;
	}
};
/** A tool call and its result, rendered as a collapsible status card. */
var ToolCardComponent = class extends CachedCardComponent {
	name;
	parsed;
	definition;
	maxOutputLines;
	maxDiffEditLength;
	palette;
	mdTheme;
	result;
	visibility = "collapsed";
	callView;
	resultView;
	diffBodyCache;
	constructor(name, parsed, definition, maxOutputLines, maxDiffEditLength, palette, mdTheme) {
		super();
		this.name = name;
		this.parsed = parsed;
		this.definition = definition;
		this.maxOutputLines = maxOutputLines;
		this.maxDiffEditLength = maxDiffEditLength;
		this.palette = palette;
		this.mdTheme = mdTheme;
		this.callView = this.presentCall();
	}
	presentCall() {
		if (this.parsed.valid && this.definition?.presentCall) try {
			const view = this.definition.presentCall(this.parsed.value);
			if (view !== void 0) return view;
		} catch (error) {
			return {
				card: "generic",
				title: displayText(this.name),
				rawInput: `Presenter failed: ${String(error)}`
			};
		}
		return {
			card: "generic",
			title: displayText(this.name),
			rawInput: this.parsed.value
		};
	}
	/**
	* Record the tool result and derive its result view.
	* @param event - The `tool/result` event payload.
	*/
	updateResult(event) {
		this.diffBodyCache = void 0;
		this.dropLines();
		const result = event.message.content[0];
		this.result = {
			content: [...result.content],
			isError: result.isError === true,
			...event.meta !== void 0 ? { meta: event.meta } : {}
		};
		if (this.parsed.valid && this.definition?.presentResult) try {
			const view = this.definition.presentResult(this.parsed.value, this.result);
			if (view !== void 0) this.resultView = view;
		} catch (error) {
			this.resultView = {
				card: "generic",
				content: [{
					type: "text",
					text: `Presenter failed: ${String(error)}`
				}]
			};
		}
	}
	/**
	* Set the card's visibility state.
	* @param visibility - Hidden, collapsed preview, or full body.
	*/
	setVisibility(visibility) {
		this.visibility = visibility;
		this.dropLines();
	}
	renderLines(width) {
		if (this.visibility === "hidden") return [];
		const isError = this.result?.isError ?? false;
		const glyph = this.result === void 0 ? "○" : "●";
		const rawBody = this.renderBody();
		const view = this.resultView ?? this.callView;
		const markdownContent = view.card === "generic" || view.card === "read" ? view.content ?? this.result?.content : view.card === "search" ? this.result?.content : view.card === "web" ? this.result?.content : void 0;
		const unknownXml = this.definition === void 0 && markdownContent !== void 0 ? renderUnknownXml(
			displayText(contentText(markdownContent)),
			this.maxOutputLines,
			this.visibility === "expanded",
			displayText,
			(text) => this.palette.dim(text),
			(text) => this.palette.dim(text),
			/* v8 ignore next -- renderUnknownXml calls the collapsed summary only when hidden XML children exceed this card's limit. */
			(count) => this.palette.dim(`  … +${count} lines (Ctrl+O to expand)`)
		) : void 0;
		const body = unknownXml ?? (markdownContent !== void 0 && rawBody.lines.length > 0 ? this.dimBody(rawBody, width) : [...rawBody.prelude, ...rawBody.lines]);
		const visibleBody = unknownXml !== void 0 || this.visibility === "expanded" ? body : preview(body, this.maxOutputLines, (count) => this.palette.dim(`… +${count} lines (Ctrl+O to expand)`));
		const statusColor = this.result === void 0 ? this.palette.warning : isError ? this.palette.error : this.palette.success;
		const desc = this.headerDescription();
		const headerText = `${glyph} Tool / ${displayText(this.name)}${desc === void 0 ? "" : ` / ${displayInlineText(desc)}`}`;
		const lines = ["", statusColor(truncateToWidth(headerText, Math.max(1, width - 2), ""))];
		if (visibleBody.length > 0) lines.push(...new Text(visibleBody.join("\n"), 0, 0).render(width));
		return lines;
	}
	/** The pending terminal call view, when this row is a terminal card. */
	terminalPending() {
		return this.callView.card === "terminal" ? this.callView : void 0;
	}
	/**
	* The optional header `/ <desc>` segment: a bash (terminal) card's
	* model-authored description. Non-terminal tools contribute no header detail —
	* their presenter title moves into the body instead.
	*/
	headerDescription() {
		const description = this.terminalPending()?.description;
		return description !== void 0 && description !== "" ? description : void 0;
	}
	/**
	* The presenter's title for a non-terminal card, shown as the first body line
	* (a read's `Read src/foo.ts`, a diff's `Edit files`) now that the header is a
	* fixed `Tool / <name>` frame. The result-state title replaces the pending one.
	*/
	bodyTitle() {
		return this.resultView?.title ?? this.callView.title;
	}
	renderBody() {
		const view = this.resultView ?? this.callView;
		if (view.card === "terminal") {
			const pending = this.terminalPending();
			const prelude = [];
			const lines = [];
			const headlined = pending?.description !== void 0 && pending.description !== "";
			if (pending !== void 0 && (headlined || this.result === void 0)) prelude.push(this.palette.dim(`$ ${displayInlineText(pending.title)}`));
			if (pending?.cwd) prelude.push(this.palette.dim(displayInlineText(pending.cwd)));
			if (this.resultView?.card === "terminal") {
				if (this.resultView.output) lines.push(...this.dimOutput(this.resultView.output));
				if (this.resultView.exitCode !== void 0) lines.push(this.palette.dim(`[exit ${this.resultView.exitCode}]`));
				if (this.resultView.signal !== void 0) lines.push(this.palette.error(`[signal ${displayText(this.resultView.signal)}]`));
			} else if (this.result !== void 0) lines.push(...this.dimOutput(contentText(this.result.content)));
			return {
				prelude: prelude.filter(Boolean),
				lines: lines.filter(Boolean)
			};
		}
		if (view.card === "diff") {
			if (this.diffBodyCache?.view === view) return this.diffBodyCache.body;
			const renderedDiffs = view.diffs.map((diff) => renderDiff(diff, this.maxDiffEditLength, this.palette));
			const added = renderedDiffs.reduce((total, rendered) => total + rendered.added, 0);
			const removed = renderedDiffs.reduce((total, rendered) => total + rendered.removed, 0);
			const approximate = renderedDiffs.some((rendered) => rendered.approximate);
			const hunks = renderedDiffs.flatMap((rendered, index) => {
				return [...index > 0 ? [""] : [], ...rendered.lines];
			});
			const files = new Set(view.diffs.map((diff) => diff.path)).size;
			const footer = this.palette.dim(`└ +${added} -${removed} · ${files} file${files === 1 ? "" : "s"}${approximate ? " · approximate" : ""}`);
			const body = {
				prelude: [...hunks, footer],
				lines: []
			};
			this.diffBodyCache = {
				view,
				body
			};
			return body;
		}
		const content = (view.card === "generic" || view.card === "read" ? view.content : void 0) ?? this.result?.content;
		const prelude = [];
		const lines = [];
		const bodyTitle = this.bodyTitle();
		if (bodyTitle !== displayText(this.name)) prelude.push(displayInlineText(bodyTitle));
		if (content !== void 0) lines.push(...displayText(contentText(content)).split("\n"));
		const rawInput = this.result === void 0 && this.callView.card === "generic" ? this.callView.rawInput : void 0;
		if (rawInput !== void 0) lines.push(...pretty(rawInput).split("\n"));
		const total = prelude.length + lines.length;
		return {
			prelude,
			lines: lines.filter((line, index) => {
				const row = prelude.length + index;
				return line.length > 0 || row > 0 && row < total - 1;
			})
		};
	}
	/**
	* A tool's own output text as dim rows — the card's result-output color, which
	* separates what the tool produced from the card's own framing. A blank row
	* stays the empty string so the terminal branch's blank-row filter still reads
	* it as blank instead of as an ANSI-wrapped value.
	*/
	dimOutput(text) {
		return displayText(text).split("\n").map((line) => line === "" ? line : this.palette.dim(line));
	}
	/**
	* Render a generic card's prelude and result as one Markdown document under the
	* dim body tone. Rendering both together preserves the document's own block
	* spacing (Markdown's blank row before a heading); dimming every row keeps the
	* card body one uniform tone, so only the status-colored header carries color.
	*/
	dimBody(body, width) {
		return new Markdown([...body.prelude, ...body.lines].join("\n"), 0, 0, this.mdTheme, { color: (value) => this.palette.text(value) }).render(width).map((row) => row.trim() === "" ? row : this.palette.dim(row));
	}
};
/**
* Matches a lone reminder-frame tag on its own line, capturing the element name.
* Producers emit the frame as whole lines (`workspace-context`, `dsh-tool-skill`),
* so anchoring the whole line keeps a tag mentioned inside prose from matching.
*/
const REMINDER_FRAME_LINE = /^<(\/?)([a-zA-Z][\w:.-]*)>$/u;
/**
* Drop a producer's outer reminder frame, keeping the instruction body verbatim.
* The card header already names the source, so the frame lines carry nothing.
* Only a matched open/close pair on the first and last lines is removed, so a
* body that merely starts with a tag-like line is left intact.
* @param text - Complete model-facing context text.
* @returns The body without its outer frame lines, trimmed of the blank lines they leave.
*/
function stripReminderFrame(text) {
	const [first = "", ...rest] = text.split("\n");
	const last = rest.at(-1);
	if (last === void 0) return text;
	const open = REMINDER_FRAME_LINE.exec(first.trim());
	const close = REMINDER_FRAME_LINE.exec(last.trim());
	if (open?.[1] !== "" || close?.[1] !== "/" || open[2] !== close[2]) return text;
	return rest.slice(0, -1).join("\n").replace(/^\n+|\n+$/gu, "");
}
/**
* Injected context (plugin/goal source, e.g. `workspace-context`), rendered as a
* collapsible dim card that shares the tool-card `Ctrl+O` toggle. The header is
* `Context · <label>`; the body is the message text as dim prose, one tone with
* the header and the fold marker, folded to `maxOutputLines`, with a surrounding
* reminder frame stripped because the source label already names the context.
*
* Injected context is prose, not markup, so this card does not parse it. The
* `<system-reminder>` frame is a prompting convention no model is trained on
* ([envelope rationale](../../../../../.agents/notes/implemented/simplification/2026-07-20-unwrap-injected-content-envelopes.md)),
* and instruction bodies legitimately contain a raw `&` or angle-bracket
* placeholders (`packages/<group>/<pkg>/`, `-t <name>`) that are prose rather than
* elements. Tree-rendering such a payload depended on whether it happened to be
* well-formed XML, which made both the fold and the frame-line suppression
* content-dependent.
*/
var ContextCardComponent = class extends CachedCardComponent {
	label;
	text;
	maxOutputLines;
	palette;
	expanded = false;
	constructor(label, text, maxOutputLines, palette) {
		super();
		this.label = label;
		this.text = text;
		this.maxOutputLines = maxOutputLines;
		this.palette = palette;
	}
	/**
	* Expand or collapse the card body.
	* @param expanded - Whether the full body is shown.
	*/
	setExpanded(expanded) {
		this.expanded = expanded;
		this.dropLines();
	}
	renderLines(width) {
		const header = this.palette.dim(`Context · ${displayText(this.label)}`);
		const stripped = stripReminderFrame(this.text);
		if (stripped === "") return [header];
		const body = stripped.split("\n").map((line) => line === "" ? line : this.palette.dim(displayText(line)));
		const visibleBody = this.expanded ? body : preview(body, this.maxOutputLines, (count) => this.palette.dim(`… +${count} lines (Ctrl+O to expand)`));
		return [header, ...new Text(visibleBody.join("\n"), 0, 0).render(width)];
	}
};
/** The plan/todo panel rendered above the prompt. */
var TodoComponent = class {
	palette;
	todos = [];
	constructor(palette) {
		this.palette = palette;
	}
	/**
	* Replace the rendered plan items.
	* @param todos - The current todo items.
	*/
	update(todos) {
		this.todos = todos;
	}
	invalidate() {}
	render(width) {
		if (this.todos.length === 0) return [];
		const lines = [this.palette.bold(this.palette.accent("Plan"))];
		for (const todo of this.todos) {
			const prefix = todo.status === "completed" ? this.palette.success("✓") : todo.status === "in_progress" ? this.palette.warning("●") : this.palette.dim("○");
			const content = displayText(todo.content);
			const text = todo.status === "completed" ? this.palette.dim(content) : content;
			lines.push(truncateToWidth(`  ${prefix} ${text}`, width, ""));
		}
		return ["", ...lines];
	}
};
//#endregion
//#region lib/types/components/dialogs.js
/**
* pi-tui dialog and selector components for the terminal front door: the status
* card, prompt-context line, model selector, resume picker, and user-question
* dialog, plus the model-choice and resume-candidate data they present.
* @module dsh-tui/components/dialogs
*/
/**
* Format a provider/model target as its `provider/model` label.
* @param target - The LLM target.
* @returns The `provider/model` label.
*/
function targetLabel(target) {
	return `${target.provider}/${target.model}`;
}
/**
* Format a target compactly as its model name with any selected reasoning effort appended.
* @param target - The LLM target.
* @returns The compact `model [effort]` label.
*/
function compactTargetLabel(target) {
	return `${target.model}${target.reasoningEffort === void 0 ? "" : ` ${target.reasoningEffort}`}`;
}
/**
* Resolve the display label for a choice's reasoning effort.
* @param choice - The model choice carrying advertised reasoning metadata.
* @param effort - The selected effort, or `undefined` for provider default.
* @returns The effort's display name, `Default`, or `undefined` when the model has no reasoning metadata.
*/
function targetReasoningLabel(choice, effort) {
	if (effort === void 0) return choice.reasoning === void 0 ? void 0 : "Default";
	return choice.reasoning?.efforts.find((candidate) => candidate.id === effort)?.name ?? effort;
}
/**
* Derive the agent's initial LLM target from its logged request header or options.
* @param agent - The driven agent.
* @returns The initial target, or `undefined` when unset.
*/
function initialTarget(agent) {
	const logged = agent.session.requestHeader()?.config;
	if (logged !== void 0) {
		if (logged.reasoningEffort === void 0) return {
			provider: logged.provider,
			model: logged.model
		};
		return {
			provider: logged.provider,
			model: logged.model,
			reasoningEffort: logged.reasoningEffort
		};
	}
	if (agent.options.provider === void 0 || agent.options.model === void 0) return void 0;
	return {
		provider: agent.options.provider,
		model: agent.options.model
	};
}
/**
* List every advertised model across registered providers, appending the current
* target when a provider does not advertise it.
* @param ctx - Context supplying the LLM service.
* @param current - The current target, appended when unadvertised.
* @returns The model choices, flattened across providers.
*/
async function readModelChoices(ctx, current) {
	const providers = ctx.llm.listProviders();
	return (await Promise.all(providers.map(async (provider) => {
		const models = [...await ctx.llm.listModels(provider.id)];
		if (current?.provider === provider.id && !models.some((model) => model.id === current.model)) models.push({
			provider: provider.id,
			id: current.model,
			name: current.model
		});
		return Promise.all(models.map(async (model) => {
			const reasoning = (await ctx.llm.resolveModelInfo(provider.id, model.id)).reasoning;
			return {
				provider: provider.id,
				model: model.id,
				modelName: model.name,
				...model.description === void 0 ? {} : { description: model.description },
				...reasoning === void 0 ? {} : { reasoning }
			};
		}));
	}))).flat();
}
/**
* Format a diagnostic integer with grouping separators.
* @param value - Integer to format.
* @returns The grouped decimal string.
*/
function formatDiagnosticNumber(value) {
	return value.toLocaleString("en-US");
}
/**
* Format a diagnostic timestamp as an ISO date-time in UTC.
* @param value - Epoch milliseconds.
* @returns The formatted UTC timestamp.
*/
function formatDiagnosticTime(value) {
	return new Date(value).toISOString().replace("T", " ").replace(/\.\d{3}Z$/u, " UTC");
}
/**
* Format a pluralized count for a diagnostic row.
* @param value - Count.
* @param singular - Singular noun; an `s` is appended for other counts.
* @returns The formatted count.
*/
function formatDiagnosticCount(value, singular) {
	return `${String(value)} ${singular}${value === 1 ? "" : "s"}`;
}
/**
* Render a fixed-width filled meter bar for a percentage.
* @param percent - Percentage in [0, 100].
* @param palette - Active role palette.
* @returns The rendered meter.
*/
function diagnosticMeter(percent, palette) {
	const width = 16;
	const filled = Math.round(Math.min(100, Math.max(0, percent)) / 100 * width);
	return `${palette.dim("[")}${palette.accent("█".repeat(filled))}${palette.dim(`${"░".repeat(width - filled)}]`)}`;
}
/** Bordered, grouped field card for one point-in-time status snapshot. */
var StatusCardComponent = class {
	groups;
	palette;
	constructor(groups, palette) {
		this.groups = groups;
		this.palette = palette;
	}
	invalidate() {}
	render(width) {
		const labels = this.groups.flatMap((group) => group.map(([label]) => `${label}:`));
		const naturalLabelWidth = Math.max(...labels.map((label) => label.length));
		const naturalBodyWidth = Math.max(...this.groups.flatMap((group) => group.map(([, value]) => 1 + naturalLabelWidth + 2 + visibleWidth(value))));
		const cardWidth = Math.min(Math.max(8, width), Math.max(19, naturalBodyWidth + 4));
		const innerWidth = Math.max(1, cardWidth - 4);
		const labelWidth = Math.min(naturalLabelWidth, Math.max(1, Math.floor(innerWidth / 3)));
		const body = [];
		for (const [groupIndex, group] of this.groups.entries()) {
			if (groupIndex > 0) body.push("");
			for (const [label, value] of group) {
				const plainLabel = truncateToWidth(`${label}:`, labelWidth, "");
				const prefix = ` ${this.palette.dim(plainLabel.padEnd(labelWidth))}  `;
				const continuation = " ".repeat(1 + labelWidth + 2);
				const valueWidth = Math.max(1, innerWidth - visibleWidth(prefix));
				const wrapped = wrapTextWithAnsi(value, valueWidth);
				for (const [lineIndex, line] of wrapped.entries()) body.push(`${lineIndex === 0 ? prefix : continuation}${line}`);
			}
		}
		const title = truncateToWidth("Session status", Math.max(1, cardWidth - 5), "");
		const topTail = "─".repeat(Math.max(0, cardWidth - visibleWidth(title) - 5));
		const lines = [`${this.palette.dim("╭─ ")}${this.palette.bold(this.palette.accent(title))}${this.palette.dim(` ${topTail}╮`)}`];
		for (const line of body) {
			const clipped = truncateToWidth(line, innerWidth, "");
			lines.push(`${this.palette.dim("│")} ${clipped}${" ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)))} ${this.palette.dim("│")}`);
		}
		lines.push(this.palette.dim(`╰${"─".repeat(Math.max(0, cardWidth - 2))}╯`));
		return lines;
	}
};
/** The left/right template line rendered above the editor. */
var PromptContextComponent = class {
	leftTemplate;
	rightTemplate;
	resolve;
	constructor(leftTemplate, rightTemplate, resolve) {
		this.leftTemplate = leftTemplate;
		this.rightTemplate = rightTemplate;
		this.resolve = resolve;
	}
	invalidate() {}
	render(width) {
		const right = truncateToWidth(renderTuiPromptTemplate(this.rightTemplate, this.resolve), width, "");
		const rightWidth = visibleWidth(right);
		const leftCapacity = Math.max(0, width - rightWidth - (rightWidth === 0 ? 0 : 2));
		const left = truncateToWidth(renderTuiPromptTemplate(this.leftTemplate, this.resolve), leftCapacity, "");
		if (rightWidth === 0) return [left];
		return [`${left}${" ".repeat(Math.max(0, width - visibleWidth(left) - rightWidth))}${right}`];
	}
};
/**
* Render a bordered dialog frame around body lines with a titled top edge.
* @param title - Dialog title shown in the top border.
* @param body - Body lines.
* @param width - Dialog width in columns.
* @param palette - Active role palette.
* @returns The framed dialog lines.
*/
function renderDialog(title, body, width, palette) {
	const innerWidth = Math.max(1, width - 4);
	const topLabel = ` ${displayText(title)} `;
	const top = `╭${topLabel}${"─".repeat(Math.max(0, width - visibleWidth(topLabel) - 2))}╮`;
	const lines = [palette.accent(top)];
	for (const line of body) {
		const clipped = truncateToWidth(line, innerWidth, "");
		lines.push(`${palette.accent("│")} ${clipped}${" ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)))} ${palette.accent("│")}`);
	}
	lines.push(palette.accent(`╰${"─".repeat(Math.max(0, width - 2))}╯`));
	return lines;
}
/** Keyboard model selector rendered as a bordered overlay, with a filter box and per-model reasoning-effort cycling. */
var ModelDialog = class {
	maxVisible;
	palette;
	done;
	cancel;
	list;
	filter = new Input();
	items;
	choices;
	efforts;
	currentValue;
	constructor(choices, current, maxVisible, palette, done, cancel) {
		this.maxVisible = maxVisible;
		this.palette = palette;
		this.done = done;
		this.cancel = cancel;
		this.items = /* @__PURE__ */ new Map();
		this.choices = /* @__PURE__ */ new Map();
		this.efforts = /* @__PURE__ */ new Map();
		this.currentValue = current === void 0 ? void 0 : targetLabel(current);
		for (const choice of choices) {
			const value = targetLabel(choice);
			const isCurrent = current?.provider === choice.provider && current.model === choice.model;
			this.choices.set(value, choice);
			this.efforts.set(value, isCurrent ? current.reasoningEffort ?? choice.reasoning?.defaultEffort : choice.reasoning?.defaultEffort);
			this.items.set(value, {
				value,
				label: displayText(value),
				description: this.describeChoice(choice, isCurrent)
			});
		}
		this.list = this.buildList(this.currentValue);
	}
	/** Build a SelectList over the currently filtered items, selecting `selectValue` when present. */
	buildList(selectValue) {
		const items = this.filteredItems();
		const list = new SelectList(items, this.maxVisible, dialogSelectTheme(this.palette));
		const index = selectValue === void 0 ? 0 : items.findIndex((item) => item.value === selectValue);
		list.setSelectedIndex(Math.max(0, index));
		list.onSelect = (item) => {
			this.confirm(item);
		};
		list.onCancel = this.cancel;
		return list;
	}
	/** Items matching the filter box, as a case-insensitive substring over the label, model name, and description. */
	filteredItems() {
		const query = this.filter.getValue().trim().toLocaleLowerCase();
		if (query === "") return [...this.items.values()];
		return [...this.items.values()].filter((item) => {
			const choice = this.choices.get(item.value);
			/* v8 ignore next -- items and choices share the same keys. */
			if (choice === void 0) return false;
			return [
				item.value,
				choice.modelName,
				choice.description ?? ""
			].some((field) => field.toLocaleLowerCase().includes(query));
		});
	}
	confirm(item) {
		const selected = this.choices.get(item.value);
		/* v8 ignore next -- SelectList only returns values built from `choices`. */
		if (selected === void 0) return;
		this.done({
			choice: selected,
			reasoningEffort: this.efforts.get(item.value)
		});
	}
	describeChoice(choice, isCurrent) {
		const effortLabel = targetReasoningLabel(choice, this.efforts.get(targetLabel(choice)));
		return [
			displayText(choice.modelName),
			...choice.description === void 0 ? [] : [displayText(choice.description)],
			...effortLabel === void 0 ? [] : [displayText(effortLabel)],
			...isCurrent ? ["current"] : []
		].join(" — ");
	}
	cycleReasoningEffort() {
		const selectedItem = this.list.getSelectedItem();
		/* v8 ignore next -- the dialog is opened only for a non-empty catalog. */
		if (selectedItem === null) return;
		const choice = this.choices.get(selectedItem.value);
		if (choice?.reasoning === void 0) return;
		const current = this.efforts.get(selectedItem.value);
		const efforts = [...choice.reasoning.defaultEffort === void 0 ? [void 0] : [], ...choice.reasoning.efforts.map((effort) => effort.id)];
		const next = efforts[(efforts.indexOf(current) + 1) % efforts.length];
		this.efforts.set(selectedItem.value, next);
		const item = this.items.get(selectedItem.value);
		/* v8 ignore next -- items and choices are constructed from the same values. */
		if (item === void 0) return;
		item.description = this.describeChoice(choice, selectedItem.value === this.currentValue);
	}
	invalidate() {
		this.filter.invalidate();
		this.list.invalidate();
	}
	handleInput(data) {
		if (matchesKey(data, Key.shift(Key.tab))) this.cycleReasoningEffort();
		else if (matchesKey(data, Key.escape)) {
			if (this.filter.getValue() === "") this.cancel();
			else {
				this.filter.setValue("");
				this.list = this.buildList(void 0);
			}
		} else if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || matchesKey(data, Key.enter)) this.list.handleInput(data);
		else {
			const previous = this.filter.getValue();
			this.filter.focused = true;
			this.filter.handleInput(data);
			if (this.filter.getValue() !== previous) {
				const selected = this.list.getSelectedItem();
				this.list = this.buildList(selected?.value);
			}
		}
		this.invalidate();
	}
	render(width) {
		const innerWidth = Math.max(1, width - 4);
		this.filter.focused = true;
		const results = this.filteredItems();
		return renderDialog("Select model", [
			truncateToWidth(this.filter.render(innerWidth).join(""), innerWidth, ""),
			"",
			...results.length === 0 ? [this.palette.dim("  No models match the filter")] : this.list.render(innerWidth),
			"",
			this.palette.dim("type to filter • ↑/↓ move • Shift+Tab reasoning • Enter select • Esc")
		], width, this.palette);
	}
};
const TOOL_CARD_PHASES = [
	"collapsed",
	"expanded",
	"hidden"
];
/**
* Keyboard toggle over the two transcript-detail entries — tool-card
* visibility and reasoning display. Tab cycles the highlighted entry's value
* and applies it immediately, so the transcript behind the dialog is the live
* preview; Enter, Esc, or Ctrl+C closes.
*/
var DetailsDialog = class {
	visibility;
	showReasoning;
	palette;
	apply;
	close;
	list;
	toolsItem;
	reasoningItem;
	constructor(visibility, showReasoning, palette, apply, close) {
		this.visibility = visibility;
		this.showReasoning = showReasoning;
		this.palette = palette;
		this.apply = apply;
		this.close = close;
		this.toolsItem = {
			value: "tools",
			label: "Tool cards",
			description: visibility
		};
		this.reasoningItem = {
			value: "reasoning",
			label: "Reasoning",
			description: this.reasoningLabel()
		};
		this.list = new SelectList([this.toolsItem, this.reasoningItem], 2, dialogSelectTheme(palette));
		this.list.onSelect = close;
	}
	reasoningLabel() {
		return this.showReasoning ? "shown" : "hidden";
	}
	/** Cycle the highlighted entry one step and apply the new state. */
	cycle() {
		const selected = this.list.getSelectedItem();
		/* v8 ignore next -- the two-entry list always has a selection. */
		if (selected === null) return;
		if (selected.value === "tools") {
			const index = TOOL_CARD_PHASES.indexOf(this.visibility);
			this.visibility = TOOL_CARD_PHASES[(index + 1) % TOOL_CARD_PHASES.length];
			this.toolsItem.description = this.visibility;
		} else {
			this.showReasoning = !this.showReasoning;
			this.reasoningItem.description = this.reasoningLabel();
		}
		this.apply({
			visibility: this.visibility,
			showReasoning: this.showReasoning
		});
	}
	invalidate() {
		this.list.invalidate();
	}
	handleInput(data) {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) this.close();
		else if (matchesKey(data, Key.tab)) this.cycle();
		else this.list.handleInput(data);
		this.invalidate();
	}
	render(width) {
		const innerWidth = Math.max(1, width - 4);
		return renderDialog("Transcript details", [
			...this.list.render(innerWidth),
			"",
			this.palette.dim("↑/↓ move • Tab toggle • Enter/Esc close")
		], width, this.palette);
	}
};
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
function summarizeResumeCandidate(record, title, lastActivityAt, currentId, cwd, formatWorkspace) {
	let disabledReason;
	if (record.header.id === currentId) disabledReason = "current session";
	else if (record.live) disabledReason = "session is already live in this runtime";
	else if (record.header.cwd === void 0) disabledReason = "session has no recorded workspace";
	return {
		record,
		title: title ?? "Untitled session",
		lastActivityAt: lastActivityAt ?? record.header.createdAt,
		currentWorkspace: record.header.cwd === cwd,
		workspaceLabel: formatWorkspace(record.header.cwd),
		...disabledReason === void 0 ? {} : { disabledReason }
	};
}
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
var ResumePicker = class {
	maxVisible;
	workspaceLabel;
	viewportRows;
	palette;
	done;
	cancel;
	search = new Input();
	pasteBuffer;
	selectedIndex = 0;
	error = "";
	scope = "workspace";
	candidates;
	focused = false;
	constructor(candidates, maxVisible, workspaceLabel, viewportRows, palette, done, cancel) {
		this.maxVisible = maxVisible;
		this.workspaceLabel = workspaceLabel;
		this.viewportRows = viewportRows;
		this.palette = palette;
		this.done = done;
		this.cancel = cancel;
		this.candidates = candidates;
	}
	invalidate() {
		this.search.invalidate();
	}
	/**
	* Replace the loading placeholder with the scanned candidate set.
	* @param candidates - the summarized rows the finished scan produced.
	*/
	setCandidates(candidates) {
		this.candidates = candidates;
		this.selectedIndex = 0;
		this.error = "";
		this.invalidate();
	}
	/** Candidates in the active scope, before the search query narrows them. */
	scoped() {
		const candidates = this.candidates ?? [];
		return this.scope === "all" ? [...candidates] : candidates.filter((candidate) => candidate.currentWorkspace);
	}
	filtered() {
		const query = this.search.getValue().trim().toLocaleLowerCase();
		const scoped = this.scoped();
		if (query === "") return scoped;
		return scoped.filter((candidate) => candidate.title.toLocaleLowerCase().includes(query) || candidate.record.header.id.toLocaleLowerCase().includes(query) || this.scope === "all" && candidate.workspaceLabel.toLocaleLowerCase().includes(query));
	}
	visibleCandidateCount() {
		const rowHeight = this.scope === "all" ? 4 : 3;
		const candidateBudget = Math.max(1, Math.floor((Math.max(1, this.viewportRows()) - 13) / rowHeight));
		return Math.min(this.maxVisible, candidateBudget);
	}
	handleBracketedPaste(data) {
		const start = data.indexOf(BRACKETED_PASTE_START);
		if (this.pasteBuffer === void 0 && start < 0) return false;
		if (this.pasteBuffer === void 0) {
			const prefix = data.slice(0, start);
			if (prefix !== "") this.handleInput(prefix);
			this.pasteBuffer = data.slice(start + 6);
		} else this.pasteBuffer += data;
		const end = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
		if (end < 0) return true;
		const pasted = sanitizePastedText(this.pasteBuffer.slice(0, end));
		const remaining = this.pasteBuffer.slice(end + 6);
		this.pasteBuffer = void 0;
		const previous = this.search.getValue();
		this.search.handleInput(`${BRACKETED_PASTE_START}${pasted}${BRACKETED_PASTE_END}`);
		if (this.search.getValue() !== previous) {
			this.selectedIndex = 0;
			this.error = "";
		}
		if (remaining !== "") this.handleInput(remaining);
		this.invalidate();
		return true;
	}
	handleInput(data) {
		if (this.handleBracketedPaste(data)) return;
		const filtered = this.filtered();
		if (matchesKey(data, Key.ctrl("c"))) {
			this.cancel();
			return;
		}
		if (matchesKey(data, Key.escape)) {
			if (this.search.getValue() === "") this.cancel();
			else {
				this.search.setValue("");
				this.selectedIndex = 0;
				this.error = "";
			}
		} else if (matchesKey(data, Key.up)) this.selectedIndex = filtered.length === 0 ? 0 : (this.selectedIndex + filtered.length - 1) % filtered.length;
		else if (matchesKey(data, Key.down)) this.selectedIndex = filtered.length === 0 ? 0 : (this.selectedIndex + 1) % filtered.length;
		else if (matchesKey(data, Key.pageUp)) this.selectedIndex = Math.max(0, this.selectedIndex - this.visibleCandidateCount());
		else if (matchesKey(data, Key.pageDown)) this.selectedIndex = Math.min(Math.max(0, filtered.length - 1), this.selectedIndex + this.visibleCandidateCount());
		else if (matchesKey(data, Key.tab)) {
			this.scope = this.scope === "workspace" ? "all" : "workspace";
			this.search.setValue("");
			this.selectedIndex = 0;
			this.error = "";
		} else if (matchesKey(data, Key.enter)) {
			const selected = filtered[this.selectedIndex];
			if (this.candidates === void 0) this.error = "Sessions are still loading.";
			else if (selected === void 0) this.error = "No session matches this search.";
			else if (selected.disabledReason !== void 0) this.error = selected.disabledReason;
			else this.done(selected);
		} else {
			const previous = this.search.getValue();
			this.search.focused = this.focused;
			this.search.handleInput(data);
			if (this.search.getValue() !== previous) {
				this.selectedIndex = 0;
				this.error = "";
			}
		}
		this.invalidate();
	}
	/**
	* The scope line under the search box: the active scope with the current
	* workspace it means, and the inactive scope with the count Tab would reveal.
	*/
	renderScopeLine() {
		const candidates = this.candidates ?? [];
		const inWorkspace = candidates.filter((candidate) => candidate.currentWorkspace).length;
		const active = this.scope === "workspace" ? `this workspace ${displayText(this.workspaceLabel)}` : `all workspaces (${candidates.length})`;
		const other = this.scope === "workspace" ? `all workspaces (${candidates.length})` : `this workspace (${inWorkspace})`;
		return `${this.palette.accent(active)}${this.palette.dim(`  ⇥ ${other}`)}`;
	}
	render(width) {
		this.search.focused = this.focused;
		const height = Math.max(1, this.viewportRows());
		const horizontalPadding = width >= 12 ? 2 : 0;
		const contentWidth = Math.max(1, width - horizontalPadding * 2);
		const indent = " ".repeat(horizontalPadding);
		const filtered = this.filtered();
		if (this.selectedIndex >= filtered.length) this.selectedIndex = Math.max(0, filtered.length - 1);
		const position = filtered[this.selectedIndex] === void 0 ? 0 : this.selectedIndex + 1;
		const title = this.candidates === void 0 ? "Resume session" : `Resume session (${position} of ${filtered.length})`;
		const lines = [
			"",
			`${indent}${this.palette.bold(this.palette.accent(title))}`,
			""
		];
		const searchInnerWidth = Math.max(1, contentWidth - 4);
		lines.push(`${indent}${this.palette.dim(`╭${"─".repeat(Math.max(0, contentWidth - 2))}╮`)}`);
		const searchContent = this.search.render(searchInnerWidth).join("").replace(/^> /u, "⌕ ");
		const clippedSearch = truncateToWidth(searchContent, searchInnerWidth, "");
		lines.push(`${indent}${this.palette.dim("│")} ${clippedSearch}${" ".repeat(Math.max(0, searchInnerWidth - visibleWidth(clippedSearch)))} ${this.palette.dim("│")}`, `${indent}${this.palette.dim(`╰${"─".repeat(Math.max(0, contentWidth - 2))}╯`)}`, "", `${indent}${this.renderScopeLine()}`, "");
		const visibleCount = this.visibleCandidateCount();
		const start = Math.max(0, Math.min(this.selectedIndex - Math.floor(visibleCount / 2), filtered.length - visibleCount));
		const end = Math.min(filtered.length, start + visibleCount);
		const push = (line) => {
			lines.push(`${indent}${truncateToWidth(line, contentWidth, "…")}`);
		};
		for (let index = start; index < end; index += 1) {
			const candidate = filtered[index];
			const active = index === this.selectedIndex;
			const status = [
				candidate.disabledReason === "current session" ? "current" : void 0,
				candidate.record.live ? "live" : void 0,
				candidate.record.persisted ? "persisted" : void 0
			].filter((value) => value !== void 0).join(" · ");
			const lead = `${active ? "❯" : " "} ${displayText(candidate.title)}`;
			push(active ? this.palette.bold(this.palette.accent(lead)) : lead);
			push(this.palette.dim(`  ${new Date(candidate.lastActivityAt).toISOString()} · ${status} · ${displayText(candidate.record.header.id)}`));
			if (this.scope === "all") push(this.palette.dim(`  workspace ${displayText(candidate.workspaceLabel)}`));
			if (candidate.disabledReason !== void 0) push(this.palette.warning(`  unavailable: ${displayText(candidate.disabledReason)}`));
		}
		if (this.candidates === void 0) push(this.palette.dim("Loading sessions…"));
		else if (filtered.length === 0) push(this.palette.warning("No matching sessions."));
		if (this.error !== "") {
			lines.push("");
			push(this.palette.error(displayText(this.error)));
		}
		const footer = `${indent}${this.palette.dim("Type to search  •  ↑/↓ navigate  •  Tab scope  •  Enter resume  •  Esc clear/cancel")}`;
		while (lines.length < height - 2) lines.push("");
		lines.push(footer, "");
		return lines.slice(0, height);
	}
};
/** Inline dialog for one user question with option or custom-answer modes. */
var QuestionDialog = class {
	question;
	position;
	total;
	unanswered;
	maxVisible;
	maxHeight;
	palette;
	done;
	cancel;
	selectedIndex = 0;
	selected = /* @__PURE__ */ new Set();
	headerPage = {
		offset: 0,
		size: 1,
		maxOffset: 0
	};
	selectedBlockPage = {
		offset: 0,
		size: 1,
		maxOffset: 0
	};
	mode;
	error = "";
	input = new Input();
	options;
	focused = false;
	constructor(question, position, total, unanswered, maxVisible, maxHeight, palette, done, cancel) {
		this.question = question;
		this.position = position;
		this.total = total;
		this.unanswered = unanswered;
		this.maxVisible = maxVisible;
		this.maxHeight = maxHeight;
		this.palette = palette;
		this.done = done;
		this.cancel = cancel;
		this.options = question.options ?? [];
		this.mode = this.options.length > 0 ? "options" : "custom";
		this.input.onSubmit = (value) => {
			this.submitCustom(value);
		};
		this.input.onEscape = () => {
			if (this.options.length > 0) {
				this.mode = "options";
				this.error = "";
			} else this.cancel();
		};
	}
	invalidate() {
		this.input.invalidate();
	}
	handleInput(data) {
		this.invalidate();
		if (matchesKey(data, Key.pageUp)) {
			this.pageBackward();
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.pageForward();
			return;
		}
		if (this.mode === "custom") {
			this.input.focused = this.focused;
			this.input.handleInput(data);
			return;
		}
		const options = this.options;
		if (matchesKey(data, Key.up)) {
			this.selectedBlockPage = {
				offset: 0,
				size: 1,
				maxOffset: 0
			};
			this.selectedIndex = this.selectedIndex === 0 ? options.length - 1 : this.selectedIndex - 1;
		} else if (matchesKey(data, Key.down)) {
			this.selectedBlockPage = {
				offset: 0,
				size: 1,
				maxOffset: 0
			};
			this.selectedIndex = this.selectedIndex === options.length - 1 ? 0 : this.selectedIndex + 1;
		} else if (matchesKey(data, Key.space) && this.question.multiSelect) {
			if (this.selected.has(this.selectedIndex)) this.selected.delete(this.selectedIndex);
			else this.selected.add(this.selectedIndex);
		} else if (matchesKey(data, Key.enter)) {
			const selected = this.question.multiSelect ? this.selectedOptionLabels() : [options[this.selectedIndex]?.label].filter((label) => label !== void 0);
			const custom = this.question.multiSelect ? this.input.getValue().trim() : "";
			if (selected.length === 0 && custom === "") {
				this.error = "Select at least one option, or press Tab for a custom answer.";
				return;
			}
			this.done({
				selected,
				...custom === "" ? {} : { custom }
			});
		} else if (matchesKey(data, Key.tab) || data.toLowerCase() === "c") {
			this.mode = "custom";
			this.selectedBlockPage = {
				offset: 0,
				size: 1,
				maxOffset: 0
			};
			this.error = "";
		} else if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) this.cancel();
	}
	submitCustom(value) {
		const custom = value.trim();
		if (custom === "") {
			this.error = "Enter an answer before submitting.";
			return;
		}
		this.done({
			selected: this.question.multiSelect ? this.selectedOptionLabels() : [],
			custom
		});
	}
	selectedOptionLabels() {
		return [...this.selected].sort((a, b) => a - b).map((index) => this.options[index]?.label).filter((label) => label !== void 0);
	}
	/** Page backward through an oversized option, then through question detail. */
	pageBackward() {
		if (this.mode === "options" && this.selectedBlockPage.offset > 0) {
			this.selectedBlockPage = {
				...this.selectedBlockPage,
				offset: Math.max(0, this.selectedBlockPage.offset - this.selectedBlockPage.size)
			};
			return;
		}
		this.headerPage = {
			...this.headerPage,
			offset: Math.max(0, this.headerPage.offset - this.headerPage.size)
		};
	}
	/** Page forward through question detail, then through an oversized option. */
	pageForward() {
		if (this.headerPage.offset < this.headerPage.maxOffset) {
			this.headerPage = {
				...this.headerPage,
				offset: Math.min(this.headerPage.maxOffset, this.headerPage.offset + this.headerPage.size)
			};
			return;
		}
		if (this.mode === "custom") return;
		this.selectedBlockPage = {
			...this.selectedBlockPage,
			offset: Math.min(this.selectedBlockPage.maxOffset, this.selectedBlockPage.offset + this.selectedBlockPage.size)
		};
	}
	render(width) {
		this.input.focused = this.focused;
		const horizontalPadding = Math.min(2, Math.max(0, Math.floor((width - 1) / 2)));
		const innerWidth = Math.max(1, width - horizontalPadding * 2);
		const header = `Question ${this.position}/${this.total} (${this.unanswered} unanswered)${this.question.header === void 0 ? "" : ` · ${displayText(this.question.header)}`}`;
		const questionLines = wrapTextWithAnsi(this.palette.text(displayText(this.question.question)), innerWidth);
		const contentLines = [...questionLines];
		const headerLines = [...wrapTextWithAnsi(this.palette.dim(header), innerWidth), ...questionLines];
		if (this.question.detail !== void 0) {
			headerLines.push("");
			contentLines.push("");
			for (const line of wrapTextWithAnsi(displayText(this.question.detail), innerWidth)) {
				headerLines.push(line);
				contentLines.push(line);
			}
		}
		headerLines.push("");
		const customControls = [
			...this.options.length > 0 && this.question.multiSelect ? [`${this.selected.size} selected`] : [],
			"Enter submit",
			this.options.length > 0 ? "Esc options" : "Esc cancel"
		];
		const customHint = this.palette.dim(customControls.join(" • "));
		const footerLines = [];
		if (this.mode === "custom") {
			for (const line of this.input.render(innerWidth)) footerLines.push(line);
			for (const line of wrapTextWithAnsi(customHint, innerWidth)) footerLines.push(line);
		} else {
			const controls = [
				"Tab custom answer",
				...this.options.length > 1 ? ["↑/↓ navigate"] : [],
				...this.question.multiSelect ? ["Space toggle"] : [],
				"Enter submit",
				"Esc interrupt"
			];
			const hint = this.palette.dim(controls.join(" • "));
			for (const line of wrapTextWithAnsi(hint, innerWidth)) footerLines.push(line);
		}
		if (this.error) for (const line of wrapTextWithAnsi(this.palette.error(this.error), innerWidth)) footerLines.push(line);
		const positionLines = this.mode === "options" && this.options.length > this.maxVisible ? [this.palette.dim(`${this.selectedIndex + 1}/${this.options.length}`)] : [];
		const paddingRows = 2;
		const maxHeight = this.maxHeight();
		const availableForOptions = Math.max(this.mode === "options" ? 4 : 1, maxHeight - paddingRows - headerLines.length - positionLines.length - footerLines.length);
		const body = [...headerLines];
		const optionLines = [];
		if (this.mode === "custom") for (const line of footerLines) body.push(line);
		else {
			const optionBlocks = this.options.map((option, index) => this.renderOptionBlock(option, index, innerWidth));
			const { visibleBlocks, hiddenBefore, hiddenAfter } = this.windowBlocks(optionBlocks, availableForOptions, innerWidth);
			if (hiddenBefore > 0) optionLines.push(this.palette.dim(`↑ ${hiddenBefore} more`));
			for (const block of visibleBlocks) for (const line of block) optionLines.push(line);
			if (hiddenAfter > 0) optionLines.push(this.palette.dim(`↓ ${hiddenAfter} more`));
			for (const line of optionLines) body.push(line);
			for (const line of positionLines) body.push(line);
			for (const line of footerLines) body.push(line);
		}
		const rows = [
			"",
			...body,
			""
		];
		let visibleRows = rows;
		if (rows.length <= maxHeight) this.headerPage = {
			offset: 0,
			size: 1,
			maxOffset: 0
		};
		if (rows.length > maxHeight && this.mode === "options" && maxHeight >= 6) {
			const headerBudget = Math.max(0, maxHeight - optionLines.length - (this.error === "" ? 1 : 2));
			const compactFooter = [...this.error === "" ? [] : [truncateToWidth(this.palette.error(`Error: ${this.error}`), innerWidth, "…")], this.compactOptionControls(innerWidth, headerBudget === 1 && contentLines.length > headerBudget)];
			visibleRows = [
				...this.compactQuestionHeader(contentLines, headerBudget, innerWidth),
				...optionLines,
				...compactFooter
			];
		} else if (rows.length > maxHeight && this.mode === "custom" && maxHeight >= 2) {
			const compactFooterSource = [
				...this.input.render(innerWidth),
				this.compactCustomControls(innerWidth),
				...this.error === "" ? [] : [truncateToWidth(this.palette.error(this.error), innerWidth, "…")]
			];
			const footerBudget = Math.max(1, maxHeight - 1);
			const compactFooter = compactFooterSource.length <= footerBudget ? compactFooterSource : footerBudget === 1 ? compactFooterSource.slice(0, 1) : [...compactFooterSource.slice(0, 1), ...compactFooterSource.slice(-(footerBudget - 1))];
			visibleRows = [...this.compactQuestionHeader(contentLines, Math.max(0, maxHeight - compactFooter.length), innerWidth), ...compactFooter];
		}
		if (visibleRows.length > maxHeight) visibleRows = maxHeight === 1 ? [this.palette.dim(`↑ ${visibleRows.length} lines hidden`)] : [this.palette.dim(`↑ ${visibleRows.length - maxHeight + 1} lines hidden`), ...visibleRows.slice(-(maxHeight - 1))];
		return visibleRows.map((line) => {
			const bounded = truncateToWidth(line, innerWidth, "…");
			const pad = " ".repeat(Math.max(0, innerWidth - visibleWidth(bounded)));
			const outerPad = " ".repeat(horizontalPadding);
			return `${outerPad}${bounded}${pad}${outerPad}`;
		});
	}
	/** Render one option as wrapped label and indented description lines. */
	renderOptionBlock(option, index, innerWidth) {
		const labelPrefixPlain = ` ${index === this.selectedIndex ? "›" : " "} ${`${index + 1}. `}${this.question.multiSelect ? this.selected.has(index) ? "[x] " : "[ ] " : ""}`;
		const labelPrefixWidth = visibleWidth(labelPrefixPlain);
		const labelBodyWidth = Math.max(1, innerWidth - labelPrefixWidth);
		const labelLines = wrapTextWithAnsi(displayText(option.label), labelBodyWidth);
		const continuation = " ".repeat(labelPrefixWidth);
		const lines = [];
		for (const [lineIndex, labelLine] of labelLines.entries()) {
			const composed = `${lineIndex === 0 ? labelPrefixPlain : continuation}${labelLine}`;
			lines.push(index === this.selectedIndex ? this.palette.bold(this.palette.accent(composed)) : composed);
		}
		if (option.description !== void 0) {
			const descIndent = " ".repeat(labelPrefixWidth);
			const descBodyWidth = Math.max(1, innerWidth - labelPrefixWidth);
			const descLines = wrapTextWithAnsi(displayText(option.description), descBodyWidth);
			for (const descLine of descLines) lines.push(`${descIndent}${this.palette.dim(descLine)}`);
		}
		return lines;
	}
	/** Keep the question visible when fixed chrome must be compacted. */
	compactQuestionHeader(contentLines, budget, innerWidth) {
		if (budget <= 0) return [];
		if (contentLines.length <= budget) {
			this.headerPage = {
				offset: 0,
				size: 1,
				maxOffset: 0
			};
			return [...contentLines];
		}
		const pageSize = Math.max(1, budget - 1);
		const maxOffset = Math.max(0, contentLines.length - pageSize);
		const offset = Math.min(this.headerPage.offset, maxOffset);
		this.headerPage = {
			offset,
			size: pageSize,
			maxOffset
		};
		const keptLines = contentLines.slice(offset, offset + pageSize);
		if (budget === 1) return [keptLines[0]];
		return [...keptLines, this.pagerStatus(offset + 1, offset + keptLines.length, contentLines.length, innerWidth)];
	}
	/** Keep Page Up / Page Down discoverable when a full pager status cannot fit. */
	pagerStatus(first, last, total, innerWidth) {
		const full = `… lines ${first}-${last}/${total} • PgUp/PgDn`;
		const compact = `PgUp/PgDn ${first}/${total}`;
		return this.palette.dim(truncateToWidth(visibleWidth(full) <= innerWidth ? full : compact, innerWidth, "…"));
	}
	/** Render custom-mode controls on one row when the header must compact. */
	compactCustomControls(innerWidth) {
		const controls = this.options.length > 0 ? "Enter submit • Esc options" : "Enter submit • Esc cancel";
		const fallback = this.options.length > 0 ? "↵ Esc options" : "Enter Esc cancel";
		const line = visibleWidth(controls) <= innerWidth ? controls : fallback;
		return this.palette.dim(truncateToWidth(line, innerWidth, "…"));
	}
	/** Render a one-row option footer that retains every mode-specific control. */
	compactOptionControls(innerWidth, showPager = false) {
		const controls = [
			...this.options.length > 1 ? ["↑/↓"] : [],
			"Tab custom",
			...this.question.multiSelect ? ["Space toggle"] : [],
			"Enter",
			"Esc interrupt",
			...showPager ? ["PgUp/PgDn"] : []
		].join(" • ");
		const optionNavigation = this.options.length > 1 ? "↑↓ " : "";
		const fallback = showPager ? `P↑↓ ${optionNavigation}Tab${this.question.multiSelect ? " S" : ""}↵Esc` : this.question.multiSelect ? `${optionNavigation}Tab Sp ↵Esc` : `${optionNavigation}Tab ↵ Esc`;
		const line = visibleWidth(controls) <= innerWidth ? controls : fallback;
		return this.palette.dim(truncateToWidth(line, innerWidth, "…"));
	}
	/**
	* Choose option blocks that fit while keeping the selected option visible.
	* Omitted blocks are counted at each end for explicit overflow markers.
	*/
	windowBlocks(blocks, budget, innerWidth) {
		if (blocks.reduce((sum, block) => sum + block.length, 0) <= budget && blocks.length <= this.maxVisible) return {
			visibleBlocks: [...blocks],
			hiddenBefore: 0,
			hiddenAfter: 0
		};
		let start = this.selectedIndex;
		let end = this.selectedIndex + 1;
		/* v8 ignore next -- selectedIndex stays inside [0, options.length). */
		let used = blocks[this.selectedIndex]?.length ?? 0;
		const markerLines = (before, after) => (before > 0 ? 1 : 0) + (after > 0 ? 1 : 0);
		const fits = (nextStart, nextEnd, nextUsed) => nextEnd - nextStart <= this.maxVisible && nextUsed + markerLines(nextStart, blocks.length - nextEnd) <= budget;
		const selectedMarkers = markerLines(start, blocks.length - end);
		if (used + selectedMarkers > budget) {
			/* v8 ignore next -- selectedIndex stays inside [0, options.length). */
			const selectedBlock = blocks[this.selectedIndex] ?? [];
			const hiddenBefore = start;
			const hiddenAfter = blocks.length - end;
			const pageSize = budget - selectedMarkers - 1;
			const maxOffset = Math.max(0, selectedBlock.length - pageSize);
			const offset = Math.min(this.selectedBlockPage.offset, maxOffset);
			this.selectedBlockPage = {
				offset,
				size: pageSize,
				maxOffset
			};
			const keptLines = selectedBlock.slice(offset, offset + pageSize);
			const first = offset + 1;
			const last = offset + keptLines.length;
			const overflow = this.pagerStatus(first, last, selectedBlock.length, innerWidth);
			return {
				visibleBlocks: [[...keptLines, overflow]],
				hiddenBefore,
				hiddenAfter
			};
		}
		this.selectedBlockPage = {
			offset: 0,
			size: 1,
			maxOffset: 0
		};
		let expanded = true;
		while (expanded && (start > 0 || end < blocks.length)) {
			expanded = false;
			if (end < blocks.length) {
				/* v8 ignore next -- guarded by `end < blocks.length` above. */
				const next = blocks[end]?.length ?? 0;
				if (fits(start, end + 1, used + next)) {
					used += next;
					end += 1;
					expanded = true;
					continue;
				}
			}
			if (start > 0) {
				/* v8 ignore next -- guarded by `start > 0` above. */
				const previous = blocks[start - 1]?.length ?? 0;
				if (fits(start - 1, end, used + previous)) {
					used += previous;
					start -= 1;
					expanded = true;
				}
			}
		}
		return {
			visibleBlocks: blocks.slice(start, end),
			hiddenBefore: start,
			hiddenAfter: blocks.length - end
		};
	}
};
/**
* Split a `/skill:<name> [instructions]` submission into its name and trailing instructions.
* @param text - trimmed submission that starts with {@link SKILL_COMMAND_PREFIX}.
* @returns the skill name and any trailing instructions.
*/
function parseSkillCommand(text) {
	const rest = text.slice(7);
	const spaceIndex = rest.indexOf(" ");
	if (spaceIndex === -1) return {
		name: rest,
		instructions: ""
	};
	return {
		name: rest.slice(0, spaceIndex),
		instructions: rest.slice(spaceIndex + 1).trim()
	};
}
/** Model-visible line locating a manually invoked skill's relative resources, or `undefined` when the provider has no base. */
function skillResourceReference(base) {
	if (base === void 0) return void 0;
	switch (base.kind) {
		case "directory": return `References in this skill are relative to ${base.path}.`;
		case "url": return `References in this skill are relative to ${base.url}.`;
		case "opaque": return base.description;
		default: return assertNever(base, "SkillResourceBase.kind");
	}
}
/**
* Render a manually invoked skill into the model-visible user-message text. The
* `<skill>` block carries the body and, when the provider supplies one, its
* resource base; the trimmed `instructions` follow the block as the user's
* request for this turn. The name is registry-validated kebab-case
* (the skill registry rejects any other) and the resource base is trusted
* same-process provider prose, so — unlike the model-facing `dsh-tool-skill`
* result, which escapes for a tool channel — this user turn is assembled raw.
* @param skill - the loaded skill definition.
* @param instructions - trimmed text typed after `/skill:<name>`; empty when absent.
* @returns the user-message text delivered to the agent.
*/
function renderSkillInvocation(skill, instructions) {
	const lines = [`<skill name="${skill.name}">`];
	const reference = skillResourceReference(skill.resourceBase);
	if (reference !== void 0) lines.push(reference, "");
	lines.push(skill.content, "</skill>");
	const block = lines.join("\n");
	return instructions === "" ? block : `${block}\n\n${instructions}`;
}
//#endregion
//#region lib/types/chat/autocomplete.js
/**
* Editor autocomplete provider merging path-only file candidates and optional
* session-reference snapshots with the base slash-command completions.
* @module dsh-tui/chat/autocomplete
*/
/** Merge path-only file candidates and optional session snapshots with commands. */
var ReferenceAutocompleteProvider = class {
	base;
	files;
	sessions;
	agent;
	constructor(base, files, sessions, agent) {
		this.base = base;
		this.files = files;
		this.sessions = sessions;
		this.agent = agent;
	}
	async getSuggestions(lines, cursorLine, cursorCol, options) {
		const basePromise = this.base.getSuggestions(lines, cursorLine, cursorCol, options);
		const currentLine = lines[cursorLine];
		/* v8 ignore next -- Editor always supplies its current state line. */
		if (currentLine === void 0) return basePromise;
		const token = activeAtToken(currentLine, cursorCol);
		if (token === void 0) {
			this.files.invalidate();
			return basePromise;
		}
		const filePromise = this.files.list(token.query, options.signal).catch(() => []);
		const sessionPromise = this.sessions === void 0 || token.quoted ? Promise.resolve([]) : this.sessions.listCandidates(this.agent, token.query, void 0, options.signal).catch(() => []);
		const [base, fileCandidates, sessionCandidates] = await Promise.all([
			basePromise,
			filePromise,
			sessionPromise
		]);
		if (options.signal.aborted) return base;
		const fileItems = fileCandidates.flatMap((candidate) => {
			const value = formatFileMention(candidate, token.quoted);
			if (value === void 0) return [];
			const name = candidate.path.slice(candidate.path.lastIndexOf("/") + 1);
			const directory = candidate.kind === "directory";
			return [{
				value,
				label: `${directory ? "Folder" : "File"} · ${displayInlineText(name)}${directory ? "/" : ""}`,
				description: displayInlineText(candidate.path)
			}];
		});
		const sessionItems = sessionCandidates.map((candidate) => {
			const mentionLabel = displayInlineText(candidate.label);
			const sessionId = displayInlineText(candidate.sessionId);
			const location = candidate.cwd === void 0 ? "(no cwd)" : displayInlineText(candidate.cwd);
			const description = `${candidate.label === candidate.sessionId ? "" : `${sessionId} · `}${location} · ${new Date(candidate.createdAt).toISOString()}`;
			return {
				value: formatSessionReferenceMention({
					sessionId: candidate.sessionId,
					label: mentionLabel
				}),
				label: `Session · ${mentionLabel}`,
				description
			};
		});
		const items = [...fileItems, ...sessionItems];
		if (items.length === 0) return base;
		return {
			items: [...items, ...base?.items ?? []],
			prefix: token.prefix
		};
	}
	applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
		return this.base.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
	}
	shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
		return this.base.shouldTriggerFileCompletion(lines, cursorLine, cursorCol);
	}
};
//#endregion
//#region lib/types/chat/helpers.js
/**
* Zero-state helpers for the interactive chat channel: prompt-directory and
* Git-branch formatting, transcript/tool-call derivations over the session log,
* session-reference context cards, the placeholder editor, and banner-reveal
* timing constants. None of these close over channel state.
* @module dsh-tui/chat/helpers
*/
/** Editor that shows a placeholder without making it editable content. */
var HintEditor = class extends Editor {
	/** Placeholder shown in the empty input row; `undefined` hides it. */
	hint;
	/** Prompt text rendered before the placeholder, matching the live prompt width. */
	hintPrefix = "";
	/**
	* Update the rendered input prompt after a prompt-template value changed.
	* @param prompt - first-line prefix and continuation filler for wrapped lines.
	*/
	setPrompt(prompt) {
		this.hintPrefix = prompt.first;
	}
	render(width) {
		const lines = super.render(width);
		if (this.hint === void 0 || this.getText() !== "") return lines;
		/* v8 ignore next -- Editor always renders one content row. */
		if (lines[0] === void 0) return lines;
		const padding = " ".repeat(this.getPaddingX());
		/* v8 ignore next -- the mounted editor is focused whenever its empty-input hint is rendered. */
		const marker = this.focused ? CURSOR_MARKER : "";
		const available = Math.max(0, width - visibleWidth(padding) - visibleWidth(this.hintPrefix));
		const placeholder = truncateToWidth(this.hint, available, "");
		const used = visibleWidth(padding) + visibleWidth(this.hintPrefix) + visibleWidth(placeholder);
		lines[0] = `${padding}${this.hintPrefix}${marker}${placeholder}${" ".repeat(Math.max(0, width - used))}`;
		return lines;
	}
};
/**
* Format the session working directory as a prompt label: `~` for home,
* `~/rel` for a home-relative path, the raw path otherwise.
* @param cwd - operational working directory from the session header.
* @returns unescaped prompt label.
*/
function formatCwd(cwd) {
	if (cwd === void 0) return "cwd unset";
	const home = homedir();
	const rel = relative(resolve(home), resolve(cwd));
	if (rel === "") return "~";
	/* v8 ignore next -- Windows cross-drive coverage; POSIX relative() cannot return an absolute path. */
	if (isAbsolute(rel)) return cwd;
	if (rel !== ".." && !rel.startsWith(`..${sep}`)) return `~${sep}${rel}`;
	return cwd;
}
/**
* Resolve the current Git branch for the prompt context line.
* @param cwd - operational working directory to query.
* @returns branch name, or `undefined` outside a worktree or on any failure.
*/
function gitBranch(cwd) {
	try {
		const branch = execFileSync("git", ["branch", "--show-current"], {
			cwd,
			encoding: "utf8",
			env: scrubbedParentEnv(),
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 1e3
		}).trim();
		/* v8 ignore next -- detached-HEAD behavior is exercised by the runtime smoke, not the unit checkout. */
		return branch === "" ? void 0 : branch;
	} catch (_gitUnavailableOrOutsideWorktree) {
		return;
	}
}
/**
* Tool-call ids whose owning assistant message is append-origin, so its tool
* cards stay paired in the transcript after a replacement shadowed the message
* on the model surface.
* @param session - session whose events to scan.
* @returns the set of transcript tool-call ids.
*/
function transcriptToolCallIds(session) {
	const ids = /* @__PURE__ */ new Set();
	for (const event of session.snapshotEvents()) {
		if (event.type !== "assistant/message" || !isAppendSurfaceEvent(event)) continue;
		const content = deriveEventMessage(event)?.content;
		if (content === void 0) continue;
		for (const block of content) if (block.type === "tool-call") ids.add(block.id);
	}
	return ids;
}
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
function isCompactCheckpoint(event) {
	return event.type === "user/message" && isCompactCheckpointSource(event.data.source) && isReplacementSurfaceEvent(event);
}
/**
* Read a session-reference context card's display labels from an event source.
* @param source - event source to inspect.
* @returns per-reference labels, or `undefined` when the source is not a reference card.
*/
function sessionReferenceCard(source) {
	if (typeof source !== "object" || source === null) return void 0;
	const record = source;
	if (record["kind"] !== "session-reference" || !Array.isArray(record["references"])) return void 0;
	const references = record["references"];
	const labels = [];
	for (const reference of references) {
		if (typeof reference !== "object" || reference === null) return void 0;
		const entry = reference;
		const sessionId = entry["sessionId"];
		const label = entry["label"];
		if (typeof sessionId !== "string" || typeof label !== "string") return void 0;
		labels.push(label === sessionId ? sessionId : `${label} (${sessionId})`);
	}
	return labels;
}
//#endregion
//#region lib/types/chat/model-command.js
/**
* Model-selection sub-controller for the interactive chat channel: the queued
* `/model` command, the keyboard model selector overlay with reasoning-effort
* selection, and resolution of the selected model's context window. Owns the
* context-window cache the prompt and status views read; the caller owns the
* shared {@link ModelSelectionRef}.
* @module dsh-tui/chat/model-command
*/
/**
* Build the model-selection controller for one chat channel.
* @param deps - channel collaborators and shared target handle.
* @returns the controller wired to the channel's overlay and prompt views.
*/
function createModelController(deps) {
	const { ctx, resolved, palette, overlayManager, target } = deps;
	let contextWindow;
	let contextResolution;
	let modelOverlay;
	let modelCommands = Promise.resolve();
	let awaitingAdapter = false;
	const resolveContextWindow = (selected) => {
		contextWindow = void 0;
		awaitingAdapter = false;
		const resolution = selected === void 0 ? Promise.resolve({
			kind: "resolved",
			contextWindow: void 0
		}) : ctx.llm.resolveModelInfo(selected.provider, selected.model).then((info) => ({
			kind: "resolved",
			contextWindow: info.context?.contextWindow
		}), (error) => ({
			kind: "error",
			error
		}));
		contextResolution = resolution;
		resolution.then((result) => {
			if (contextResolution !== resolution) return;
			if (result.kind === "error") {
				if (selected !== void 0 && result.error instanceof LlmError && result.error.code === "NO_ADAPTER") {
					awaitingAdapter = true;
					return;
				}
				deps.appendNotice(`Could not resolve model context: ${errorChain(result.error)}`, "error");
				return;
			}
			contextWindow = result.contextWindow;
			deps.requestRender();
		});
	};
	const disposeAdapterListener = ctx.on("llm/adapters-updated", () => {
		if (deps.isDisposed() || !awaitingAdapter) return;
		resolveContextWindow(target.current);
	});
	resolveContextWindow(target.current);
	const selectModel = (selected, explicitReasoning) => {
		const sameRoute = target.current?.provider === selected.provider && target.current.model === selected.model;
		const reasoningEffort = explicitReasoning === void 0 ? sameRoute ? target.current?.reasoningEffort ?? selected.reasoning?.defaultEffort : selected.reasoning?.defaultEffort : explicitReasoning.effort;
		if (sameRoute && target.current?.reasoningEffort === reasoningEffort) {
			const reasoning = targetReasoningLabel(selected, reasoningEffort);
			deps.appendNotice(`Model is already ${targetLabel(selected)}${reasoning === void 0 ? "" : ` with reasoning effort ${displayText(reasoning)}`}.`);
			return;
		}
		target.current = {
			provider: selected.provider,
			model: selected.model,
			...reasoningEffort === void 0 ? {} : { reasoningEffort }
		};
		resolveContextWindow(target.current);
		const reasoning = targetReasoningLabel(selected, reasoningEffort);
		deps.appendNotice([
			`Model selected: ${targetLabel(selected)}.`,
			...reasoning === void 0 ? [] : [`Reasoning effort: ${displayText(reasoning)}.`],
			"New steps will use it."
		].join(" "));
	};
	const showModelSelector = (choices) => {
		const current = target.current === void 0 ? "unset" : targetLabel(target.current);
		if (choices.length === 0) {
			deps.appendNotice(`Current model: ${current}\nNo models are advertised by registered providers.`, "warning");
			return;
		}
		modelOverlay?.close();
		const session = overlayManager.open({
			create: () => new ModelDialog(choices, target.current, resolved.maxModelOptions, palette, (selection) => {
				session.close();
				selectModel(selection.choice, { effort: selection.reasoningEffort });
			}, () => {
				session.close();
			}),
			options: {
				width: resolved.modelDialogWidth,
				maxHeight: resolved.modelDialogMaxHeight,
				anchor: "center",
				margin: 1
			}
		});
		modelOverlay = session;
		session.closed.then(() => {
			if (modelOverlay === session) modelOverlay = void 0;
		});
		deps.requestRender();
	};
	const handleModelCommand = async (raw) => {
		const choices = await readModelChoices(ctx, target.current);
		if (deps.isDisposed()) return;
		const argument = raw.trim();
		if (argument === "") {
			showModelSelector(choices);
			return;
		}
		const parts = argument.split(/\s+/u);
		if (parts.length > 2) {
			deps.appendNotice("Usage: /model [provider/]model", "warning");
			return;
		}
		let matches;
		if (parts.length === 2) matches = choices.filter((choice) => choice.provider === parts[0] && choice.model === parts[1]);
		else {
			const value = argument;
			const qualified = choices.filter((choice) => targetLabel(choice) === value);
			matches = qualified.length > 0 ? qualified : choices.filter((choice) => choice.model === value);
		}
		if (matches.length === 0) {
			deps.appendNotice(`Unknown model: ${argument}. Run /model to list available models.`, "warning");
			return;
		}
		if (matches.length > 1) {
			deps.appendNotice(`Model "${argument}" is advertised by multiple providers; use /model <provider>/<model>.`, "warning");
			return;
		}
		const selected = matches[0];
		/* v8 ignore next -- a non-empty matches array always has index zero. */
		if (selected === void 0) return;
		selectModel(selected);
	};
	return {
		contextWindow: () => contextWindow,
		queueModelCommand(raw) {
			modelCommands = modelCommands.then(async () => {
				await handleModelCommand(raw);
			}).catch((error) => {
				if (!deps.isDisposed()) deps.appendNotice(`Could not read the model catalog: ${errorChain(error)}`, "error");
			});
		},
		resetContextResolution() {
			contextResolution = void 0;
		},
		clearOverlay() {
			modelOverlay = void 0;
		},
		detach() {
			disposeAdapterListener();
		}
	};
}
//#endregion
//#region lib/types/chat/questions.js
/**
* Ask-user-question sub-machine for the interactive chat channel. Registers the
* user-interaction provider, presents one question overlay at a time in FIFO
* order, and settles each request on answer, abort, overlay error, or channel
* shutdown.
* @module dsh-tui/chat/questions
*/
/**
* Build the ask-user-question queue for one chat channel.
* @param deps - channel collaborators and overlay host.
* @returns the controller used at shutdown to drain and unregister.
*/
function createQuestionQueue(deps) {
	const { ctx, resolved, palette, overlayManager } = deps;
	const questionQueue = [];
	let activeQuestion;
	const removeAbortListener = (pending) => {
		pending.request.signal?.removeEventListener("abort", pending.onAbort);
	};
	const rejectQuestion = (pending) => {
		pending.overlay?.close();
		pending.overlay = void 0;
		removeAbortListener(pending);
		pending.reject(new UserQuestionError("ask_user_question was interrupted before the user answered", "ASK_ABORTED"));
	};
	const startNextQuestion = () => {
		if (activeQuestion !== void 0 || deps.isDisposed()) return;
		const pending = questionQueue.shift();
		if (pending === void 0) return;
		activeQuestion = pending;
		const show = () => {
			const question = pending.request.questions[pending.index];
			if (question === void 0) {
				activeQuestion = void 0;
				removeAbortListener(pending);
				pending.resolve({ answers: pending.answers });
				startNextQuestion();
				return;
			}
			const session = overlayManager.open({
				...pending.request.signal === void 0 ? {} : { signal: pending.request.signal },
				create: () => new QuestionDialog(question, pending.index + 1, pending.request.questions.length, pending.request.questions.length - pending.answers.length, resolved.maxQuestionOptions, () => deps.questionMaxHeight(), palette, (selection) => {
					pending.overlay = void 0;
					session.close();
					pending.answers.push({
						id: question.id,
						...selection
					});
					pending.index += 1;
					show();
				}, () => {
					activeQuestion = void 0;
					rejectQuestion(pending);
					startNextQuestion();
				}),
				options: {
					width: resolved.questionDialogWidth,
					maxHeight: resolved.questionDialogMaxHeight
				}
			}, "inline");
			pending.overlay = session;
			session.closed.then((result) => {
				if (pending.overlay !== session) return;
				pending.overlay = void 0;
				/* v8 ignore next 2 -- close, abort, and shutdown settle the owner before this callback */
				if (result.reason !== "error") return;
				activeQuestion = void 0;
				removeAbortListener(pending);
				pending.reject(new UserQuestionError(`ask_user_question TUI failed: ${errorChain(result.error)}`, "ASK_ABORTED"));
				startNextQuestion();
			});
			deps.requestRender();
		};
		show();
	};
	return {
		rejectAll() {
			if (activeQuestion !== void 0) {
				const pending = activeQuestion;
				activeQuestion = void 0;
				rejectQuestion(pending);
			}
			for (const pending of questionQueue.splice(0)) rejectQuestion(pending);
		},
		unregister: ctx.on("user-questions/request", (request, next) => {
			if (deps.isDisposed()) return next();
			return new Promise((resolveAnswer, reject) => {
				const pending = {
					request,
					index: 0,
					answers: [],
					resolve: resolveAnswer,
					reject,
					overlay: void 0,
					onAbort: () => {
						if (activeQuestion === pending) {
							activeQuestion = void 0;
							rejectQuestion(pending);
							startNextQuestion();
							return;
						}
						questionQueue.splice(questionQueue.indexOf(pending), 1);
						rejectQuestion(pending);
					}
				};
				request.signal?.addEventListener("abort", pending.onAbort, { once: true });
				questionQueue.push(pending);
				startNextQuestion();
			});
		})
	};
}
//#endregion
//#region lib/types/chat/resume.js
/**
* Session-resume sub-controller for the interactive chat channel: the
* `/resume` selector, one metadata-plus-title scan that tolerates a corrupt
* neighbor, the pre-handoff preflight, and the terminal handoff itself.
* @module dsh-tui/chat/resume
*/
/**
* Build the session-resume controller for one chat channel.
* @param deps - channel collaborators, terminal handles, and optional services.
* @returns the controller wired to the `/resume` command.
*/
function createResumeController(deps) {
	const { ctx, agent, runtime, resolved, palette, overlayManager, sessionQuery, ui, editor } = deps;
	let resumeOverlay;
	let resumeInFlight = false;
	let resumeScan = 0;
	/** Label any session's own workspace the way the prompt labels the current one. */
	const workspaceLabel = (cwd) => runtime.formatCwd?.(cwd) ?? formatCwd(cwd);
	/** Summarize one record from metadata and its batch-folded title. */
	const summarize = (record, title, lastActivityAt) => summarizeResumeCandidate(record, title, lastActivityAt, agent.session.id, agent.session.header.cwd, workspaceLabel);
	/** The disabled fallback row for a session whose title read failed. */
	const unreadableCandidate = (record, lastActivityAt, error) => ({
		record,
		title: "Unreadable session",
		lastActivityAt: lastActivityAt ?? record.header.createdAt,
		currentWorkspace: record.header.cwd === agent.session.header.cwd,
		workspaceLabel: workspaceLabel(record.header.cwd),
		disabledReason: `session cannot be loaded: ${errorChain(error)}`
	});
	/**
	* Metadata-only activity time: a live session's last in-memory event time,
	* otherwise the persisted artifact's mtime. Never reads a log, so browsing
	* cost stays independent of log size; any append (including bookkeeping)
	* moves it.
	*/
	const lastActivityAt = async (record) => {
		const live = ctx.sessions.get(record.header.id);
		if (live !== void 0) return live.snapshotEvents().at(-1)?.time;
		const location = ctx.get("sessionPersistence")?.locate(record.header);
		if (location === void 0) return void 0;
		try {
			return (await stat(location.path)).mtimeMs;
		} catch {
			return;
		}
	};
	/**
	* One listed row's title: live sessions answer from the projections snapshot.
	* Persisted rows defer to the query-engine batch (alpha.4's projection-cache
	* identity needs the durable fork-lineage cut, which a listed record does not
	* carry, and `coldSnapshot(meta, events)` expects the caller to own the full
	* log) — see {@link resolveTitles}.
	*/
	const projectedTitle = async (record) => {
		const live = ctx.sessions.get(record.header.id);
		if (live !== void 0) return ctx.get("sessionProjections")?.snapshot(live).values.title;
	};
	/**
	* Resolve every row's title: live sessions from the projections snapshot,
	* persisted rows from one bounded query-engine batch (bounded by
	* `resumeScanConcurrency` for the live probes; the batch reads logs itself).
	*/
	const resolveTitles = async (listQuery, records, signal) => {
		const resolutions = new Array(records.length);
		const missing = [];
		let cursor = 0;
		const worker = async () => {
			for (;;) {
				const index = cursor;
				if (index >= records.length) return;
				cursor += 1;
				const record = records[index];
				try {
					const value = await projectedTitle(record);
					if (value === void 0 && ctx.sessions.get(record.header.id) === void 0) {
						missing.push({
							index,
							id: record.header.id
						});
						continue;
					}
					resolutions[index] = typeof value === "string" ? { title: value } : {};
				} catch (failure) {
					resolutions[index] = { failure };
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(resolved.resumeScanConcurrency, records.length) }, () => worker()));
		if (missing.length > 0) {
			const results = await listQuery.readTitleSnapshots(missing.map((entry) => entry.id), signal);
			for (let resultIndex = 0; resultIndex < missing.length; resultIndex++) {
				const entry = missing[resultIndex];
				const result = results[resultIndex];
				/* v8 ignore next 2 -- readTitleSnapshots returns one result per unique listed id in input order */
				if (result === void 0 || result.sessionId !== entry.id) throw new Error(`resume scan misaligned at "${entry.id}"`);
				if (result.status === "rejected") resolutions[entry.index] = { failure: result.reason };
				else {
					const title = result.value.title?.title;
					resolutions[entry.index] = title === void 0 ? {} : { title };
				}
			}
		}
		return resolutions;
	};
	/** The latest logged provider/model route, for the preflight availability check. */
	const resumeRoute = (events) => {
		const header = events.findLast((item) => item.type === "request/header");
		if (header?.type === "request/header") return {
			provider: header.data.header.config.provider,
			model: header.data.header.config.model
		};
		const assistant = events.findLast((item) => item.type === "assistant/message");
		return assistant?.type === "assistant/message" ? {
			provider: assistant.data.message.source.provider,
			model: assistant.data.message.source.model
		} : void 0;
	};
	/**
	* Re-read every mutable precondition immediately before terminal handoff and
	* resolve the exact identity and workspace the host will re-exec into. This
	* is where the one chosen log is fully read, replay-validated, and checked
	* for a currently-available route — the listing never does any of that.
	*/
	const preflightResume = async (sessionId) => {
		const query = sessionQuery();
		/* v8 ignore start -- showResume alone calls this after proving the optional service exists */
		if (query === void 0) throw new Error("Resume is unavailable: session query is not mounted.");
		/* v8 ignore stop */
		const initialStatus = deps.agentStatus();
		if (initialStatus !== "idle") throw new Error(`Resume requires an idle agent (status: ${initialStatus}).`);
		const record = (await query.listSessions()).find((candidate) => candidate.header.id === sessionId);
		if (record === void 0) throw new Error(`Session "${sessionId}" is no longer available.`);
		const candidate = summarize(record, void 0, void 0);
		if (candidate.disabledReason !== void 0) throw new Error(candidate.disabledReason);
		let events;
		try {
			events = (await query.readSession(record.header.id)).events;
		} catch (error) {
			throw new Error(`session cannot be loaded: ${errorChain(error)}`);
		}
		const route = resumeRoute(events);
		if (route !== void 0 && !ctx.llm.listProviders().some((provider) => provider.id === route.provider)) throw new Error(`session is complete, but route is currently unavailable (${route.provider}/${route.model})`);
		const cwd = record.header.cwd;
		/* v8 ignore next -- summarizeResumeCandidate disables a cwd-less record, so the check above already rejected it */
		if (cwd === void 0) throw new Error(`Session "${sessionId}" has no recorded workspace to resume in.`);
		const finalStatus = deps.agentStatus();
		if (finalStatus !== "idle") throw new Error(`Resume requires an idle agent (status: ${finalStatus}).`);
		return {
			id: record.header.id,
			cwd
		};
	};
	const handoffResume = async (candidate, overlay) => {
		if (resumeInFlight) return;
		resumeInFlight = true;
		let terminalReleased = false;
		try {
			const checked = await preflightResume(candidate.record.header.id);
			const hostHandoff = runtime.handoffResume;
			if (hostHandoff === void 0) {
				await overlay.close();
				resumeOverlay = void 0;
				deps.appendNotice("Session is resumable, but this host cannot hand it off in place.", "warning");
				return;
			}
			/* v8 ignore next -- shutdown during preflight invalidates an awaited service read or reaches this guard */
			if (deps.isDisposed()) return;
			await ctx.sessions.flush(agent.session);
			if (deps.isDisposed()) return;
			if (agent.status !== "idle") throw new Error(`Resume requires an idle agent (status: ${agent.status}).`);
			await overlay.close();
			resumeOverlay = void 0;
			await runtime.terminal.drainInput(100, 20);
			if (deps.isDisposed()) return;
			ui.stop();
			terminalReleased = true;
			await hostHandoff(checked.id, checked.cwd);
			throw new Error("resume host returned without replacing the process");
		} catch (error) {
			if (!deps.isDisposed()) {
				if (terminalReleased) {
					ui.start();
					ui.setFocus(editor);
					deps.appendNotice(`Resume handoff failed: ${errorChain(error)}`, "error");
				} else {
					await overlay.close();
					resumeOverlay = void 0;
					deps.appendNotice(`Resume failed: ${errorChain(error)}`, "error");
				}
			}
		} finally {
			resumeInFlight = false;
		}
	};
	return { showResume() {
		if (agent.status !== "idle") {
			deps.appendNotice("Resume requires the current turn to finish or be cancelled first.", "warning");
			return;
		}
		const listQuery = sessionQuery();
		if (listQuery === void 0) {
			deps.appendNotice("Resume is not available: session query is not mounted.", "warning");
			return;
		}
		const scan = ++resumeScan;
		resumeOverlay?.close();
		let picker;
		let scanned;
		const session = overlayManager.open({
			create: (host) => {
				picker = new ResumePicker(scanned, resolved.maxResumeOptions, workspaceLabel(agent.session.header.cwd), () => host.viewport.rows, palette, (candidate) => {
					handoffResume(candidate, session);
				}, () => {
					session.close();
				});
				return picker;
			},
			options: {
				width: "100%",
				maxHeight: "100%",
				anchor: "top-left",
				margin: 0
			}
		});
		resumeOverlay = session;
		const scanAbort = new AbortController();
		session.closed.then(() => {
			scanAbort.abort();
			/* v8 ignore next -- overlay FIFO closes this session before a replacement can become the tracked resume overlay */
			if (resumeOverlay === session) resumeOverlay = void 0;
		});
		deps.requestRender();
		/** Whether this scan's overlay, session generation, or TUI is gone. */
		const scanStale = () => deps.isDisposed() || scan !== resumeScan || scanAbort.signal.aborted;
		const scanCandidates = async () => {
			const records = await listQuery.listSessions(scanAbort.signal);
			if (scanStale()) return;
			const [titles, activity] = await Promise.all([resolveTitles(listQuery, records, scanAbort.signal), Promise.all(records.map((record) => lastActivityAt(record)))]);
			const candidates = records.map((record, index) => {
				const resolution = titles[index];
				return "failure" in resolution ? unreadableCandidate(record, activity[index], resolution.failure) : summarize(record, resolution.title, activity[index]);
			});
			candidates.sort((a, b) => b.lastActivityAt - a.lastActivityAt || a.record.header.id.localeCompare(b.record.header.id));
			if (scanStale()) return;
			scanned = candidates;
			picker?.setCandidates(candidates);
			deps.requestRender();
		};
		scanCandidates().catch((error) => {
			if (scanStale()) return;
			session.close();
			deps.appendNotice(`Resume session scan failed: ${errorChain(error)}`, "error");
		});
	} };
}
//#endregion
//#region lib/types/index.js
/**
* Interactive pi-tui front door for DeepSeek Harness agents. It renders the
* durable session transcript, drives one configured agent, and provides
* keyboard-driven user-interaction dialogs without owning agent lifecycle.
* @module dsh-tui
*/
/** First terminal Cordis state: FAILED, DISPOSED, and UNLOADING are unusable. */
const FIBER_FAILED = 3;
/** Latest activity timestamp across a session's logged events. */
function lastSessionActivityTime(events) {
	let latest;
	for (const event of events) if (latest === void 0 || event.time > latest) latest = event.time;
	return latest;
}
/**
* Context key a launcher sets before any Loader entry mounts
* (`ctx.provide(MAIN_SESSION_ID_KEY, identity)`) to fix the `main` agent's
* session identity, so an app bundle mounted from a `cordis.yml` binds a
* launcher-selected session without a config key. `ctx.provide` is the only
* channel from launcher argv into a Loader-mounted plugin, because config
* `!!js` expressions evaluate against the entry's context. Absent leaves the
* choice to the app.
*/
const MAIN_SESSION_ID_KEY = "mainSessionId";
/**
* Context key a launcher sets before any Loader entry mounts
* (`ctx.provide(TUI_GOODBYE_MESSAGE_KEY, line)`) to supply the line the TUI
* prints once the terminal is released on exit — for the shipped CLI, the
* command that resumes this session. The launcher owns the wording because only
* it knows how it was invoked; the TUI escapes terminal controls before
* rendering. Absent prints nothing.
*/
const TUI_GOODBYE_MESSAGE_KEY = "tuiGoodbyeMessage";
/**
* Context key a launcher sets before any Loader entry mounts
* (`ctx.provide(INITIAL_SKILL_KEY, name)`) to seed a fresh session's first user
* turn with `/skill:<name>` — the `dsh migrate`/`dsh upgrade`
* guided-session entry. The launcher sets it only when minting a fresh session,
* so it never re-fires on a resumed one. Absent leaves the first turn to the user.
*/
const INITIAL_SKILL_KEY = "tuiInitialSkill";
/**
* Optional terminal-local interaction service provided by one mounted TUI.
*
* The concrete provider retains pi-tui, focus, and terminal lifecycle state.
* Plugins receive only effect-owned overlay sessions.
*/
var TuiExtensionService = class extends Service {};
const name = "ui-tui";
const inject = [
	"agents",
	"sessions",
	"commands",
	"userQuestions",
	"tools",
	"llm",
	"systemPrompt",
	"tokenMeter",
	"tuiPrompt"
];
/** Model guidance for path-only file references selected through the TUI. */
const FILE_REFERENCE_PROMPT = "Paths prefixed with @ are files explicitly referenced by the user. Use the read tool when their contents are needed; do not claim to have inspected a file before reading it.";
/**
* Transcript row standing in for one compacted range. The conversation the
* compaction replaced stays rendered above it: the marker reports where the
* model stopped seeing that history, not that the history is gone.
*/
const COMPACTION_MARKER = "… earlier context was compacted …";
/** Width/height adapter for a modal component rendered inside the base TUI flow. */
var InlineModalComponent = class extends Container {
	width;
	maxHeight;
	constructor(component, width, maxHeight) {
		super();
		this.width = width;
		this.maxHeight = maxHeight;
		this.addChild(component);
	}
	render(width) {
		return super.render(Math.max(1, Math.min(width, this.width))).slice(0, Math.max(1, this.maxHeight));
	}
};
/**
* Start the interactive pi-tui channel for an already-created target agent.
* @param ctx - agent, tools, session-event, and user-interaction context.
* @param config - target agent, banner, and TUI presentation config.
* @param runtime - terminal and process-exit boundary.
* @returns lifecycle controller used by the Cordis effect disposer.
*/
function createTuiChat(ctx, config, runtime) {
	const sessionId = SessionId(config.sessionId ?? "main");
	const agent = ctx.agents.get(sessionId);
	if (agent === void 0) throw new Error(`ui-tui: session "${sessionId}" is not running`);
	const resolved = resolveTuiConfig(config);
	const palette = resolved.theme.color && resolved.theme.vscode ? createVscodePalette(true) : createPalette(resolved.theme.color);
	const mdTheme = markdownTheme(palette);
	const ui = new TUI(runtime.terminal, resolved.showHardwareCursor);
	const chat = new Container();
	const todoContainer = new Container();
	const questionContainer = new Container();
	const inputTemplate = parseTuiPromptTemplate(displayInlineText(resolved.theme.inputPrompt));
	const renderInputPrompt = () => renderTuiPromptTemplate(inputTemplate, (valueName) => ctx.tuiPrompt.get(valueName));
	const initialInputPrompt = renderInputPrompt();
	const editor = new HintEditor(ui, {
		borderColor: palette.dim,
		selectList: selectTheme(palette)
	}, { paddingX: 1 });
	editor.hintPrefix = initialInputPrompt;
	const todo = new TodoComponent(palette);
	const compactionStatusLine = new Text("", 0, 0);
	let showReasoning = resolved.showReasoning;
	let toolsVisibility = "collapsed";
	let streaming;
	let completedStreaming;
	const stepTimingTracker = new StepTimingTracker();
	const assistantSteps = /* @__PURE__ */ new Map();
	let runningStatus;
	let fadingStatus;
	/**
	* Live standalone compaction observed by this process. Never derive this
	* state from history: a resumed log may contain a stale orphaned start.
	*/
	let compacting;
	const pendingSteering = /* @__PURE__ */ new Set();
	let disposed = false;
	let shuttingDown;
	const skills = ctx.get("skills");
	const cwd = agent.session.header.cwd ?? process.cwd();
	const fileSearch = new WorkspaceFileSearch(cwd, {
		maxResults: resolved.fileSearchMaxResults,
		maxEntries: resolved.fileSearchMaxEntries,
		excludedDirectories: resolved.fileSearchExcludedDirectories
	});
	const skillAbort = new AbortController();
	const tokens = sessionTokens(agent.session);
	const toolCards = /* @__PURE__ */ new Map();
	const allToolCards = /* @__PURE__ */ new Set();
	const contextCards = /* @__PURE__ */ new Set();
	const liveErrors = /* @__PURE__ */ new Set();
	const commandControllers = /* @__PURE__ */ new Set();
	const referenceControllers = /* @__PURE__ */ new Set();
	let tuiServiceFiber;
	const target = {
		current: initialTarget(agent),
		assembled: void 0
	};
	let modelController;
	const now = () => runtime.now?.() ?? Date.now();
	const agentStatus = () => agent.status;
	const isDisposed = () => disposed;
	let sessionTitle = foldSessionTitle(agent.session.snapshotEvents())?.title;
	const header = new HeaderComponent(agent, () => sessionTitle ?? config.welcome, palette);
	const formattedCwd = displayText(runtime.formatCwd?.(agent.session.header.cwd) ?? formatCwd(agent.session.header.cwd));
	const branch = runtime.gitBranch?.(cwd) ?? gitBranch(cwd);
	const promptValues = [
		ctx.tuiPrompt.register("cwd", palette.bold(palette.accent(formattedCwd))),
		ctx.tuiPrompt.register("git/worktree", branch === void 0 ? void 0 : palette.dim(` (${displayText(branch)})`)),
		ctx.tuiPrompt.register("token_meter/cache_hit_rate"),
		ctx.tuiPrompt.register("model"),
		ctx.tuiPrompt.register("context"),
		ctx.tuiPrompt.register("queued"),
		ctx.tuiPrompt.register("symbol", palette.bold(palette.accent("dsh"))),
		ctx.tuiPrompt.register("indicator", palette.dim("> "))
	];
	const [cwdValue, gitValue, tokenValue, modelValue, contextValue, queuedValue, symbolValue, indicatorValue] = promptValues;
	/* v8 ignore next -- the fixed built-in registration list always supplies each handle. */
	if (cwdValue === void 0 || gitValue === void 0 || tokenValue === void 0 || modelValue === void 0 || contextValue === void 0 || queuedValue === void 0 || symbolValue === void 0 || indicatorValue === void 0) throw new Error("TUI prompt built-ins failed to initialize");
	const updatePromptValues = () => {
		const renderTime = now();
		cwdValue.set(palette.bold(palette.accent(formattedCwd)));
		gitValue.set(branch === void 0 ? void 0 : palette.dim(` (${displayText(branch)})`));
		const rate = cacheHitRate(tokens);
		const usage = `↑${formatTokens(tokens.input)} ↓${formatTokens(tokens.output)}`;
		modelValue.set(`  ${palette.dim(displayText(target.current === void 0 ? "model unset" : compactTargetLabel(target.current)))}`);
		tokenValue.set(`  ${palette.dim(rate === void 0 ? usage : `${usage}  cache ${rate}%`)}`);
		const contextWindow = modelController.contextWindow();
		contextValue.set(contextWindow === void 0 ? void 0 : `  ${palette.dim(`${Math.min(100, Math.round(ctx.tokenMeter.measure(agent.session).totalTokens / contextWindow * 100))}% context`)}`);
		const queued = runningStatus === void 0 ? void 0 : formatQueuedStatus(pendingSteering.size);
		queuedValue.set(queued === void 0 ? void 0 : palette.dim(queued));
		symbolValue.set(palette.bold(palette.accent("dsh")));
		compactionStatusLine.setText(compacting === void 0 ? "" : palette.dim(`Context being compacted ${formatStatusDuration(renderTime - compacting.startedAt)}`));
		const statusGlyph = runningPhaseGlyph(agent.session.snapshotEvents(), runningStatus !== void 0, compacting !== void 0);
		if (runningStatus !== void 0 && statusGlyph !== void 0) runningStatus.lastGlyph = statusGlyph;
		const activeSince = runningStatus?.startedAt ?? compacting?.startedAt;
		const envelope = activeSince !== void 0 && statusGlyph !== void 0 ? {
			glyph: statusGlyph,
			level: Math.min(1, (renderTime - activeSince) / 300)
		} : fadingStatus !== void 0 ? {
			glyph: fadingStatus.glyph,
			level: Math.max(0, 1 - (renderTime - fadingStatus.endedAt) / 300)
		} : void 0;
		const caret = envelope === void 0 ? palette.dim(">") : fadeGlyph(envelope.glyph, palette, resolved.theme.color, resolved.theme.color && resolved.theme.truecolor, envelope.level * pulseLevel(renderTime), envelope.level >= .5);
		indicatorValue.set(`${caret}${palette.dim(" ")}`);
	};
	const promptContext = new PromptContextComponent(parseTuiPromptTemplate(displayInlineText(resolved.theme.leftPrompt)), parseTuiPromptTemplate(displayInlineText(resolved.theme.rightPrompt)), (valueName) => ctx.tuiPrompt.get(valueName));
	ui.addChild(header);
	ui.addChild(chat);
	ui.addChild(new Spacer(1));
	todoContainer.addChild(todo);
	ui.addChild(todoContainer);
	ui.addChild(compactionStatusLine);
	ui.addChild(promptContext);
	ui.addChild(questionContainer);
	ui.addChild(editor);
	ui.setFocus(editor);
	const updateTerminalTitle = () => {
		runtime.terminal.setTitle(displayText(sessionTitle === void 0 ? resolved.title : `${sessionTitle} — ${resolved.title}`));
	};
	updateTerminalTitle();
	const requestRender = () => {
		if (disposed) return;
		updatePromptValues();
		const inputPrompt = renderInputPrompt();
		editor.setPrompt({
			first: inputPrompt,
			continuation: " ".repeat(visibleWidth(inputPrompt))
		});
		editor.hintPrefix = inputPrompt;
		promptContext.invalidate();
		ui.requestRender();
	};
	const disposePromptChanges = ctx.tuiPrompt.subscribe(requestRender);
	const appendNotice = (message, kind = "info") => {
		const color = kind === "error" ? palette.error : kind === "warning" ? palette.warning : palette.dim;
		chat.addChild(new Spacer(1));
		chat.addChild(new Text(color(displayText(message)), 0, 0));
		requestRender();
	};
	const appendSeparator = () => {
		const width = Math.min(72, runtime.terminal.columns - 2);
		chat.addChild(new Text(palette.dim("─".repeat(Math.max(4, width))), 0, 0));
	};
	const extensionTheme = Object.freeze({
		text: (value) => palette.text(value),
		brand: (value) => resolved.theme.color ? resolved.theme.truecolor ? brandText(value) : palette.brand(value) : value,
		dim: (value) => palette.dim(value),
		accent: (value) => palette.accent(value),
		success: (value) => palette.success(value),
		warning: (value) => palette.warning(value),
		error: (value) => palette.error(value),
		bold: (value) => palette.bold(value)
	});
	const overlayManager = new TuiOverlayManager({
		viewport: () => Object.freeze({
			columns: runtime.terminal.columns,
			rows: runtime.terminal.rows
		}),
		theme: () => extensionTheme,
		display: displayText,
		show: (component, options, placement) => {
			if (placement === "overlay") return ui.showOverlay(component, options === void 0 ? void 0 : {
				...options,
				...typeof options.margin === "object" ? { margin: { ...options.margin } } : {}
			});
			const modal = new InlineModalComponent(component, resolved.questionDialogWidth, resolved.questionDialogMaxHeight);
			questionContainer.clear();
			questionContainer.addChild(modal);
			ui.setFocus(component);
			return { hide() {
				questionContainer.clear();
				ui.setFocus(editor);
			} };
		},
		invalidate: requestRender,
		reportError: (error) => {
			const message = errorChain(error);
			ctx.logger.warn(`ui-tui: overlay failed: ${message}`);
			/* v8 ignore next -- shutdown removes overlays before the terminal stops */
			if (disposed) return;
			appendNotice(`TUI overlay failed: ${message}`, "error");
		}
	});
	const disposeTargetListeners = installModelSelection(agent.ctx, target);
	modelController = createModelController({
		ctx,
		resolved,
		palette,
		overlayManager,
		target,
		appendNotice,
		requestRender,
		isDisposed
	});
	updatePromptValues();
	const renderStatus = () => {
		streaming?.invalidate();
		requestRender();
	};
	/** Stop the turn-phase running and fade-out timers and drop both states. */
	const clearTurnStatus = () => {
		if (runningStatus !== void 0) {
			clearInterval(runningStatus.timer);
			runningStatus = void 0;
		}
		if (fadingStatus !== void 0) {
			clearInterval(fadingStatus.timer);
			fadingStatus = void 0;
		}
		runtime.terminal.setProgress(compacting !== void 0);
	};
	/** Hard clear: drop every indicator, including a live compaction bracket. */
	const clearStatus = () => {
		if (compacting !== void 0) {
			clearInterval(compacting.timer);
			compacting = void 0;
		}
		clearTurnStatus();
	};
	/**
	* Hand the last active glyph to a fade-out that re-renders until it settles
	* on the `>` caret, then stops its own timer. A hard clear (teardown) skips
	* this via {@link clearStatus}.
	*/
	const beginFadeOut = (glyph) => {
		clearTurnStatus();
		const fading = {
			glyph,
			endedAt: now(),
			timer: setInterval(() => {
				if (now() - fading.endedAt >= 300) clearTurnStatus();
				renderStatus();
			}, 50)
		};
		fadingStatus = fading;
	};
	const setStatus = (status) => {
		const priorTurn = runningStatus?.turn;
		const fadeOutGlyph = status !== "running" ? runningStatus?.lastGlyph : void 0;
		if (status === "running") clearTurnStatus();
		else if (fadeOutGlyph !== void 0) beginFadeOut(fadeOutGlyph);
		else clearTurnStatus();
		editor.borderColor = status === "running" ? (text) => palette.accent(text) : (text) => palette.dim(text);
		editor.hint = status === "running" ? palette.dim(displayInlineText(resolved.theme.inputPlaceholder)) : void 0;
		if (status === "running") {
			runningStatus = {
				turn: priorTurn ?? openTurn(agent.session.snapshotEvents()),
				startedAt: now(),
				lastGlyph: TIMING_BUCKET_GLYPHS[openStepPhase(agent.session.snapshotEvents()) ?? "ttft"],
				timer: setInterval(renderStatus, 50)
			};
			runtime.terminal.setProgress(true);
		}
		requestRender();
	};
	const refreshStatus = () => {
		renderStatus();
	};
	const parsedTool = (event) => {
		const parsed = parseArguments(event.data.arguments);
		const card = new ToolCardComponent(event.data.name, parsed, ctx.tools.get(event.data.name, agent), resolved.maxToolOutputLines, resolved.maxDiffEditLength, palette, mdTheme);
		card.setVisibility(toolsVisibility);
		toolCards.set(event.data.callId, card);
		allToolCards.add(card);
		return card;
	};
	/**
	* Re-derive hidden-mode folding for one turn: the first step with a visible
	* body owns the turn's single Assistant header, every other step renders as a
	* headerless continuation (empty ones render nothing). Any other visibility
	* restores the per-step headers.
	*/
	const applyTurnFolding = (turn) => {
		const steps = assistantSteps.get(turn);
		if (steps === void 0) return;
		let headerSeen = false;
		for (const step of steps) if (toolsVisibility !== "hidden") step.setFoldedContinuation(false);
		else if (!headerSeen && step.hasVisibleBody()) {
			headerSeen = true;
			step.setFoldedContinuation(false);
		} else step.setFoldedContinuation(true);
	};
	const registerAssistantStep = (component) => {
		const steps = assistantSteps.get(component.position.turn) ?? [];
		steps.push(component);
		assistantSteps.set(component.position.turn, steps);
		applyTurnFolding(component.position.turn);
	};
	const removeStreaming = (current) => {
		if (current === void 0) return;
		for (const child of [current, current.timing]) {
			const index = chat.children.indexOf(child);
			/* v8 ignore next -- streaming components and their timing footers are retained only while attached to the chat. */
			if (index >= 0) chat.children.splice(index, 1);
		}
		const steps = assistantSteps.get(current.position.turn);
		/* v8 ignore next -- every attached streaming component is registered in the fold map. */
		if (steps === void 0) return;
		const index = steps.indexOf(current);
		/* v8 ignore next -- registration precedes attachment, so the component is present until this removal. */
		if (index < 0) return;
		steps.splice(index, 1);
		applyTurnFolding(current.position.turn);
	};
	/**
	* Move the running step's timing footer to the tail of the chat so it trails
	* the tool cards the step just appended. A completed footer (its step ended,
	* so `streaming` is cleared) stays pinned where it is.
	*/
	const trailStreamingTiming = () => {
		/* v8 ignore next -- every replayed tool event follows its step/start, so an open step always owns an attached footer here. */
		if (streaming === void 0) return;
		const footer = streaming.timing;
		const index = chat.children.indexOf(footer);
		/* v8 ignore next -- the open step's footer is attached to the chat whenever a tool event of that step renders. */
		if (index < 0) return;
		chat.children.splice(index, 1);
		chat.addChild(footer);
	};
	const clearStreaming = () => {
		removeStreaming(streaming);
		streaming = void 0;
	};
	const retractFailedStreaming = () => {
		removeStreaming(streaming ?? completedStreaming);
		streaming = void 0;
		completedStreaming = void 0;
	};
	const startAssistantStep = (position) => {
		streaming = new StreamingAssistantComponent(position, () => agent.session.snapshotEvents(), stepTimingTracker, now, showReasoning, palette, mdTheme);
		registerAssistantStep(streaming);
		appendSeparator();
		chat.addChild(new Spacer(1));
		chat.addChild(streaming);
		chat.addChild(streaming.timing);
	};
	const renderEvent = (event, options) => {
		switch (event.type) {
			case "user/message": {
				const source = event.data.source;
				if (source.kind !== "user") {
					const references = sessionReferenceCard(event.data.source);
					if (references !== void 0) {
						chat.addChild(new Spacer(1));
						chat.addChild(new Text(palette.dim(`Referenced sessions · ${references.map(displayText).join(", ")}`), 0, 0));
						break;
					}
					const text = contentText(event.data.content).trim();
					/* v8 ignore next -- context events with empty content are rejected by their owning producers. */
					if (text) {
						const labelled = source;
						const card = new ContextCardComponent(typeof labelled.plugin === "string" ? labelled.plugin : typeof labelled.kind === "string" ? labelled.kind : "context", text, resolved.maxToolOutputLines, palette);
						card.setExpanded(toolsVisibility === "expanded");
						contextCards.add(card);
						appendSeparator();
						chat.addChild(new Spacer(1));
						chat.addChild(card);
					}
					break;
				}
				const text = displayText(contentText(event.data.content).trim());
				if (text) {
					appendSeparator();
					chat.addChild(new Spacer(1));
					chat.addChild(new UserMessageComponent(text, palette, mdTheme));
					if (options.addHistory) editor.addToHistory(text);
				}
				break;
			}
			case "step/start":
				startAssistantStep(event.data);
				break;
			case "assistant/chunk":
				if (options.renderChunks && streaming !== void 0) {
					streaming.update(event.data.chunk);
					applyTurnFolding(streaming.position.turn);
				}
				break;
			case "assistant/message":
				completedStreaming = void 0;
				if (streaming === void 0 || streaming.isSettled() || !chat.children.includes(streaming)) startAssistantStep(event.data);
				if (streaming !== void 0) {
					streaming.settle(event.data.message.content);
					applyTurnFolding(streaming.position.turn);
				}
				break;
			case "llm/retry": {
				retractFailedStreaming();
				const retryLimit = event.data.mode === "always" ? "∞" : String(event.data.maxRetries);
				appendNotice(`Retrying model request (${event.data.retry}/${retryLimit}) in ${event.data.delayMs}ms: ${event.data.failure.message}`, "warning");
				break;
			}
			case "tool/call":
				chat.addChild(parsedTool(event));
				trailStreamingTiming();
				break;
			case "tool/result": {
				const callId = event.data.message.source.callId;
				let card = toolCards.get(callId);
				if (card === void 0) {
					card = new ToolCardComponent("tool", {
						value: {},
						valid: true
					}, void 0, resolved.maxToolOutputLines, resolved.maxDiffEditLength, palette, mdTheme);
					card.setVisibility(toolsVisibility);
					chat.addChild(card);
					allToolCards.add(card);
				}
				card.updateResult(event.data);
				toolCards.delete(callId);
				trailStreamingTiming();
				break;
			}
			case "todo/write":
				todo.update(event.data.todos);
				break;
			case "turn/start":
				todo.update([]);
				break;
			case "session/title":
				sessionTitle = event.data.title;
				header.invalidate();
				updateTerminalTitle();
				break;
			case "step/end":
				if (streaming === void 0) startAssistantStep(event.data);
				streaming?.complete(event.time);
				completedStreaming = streaming;
				streaming = void 0;
				break;
			case "turn/end": {
				clearStreaming();
				const reason = event.data.reason;
				switch (reason.kind) {
					case "completed": break;
					case "error": {
						const key = String(event.data.turn);
						const message = errorChain(reason.error);
						if (!liveErrors.delete(key)) appendNotice(message, "error");
						break;
					}
					case "aborted":
						appendNotice("Turn cancelled.", "warning");
						break;
					case "max-tokens":
						appendNotice("The model reached its output-token limit.", "warning");
						break;
					case "interrupted":
						appendNotice("The previous process ended during this turn.", "warning");
						break;
					default: appendNotice(`Turn ended: ${reason.kind}.`, "warning");
				}
				break;
			}
		}
	};
	const renderCompactionMarker = () => {
		chat.addChild(new Spacer(1));
		chat.addChild(new Text(palette.dim(COMPACTION_MARKER), 0, 0));
	};
	/**
	* Replay the human transcript from the append-only log. The model-visible
	* surface shadows compacted ranges, so it is not the source here: every
	* append-origin message stays rendered, and a replacement contributes at most
	* the compaction marker at its own log position.
	*
	* The `tool/call` pairing check has no live counterpart, because only replay
	* can meet an orphan: `tool/call` carries no `surfaceOp` of its own, so it
	* inherits transcript membership from the `assistant/message` that advertised
	* it, which the live listener has necessarily just rendered. A loaded log is a
	* replay boundary, so the pairing is re-derived here instead of assumed.
	*/
	const rebuildTranscript = (populateHistory) => {
		chat.clear();
		toolCards.clear();
		allToolCards.clear();
		contextCards.clear();
		assistantSteps.clear();
		streaming = void 0;
		todo.update([]);
		const transcriptCalls = transcriptToolCallIds(agent.session);
		for (const event of agent.session.snapshotEvents()) {
			if (isReplacementSurfaceEvent(event)) {
				if (isCompactCheckpoint(event)) renderCompactionMarker();
				continue;
			}
			if (event.type === "tool/call" && !transcriptCalls.has(event.data.callId)) continue;
			renderEvent(event, {
				addHistory: populateHistory,
				renderChunks: false
			});
		}
		requestRender();
	};
	const questions = createQuestionQueue({
		ctx,
		resolved,
		palette,
		overlayManager,
		requestRender,
		isDisposed,
		questionMaxHeight: () => {
			const width = runtime.terminal.columns;
			const editorRows = editor.render(width).length;
			return Math.max(1, Math.min(resolved.questionDialogMaxHeight, runtime.terminal.rows - editorRows));
		}
	});
	const resume = createResumeController({
		ctx,
		agent,
		runtime,
		resolved,
		palette,
		overlayManager,
		sessionQuery: () => {
			const implementation = ctx.reflect._getImpl("sessionQuery", false);
			if (implementation === void 0 || implementation.fiber.state >= FIBER_FAILED) return void 0;
			return ctx.get("sessionQuery", false);
		},
		ui,
		editor,
		appendNotice,
		requestRender,
		isDisposed,
		agentStatus
	});
	const shutdown = (exitProcess) => {
		shuttingDown ??= (async () => {
			disposed = true;
			overlayManager.beginShutdown();
			modelController.resetContextResolution();
			clearStatus();
			for (const controller of commandControllers) controller.abort(/* @__PURE__ */ new Error("TUI disposed"));
			commandControllers.clear();
			for (const controller of referenceControllers) controller.abort(/* @__PURE__ */ new Error("TUI disposed"));
			referenceControllers.clear();
			await tuiServiceFiber?.dispose();
			tuiServiceFiber = void 0;
			questions.rejectAll();
			await overlayManager.dispose();
			modelController.clearOverlay();
			questions.unregister();
			await runtime.terminal.drainInput(100, 20);
			ui.stop();
			if (exitProcess) {
				if (runtime.goodbyeMessage !== void 0) runtime.terminal.write(`${palette.dim(displayText(runtime.goodbyeMessage))}\n`);
				runtime.exit(0);
			}
		})();
		return shuttingDown;
	};
	const requestExit = () => {
		if (agent.status === "running") {
			agent.cancel({ kind: "user" });
			appendNotice("Cancelling the active turn before exit…", "warning");
			agent.whenIdle().then(() => shutdown(true));
			return;
		}
		shutdown(true);
	};
	/** Swap the palette and all derived themes for the given terminal color scheme. */
	const applyColorScheme = (scheme) => {
		if (scheme === currentScheme) return;
		currentScheme = scheme;
		Object.assign(palette, resolved.theme.color && resolved.theme.vscode ? createVscodePalette(true) : createPalette(resolved.theme.color, scheme));
		Object.assign(mdTheme, markdownTheme(palette));
		rebuildTranscript(false);
		setStatus(agent.status);
		requestRender();
	};
	let currentScheme = "dark";
	const disposeSchemeListener = ui.onTerminalColorSchemeChange(applyColorScheme);
	ui.queryTerminalColorScheme({ timeoutMs: 2e3 }).catch(() => {});
	const setToolsVisibility = (next) => {
		toolsVisibility = next;
		for (const card of allToolCards) card.setVisibility(toolsVisibility);
		for (const card of contextCards) card.setExpanded(toolsVisibility === "expanded");
		for (const turn of assistantSteps.keys()) applyTurnFolding(turn);
		appendNotice(toolsVisibility === "hidden" ? "Tool cards hidden." : `Tool and context cards ${toolsVisibility}.`);
	};
	const toggleTools = () => {
		setToolsVisibility(toolsVisibility === "collapsed" ? "expanded" : toolsVisibility === "expanded" ? "hidden" : "collapsed");
	};
	const setReasoning = (show) => {
		showReasoning = show;
		const activeStreaming = streaming;
		rebuildTranscript(false);
		/* v8 ignore next -- the non-streaming command path is covered; this branch preserves an active stream across rebuild. */
		if (activeStreaming !== void 0) {
			streaming = activeStreaming;
			streaming.setShowReasoning(showReasoning);
			registerAssistantStep(activeStreaming);
			chat.addChild(activeStreaming);
			chat.addChild(activeStreaming.timing);
		}
		appendNotice(`Reasoning blocks ${showReasoning ? "shown" : "hidden"}.`);
	};
	const toggleReasoning = () => {
		setReasoning(!showReasoning);
	};
	let detailsOverlay;
	const showDetailsSelector = () => {
		detailsOverlay?.close();
		const session = overlayManager.open({
			create: () => new DetailsDialog(toolsVisibility, showReasoning, palette, (selection) => {
				if (selection.showReasoning !== showReasoning) setReasoning(selection.showReasoning);
				if (selection.visibility !== toolsVisibility) setToolsVisibility(selection.visibility);
			}, () => {
				session.close();
			}),
			options: {
				width: resolved.detailsDialogWidth,
				anchor: "center",
				margin: 1
			}
		});
		detailsOverlay = session;
		session.closed.then(() => {
			if (detailsOverlay === session) detailsOverlay = void 0;
		});
		requestRender();
	};
	const runDetails = (rawInput) => {
		const tokens = rawInput.split(/\s+/u).filter((token) => token !== "");
		if (tokens.length === 0) {
			showDetailsSelector();
			return { kind: "success" };
		}
		let visibility;
		let reasoning;
		for (let token = tokens.shift(); token !== void 0; token = tokens.shift()) if (token === "collapsed" || token === "expanded" || token === "hidden") visibility = token;
		else if (token === "reasoning") {
			const value = tokens[0];
			if (value === "on" || value === "off") {
				tokens.shift();
				reasoning = value === "on";
			} else reasoning = !showReasoning;
		} else return {
			kind: "error",
			text: `Unknown /details argument "${token}". Usage: /details [collapsed|expanded|hidden] [reasoning [on|off]]`
		};
		if (reasoning !== void 0) setReasoning(reasoning);
		if (visibility !== void 0) setToolsVisibility(visibility);
		return { kind: "success" };
	};
	const showHelp = () => {
		const commandLines = ctx.commands.list(agent).map((command) => {
			const input = command.input === void 0 ? "" : ` ${command.input.hint}`;
			return `/${command.name}${input} — ${command.description}`;
		});
		chat.addChild(new Spacer(1));
		chat.addChild(new Text(palette.bold(palette.accent("Keyboard shortcuts")), 0, 0));
		chat.addChild(new Text([
			"Enter send • Shift/Alt+Enter newline • Up/Down prompt history",
			"Esc cancel turn • Ctrl+O cycle cards (collapse/expand/hide) • Ctrl+R toggle reasoning • Ctrl+L redraw",
			"Ctrl+C cancel while running; clear input or exit while idle • Ctrl+D exit",
			"",
			...commandLines,
			"/skill:<name> [instructions] — load a skill into the conversation"
		].map((line) => palette.dim(line)).join("\n"), 0, 0));
		requestRender();
	};
	const showPalette = () => {
		chat.addChild(new Spacer(1));
		chat.addChild(new Text(renderPalette(palette, currentScheme, resolved.theme.color).join("\n"), 0, 0));
		requestRender();
	};
	const showStatus = async (signal) => {
		const assembly = await ctx.systemPrompt.assemble(assembleContextFor(agent, signal));
		/* v8 ignore next -- disposal during the awaited assembly is covered by command-owner teardown tests. */
		if (disposed) return;
		/* v8 ignore next -- SystemPrompt always emits at least its required base section. */
		const systemPrompt = displayText(renderPrompt(assembly)) || "(empty)";
		const registeredTools = assembly.tools.map((tool) => displayText(tool.name)).join(", ") || "(none)";
		const events = agent.session.snapshotEvents();
		const latestActivity = lastSessionActivityTime(events) ?? agent.session.header.createdAt;
		const usedContext = Math.max(0, Math.round(ctx.tokenMeter.measure(agent.session).totalTokens));
		let context = `${formatDiagnosticNumber(usedContext)} used · capacity unknown`;
		const contextWindow = modelController.contextWindow();
		if (contextWindow !== void 0) {
			const contextPercent = Math.round(usedContext / contextWindow * 100);
			context = `${diagnosticMeter(contextPercent, palette)} ${String(contextPercent)}% used (${formatDiagnosticNumber(usedContext)} / ${formatDiagnosticNumber(contextWindow)})`;
		}
		const rate = cacheHitRate(tokens);
		const turns = events.filter((event) => event.type === "turn/start").length;
		const steps = events.filter((event) => event.type === "step/start").length;
		const toolCalls = events.filter((event) => event.type === "tool/call").length;
		const model = target.current === void 0 ? "unset" : displayText(targetLabel(target.current));
		const effort = target.current === void 0 ? "unset" : target.current.reasoningEffort === void 0 ? "default" : displayText(target.current.reasoningEffort);
		const card = new StatusCardComponent([
			[
				["Session", displayText(agent.session.id)],
				["Title", displayText(sessionTitle ?? "untitled")],
				["Directory", displayText(cwd)],
				["Model", `${model} ${palette.dim(`(effort ${effort}; reasoning blocks ${showReasoning ? "shown" : "hidden"})`)}`]
			],
			[["Agent", [
				agent.status,
				formatDiagnosticCount(events.length, "event"),
				formatDiagnosticCount(turns, "turn"),
				formatDiagnosticCount(steps, "step"),
				formatDiagnosticCount(toolCalls, "tool call")
			].join(" · ")]],
			[
				["Tokens", `${formatDiagnosticNumber(tokens.input)} input + ${formatDiagnosticNumber(tokens.output)} output`],
				["KV cache", rate === void 0 ? `n/a (${formatDiagnosticNumber(tokens.cacheRead)} read + ${formatDiagnosticNumber(tokens.cacheWrite)} write)` : `${diagnosticMeter(rate, palette)} ${String(rate)}% hit (${formatDiagnosticNumber(tokens.cacheRead)} read + ${formatDiagnosticNumber(tokens.cacheWrite)} write)`],
				["Context", context]
			],
			[["Created", formatDiagnosticTime(agent.session.header.createdAt)], ["Active", formatDiagnosticTime(latestActivity)]]
		], palette);
		chat.addChild(new Spacer(1));
		chat.addChild(card);
		chat.addChild(new Spacer(1));
		chat.addChild(new Text(palette.bold(palette.accent("System prompt")), 0, 0));
		chat.addChild(new Text(systemPrompt, 0, 0));
		chat.addChild(new Spacer(1));
		chat.addChild(new Text(palette.bold(palette.accent("Registered tools")), 0, 0));
		chat.addChild(new Text(registeredTools, 0, 0));
		requestRender();
	};
	let skillCommands = [];
	let skillCommandScan = 0;
	const refreshCommandAutocomplete = () => {
		const base = new CombinedAutocompleteProvider([...ctx.commands.list(agent).map((command) => ({
			name: command.name,
			description: command.description,
			...command.input === void 0 ? {} : { argumentHint: command.input.hint }
		})), ...skillCommands], agent.session.header.cwd ?? process.cwd());
		const sessionReferences = ctx.get("sessionReferences");
		editor.setAutocompleteProvider(new ReferenceAutocompleteProvider(base, fileSearch, sessionReferences, agent));
	};
	const refreshVisibleSlashAutocomplete = () => {
		const cursor = editor.getCursor();
		const textBeforeCursor = editor.getLines().slice(cursor.line, cursor.line + 1).join("").slice(0, cursor.col);
		if (cursor.line === 0 && textBeforeCursor.startsWith("/") && !textBeforeCursor.includes(" ")) editor.handleInput("	");
	};
	const disposeCommandChanges = ctx.on("commands/change", refreshCommandAutocomplete);
	refreshCommandAutocomplete();
	const refreshSkillCommands = (service) => {
		const scan = ++skillCommandScan;
		service.snapshot({
			cwd,
			signal: skillAbort.signal
		}).then((snapshot) => {
			if (disposed || scan !== skillCommandScan || !snapshot.complete) return;
			skillCommands = snapshot.skills.filter((skill) => skill.invocation.userInvocable).map((skill) => ({
				name: `skill:${skill.name}`,
				description: skill.description,
				argumentHint: skill.source.startsWith("project-") ? "(project)" : "(user)"
			}));
			refreshCommandAutocomplete();
			refreshVisibleSlashAutocomplete();
			requestRender();
		}, () => {});
	};
	const disposeSkillChanges = skills === void 0 ? () => {} : ctx.on("skills/change", () => {
		refreshSkillCommands(skills);
	});
	if (skills !== void 0) refreshSkillCommands(skills);
	const commandFiber = agent.ctx.inject(["commands"], (commandCtx) => {
		commandCtx.commands.register({
			name: "help",
			description: "Show keyboard shortcuts and commands",
			handler: () => {
				showHelp();
				return { kind: "success" };
			}
		});
		commandCtx.commands.register({
			name: "model",
			description: "Show or switch this session's model",
			input: { hint: "[[provider/]model]" },
			handler: ({ rawInput }) => {
				modelController.queueModelCommand(rawInput);
				return { kind: "success" };
			}
		});
		commandCtx.commands.register({
			name: "clear",
			description: "Clear the transcript view (session history is unchanged)",
			handler: () => {
				chat.clear();
				requestRender();
				return { kind: "success" };
			}
		});
		commandCtx.commands.register({
			name: "details",
			description: "Select tool-card visibility and reasoning display",
			input: { hint: "[collapsed|expanded|hidden] [reasoning [on|off]]" },
			handler: ({ rawInput }) => runDetails(rawInput)
		});
		commandCtx.commands.register({
			name: "palette",
			description: "Show every color and attribute role this terminal renders",
			handler: () => {
				showPalette();
				return { kind: "success" };
			}
		});
		commandCtx.commands.register({
			name: "reload",
			description: "EXPERIMENTAL (dev): re-read loader config files and apply the diff (idle only)",
			handler: () => {
				runReload();
				return { kind: "success" };
			}
		});
		commandCtx.commands.register({
			name: "resume",
			description: "List this workspace's resumable sessions",
			handler: () => {
				resume.showResume();
				return { kind: "success" };
			}
		});
		commandCtx.commands.register({
			name: "status",
			description: "Show session diagnostics, system prompt, and registered tools",
			handler: async ({ signal }) => {
				await showStatus(signal);
				return { kind: "success" };
			}
		});
		const exitHandler = () => {
			requestExit();
			return { kind: "success" };
		};
		commandCtx.commands.register({
			name: "exit",
			description: "Exit after the active turn reaches idle",
			handler: exitHandler
		});
		commandCtx.commands.register({
			name: "quit",
			description: "Exit after the active turn reaches idle",
			handler: exitHandler
		});
	});
	const fileReferencePromptFiber = agent.ctx.inject(["systemPrompt"], (promptCtx) => {
		promptCtx.systemPrompt.section({
			name: "ui:tui-file-reference",
			order: 99,
			text: () => agent.ctx.tools.get("read", agent) === void 0 ? "" : FILE_REFERENCE_PROMPT
		});
	});
	const runCommand = (text) => {
		const controller = new AbortController();
		commandControllers.add(controller);
		ctx.commands.execute(agent, text, [], controller.signal).then((execution) => {
			if (disposed) return;
			if (execution === void 0) appendNotice(`Unknown command: ${text}`, "warning");
			else if (execution.result.text !== void 0 && execution.result.text !== "") appendNotice(execution.result.text, execution.result.kind === "error" ? "error" : "info");
		}, (error) => {
			if (!disposed) appendNotice(`Command failed: ${errorChain(error)}`, "error");
		}).finally(() => {
			commandControllers.delete(controller);
		});
	};
	const dispatchMessage = (content) => {
		if (disposed) {
			appendNotice(`Agent "${agent.id}" is disposed.`, "error");
			return;
		}
		if (agent.status === "running") {
			const message = createUserMessage({
				content,
				source: { kind: "user" }
			});
			agent.steer(message);
			pendingSteering.add(message.id);
			refreshStatus();
			return;
		}
		agent.followup(createUserMessage({
			content,
			source: { kind: "user" }
		}));
	};
	/** Deliver a user turn to the agent: steer while running, send while idle, or report a disposed agent. */
	const deliver = (payload) => {
		dispatchMessage([{
			type: "text",
			text: payload
		}]);
	};
	/** Load a manually invoked skill and deliver its rendered body as a user turn, reporting lookup outcomes as notices. */
	const invokeSkill = (name, instructions) => {
		if (skills === void 0) {
			appendNotice("Skills are not available in this session.", "warning");
			return;
		}
		const lookup = {
			cwd,
			signal: skillAbort.signal
		};
		const reportFailure = (error) => {
			if (disposed) return;
			appendNotice(`Skill "${name}" failed to load: ${errorChain(error)}`, "error");
		};
		skills.list(lookup).then((summaries) => {
			if (disposed) return;
			const summary = summaries.find((skill) => skill.name === name);
			if (summary === void 0) {
				appendNotice(`Unknown skill: ${name}`, "warning");
				return;
			}
			if (!summary.invocation.userInvocable) {
				appendNotice(`Skill "${name}" is not available for user invocation.`, "warning");
				return;
			}
			skills.get(name, lookup).then((skill) => {
				if (disposed) return;
				if (skill === void 0) {
					appendNotice(`Unknown skill: ${name}`, "warning");
					return;
				}
				if (!skill.invocation.userInvocable) {
					appendNotice(`Skill "${name}" is not available for user invocation.`, "warning");
					return;
				}
				deliver(renderSkillInvocation(skill, instructions));
			}, reportFailure);
		}, reportFailure);
	};
	let reloadInFlight = false;
	const runReload = () => {
		if (agent.status !== "idle") {
			appendNotice(`/reload requires an idle agent (status: ${agent.status}).`, "warning");
			return;
		}
		if (reloadInFlight) {
			appendNotice("A config reload is already running.", "warning");
			return;
		}
		const loader = ctx.get("loader");
		if (loader === void 0) {
			appendNotice("/reload needs the cordis Loader; this runtime has none.", "warning");
			return;
		}
		const refreshes = [];
		for (const entry of loader.entries()) if (entry.subtree?.refresh !== void 0) refreshes.push(entry.subtree.refresh());
		reloadInFlight = true;
		appendNotice(`Reloading ${refreshes.length} config tree(s)… (experimental)`);
		Promise.all(refreshes).then(() => {
			appendNotice("Config reload complete. Unchanged files were skipped; invalid files keep the running tree (see logs).");
		}).catch((error) => {
			appendNotice(`Config reload failed: ${errorChain(error)}`, "error");
		}).finally(() => {
			reloadInFlight = false;
		});
	};
	editor.onSubmit = (value) => {
		const text = value.trim();
		if (text === "") return;
		if (text.startsWith("/skill:")) {
			editor.addToHistory(text);
			editor.setText("");
			const { name: skillName, instructions } = parseSkillCommand(text);
			if (skillName === "") appendNotice("Usage: /skill:<name> [instructions]", "warning");
			else invokeSkill(skillName, instructions);
			return;
		}
		if (value.startsWith("/")) {
			editor.addToHistory(text);
			editor.setText("");
			runCommand(value);
			return;
		}
		editor.addToHistory(text);
		editor.setText("");
		dispatchMessage([{
			type: "text",
			text
		}]);
	};
	const removeInputListener = ui.addInputListener((data) => {
		if (overlayManager.hasActiveOverlay()) return void 0;
		if (matchesKey(data, Key.ctrl("o"))) {
			toggleTools();
			return { consume: true };
		}
		if (matchesKey(data, Key.ctrl("r"))) {
			toggleReasoning();
			return { consume: true };
		}
		if (matchesKey(data, Key.ctrl("l"))) {
			ui.invalidate();
			ui.requestRender(true);
			return { consume: true };
		}
		if (matchesKey(data, Key.escape) && agent.status === "running") {
			agent.cancel({ kind: "user" });
			return { consume: true };
		}
		if (matchesKey(data, Key.ctrl("c"))) {
			if (agent.status === "running") agent.cancel({ kind: "user" });
			else if (editor.getText() !== "") editor.setText("");
			else requestExit();
			return { consume: true };
		}
		if (matchesKey(data, Key.ctrl("d"))) {
			if (agent.status === "running") appendNotice("Cancel the active turn before exiting.", "warning");
			else requestExit();
			return { consume: true };
		}
	});
	const disposeSessionEvents = ctx.on("session/event", (session, event) => {
		if (session !== agent.session) return;
		if (event.type === "tool/result") fileSearch.invalidate();
		recordEventUsage(tokens, event);
		if (event.type === "turn/start" && runningStatus !== void 0) runningStatus.turn = event.data.turn;
		if (event.type === "compaction/start" && event.data.turn === null) {
			if (compacting === void 0) {
				compacting = {
					startedAt: now(),
					timer: setInterval(renderStatus, 50)
				};
				runtime.terminal.setProgress(true);
			}
			requestRender();
			return;
		}
		if (event.type === "compaction/end" && event.data.turn === null && compacting !== void 0) {
			const fadeOutGlyph = runningPhaseGlyph(agent.session.snapshotEvents(), false, true);
			clearInterval(compacting.timer);
			compacting = void 0;
			if (event.data.error !== void 0) appendNotice(`Compaction failed: ${event.data.error}`, "warning");
			if (runningStatus === void 0 && fadeOutGlyph !== void 0) beginFadeOut(fadeOutGlyph);
			requestRender();
			return;
		}
		if (isReplacementSurfaceEvent(event)) {
			if (isCompactCheckpoint(event)) renderCompactionMarker();
			requestRender();
			return;
		}
		renderEvent(event, {
			addHistory: false,
			renderChunks: true
		});
		requestRender();
	});
	const settlePendingSteering = (id) => {
		if (pendingSteering.delete(id)) refreshStatus();
	};
	const disposeDequeued = ctx.on("agent/inbox/claimed", ({ agent: subject, message }) => {
		if (subject === agent) settlePendingSteering(message.id);
	});
	const disposeDiscarded = ctx.on("agent/inbox/discarded", ({ agent: subject, message }) => {
		if (subject !== agent) return;
		if (pendingSteering.delete(message.id)) refreshStatus();
	});
	const disposeStatus = ctx.on("agent/status", ({ agent: subject, status }) => {
		if (subject !== agent) return;
		if (status !== "running") pendingSteering.clear();
		setStatus(status);
	});
	const disposeError = ctx.on("agent/error", ({ agent: subject, turn, step, error }) => {
		if (subject !== agent) return;
		liveErrors.add(`${turn}:${step}`);
		appendNotice(errorChain(error), "error");
	});
	const disposeAgent = ctx.on("agent/disposed", ({ agent: subject }) => {
		if (subject !== agent) return;
		clearStatus();
		appendNotice(`Agent "${agent.id}" was disposed.`, "warning");
		disposed = true;
	});
	const detachListeners = () => {
		skillAbort.abort();
		fileSearch.dispose();
		removeInputListener();
		disposeCommandChanges();
		disposeSkillChanges();
		disposePromptChanges();
		for (const value of promptValues) value.dispose();
		stopBannerReveal();
		disposeSessionEvents();
		disposeDequeued();
		disposeDiscarded();
		disposeStatus();
		disposeError();
		disposeAgent();
		disposeSchemeListener();
		disposeTargetListeners();
		modelController.detach();
	};
	let revealTimer;
	const stopBannerReveal = () => {
		if (revealTimer === void 0) return;
		clearInterval(revealTimer);
		revealTimer = void 0;
		header.setRevealWidth(void 0);
	};
	const startBannerReveal = () => {
		if (config.welcome !== void 0) return;
		const total = 7;
		let shown = 0;
		header.setRevealWidth(0);
		revealTimer = setInterval(() => {
			shown += 1;
			if (shown >= total) stopBannerReveal();
			else header.setRevealWidth(shown);
			requestRender();
		}, 15);
	};
	rebuildTranscript(true);
	const restoredGoal = foldGoal(agent.session.snapshotEvents()).goal;
	/* v8 ignore next -- goal replay coverage lives with the goal seam; the TUI only formats its startup notice. */
	if (restoredGoal !== void 0 && restoredGoal.phase !== "complete") appendNotice(`Goal restored (${restoredGoal.phase}) with automatic continuation disarmed. Human confirmation is required; send “继续” or run /goal resume.`, "warning");
	setStatus(agent.status);
	try {
		ui.start();
	} catch (error) {
		disposed = true;
		detachListeners();
		Promise.all([commandFiber.dispose(), fileReferencePromptFiber.dispose()]).catch(
			/* v8 ignore next 2 -- command registration cleanup is non-throwing; this guards a future disposer regression */
			(cleanupError) => {
				ctx.logger.warn(`ui-tui: scoped cleanup after startup failure failed: ${errorChain(cleanupError)}`);
			}
		);
		clearStatus();
		questions.unregister();
		ui.stop();
		throw error;
	}
	tuiServiceFiber = ctx.inject([], (serviceCtx) => {
		new TuiExtensionServiceImpl(serviceCtx, agent, overlayManager);
	});
	startBannerReveal();
	if (config.initialSkill !== void 0) invokeSkill(config.initialSkill, "");
	return { async dispose() {
		detachListeners();
		await shutdown(false);
		await Promise.all([commandFiber.dispose(), fileReferencePromptFiber.dispose()]);
	} };
}
/**
* Open the pi-tui channel once its configured agent exists.
*
* @param ctx - Context supplying the agent registry, tools, and event stream.
* @param config - Target agent and presentation configuration.
* @param runtime - Terminal and process-exit boundary.
*/
function mountTui(ctx, config, runtime) {
	const sessionId = SessionId(config.sessionId ?? "main");
	const matchesConfiguredIdentity = (agent) => agent.id === sessionId && ctx.agents.roots().includes(agent);
	let settled = false;
	const stopWaiting = () => {
		disposeCreated();
		disposeFailure();
	};
	const start = (agent) => {
		if (settled || !matchesConfiguredIdentity(agent)) return;
		settled = true;
		stopWaiting();
		ctx.effect(() => {
			const controller = createTuiChat(ctx, config, runtime);
			return () => controller.dispose();
		}, "ui-tui");
	};
	const fail = (failedSessionId, error) => {
		if (settled || failedSessionId !== sessionId) return;
		settled = true;
		stopWaiting();
		runtime.terminal.write(displayText(`ui-tui: session "${sessionId}" failed to start: ${errorChain(error)}\n`));
		runtime.exit(1);
	};
	const disposeCreated = ctx.on("agent/created", ({ agent }) => start(agent));
	const disposeFailure = ctx.on("agent-loop/config-start-failed", ({ sessionId, error }) => fail(sessionId, error));
	const existing = ctx.agents.roots().find((agent) => agent.id === sessionId);
	if (existing !== void 0) start(existing);
}
const ROOT_DISPOSE_TIMEOUT_MS = 5e3;
/**
* Dispose the whole application before process exit, with a bounded fallback.
* @param ctx - The TUI plugin context whose root owns sibling resources.
* @param code - Process status to report.
* @param exit - Exit boundary, replaceable by tests.
*/
function disposeRootAndExit(ctx, code, exit = (status) => {
	process.exit(status);
}) {
	let exited = false;
	const exitOnce = () => {
		if (exited) return;
		exited = true;
		exit(code);
	};
	const timeout = setTimeout(exitOnce, ROOT_DISPOSE_TIMEOUT_MS);
	ctx.root.fiber.dispose().then(() => {
		clearTimeout(timeout);
		exitOnce();
	}, () => {
		clearTimeout(timeout);
		exitOnce();
	});
}
/** Cordis entry point using the process terminal; explicit TUI composition requires a TTY pair. */
/* v8 ignore start -- production process wiring; fake-terminal tests cover mountTui/createTuiChat,
and apps/cli PTY smokes cover the real entry */
function apply(ctx, config) {
	if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("ui-tui: both stdin and stdout must be TTYs; use the one-shot @deepseek-ai/dsh-cli-demo app for pipes");
	const truecolor = config.theme?.truecolor ?? ["truecolor", "24bit"].includes(process.env.COLORTERM ?? "");
	const resumeHost = ctx.get("tuiResumeHost");
	const goodbyeMessage = ctx.get("tuiGoodbyeMessage");
	const initialSkill = config.initialSkill ?? ctx.get("tuiInitialSkill");
	mountTui(ctx, Object.assign({}, config, { theme: Object.assign({}, config.theme, { truecolor }) }, initialSkill === void 0 ? {} : { initialSkill }), {
		terminal: new ProcessTerminal(),
		exit: (code) => {
			disposeRootAndExit(ctx, code);
		},
		...resumeHost === void 0 ? {} : { handoffResume: (sessionId, cwd) => resumeHost.handoff(sessionId, cwd) },
		...goodbyeMessage === void 0 ? {} : { goodbyeMessage }
	});
}
/* v8 ignore stop */
//#endregion
export { Config, DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES, DEFAULT_FILE_SEARCH_MAX_ENTRIES, DEFAULT_FILE_SEARCH_MAX_RESULTS, FILE_REFERENCE_PROMPT, INITIAL_SKILL_KEY, MAIN_SESSION_ID_KEY, TUI_GOODBYE_MESSAGE_KEY, TuiConfigSchema, TuiExtensionService, TuiPromptService, apply, createTuiChat, disposeRootAndExit, inject, mountTui, name, renderSkillInvocation, resolveTuiConfig };
