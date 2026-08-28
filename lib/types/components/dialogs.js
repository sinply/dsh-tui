/**
 * pi-tui dialog and selector components for the terminal front door: the status
 * card, prompt-context line, model selector, resume picker, and user-question
 * dialog, plus the model-choice and resume-candidate data they present.
 * @module @deepseek-ai/dsh-tui/components/dialogs
 */
import { Input, Key, SelectList, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, } from '@earendil-works/pi-tui';
import { BRACKETED_PASTE_END, BRACKETED_PASTE_START, displayText, sanitizePastedText } from "./text.js";
import { dialogSelectTheme } from "./theme.js";
import { renderTuiPromptTemplate, } from "../prompt.js";
/**
 * Format a provider/model target as its `provider/model` label.
 * @param target - The LLM target.
 * @returns The `provider/model` label.
 */
export function targetLabel(target) {
    return `${target.provider}/${target.model}`;
}
/**
 * Format a target compactly as its model name with any selected reasoning effort appended.
 * @param target - The LLM target.
 * @returns The compact `model [effort]` label.
 */
export function compactTargetLabel(target) {
    return `${target.model}${target.reasoningEffort === undefined ? '' : ` ${target.reasoningEffort}`}`;
}
/**
 * Resolve the display label for a choice's reasoning effort.
 * @param choice - The model choice carrying advertised reasoning metadata.
 * @param effort - The selected effort, or `undefined` for provider default.
 * @returns The effort's display name, `Default`, or `undefined` when the model has no reasoning metadata.
 */
export function targetReasoningLabel(choice, effort) {
    if (effort === undefined)
        return choice.reasoning === undefined ? undefined : 'Default';
    return choice.reasoning?.efforts.find(candidate => candidate.id === effort)?.name ?? effort;
}
/**
 * Derive the agent's initial LLM target from its logged request header or options.
 * @param agent - The driven agent.
 * @returns The initial target, or `undefined` when unset.
 */
export function initialTarget(agent) {
    const logged = agent.session.requestHeader()?.config;
    if (logged !== undefined) {
        if (logged.reasoningEffort === undefined) {
            return { provider: logged.provider, model: logged.model };
        }
        return { provider: logged.provider, model: logged.model, reasoningEffort: logged.reasoningEffort };
    }
    if (agent.options.provider === undefined || agent.options.model === undefined)
        return undefined;
    return { provider: agent.options.provider, model: agent.options.model };
}
/**
 * List every advertised model across registered providers, appending the current
 * target when a provider does not advertise it.
 * @param ctx - Context supplying the LLM service.
 * @param current - The current target, appended when unadvertised.
 * @returns The model choices, flattened across providers.
 */
export async function readModelChoices(ctx, current) {
    const providers = ctx.llm.listProviders();
    const groups = await Promise.all(providers.map(async (provider) => {
        const advertised = await ctx.llm.listModels(provider.id);
        const models = [...advertised];
        if (current?.provider === provider.id
            && !models.some(model => model.id === current.model)) {
            models.push({ provider: provider.id, id: current.model, name: current.model });
        }
        return Promise.all(models.map(async (model) => {
            const reasoning = (await ctx.llm.resolveModelInfo(provider.id, model.id)).reasoning;
            return {
                provider: provider.id,
                model: model.id,
                modelName: model.name,
                ...model.description === undefined ? {} : { description: model.description },
                ...reasoning === undefined ? {} : { reasoning },
            };
        }));
    }));
    return groups.flat();
}
/**
 * Format a diagnostic integer with grouping separators.
 * @param value - Integer to format.
 * @returns The grouped decimal string.
 */
export function formatDiagnosticNumber(value) {
    return value.toLocaleString('en-US');
}
/**
 * Format a diagnostic timestamp as an ISO date-time in UTC.
 * @param value - Epoch milliseconds.
 * @returns The formatted UTC timestamp.
 */
export function formatDiagnosticTime(value) {
    return new Date(value).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/u, ' UTC');
}
/**
 * Format a pluralized count for a diagnostic row.
 * @param value - Count.
 * @param singular - Singular noun; an `s` is appended for other counts.
 * @returns The formatted count.
 */
export function formatDiagnosticCount(value, singular) {
    return `${String(value)} ${singular}${value === 1 ? '' : 's'}`;
}
/**
 * Render a fixed-width filled meter bar for a percentage.
 * @param percent - Percentage in [0, 100].
 * @param palette - Active role palette.
 * @returns The rendered meter.
 */
export function diagnosticMeter(percent, palette) {
    const width = 16;
    const filled = Math.round(Math.min(100, Math.max(0, percent)) / 100 * width);
    return `${palette.dim('[')}${palette.accent('█'.repeat(filled))}${palette.dim(`${'░'.repeat(width - filled)}]`)}`;
}
/** Bordered, grouped field card for one point-in-time status snapshot. */
export class StatusCardComponent {
    groups;
    palette;
    constructor(groups, palette) {
        this.groups = groups;
        this.palette = palette;
    }
    invalidate() { }
    render(width) {
        const labels = this.groups.flatMap(group => group.map(([label]) => `${label}:`));
        const naturalLabelWidth = Math.max(...labels.map(label => label.length));
        const naturalBodyWidth = Math.max(...this.groups.flatMap(group => group.map(([, value]) => 1 + naturalLabelWidth + 2 + visibleWidth(value))));
        const cardWidth = Math.min(Math.max(8, width), Math.max('Session status'.length + 5, naturalBodyWidth + 4));
        const innerWidth = Math.max(1, cardWidth - 4);
        const labelWidth = Math.min(naturalLabelWidth, Math.max(1, Math.floor(innerWidth / 3)));
        const body = [];
        for (const [groupIndex, group] of this.groups.entries()) {
            if (groupIndex > 0)
                body.push('');
            for (const [label, value] of group) {
                const plainLabel = truncateToWidth(`${label}:`, labelWidth, '');
                const prefix = ` ${this.palette.dim(plainLabel.padEnd(labelWidth))}  `;
                const continuation = ' '.repeat(1 + labelWidth + 2);
                const valueWidth = Math.max(1, innerWidth - visibleWidth(prefix));
                const wrapped = wrapTextWithAnsi(value, valueWidth);
                for (const [lineIndex, line] of wrapped.entries()) {
                    body.push(`${lineIndex === 0 ? prefix : continuation}${line}`);
                }
            }
        }
        const title = truncateToWidth('Session status', Math.max(1, cardWidth - 5), '');
        const topTail = '─'.repeat(Math.max(0, cardWidth - visibleWidth(title) - 5));
        const top = `${this.palette.dim('╭─ ')}${this.palette.bold(this.palette.accent(title))}${this.palette.dim(` ${topTail}╮`)}`;
        const lines = [top];
        for (const line of body) {
            const clipped = truncateToWidth(line, innerWidth, '');
            lines.push(`${this.palette.dim('│')} ${clipped}${' '.repeat(Math.max(0, innerWidth - visibleWidth(clipped)))} ${this.palette.dim('│')}`);
        }
        lines.push(this.palette.dim(`╰${'─'.repeat(Math.max(0, cardWidth - 2))}╯`));
        return lines;
    }
}
/** The left/right template line rendered above the editor. */
export class PromptContextComponent {
    leftTemplate;
    rightTemplate;
    resolve;
    constructor(leftTemplate, rightTemplate, resolve) {
        this.leftTemplate = leftTemplate;
        this.rightTemplate = rightTemplate;
        this.resolve = resolve;
    }
    invalidate() { }
    render(width) {
        const right = truncateToWidth(renderTuiPromptTemplate(this.rightTemplate, this.resolve), width, '');
        const rightWidth = visibleWidth(right);
        const leftCapacity = Math.max(0, width - rightWidth - (rightWidth === 0 ? 0 : 2));
        const left = truncateToWidth(renderTuiPromptTemplate(this.leftTemplate, this.resolve), leftCapacity, '');
        if (rightWidth === 0)
            return [left];
        const gap = ' '.repeat(Math.max(0, width - visibleWidth(left) - rightWidth));
        return [`${left}${gap}${right}`];
    }
}
/**
 * Render a bordered dialog frame around body lines with a titled top edge.
 * @param title - Dialog title shown in the top border.
 * @param body - Body lines.
 * @param width - Dialog width in columns.
 * @param palette - Active role palette.
 * @returns The framed dialog lines.
 */
export function renderDialog(title, body, width, palette) {
    const innerWidth = Math.max(1, width - 4);
    const topLabel = ` ${displayText(title)} `;
    const top = `╭${topLabel}${'─'.repeat(Math.max(0, width - visibleWidth(topLabel) - 2))}╮`;
    const lines = [palette.accent(top)];
    for (const line of body) {
        const clipped = truncateToWidth(line, innerWidth, '');
        lines.push(`${palette.accent('│')} ${clipped}${' '.repeat(Math.max(0, innerWidth - visibleWidth(clipped)))} ${palette.accent('│')}`);
    }
    lines.push(palette.accent(`╰${'─'.repeat(Math.max(0, width - 2))}╯`));
    return lines;
}
/** Keyboard model selector rendered as a bordered overlay, with a filter box and per-model reasoning-effort cycling. */
export class ModelDialog {
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
        this.items = new Map();
        this.choices = new Map();
        this.efforts = new Map();
        this.currentValue = current === undefined ? undefined : targetLabel(current);
        for (const choice of choices) {
            const value = targetLabel(choice);
            const isCurrent = current?.provider === choice.provider && current.model === choice.model;
            this.choices.set(value, choice);
            this.efforts.set(value, isCurrent
                ? current.reasoningEffort ?? choice.reasoning?.defaultEffort
                : choice.reasoning?.defaultEffort);
            this.items.set(value, {
                value,
                label: displayText(value),
                description: this.describeChoice(choice, isCurrent),
            });
        }
        this.list = this.buildList(this.currentValue);
    }
    /** Build a SelectList over the currently filtered items, selecting `selectValue` when present. */
    buildList(selectValue) {
        const items = this.filteredItems();
        const list = new SelectList(items, this.maxVisible, dialogSelectTheme(this.palette));
        const index = selectValue === undefined ? 0 : items.findIndex(item => item.value === selectValue);
        list.setSelectedIndex(Math.max(0, index));
        list.onSelect = (item) => { this.confirm(item); };
        list.onCancel = this.cancel;
        return list;
    }
    /** Items matching the filter box, as a case-insensitive substring over the label, model name, and description. */
    filteredItems() {
        const query = this.filter.getValue().trim().toLocaleLowerCase();
        if (query === '')
            return [...this.items.values()];
        return [...this.items.values()].filter((item) => {
            const choice = this.choices.get(item.value);
            /* v8 ignore next -- items and choices share the same keys. */
            if (choice === undefined)
                return false;
            return [item.value, choice.modelName, choice.description ?? '']
                .some(field => field.toLocaleLowerCase().includes(query));
        });
    }
    confirm(item) {
        const selected = this.choices.get(item.value);
        /* v8 ignore next -- SelectList only returns values built from `choices`. */
        if (selected === undefined)
            return;
        this.done({ choice: selected, reasoningEffort: this.efforts.get(item.value) });
    }
    describeChoice(choice, isCurrent) {
        const effortLabel = targetReasoningLabel(choice, this.efforts.get(targetLabel(choice)));
        return [
            displayText(choice.modelName),
            ...choice.description === undefined ? [] : [displayText(choice.description)],
            ...effortLabel === undefined ? [] : [displayText(effortLabel)],
            ...isCurrent ? ['current'] : [],
        ].join(' — ');
    }
    cycleReasoningEffort() {
        const selectedItem = this.list.getSelectedItem();
        /* v8 ignore next -- the dialog is opened only for a non-empty catalog. */
        if (selectedItem === null)
            return;
        const choice = this.choices.get(selectedItem.value);
        if (choice?.reasoning === undefined)
            return;
        const current = this.efforts.get(selectedItem.value);
        const efforts = [
            ...choice.reasoning.defaultEffort === undefined ? [undefined] : [],
            ...choice.reasoning.efforts.map(effort => effort.id),
        ];
        const currentIndex = efforts.indexOf(current);
        const next = efforts[(currentIndex + 1) % efforts.length];
        this.efforts.set(selectedItem.value, next);
        const item = this.items.get(selectedItem.value);
        /* v8 ignore next -- items and choices are constructed from the same values. */
        if (item === undefined)
            return;
        item.description = this.describeChoice(choice, selectedItem.value === this.currentValue);
    }
    invalidate() {
        this.filter.invalidate();
        this.list.invalidate();
    }
    handleInput(data) {
        if (matchesKey(data, Key.shift(Key.tab))) {
            this.cycleReasoningEffort();
        }
        else if (matchesKey(data, Key.escape)) {
            if (this.filter.getValue() === '')
                this.cancel();
            else {
                this.filter.setValue('');
                this.list = this.buildList(undefined);
            }
        }
        else if (matchesKey(data, Key.up)
            || matchesKey(data, Key.down)
            || matchesKey(data, Key.enter)) {
            this.list.handleInput(data);
        }
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
        const filterContent = truncateToWidth(this.filter.render(innerWidth).join(''), innerWidth, '');
        return renderDialog('Select model', [
            filterContent,
            '',
            ...results.length === 0
                ? [this.palette.dim('  No models match the filter')]
                : this.list.render(innerWidth),
            '',
            this.palette.dim('type to filter • ↑/↓ move • Shift+Tab reasoning • Enter select • Esc'),
        ], width, this.palette);
    }
}
const TOOL_CARD_PHASES = ['collapsed', 'expanded', 'hidden'];
/**
 * Keyboard toggle over the two transcript-detail entries — tool-card
 * visibility and reasoning display. Tab cycles the highlighted entry's value
 * and applies it immediately, so the transcript behind the dialog is the live
 * preview; Enter, Esc, or Ctrl+C closes.
 */
export class DetailsDialog {
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
        this.toolsItem = { value: 'tools', label: 'Tool cards', description: visibility };
        this.reasoningItem = { value: 'reasoning', label: 'Reasoning', description: this.reasoningLabel() };
        this.list = new SelectList([this.toolsItem, this.reasoningItem], 2, dialogSelectTheme(palette));
        this.list.onSelect = close;
    }
    reasoningLabel() {
        return this.showReasoning ? 'shown' : 'hidden';
    }
    /** Cycle the highlighted entry one step and apply the new state. */
    cycle() {
        const selected = this.list.getSelectedItem();
        /* v8 ignore next -- the two-entry list always has a selection. */
        if (selected === null)
            return;
        if (selected.value === 'tools') {
            const index = TOOL_CARD_PHASES.indexOf(this.visibility);
            this.visibility = TOOL_CARD_PHASES[(index + 1) % TOOL_CARD_PHASES.length];
            this.toolsItem.description = this.visibility;
        }
        else {
            this.showReasoning = !this.showReasoning;
            this.reasoningItem.description = this.reasoningLabel();
        }
        this.apply({ visibility: this.visibility, showReasoning: this.showReasoning });
    }
    invalidate() {
        this.list.invalidate();
    }
    handleInput(data) {
        if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c')))
            this.close();
        else if (matchesKey(data, Key.tab))
            this.cycle();
        else
            this.list.handleInput(data);
        this.invalidate();
    }
    render(width) {
        const innerWidth = Math.max(1, width - 4);
        return renderDialog('Transcript details', [
            ...this.list.render(innerWidth),
            '',
            this.palette.dim('↑/↓ move • Tab toggle • Enter/Esc close'),
        ], width, this.palette);
    }
}
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
export function summarizeResumeCandidate(record, title, lastActivityAt, currentId, cwd, formatWorkspace) {
    let disabledReason;
    if (record.header.id === currentId)
        disabledReason = 'current session';
    else if (record.live)
        disabledReason = 'session is already live in this runtime';
    else if (record.header.cwd === undefined)
        disabledReason = 'session has no recorded workspace';
    return {
        record,
        title: title ?? 'Untitled session',
        lastActivityAt: lastActivityAt ?? record.header.createdAt,
        currentWorkspace: record.header.cwd === cwd,
        workspaceLabel: formatWorkspace(record.header.cwd),
        ...disabledReason === undefined ? {} : { disabledReason },
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
export class ResumePicker {
    maxVisible;
    workspaceLabel;
    viewportRows;
    palette;
    done;
    cancel;
    search = new Input();
    pasteBuffer;
    selectedIndex = 0;
    error = '';
    scope = 'workspace';
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
        // A still-loading error is false the moment rows exist.
        this.error = '';
        this.invalidate();
    }
    /** Candidates in the active scope, before the search query narrows them. */
    scoped() {
        const candidates = this.candidates ?? [];
        return this.scope === 'all'
            ? [...candidates]
            : candidates.filter(candidate => candidate.currentWorkspace);
    }
    filtered() {
        const query = this.search.getValue().trim().toLocaleLowerCase();
        const scoped = this.scoped();
        if (query === '')
            return scoped;
        // The workspace label only distinguishes rows once it is on screen, so it
        // joins the searchable text exactly in the scope that shows it.
        return scoped.filter(candidate => candidate.title.toLocaleLowerCase().includes(query)
            || candidate.record.header.id.toLocaleLowerCase().includes(query)
            || (this.scope === 'all' && candidate.workspaceLabel.toLocaleLowerCase().includes(query)));
    }
    visibleCandidateCount() {
        // The all-workspaces scope adds a per-row workspace line, so a row costs
        // one more terminal row there than in the single-workspace scope.
        const rowHeight = this.scope === 'all' ? 4 : 3;
        const candidateBudget = Math.max(1, Math.floor((Math.max(1, this.viewportRows()) - 13) / rowHeight));
        return Math.min(this.maxVisible, candidateBudget);
    }
    handleBracketedPaste(data) {
        const start = data.indexOf(BRACKETED_PASTE_START);
        if (this.pasteBuffer === undefined && start < 0)
            return false;
        if (this.pasteBuffer === undefined) {
            const prefix = data.slice(0, start);
            if (prefix !== '')
                this.handleInput(prefix);
            this.pasteBuffer = data.slice(start + BRACKETED_PASTE_START.length);
        }
        else {
            this.pasteBuffer += data;
        }
        const end = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
        if (end < 0)
            return true;
        const pasted = sanitizePastedText(this.pasteBuffer.slice(0, end));
        const remaining = this.pasteBuffer.slice(end + BRACKETED_PASTE_END.length);
        this.pasteBuffer = undefined;
        const previous = this.search.getValue();
        this.search.handleInput(`${BRACKETED_PASTE_START}${pasted}${BRACKETED_PASTE_END}`);
        if (this.search.getValue() !== previous) {
            this.selectedIndex = 0;
            this.error = '';
        }
        if (remaining !== '')
            this.handleInput(remaining);
        this.invalidate();
        return true;
    }
    handleInput(data) {
        if (this.handleBracketedPaste(data))
            return;
        const filtered = this.filtered();
        if (matchesKey(data, Key.ctrl('c'))) {
            this.cancel();
            return;
        }
        if (matchesKey(data, Key.escape)) {
            if (this.search.getValue() === '')
                this.cancel();
            else {
                this.search.setValue('');
                this.selectedIndex = 0;
                this.error = '';
            }
        }
        else if (matchesKey(data, Key.up)) {
            this.selectedIndex = filtered.length === 0
                ? 0
                : (this.selectedIndex + filtered.length - 1) % filtered.length;
        }
        else if (matchesKey(data, Key.down)) {
            this.selectedIndex = filtered.length === 0 ? 0 : (this.selectedIndex + 1) % filtered.length;
        }
        else if (matchesKey(data, Key.pageUp)) {
            this.selectedIndex = Math.max(0, this.selectedIndex - this.visibleCandidateCount());
        }
        else if (matchesKey(data, Key.pageDown)) {
            this.selectedIndex = Math.min(Math.max(0, filtered.length - 1), this.selectedIndex + this.visibleCandidateCount());
        }
        else if (matchesKey(data, Key.tab)) {
            this.scope = this.scope === 'workspace' ? 'all' : 'workspace';
            this.search.setValue('');
            this.selectedIndex = 0;
            this.error = '';
        }
        else if (matchesKey(data, Key.enter)) {
            const selected = filtered[this.selectedIndex];
            if (this.candidates === undefined)
                this.error = 'Sessions are still loading.';
            else if (selected === undefined)
                this.error = 'No session matches this search.';
            else if (selected.disabledReason !== undefined)
                this.error = selected.disabledReason;
            else
                this.done(selected);
        }
        else {
            const previous = this.search.getValue();
            this.search.focused = this.focused;
            this.search.handleInput(data);
            if (this.search.getValue() !== previous) {
                this.selectedIndex = 0;
                this.error = '';
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
        const inWorkspace = candidates.filter(candidate => candidate.currentWorkspace).length;
        const active = this.scope === 'workspace'
            ? `this workspace ${displayText(this.workspaceLabel)}`
            : `all workspaces (${candidates.length})`;
        const other = this.scope === 'workspace'
            ? `all workspaces (${candidates.length})`
            : `this workspace (${inWorkspace})`;
        return `${this.palette.accent(active)}${this.palette.dim(`  ⇥ ${other}`)}`;
    }
    render(width) {
        this.search.focused = this.focused;
        const height = Math.max(1, this.viewportRows());
        const horizontalPadding = width >= 12 ? 2 : 0;
        const contentWidth = Math.max(1, width - horizontalPadding * 2);
        const indent = ' '.repeat(horizontalPadding);
        const filtered = this.filtered();
        if (this.selectedIndex >= filtered.length)
            this.selectedIndex = Math.max(0, filtered.length - 1);
        const selected = filtered[this.selectedIndex];
        const position = selected === undefined ? 0 : this.selectedIndex + 1;
        const title = this.candidates === undefined
            ? 'Resume session'
            : `Resume session (${position} of ${filtered.length})`;
        const lines = [
            '',
            `${indent}${this.palette.bold(this.palette.accent(title))}`,
            '',
        ];
        const searchInnerWidth = Math.max(1, contentWidth - 4);
        lines.push(`${indent}${this.palette.dim(`╭${'─'.repeat(Math.max(0, contentWidth - 2))}╮`)}`);
        const searchContent = this.search.render(searchInnerWidth).join('').replace(/^> /u, '⌕ ');
        const clippedSearch = truncateToWidth(searchContent, searchInnerWidth, '');
        lines.push(`${indent}${this.palette.dim('│')} ${clippedSearch}${' '.repeat(Math.max(0, searchInnerWidth - visibleWidth(clippedSearch)))} ${this.palette.dim('│')}`, `${indent}${this.palette.dim(`╰${'─'.repeat(Math.max(0, contentWidth - 2))}╯`)}`, '', `${indent}${this.renderScopeLine()}`, '');
        const visibleCount = this.visibleCandidateCount();
        const start = Math.max(0, Math.min(this.selectedIndex - Math.floor(visibleCount / 2), filtered.length - visibleCount));
        const end = Math.min(filtered.length, start + visibleCount);
        const push = (line) => {
            lines.push(`${indent}${truncateToWidth(line, contentWidth, '…')}`);
        };
        for (let index = start; index < end; index += 1) {
            const candidate = filtered[index];
            const active = index === this.selectedIndex;
            const status = [
                candidate.disabledReason === 'current session' ? 'current' : undefined,
                candidate.record.live ? 'live' : undefined,
                candidate.record.persisted ? 'persisted' : undefined,
            ].filter((value) => value !== undefined).join(' · ');
            const lead = `${active ? '❯' : ' '} ${displayText(candidate.title)}`;
            push(active ? this.palette.bold(this.palette.accent(lead)) : lead);
            push(this.palette.dim(`  ${new Date(candidate.lastActivityAt).toISOString()} · ${status} · ${displayText(candidate.record.header.id)}`));
            // Only the all-workspaces scope mixes directories, so the per-row
            // workspace is redundant in the scope that already names one.
            if (this.scope === 'all') {
                push(this.palette.dim(`  workspace ${displayText(candidate.workspaceLabel)}`));
            }
            if (candidate.disabledReason !== undefined) {
                push(this.palette.warning(`  unavailable: ${displayText(candidate.disabledReason)}`));
            }
        }
        if (this.candidates === undefined)
            push(this.palette.dim('Loading sessions…'));
        else if (filtered.length === 0)
            push(this.palette.warning('No matching sessions.'));
        if (this.error !== '') {
            lines.push('');
            push(this.palette.error(displayText(this.error)));
        }
        const footer = `${indent}${this.palette.dim('Type to search  •  ↑/↓ navigate  •  Tab scope  •  Enter resume  •  Esc clear/cancel')}`;
        while (lines.length < height - 2)
            lines.push('');
        lines.push(footer, '');
        return lines.slice(0, height);
    }
}
/** Inline dialog for one user question with option or custom-answer modes. */
export class QuestionDialog {
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
    selected = new Set();
    headerPage = { offset: 0, size: 1, maxOffset: 0 };
    selectedBlockPage = { offset: 0, size: 1, maxOffset: 0 };
    mode;
    error = '';
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
        this.mode = this.options.length > 0 ? 'options' : 'custom';
        this.input.onSubmit = (value) => { this.submitCustom(value); };
        this.input.onEscape = () => {
            if (this.options.length > 0) {
                this.mode = 'options';
                this.error = '';
            }
            else {
                this.cancel();
            }
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
        if (this.mode === 'custom') {
            this.input.focused = this.focused;
            this.input.handleInput(data);
            return;
        }
        const options = this.options;
        if (matchesKey(data, Key.up)) {
            this.selectedBlockPage = { offset: 0, size: 1, maxOffset: 0 };
            this.selectedIndex = this.selectedIndex === 0 ? options.length - 1 : this.selectedIndex - 1;
        }
        else if (matchesKey(data, Key.down)) {
            this.selectedBlockPage = { offset: 0, size: 1, maxOffset: 0 };
            this.selectedIndex = this.selectedIndex === options.length - 1 ? 0 : this.selectedIndex + 1;
        }
        else if (matchesKey(data, Key.space) && this.question.multiSelect) {
            if (this.selected.has(this.selectedIndex))
                this.selected.delete(this.selectedIndex);
            else
                this.selected.add(this.selectedIndex);
        }
        else if (matchesKey(data, Key.enter)) {
            const selected = this.question.multiSelect
                ? this.selectedOptionLabels()
                : [options[this.selectedIndex]?.label].filter((label) => label !== undefined);
            const custom = this.question.multiSelect ? this.input.getValue().trim() : '';
            if (selected.length === 0 && custom === '') {
                this.error = 'Select at least one option, or press Tab for a custom answer.';
                return;
            }
            this.done({ selected, ...(custom === '' ? {} : { custom }) });
        }
        else if (matchesKey(data, Key.tab) || data.toLowerCase() === 'c') {
            this.mode = 'custom';
            this.selectedBlockPage = { offset: 0, size: 1, maxOffset: 0 };
            this.error = '';
        }
        else if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) {
            this.cancel();
        }
    }
    submitCustom(value) {
        const custom = value.trim();
        if (custom === '') {
            this.error = 'Enter an answer before submitting.';
            return;
        }
        this.done({
            selected: this.question.multiSelect ? this.selectedOptionLabels() : [],
            custom,
        });
    }
    selectedOptionLabels() {
        return [...this.selected]
            .sort((a, b) => a - b)
            .map(index => this.options[index]?.label)
            .filter((label) => label !== undefined);
    }
    /** Page backward through an oversized option, then through question detail. */
    pageBackward() {
        if (this.mode === 'options' && this.selectedBlockPage.offset > 0) {
            this.selectedBlockPage = {
                ...this.selectedBlockPage,
                offset: Math.max(0, this.selectedBlockPage.offset - this.selectedBlockPage.size),
            };
            return;
        }
        this.headerPage = {
            ...this.headerPage,
            offset: Math.max(0, this.headerPage.offset - this.headerPage.size),
        };
    }
    /** Page forward through question detail, then through an oversized option. */
    pageForward() {
        if (this.headerPage.offset < this.headerPage.maxOffset) {
            this.headerPage = {
                ...this.headerPage,
                offset: Math.min(this.headerPage.maxOffset, this.headerPage.offset + this.headerPage.size),
            };
            return;
        }
        if (this.mode === 'custom')
            return;
        this.selectedBlockPage = {
            ...this.selectedBlockPage,
            offset: Math.min(this.selectedBlockPage.maxOffset, this.selectedBlockPage.offset + this.selectedBlockPage.size),
        };
    }
    render(width) {
        this.input.focused = this.focused;
        const horizontalPadding = Math.min(2, Math.max(0, Math.floor((width - 1) / 2)));
        const innerWidth = Math.max(1, width - horizontalPadding * 2);
        const header = `Question ${this.position}/${this.total} (${this.unanswered} unanswered)${this.question.header === undefined ? '' : ` · ${displayText(this.question.header)}`}`;
        const questionLines = wrapTextWithAnsi(this.palette.text(displayText(this.question.question)), innerWidth);
        const contentLines = [...questionLines];
        const headerLines = [
            ...wrapTextWithAnsi(this.palette.dim(header), innerWidth),
            ...questionLines,
        ];
        // Supporting detail (e.g. the full plan under review) renders between the
        // question and the answer surface, kept out of option labels.
        if (this.question.detail !== undefined) {
            headerLines.push('');
            contentLines.push('');
            for (const line of wrapTextWithAnsi(displayText(this.question.detail), innerWidth)) {
                headerLines.push(line);
                contentLines.push(line);
            }
        }
        headerLines.push('');
        const customControls = [
            ...(this.options.length > 0 && this.question.multiSelect ? [`${this.selected.size} selected`] : []),
            'Enter submit',
            this.options.length > 0 ? 'Esc options' : 'Esc cancel',
        ];
        const customHint = this.palette.dim(customControls.join(' • '));
        const footerLines = [];
        if (this.mode === 'custom') {
            for (const line of this.input.render(innerWidth))
                footerLines.push(line);
            for (const line of wrapTextWithAnsi(customHint, innerWidth))
                footerLines.push(line);
        }
        else {
            const controls = [
                'Tab custom answer',
                ...(this.options.length > 1 ? ['↑/↓ navigate'] : []),
                ...(this.question.multiSelect ? ['Space toggle'] : []),
                'Enter submit',
                'Esc interrupt',
            ];
            const hint = this.palette.dim(controls.join(' • '));
            for (const line of wrapTextWithAnsi(hint, innerWidth))
                footerLines.push(line);
        }
        if (this.error) {
            for (const line of wrapTextWithAnsi(this.palette.error(this.error), innerWidth))
                footerLines.push(line);
        }
        const positionLines = this.mode === 'options' && this.options.length > this.maxVisible
            ? [this.palette.dim(`${this.selectedIndex + 1}/${this.options.length}`)]
            : [];
        // Options receive only the rows left after fixed chrome and outer padding.
        // The final height window handles fixed chrome that cannot fit even alone.
        const paddingRows = 2;
        const maxHeight = this.maxHeight();
        const availableForOptions = Math.max(this.mode === 'options' ? 4 : 1, maxHeight - paddingRows - headerLines.length - positionLines.length - footerLines.length);
        const body = [...headerLines];
        const optionLines = [];
        if (this.mode === 'custom') {
            for (const line of footerLines)
                body.push(line);
        }
        else {
            const optionBlocks = this.options.map((option, index) => this.renderOptionBlock(option, index, innerWidth));
            const { visibleBlocks, hiddenBefore, hiddenAfter } = this.windowBlocks(optionBlocks, availableForOptions, innerWidth);
            if (hiddenBefore > 0)
                optionLines.push(this.palette.dim(`↑ ${hiddenBefore} more`));
            for (const block of visibleBlocks) {
                for (const line of block)
                    optionLines.push(line);
            }
            if (hiddenAfter > 0)
                optionLines.push(this.palette.dim(`↓ ${hiddenAfter} more`));
            for (const line of optionLines)
                body.push(line);
            for (const line of positionLines)
                body.push(line);
            for (const line of footerLines)
                body.push(line);
        }
        const rows = ['', ...body, ''];
        let visibleRows = rows;
        if (rows.length <= maxHeight)
            this.headerPage = { offset: 0, size: 1, maxOffset: 0 };
        if (rows.length > maxHeight && this.mode === 'options' && maxHeight >= 6) {
            const headerBudget = Math.max(0, maxHeight - optionLines.length - (this.error === '' ? 1 : 2));
            const compactFooter = [
                ...this.error === ''
                    ? []
                    : [truncateToWidth(this.palette.error(`Error: ${this.error}`), innerWidth, '…')],
                this.compactOptionControls(innerWidth, headerBudget === 1 && contentLines.length > headerBudget),
            ];
            const compactHeader = this.compactQuestionHeader(contentLines, headerBudget, innerWidth);
            visibleRows = [...compactHeader, ...optionLines, ...compactFooter];
        }
        else if (rows.length > maxHeight && this.mode === 'custom' && maxHeight >= 2) {
            const compactFooterSource = [
                ...this.input.render(innerWidth),
                this.compactCustomControls(innerWidth),
                ...this.error === ''
                    ? []
                    : [truncateToWidth(this.palette.error(this.error), innerWidth, '…')],
            ];
            const footerBudget = Math.max(1, maxHeight - 1);
            const compactFooter = compactFooterSource.length <= footerBudget
                ? compactFooterSource
                : footerBudget === 1
                    ? compactFooterSource.slice(0, 1)
                    : [
                        ...compactFooterSource.slice(0, 1),
                        ...compactFooterSource.slice(-(footerBudget - 1)),
                    ];
            const compactHeader = this.compactQuestionHeader(contentLines, Math.max(0, maxHeight - compactFooter.length), innerWidth);
            visibleRows = [...compactHeader, ...compactFooter];
        }
        if (visibleRows.length > maxHeight) {
            visibleRows = maxHeight === 1
                ? [this.palette.dim(`↑ ${visibleRows.length} lines hidden`)]
                : [
                    this.palette.dim(`↑ ${visibleRows.length - maxHeight + 1} lines hidden`),
                    ...visibleRows.slice(-(maxHeight - 1)),
                ];
        }
        return visibleRows.map((line) => {
            const bounded = truncateToWidth(line, innerWidth, '…');
            const pad = ' '.repeat(Math.max(0, innerWidth - visibleWidth(bounded)));
            const outerPad = ' '.repeat(horizontalPadding);
            return `${outerPad}${bounded}${pad}${outerPad}`;
        });
    }
    /** Render one option as wrapped label and indented description lines. */
    renderOptionBlock(option, index, innerWidth) {
        const cursor = index === this.selectedIndex ? '›' : ' ';
        const number = `${index + 1}. `;
        const mark = this.question.multiSelect
            ? this.selected.has(index) ? '[x] ' : '[ ] '
            : '';
        const labelPrefixPlain = ` ${cursor} ${number}${mark}`;
        const labelPrefixWidth = visibleWidth(labelPrefixPlain);
        const labelBodyWidth = Math.max(1, innerWidth - labelPrefixWidth);
        const labelLines = wrapTextWithAnsi(displayText(option.label), labelBodyWidth);
        const continuation = ' '.repeat(labelPrefixWidth);
        const lines = [];
        for (const [lineIndex, labelLine] of labelLines.entries()) {
            const prefix = lineIndex === 0 ? labelPrefixPlain : continuation;
            const composed = `${prefix}${labelLine}`;
            lines.push(index === this.selectedIndex ? this.palette.bold(this.palette.accent(composed)) : composed);
        }
        if (option.description !== undefined) {
            const descIndent = ' '.repeat(labelPrefixWidth);
            const descBodyWidth = Math.max(1, innerWidth - labelPrefixWidth);
            const descLines = wrapTextWithAnsi(displayText(option.description), descBodyWidth);
            for (const descLine of descLines)
                lines.push(`${descIndent}${this.palette.dim(descLine)}`);
        }
        return lines;
    }
    /** Keep the question visible when fixed chrome must be compacted. */
    compactQuestionHeader(contentLines, budget, innerWidth) {
        if (budget <= 0)
            return [];
        if (contentLines.length <= budget) {
            this.headerPage = { offset: 0, size: 1, maxOffset: 0 };
            return [...contentLines];
        }
        const pageSize = Math.max(1, budget - 1);
        const maxOffset = Math.max(0, contentLines.length - pageSize);
        const offset = Math.min(this.headerPage.offset, maxOffset);
        this.headerPage = { offset, size: pageSize, maxOffset };
        const keptLines = contentLines.slice(offset, offset + pageSize);
        if (budget === 1) {
            // A page is non-empty because pageSize is one and offset is clamped inside contentLines.
            return [keptLines[0]];
        }
        return [
            ...keptLines,
            this.pagerStatus(offset + 1, offset + keptLines.length, contentLines.length, innerWidth),
        ];
    }
    /** Keep Page Up / Page Down discoverable when a full pager status cannot fit. */
    pagerStatus(first, last, total, innerWidth) {
        const full = `… lines ${first}-${last}/${total} • PgUp/PgDn`;
        const compact = `PgUp/PgDn ${first}/${total}`;
        return this.palette.dim(truncateToWidth(visibleWidth(full) <= innerWidth ? full : compact, innerWidth, '…'));
    }
    /** Render custom-mode controls on one row when the header must compact. */
    compactCustomControls(innerWidth) {
        const controls = this.options.length > 0
            ? 'Enter submit • Esc options'
            : 'Enter submit • Esc cancel';
        const fallback = this.options.length > 0 ? '↵ Esc options' : 'Enter Esc cancel';
        const line = visibleWidth(controls) <= innerWidth ? controls : fallback;
        return this.palette.dim(truncateToWidth(line, innerWidth, '…'));
    }
    /** Render a one-row option footer that retains every mode-specific control. */
    compactOptionControls(innerWidth, showPager = false) {
        const controls = [
            ...(this.options.length > 1 ? ['↑/↓'] : []),
            'Tab custom',
            ...(this.question.multiSelect ? ['Space toggle'] : []),
            'Enter',
            'Esc interrupt',
            ...(showPager ? ['PgUp/PgDn'] : []),
        ].join(' • ');
        const optionNavigation = this.options.length > 1 ? '↑↓ ' : '';
        const fallback = showPager
            ? `P↑↓ ${optionNavigation}Tab${this.question.multiSelect ? ' S' : ''}↵Esc`
            : this.question.multiSelect ? `${optionNavigation}Tab Sp ↵Esc` : `${optionNavigation}Tab ↵ Esc`;
        const line = visibleWidth(controls) <= innerWidth ? controls : fallback;
        return this.palette.dim(truncateToWidth(line, innerWidth, '…'));
    }
    /**
     * Choose option blocks that fit while keeping the selected option visible.
     * Omitted blocks are counted at each end for explicit overflow markers.
     */
    windowBlocks(blocks, budget, innerWidth) {
        const totalLines = blocks.reduce((sum, block) => sum + block.length, 0);
        if (totalLines <= budget && blocks.length <= this.maxVisible) {
            return { visibleBlocks: [...blocks], hiddenBefore: 0, hiddenAfter: 0 };
        }
        // `blocks` is dense and selectedIndex is derived from the same options.
        let start = this.selectedIndex;
        let end = this.selectedIndex + 1;
        /* v8 ignore next -- selectedIndex stays inside [0, options.length). */
        let used = blocks[this.selectedIndex]?.length ?? 0;
        const markerLines = (before, after) => (before > 0 ? 1 : 0) + (after > 0 ? 1 : 0);
        const fits = (nextStart, nextEnd, nextUsed) => nextEnd - nextStart <= this.maxVisible
            && nextUsed + markerLines(nextStart, blocks.length - nextEnd) <= budget;
        const selectedMarkers = markerLines(start, blocks.length - end);
        if (used + selectedMarkers > budget) {
            /* v8 ignore next -- selectedIndex stays inside [0, options.length). */
            const selectedBlock = blocks[this.selectedIndex] ?? [];
            const hiddenBefore = start;
            const hiddenAfter = blocks.length - end;
            const pageSize = budget - selectedMarkers - 1;
            const maxOffset = Math.max(0, selectedBlock.length - pageSize);
            const offset = Math.min(this.selectedBlockPage.offset, maxOffset);
            this.selectedBlockPage = { offset, size: pageSize, maxOffset };
            const keptLines = selectedBlock.slice(offset, offset + pageSize);
            const first = offset + 1;
            const last = offset + keptLines.length;
            const overflow = this.pagerStatus(first, last, selectedBlock.length, innerWidth);
            return {
                visibleBlocks: [[...keptLines, overflow]],
                hiddenBefore,
                hiddenAfter,
            };
        }
        this.selectedBlockPage = { offset: 0, size: 1, maxOffset: 0 };
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
            hiddenAfter: blocks.length - end,
        };
    }
}
//# sourceMappingURL=dialogs.js.map