// The two sidebars, as data. Shared so the page head can label itself with the
// same artwork the navigation uses — the icon beside a title is the one the
// user just clicked to get there, and neither list can drift from the other.

export const FO_SECTIONS = [
  { path: '/fo/dashboard', label: 'Dashboard', icon: 'home' },
  { path: '/fo/shipments', label: 'Shipments', icon: 'box' },
  { path: '/fo/stock', label: 'Stock', icon: 'warehouse' },
  { path: '/fo/notifications', label: 'Notifications', icon: 'bell' },
  { path: '/fo/site', label: 'Site', icon: 'building' },
  // Reached from the persona switcher rather than the nav — it is about who you
  // are, not a place in the app. Listed here so the page still knows its icon.
  { path: '/fo/profile', label: 'Profile', icon: 'user', offNav: true },
];

export const BO_SECTIONS = [
  { path: '/bo/dashboard', label: 'Dashboard', icon: 'home' },
  { path: '/bo/tasks', label: 'Tasks', icon: 'clipboard' },
  { path: '/bo/shipments', label: 'Shipments', icon: 'box' },
  { path: '/bo/stock', label: 'Stock', icon: 'grid' },
  { path: '/bo/sites', label: 'Sites', icon: 'building' },
  { path: '/bo/trials', label: 'Trials', icon: 'flask' },
  { path: '/bo/profile', label: 'Profile', icon: 'user', offNav: true },
];

const ALL = [...FO_SECTIONS, ...BO_SECTIONS];

/** The sections that get a sidebar link — everything not reached another way. */
export const navSections = (sections) => sections.filter((s) => !s.offNav);

/** Where the current user's own profile lives. */
export const profilePath = (user) => (user && user.role === 'FO' ? '/fo/profile' : '/bo/profile');

/**
 * The icon for whichever section `path` sits in, or null off the nav entirely.
 * Longest match wins, so a detail route like `/bo/sites/site-1` still resolves
 * to Sites rather than to a shorter prefix.
 */
export function sectionIcon(path) {
  const match = ALL
    .filter((s) => path === s.path || path.startsWith(`${s.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return match ? match.icon : null;
}
