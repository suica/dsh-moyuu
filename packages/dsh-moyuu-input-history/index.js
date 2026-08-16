/**
 * dsh-moyuu-input-history — node half.
 *
 * Pure client feature: the empty apply exists so the package shows up as an
 * activatable Loader entry (a row in cordis.patch.yml); the actual composer
 * history behavior runs in the browser via exports["./client"] (dsh.client
 * manifest, see dsh-client-modules).
 */
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}

export { apply };
