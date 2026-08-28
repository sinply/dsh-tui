/**
 * Shared collaborator surface every chat-channel sub-controller receives from
 * `createTuiChat`. Each controller's own `*Deps` extends {@link ChatChannelDeps}
 * (and {@link ChannelNotice} when it reports outcomes) with the extra services
 * it needs. Value collaborators (`ctx`, `resolved`, `palette`, `overlayManager`)
 * are stable for the channel's life; the callbacks stay on the object so a
 * controller always calls the channel's current implementation.
 * @module @deepseek-ai/dsh-tui/chat/channel
 */
export {};
//# sourceMappingURL=channel.js.map