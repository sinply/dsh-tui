/**
 * Private bridge between the public TUI extension contract and pi-tui.
 *
 * The manager serializes modal ownership, guards extension callbacks, and
 * settles every queued or active operation before terminal teardown.
 * @module @deepseek-ai/dsh-tui/extension/overlay-manager
 */
import { Service, type Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { TuiExtensionService } from '../index.ts';
import type { Component } from '@earendil-works/pi-tui';
import type { TuiOverlayCloseReason, TuiOverlayOutcome, TuiOverlayOptions, TuiOverlayRequest, TuiOverlaySession, TuiTheme, TuiViewport } from './types.ts';
/** pi-tui operations retained by the front door instead of exposed to plugins. */
export interface TuiOverlayDriver {
    /** Current terminal viewport. */
    viewport(): TuiViewport;
    /** Current semantic theme facade. */
    theme(): TuiTheme;
    /** Escape text at the terminal display boundary. */
    display(value: string): string;
    /** Mount one guarded modal and return its private focus/lifecycle handle. */
    show(component: Component, options: TuiOverlayOptions | undefined, placement: TuiOverlayPlacement): TuiModalHandle;
    /** Invalidate the mounted UI and request a render. */
    invalidate(): void;
    /** Report a contained extension failure. */
    reportError(error: unknown): void;
}
type TuiOverlayPlacement = 'overlay' | 'inline';
interface TuiModalHandle {
    hide(): void;
}
/** FIFO modal owner for one mounted TUI. */
export declare class TuiOverlayManager {
    private readonly driver;
    private readonly queue;
    private active;
    private accepting;
    private disposeTask;
    constructor(driver: TuiOverlayDriver);
    /**
     * Whether one extension or built-in overlay currently owns terminal focus.
     * @returns `true` while an overlay is active.
     */
    hasActiveOverlay(): boolean;
    /** Reject new work while the TUI unloads dependent extension fibers. */
    beginShutdown(): void;
    /**
     * Queue one modal without assigning Cordis ownership.
     * @param request - component factory, constraints, and request signal.
     * @param placement - terminal overlay for extensions, or inline for the built-in question panel.
     * @returns an internal session that can close with an ownership reason.
     */
    open(request: TuiOverlayRequest, placement?: TuiOverlayPlacement): TuiOverlaySession & {
        closeWith(reason: Exclude<TuiOverlayCloseReason, 'error'>): Promise<TuiOverlayOutcome>;
    };
    /** Stop accepting work and settle every active or queued overlay. */
    dispose(): Promise<void>;
    private activateNext;
    private host;
    private fail;
    private report;
    private hide;
    private close;
}
/** Cordis service whose method effects bind to the calling plugin fiber. */
export declare class TuiExtensionServiceImpl extends Service implements TuiExtensionService {
    readonly agent: Agent;
    private readonly overlays;
    constructor(ctx: Context, agent: Agent, overlays: TuiOverlayManager);
    /** @inheritdoc */
    openOverlay(request: TuiOverlayRequest): TuiOverlaySession;
}
export {};
//# sourceMappingURL=overlay-manager.d.ts.map