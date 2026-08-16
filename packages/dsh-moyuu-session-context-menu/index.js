/**
 * dsh-moyuu-session-context-menu — node half.
 *
 * Pure UI plugin: the empty apply exists so the plugin appears in the host
 * cordis.yml / Loader as an activatable entry; the actual behavior runs in
 * the browser via exports["./client"], discovered through the package.json
 * dsh.client declaration (see dsh-client-modules).
 */
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}

export { apply };
