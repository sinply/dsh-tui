/**
 * Session-resume sub-controller for the interactive chat channel: the
 * `/resume` selector, one metadata-plus-title scan that tolerates a corrupt
 * neighbor, the pre-handoff preflight, and the terminal handoff itself.
 * @module @deepseek-ai/dsh-tui/chat/resume
 */
import { stat } from 'node:fs/promises';
import { errorChain } from '@deepseek-ai/dsh-llm';
import { formatCwd } from "./helpers.js";
import { ResumePicker, summarizeResumeCandidate, } from "../components/dialogs.js";
/**
 * Build the session-resume controller for one chat channel.
 * @param deps - channel collaborators, terminal handles, and optional services.
 * @returns the controller wired to the `/resume` command.
 */
export function createResumeController(deps) {
    const { ctx, agent, runtime, resolved, palette, overlayManager, sessionQuery, ui, editor, } = deps;
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
        title: 'Unreadable session',
        lastActivityAt: lastActivityAt ?? record.header.createdAt,
        currentWorkspace: record.header.cwd === agent.session.header.cwd,
        workspaceLabel: workspaceLabel(record.header.cwd),
        disabledReason: `session cannot be loaded: ${errorChain(error)}`,
    });
    /**
     * Metadata-only activity time: a live session's last in-memory event time,
     * otherwise the persisted artifact's mtime. Never reads a log, so browsing
     * cost stays independent of log size; any append (including bookkeeping)
     * moves it.
     */
    const lastActivityAt = async (record) => {
        const live = ctx.sessions.get(record.header.id);
        if (live !== undefined)
            return live.events.at(-1)?.time;
        const location = ctx.get('sessionPersistence')?.locate(record.header);
        if (location === undefined)
            return undefined;
        try {
            return (await stat(location.path)).mtimeMs;
        }
        catch {
            // Only a just-deleted or never-materialized artifact fails stat; the row falls back to created-at.
            return undefined;
        }
    };
    /**
     * One persisted row's title through the projection-cache ladder: the
     * zero-I/O checkpoint row when usable, otherwise a cold read that folds
     * only the log tail since the checkpoint and writes the refreshed row
     * back — so a store scanned once serves later scans without log reads.
     */
    const projectedTitle = async (cache, record, signal) => {
        const live = ctx.sessions.get(record.header.id);
        if (live !== undefined)
            return ctx.get('sessionProjections')?.snapshot(live).values.title;
        const cached = cache.cachedSnapshot(record.header);
        if (cached !== undefined && 'title' in cached.values)
            return cached.values.title;
        return (await cache.coldSnapshot(record.header.id, signal)).values.title;
    };
    /**
     * Resolve every row's title without reading whole logs when the projection
     * cache is mounted (live registry snapshot / checkpoint row / tail-only
     * cold read, bounded by `resumeScanConcurrency`); a composition without
     * the cache falls back to one bounded raw-log title batch.
     */
    const resolveTitles = async (listQuery, records, signal) => {
        const cache = ctx.get('sessionProjectionCache');
        if (cache === undefined) {
            const results = await listQuery.readTitleSnapshots(records.map(record => record.header.id), signal);
            return records.map((record, index) => {
                const result = results[index];
                /* v8 ignore next 2 -- readTitleSnapshots returns one result per unique listed id in input order */
                if (result === undefined || result.sessionId !== record.header.id)
                    throw new Error(`resume scan misaligned at "${record.header.id}"`);
                if (result.status === 'rejected')
                    return { failure: result.reason };
                const title = result.value.title?.title;
                return title === undefined ? {} : { title };
            });
        }
        const resolutions = new Array(records.length);
        let cursor = 0;
        const worker = async () => {
            for (;;) {
                const index = cursor;
                if (index >= records.length)
                    return;
                cursor += 1;
                const record = records[index];
                try {
                    const value = await projectedTitle(cache, record, signal);
                    resolutions[index] = typeof value === 'string' ? { title: value } : {};
                }
                catch (failure) {
                    resolutions[index] = { failure };
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(resolved.resumeScanConcurrency, records.length) }, () => worker()));
        return resolutions;
    };
    /** The latest logged provider/model route, for the preflight availability check. */
    const resumeRoute = (events) => {
        const header = events.findLast(item => item.type === 'request/header');
        if (header?.type === 'request/header') {
            return { provider: header.data.header.config.provider, model: header.data.header.config.model };
        }
        const assistant = events.findLast(item => item.type === 'assistant/message');
        return assistant?.type === 'assistant/message'
            ? { provider: assistant.data.message.source.provider, model: assistant.data.message.source.model }
            : undefined;
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
        if (query === undefined)
            throw new Error('Resume is unavailable: session query is not mounted.');
        /* v8 ignore stop */
        const initialStatus = deps.agentStatus();
        if (initialStatus !== 'idle')
            throw new Error(`Resume requires an idle agent (status: ${initialStatus}).`);
        const record = (await query.listSessions()).find(candidate => candidate.header.id === sessionId);
        if (record === undefined)
            throw new Error(`Session "${sessionId}" is no longer available.`);
        const candidate = summarize(record, undefined, undefined);
        if (candidate.disabledReason !== undefined)
            throw new Error(candidate.disabledReason);
        let events;
        try {
            events = (await query.readSession(record.header.id)).events;
        }
        catch (error) {
            throw new Error(`session cannot be loaded: ${errorChain(error)}`);
        }
        const route = resumeRoute(events);
        if (route !== undefined && !ctx.llm.listProviders().some(provider => provider.id === route.provider)) {
            throw new Error(`session is complete, but route is currently unavailable (${route.provider}/${route.model})`);
        }
        const cwd = record.header.cwd;
        /* v8 ignore next -- summarizeResumeCandidate disables a cwd-less record, so the check above already rejected it */
        if (cwd === undefined)
            throw new Error(`Session "${sessionId}" has no recorded workspace to resume in.`);
        const finalStatus = deps.agentStatus();
        if (finalStatus !== 'idle')
            throw new Error(`Resume requires an idle agent (status: ${finalStatus}).`);
        return { id: record.header.id, cwd };
    };
    const handoffResume = async (candidate, overlay) => {
        if (resumeInFlight)
            return;
        resumeInFlight = true;
        let terminalReleased = false;
        try {
            const checked = await preflightResume(candidate.record.header.id);
            const hostHandoff = runtime.handoffResume;
            if (hostHandoff === undefined) {
                await overlay.close();
                resumeOverlay = undefined;
                deps.appendNotice('Session is resumable, but this host cannot hand it off in place.', 'warning');
                return;
            }
            /* v8 ignore next -- shutdown during preflight invalidates an awaited service read or reaches this guard */
            if (deps.isDisposed())
                return;
            await ctx.sessions.flush(agent.session);
            // Disposal can run while the flush promise is pending.
            if (deps.isDisposed())
                return;
            if (agent.status !== 'idle')
                throw new Error(`Resume requires an idle agent (status: ${agent.status}).`);
            await overlay.close();
            resumeOverlay = undefined;
            await runtime.terminal.drainInput(100, 20);
            // Disposal can run while terminal draining is pending.
            if (deps.isDisposed())
                return;
            ui.stop();
            terminalReleased = true;
            // The host re-execs into the session's own workspace: process cwd, not the
            // restored session header, is what the filesystem and shell tools resolve
            // against.
            await hostHandoff(checked.id, checked.cwd);
            throw new Error('resume host returned without replacing the process');
        }
        catch (error) {
            if (!deps.isDisposed()) {
                if (terminalReleased) {
                    ui.start();
                    ui.setFocus(editor);
                    deps.appendNotice(`Resume handoff failed: ${errorChain(error)}`, 'error');
                }
                else {
                    await overlay.close();
                    resumeOverlay = undefined;
                    deps.appendNotice(`Resume failed: ${errorChain(error)}`, 'error');
                }
            }
        }
        finally {
            resumeInFlight = false;
        }
    };
    return {
        showResume() {
            if (agent.status !== 'idle') {
                deps.appendNotice('Resume requires the current turn to finish or be cancelled first.', 'warning');
                return;
            }
            const listQuery = sessionQuery();
            if (listQuery === undefined) {
                deps.appendNotice('Resume is not available: session query is not mounted.', 'warning');
                return;
            }
            const scan = ++resumeScan;
            void resumeOverlay?.close();
            // The picker opens before the scan settles so the terminal stops feeding
            // the editor immediately; a queued activation (the closing predecessor
            // still holds the slot) receives an already-scanned set through
            // `scanned` instead of a loading placeholder.
            let picker;
            let scanned;
            const session = overlayManager.open({
                create: (host) => {
                    picker = new ResumePicker(scanned, resolved.maxResumeOptions, workspaceLabel(agent.session.header.cwd), () => host.viewport.rows, palette, (candidate) => { void handoffResume(candidate, session); }, () => { void session.close(); });
                    return picker;
                },
                options: {
                    width: '100%',
                    maxHeight: '100%',
                    anchor: 'top-left',
                    margin: 0,
                },
            });
            resumeOverlay = session;
            // Closing the picker — Escape, supersession, disposal — aborts the scan:
            // the borrowed-log pass over a large store must not outlive its overlay.
            const scanAbort = new AbortController();
            void session.closed.then(() => {
                scanAbort.abort();
                /* v8 ignore next -- overlay FIFO closes this session before a replacement can become the tracked resume overlay */
                if (resumeOverlay === session)
                    resumeOverlay = undefined;
            });
            deps.requestRender();
            /** Whether this scan's overlay, session generation, or TUI is gone. */
            const scanStale = () => deps.isDisposed() || scan !== resumeScan || scanAbort.signal.aborted;
            const scanCandidates = async () => {
                // Every workspace in the store is listed; the picker owns the
                // current-workspace/all-workspaces scope split over the whole set.
                const records = await listQuery.listSessions(scanAbort.signal);
                if (scanStale())
                    return;
                // Rows need only metadata, an mtime, and a title — resolved without
                // whole-log reads when the projection cache is mounted. A corrupt
                // neighbor degrades to one disabled row.
                const [titles, activity] = await Promise.all([
                    resolveTitles(listQuery, records, scanAbort.signal),
                    Promise.all(records.map(record => lastActivityAt(record))),
                ]);
                const candidates = records.map((record, index) => {
                    const resolution = titles[index];
                    return 'failure' in resolution
                        ? unreadableCandidate(record, activity[index], resolution.failure)
                        : summarize(record, resolution.title, activity[index]);
                });
                candidates.sort((a, b) => b.lastActivityAt - a.lastActivityAt
                    || a.record.header.id.localeCompare(b.record.header.id));
                if (scanStale())
                    return;
                scanned = candidates;
                picker?.setCandidates(candidates);
                deps.requestRender();
            };
            // One catch covers listing, titles, and mtimes, so a scan failure
            // cannot strand the overlay on its loading placeholder; an aborted
            // scan's rejection stays silent because the user already dismissed the
            // picker.
            void scanCandidates().catch((error) => {
                if (scanStale())
                    return;
                void session.close();
                deps.appendNotice(`Resume session scan failed: ${errorChain(error)}`, 'error');
            });
        },
    };
}
//# sourceMappingURL=resume.js.map