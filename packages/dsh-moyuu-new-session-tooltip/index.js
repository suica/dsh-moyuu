/**
 * dsh-moyuu-new-session-tooltip — node half.
 *
 * Pure UI feature: the empty apply exists so the package shows up as an
 * activatable Loader entry (a row in cordis.patch.yml); the actual behavior
 * runs in the browser via exports["./client"] (dsh.client manifest).
 *
 * The tooltip reuses only visual conventions of the built-in sidebar Tooltip
 * (same tokens, right side, vertical centering); it needs no host-side logic.
 */
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}

export { apply };