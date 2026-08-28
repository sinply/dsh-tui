/**
 * Model-selection sub-controller for the interactive chat channel: the queued
 * `/model` command, the keyboard model selector overlay with reasoning-effort
 * selection, and resolution of the selected model's context window. Owns the
 * context-window cache the prompt and status views read; the caller owns the
 * shared {@link ModelSelectionRef}.
 * @module @deepseek-ai/dsh-tui/chat/model-command
 */
import { errorChain, LlmError } from '@deepseek-ai/dsh-llm';
import { displayText } from "../components/text.js";
import { ModelDialog, readModelChoices, targetLabel, targetReasoningLabel, } from "../components/dialogs.js";
/**
 * Build the model-selection controller for one chat channel.
 * @param deps - channel collaborators and shared target handle.
 * @returns the controller wired to the channel's overlay and prompt views.
 */
export function createModelController(deps) {
    const { ctx, resolved, palette, overlayManager, target } = deps;
    let contextWindow;
    let contextResolution;
    let modelOverlay;
    let modelCommands = Promise.resolve();
    // A route whose adapter has not registered yet. Loader activation order is
    // service-driven, so the TUI can mount before a configured adapter plugin
    // activates; that transient NO_ADAPTER is not an error — the resolution
    // waits for the next `llm/adapters-updated` commit instead of surfacing it.
    let awaitingAdapter = false;
    const resolveContextWindow = (selected) => {
        contextWindow = undefined;
        awaitingAdapter = false;
        const resolution = selected === undefined
            ? Promise.resolve({ kind: 'resolved', contextWindow: undefined })
            : ctx.llm.resolveModelInfo(selected.provider, selected.model).then(info => ({ kind: 'resolved', contextWindow: info.context?.contextWindow }), (error) => ({ kind: 'error', error }));
        contextResolution = resolution;
        void resolution.then((result) => {
            if (contextResolution !== resolution)
                return;
            if (result.kind === 'error') {
                if (selected !== undefined && result.error instanceof LlmError && result.error.code === 'NO_ADAPTER') {
                    awaitingAdapter = true;
                    return;
                }
                deps.appendNotice(`Could not resolve model context: ${errorChain(result.error)}`, 'error');
                return;
            }
            contextWindow = result.contextWindow;
            deps.requestRender();
        });
    };
    // The wait cannot go stale against `target.current`: every target change
    // re-enters resolveContextWindow, which clears it. A commit that still
    // lacks the route parks the resolution again rather than erroring, so
    // unrelated topology changes stay silent. The disposer rides the channel's
    // detachListeners() through detach(), matching the sibling listeners.
    const disposeAdapterListener = ctx.on('llm/adapters-updated', () => {
        if (deps.isDisposed() || !awaitingAdapter)
            return;
        resolveContextWindow(target.current);
    });
    resolveContextWindow(target.current);
    const selectModel = (selected, explicitReasoning) => {
        const sameRoute = target.current?.provider === selected.provider && target.current.model === selected.model;
        const reasoningEffort = explicitReasoning === undefined
            ? (sameRoute ? target.current?.reasoningEffort ?? selected.reasoning?.defaultEffort : selected.reasoning?.defaultEffort)
            : explicitReasoning.effort;
        if (sameRoute && target.current?.reasoningEffort === reasoningEffort) {
            const reasoning = targetReasoningLabel(selected, reasoningEffort);
            deps.appendNotice(`Model is already ${targetLabel(selected)}${reasoning === undefined ? '' : ` with reasoning effort ${displayText(reasoning)}`}.`);
            return;
        }
        target.current = {
            provider: selected.provider,
            model: selected.model,
            ...reasoningEffort === undefined ? {} : { reasoningEffort },
        };
        resolveContextWindow(target.current);
        const reasoning = targetReasoningLabel(selected, reasoningEffort);
        deps.appendNotice([
            `Model selected: ${targetLabel(selected)}.`,
            ...reasoning === undefined ? [] : [`Reasoning effort: ${displayText(reasoning)}.`],
            'New steps will use it.',
        ].join(' '));
    };
    const showModelSelector = (choices) => {
        const current = target.current === undefined ? 'unset' : targetLabel(target.current);
        if (choices.length === 0) {
            deps.appendNotice(`Current model: ${current}\nNo models are advertised by registered providers.`, 'warning');
            return;
        }
        void modelOverlay?.close();
        const session = overlayManager.open({
            create: () => new ModelDialog(choices, target.current, resolved.maxModelOptions, palette, (selection) => {
                void session.close();
                selectModel(selection.choice, { effort: selection.reasoningEffort });
            }, () => { void session.close(); }),
            options: {
                width: resolved.modelDialogWidth,
                maxHeight: resolved.modelDialogMaxHeight,
                anchor: 'center',
                margin: 1,
            },
        });
        modelOverlay = session;
        void session.closed.then(() => {
            if (modelOverlay === session)
                modelOverlay = undefined;
        });
        deps.requestRender();
    };
    const handleModelCommand = async (raw) => {
        const choices = await readModelChoices(ctx, target.current);
        if (deps.isDisposed())
            return;
        const argument = raw.trim();
        if (argument === '') {
            showModelSelector(choices);
            return;
        }
        const parts = argument.split(/\s+/u);
        if (parts.length > 2) {
            deps.appendNotice('Usage: /model [provider/]model', 'warning');
            return;
        }
        let matches;
        if (parts.length === 2) {
            matches = choices.filter(choice => choice.provider === parts[0] && choice.model === parts[1]);
        }
        else {
            const value = argument;
            const qualified = choices.filter(choice => targetLabel(choice) === value);
            matches = qualified.length > 0 ? qualified : choices.filter(choice => choice.model === value);
        }
        if (matches.length === 0) {
            deps.appendNotice(`Unknown model: ${argument}. Run /model to list available models.`, 'warning');
            return;
        }
        if (matches.length > 1) {
            deps.appendNotice(`Model "${argument}" is advertised by multiple providers; use /model <provider>/<model>.`, 'warning');
            return;
        }
        const selected = matches[0];
        /* v8 ignore next -- a non-empty matches array always has index zero. */
        if (selected === undefined)
            return;
        selectModel(selected);
    };
    return {
        contextWindow: () => contextWindow,
        queueModelCommand(raw) {
            modelCommands = modelCommands.then(async () => {
                await handleModelCommand(raw);
            }).catch((error) => {
                if (!deps.isDisposed())
                    deps.appendNotice(`Could not read the model catalog: ${errorChain(error)}`, 'error');
            });
        },
        resetContextResolution() {
            contextResolution = undefined;
        },
        clearOverlay() {
            modelOverlay = undefined;
        },
        detach() {
            disposeAdapterListener();
        },
    };
}
//# sourceMappingURL=model-command.js.map