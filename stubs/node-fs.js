// Browser stub for Node.js 'fs' module.
// @tevm/node imports fs at the module level but only uses it for disk-persisted
// checkpoints, a code path that never runs in the browser.
export const existsSync = () => false;
export const readFileSync = () => "";
export default { existsSync, readFileSync };
