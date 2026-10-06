// The plugin is its own package: this stops vitest from picking up the repository's root config (which needs the root's
// node_modules, absent in the plugin's CI job).
export default {};
