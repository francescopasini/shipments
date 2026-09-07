// Section filter registry.
//
// Filters live inside the view that owns them, but the sidebar has to be able to
// clear them: reaching a section from the main menu should always show the whole
// section, while arriving from a link that deliberately narrowed it (a site's
// "6 shipments", say) must keep that narrowing. The nav cannot import every view
// to do that, so each view leaves its reset here and the nav calls it by path.

const resets = new Map();

/** Views call this once, at module load. */
export function onSection(path, reset) {
  resets.set(path, reset);
}

/** The sidebar calls this just before navigating to `path`. */
export function resetSection(path) {
  const reset = resets.get(path);
  if (reset) reset();
}
