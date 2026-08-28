/**
 * Private bridge between the public TUI extension contract and pi-tui.
 *
 * The manager serializes modal ownership, guards extension callbacks, and
 * settles every queued or active operation before terminal teardown.
 * @module dsh-tui/extension/overlay-manager
 */
import { Service } from '@deepseek-ai/cordis';
/** Turn a close reason into its immutable public outcome. */
function outcome(reason) {
    return Object.freeze({ reason });
}
/** Retain only supported layout fields before a queued request returns to its caller. */
function retainOptions(options) {
    return Object.freeze({
        ...options.width === undefined ? {} : { width: options.width },
        ...options.minWidth === undefined ? {} : { minWidth: options.minWidth },
        ...options.maxHeight === undefined ? {} : { maxHeight: options.maxHeight },
        ...options.anchor === undefined ? {} : { anchor: options.anchor },
        ...options.margin === undefined
            ? {}
            : {
                margin: typeof options.margin === 'object'
                    ? Object.freeze({ ...options.margin })
                    : options.margin,
            },
    });
}
/** Guard plugin component methods while preserving focus and key-release state. */
class GuardedOverlayComponent {
    component;
    fail;
    constructor(component, fail) {
        this.component = component;
        this.fail = fail;
    }
    get focused() {
        try {
            return this.component.focused ?? false;
        }
        catch (error) {
            this.fail(error);
            return false;
        }
    }
    set focused(value) {
        try {
            if ('focused' in this.component)
                this.component.focused = value;
        }
        catch (error) {
            this.fail(error);
        }
    }
    get wantsKeyRelease() {
        try {
            return this.component.wantsKeyRelease ?? false;
        }
        catch (error) {
            this.fail(error);
            return false;
        }
    }
    render(width) {
        try {
            return this.component.render(width);
        }
        catch (error) {
            this.fail(error);
            return [];
        }
    }
    handleInput(data) {
        try {
            this.component.handleInput?.(data);
        }
        catch (error) {
            this.fail(error);
        }
    }
    invalidate() {
        try {
            this.component.invalidate();
            return true;
        }
        catch (error) {
            this.fail(error);
            return false;
        }
    }
}
/** FIFO modal owner for one mounted TUI. */
export class TuiOverlayManager {
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
        return this.active !== undefined;
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
    open(request, placement = 'overlay') {
        if (!this.accepting)
            throw new Error('TUI is shutting down');
        const requestSignal = request.signal;
        const retainedRequest = Object.freeze({
            create: request.create,
            ...request.options === undefined ? {} : { options: retainOptions(request.options) },
            ...requestSignal === undefined ? {} : { signal: requestSignal },
        });
        const controller = new AbortController();
        const signal = requestSignal === undefined
            ? controller.signal
            : AbortSignal.any([requestSignal, controller.signal]);
        const deferred = Promise.withResolvers();
        const session = {
            get state() {
                return entry.state;
            },
            closed: deferred.promise,
            close: () => this.close(entry, outcome('closed')),
            closeWith: (reason) => this.close(entry, outcome(reason)),
        };
        const entry = {
            request: retainedRequest,
            controller,
            signal,
            closed: deferred.promise,
            resolveClosed: deferred.resolve,
            session,
            placement,
            state: 'queued',
        };
        if (requestSignal?.aborted === true) {
            void this.close(entry, outcome('aborted'));
            return session;
        }
        if (requestSignal !== undefined) {
            const onAbort = () => { void this.close(entry, outcome('aborted')); };
            requestSignal.addEventListener('abort', onAbort, { once: true });
            entry.removeRequestAbort = () => { requestSignal.removeEventListener('abort', onAbort); };
        }
        this.queue.push(entry);
        this.activateNext();
        return session;
    }
    /** Stop accepting work and settle every active or queued overlay. */
    dispose() {
        if (this.disposeTask !== undefined)
            return this.disposeTask;
        this.beginShutdown();
        const entries = [
            ...this.active === undefined ? [] : [this.active],
            ...this.queue,
        ];
        return this.disposeTask = Promise.all(entries.map(entry => this.close(entry, outcome('tui-disposed')))).then(() => { });
    }
    activateNext() {
        if (!this.accepting || this.active !== undefined)
            return;
        const entry = this.queue.shift();
        if (entry === undefined)
            return;
        this.active = entry;
        entry.state = 'active';
        const host = this.host(entry);
        let component;
        try {
            component = entry.request.create(host);
        }
        catch (error) {
            this.fail(entry, error);
            return;
        }
        if (this.active !== entry)
            return;
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
        }
        catch (error) {
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
                if (this.active !== entry || entry.component === undefined || entry.failing === true)
                    return;
                if (!entry.component.invalidate() || this.active !== entry)
                    return;
                try {
                    this.driver.invalidate();
                }
                catch (error) {
                    this.fail(entry, error);
                }
            },
            close: () => { void this.close(entry, outcome('closed')); },
        });
    }
    fail(entry, error) {
        if (entry.state === 'closed' || entry.failing === true)
            return;
        entry.failing = true;
        this.report(error);
        queueMicrotask(() => {
            void this.close(entry, Object.freeze({ reason: 'error', error }));
        });
    }
    report(error) {
        try {
            this.driver.reportError(error);
        }
        catch {
            // Error reporting is a containment boundary, never a second failure path.
        }
    }
    hide(handle) {
        try {
            handle.hide();
        }
        catch (error) {
            this.report(error);
        }
    }
    close(entry, result) {
        if (entry.outcome !== undefined)
            return entry.closed;
        entry.outcome = result;
        entry.state = 'closed';
        entry.removeRequestAbort?.();
        delete entry.removeRequestAbort;
        if (!entry.controller.signal.aborted)
            entry.controller.abort(result);
        const queuedIndex = this.queue.indexOf(entry);
        if (queuedIndex >= 0)
            this.queue.splice(queuedIndex, 1);
        if (this.active === entry) {
            this.active = undefined;
            if (entry.handle !== undefined)
                this.hide(entry.handle);
            delete entry.handle;
        }
        delete entry.component;
        entry.resolveClosed(result);
        try {
            this.driver.invalidate();
        }
        catch (error) {
            this.report(error);
        }
        queueMicrotask(() => { this.activateNext(); });
        return entry.closed;
    }
}
/** Cordis service whose method effects bind to the calling plugin fiber. */
export class TuiExtensionServiceImpl extends Service {
    agent;
    overlays;
    constructor(ctx, agent, overlays) {
        super(ctx, 'tui');
        this.agent = agent;
        this.overlays = overlays;
    }
    /** @inheritdoc */
    openOverlay(request) {
        let operation;
        const disposeOwner = this.ctx.effect(() => () => operation?.closeWith('owner-disposed'), 'tui.openOverlay()');
        try {
            operation = this.overlays.open(request);
        }
        catch (error) {
            void disposeOwner();
            throw error;
        }
        void operation.closed.then(() => { void disposeOwner(); });
        return operation;
    }
}
//# sourceMappingURL=overlay-manager.js.map