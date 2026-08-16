/**
 * dsh-moyuu-cmdk-new-session — node half.
 *
 * Pure UI feature: the empty apply exists so the package shows up as an
 * activatable Loader entry (a row in cordis.patch.yml); the actual behavior
 * runs in the browser via exports["./client"] (dsh.client manifest, see
 * dsh-client-modules).
 *
 * The shortcut reuses the same "New Session" action the sidebar button calls
 * (ctx.workspaces.startSession), so it needs the client runtime to be loaded
 * first — declared in package.json `dsh.client.inject`.
 */
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}

export { apply };
