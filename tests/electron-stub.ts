// Minimal runtime stub for 'electron', which Obsidian's desktop renderer
// provides at runtime and the plugin never installs (it's external in the
// build). Aliased in vitest.config.ts; tests mock the parts they exercise.
export const remote = undefined;
