//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-tui`.
* @module @deepseek-ai/dsh-tui/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-tui";
/** Cordis companion plugin name. */
const name = "tui-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: this presentation adapter owns no durable package-local event stream;
* boundary and replay tests cover its protocol mapping.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
