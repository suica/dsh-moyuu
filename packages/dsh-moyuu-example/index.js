/**
 * dsh-moyuu-example — node half.
 *
 * Example feature package proving "one feature = one package, independently
 * loadable". Pure client feature: the empty apply exists so the package shows
 * up as an activatable Loader entry (a row in cordis.patch.yml); the actual
 * behavior runs in the browser via exports["./client"] (dsh.client manifest).
 */
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}

export { apply };
