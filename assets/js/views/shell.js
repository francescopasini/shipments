// App frame: themed sidebar, section nav, persona switcher, FO site switcher.

import { h, append, initials } from '../ui/el.js';
import { icon, iconImg } from '../ui/icons.js';
import {
  card, tile, btn, iconBtn, badge, avatar, dialog, confirmDialog, toast, empty,
} from '../ui/components.js';
import { navigate, currentPath } from '../router.js';
import * as store from '../store.js';
import { BO_ROLE_META } from '../domain/constants.js';
import { openTasksFor, unreadCount, sitesForUser, getTrial } from '../domain/selectors.js';

const FO_SECTIONS = [
  { path: '/fo/dashboard', label: 'Dashboard', icon: 'home' },
  { path: '/fo/shipments', label: 'Shipments', icon: 'box' },
  { path: '/fo/stock', label: 'Stock', icon: 'warehouse' },
  { path: '/fo/notifications', label: 'Notifications', icon: 'bell' },
  { path: '/fo/site', label: 'Site', icon: 'building' },
  { path: '/fo/profile', label: 'Profile', icon: 'user' },
];

const BO_SECTIONS = [
  { path: '/bo/dashboard', label: 'Dashboard', icon: 'home' },
  { path: '/bo/tasks', label: 'Tasks', icon: 'clipboard' },
  { path: '/bo/shipments', label: 'Shipments', icon: 'box' },
  { path: '/bo/stock', label: 'Stock', icon: 'grid' },
  { path: '/bo/sites', label: 'Sites', icon: 'building' },
  { path: '/bo/trials', label: 'Trials', icon: 'flask' },
  { path: '/bo/profile', label: 'Profile', icon: 'user' },
];

/** Renders the frame and returns the element the active view mounts into. */
export function renderShell(root) {
  const db = store.getDb();
  const user = store.currentUser();
  const side = user.role === 'FO' ? 'fo' : 'bo';
  const sections = side === 'fo' ? FO_SECTIONS : BO_SECTIONS;
  const path = currentPath();

  // Dialogs and toasts mount on <body>, outside .shell — put the theme class there
  // too so its scoped color/shadow variables reach them.
  document.body.classList.remove('theme-fo', 'theme-bo');
  document.body.classList.add(`theme-${side}`);

  const main = h('main', { class: 'main' });
  const shell = h('div', { class: `shell theme-${side}` },
    h('nav', { class: 'nav' },
      brand(side),
      side === 'fo' ? siteSwitcher(db, user) : null,
      h('div', { class: 'nav__group nav__group--sections' },
        h('span', { class: 'nav__label' }, side === 'fo' ? 'Site' : 'Deposit'),
        ...sections.map((s) => navLink(s, path, db, user, side))),
      h('div', { class: 'nav__spacer' }),
      personaCard(db, user)),
    main);

  root.replaceChildren(shell);
  return main;
}

function brand(side) {
  return h('div', { class: 'nav__brand' },
    brandMark(),
    h('div', {},
      h('div', { class: 'nav__brand-name' }, 'Shipments'),
      h('div', { class: 'nav__brand-sub' }, side === 'fo' ? 'Site front office' : 'Deposit back office')));
}

const navIcon = (name) => {
  const img = iconImg(name, 38);
  if (img) img.className = 'nav__icon';
  return img || icon(name, 22);
};

const brandMark = () => {
  const img = iconImg('truck', 92);
  if (img) img.className = 'nav__brand-mark';
  return img || icon('truck', 40);
};

function navLink(section, path, db, user, side) {
  const active = path === section.path || path.startsWith(`${section.path}/`);
  let count = 0;
  if (side === 'bo' && section.path === '/bo/tasks') count = openTasksFor(db, user.id).length;
  if (side === 'fo' && section.path === '/fo/notifications') count = unreadCount(db, db.currentSiteId);

  return h('button', {
    type: 'button',
    class: `nav__link${active ? ' is-active' : ''}`,
    onClick: () => navigate(section.path),
  },
  navIcon(section.icon),
  h('span', { class: 'grow truncate' }, section.label),
  count ? h('span', { class: 'nav__link-count' }, count) : null);
}

/* ---------- FO site switcher ---------- */

function siteSwitcher(db, user) {
  const site = store.currentSite();
  const options = sitesForUser(db, user);
  if (!site) return null;
  const trial = getTrial(db, site.trialId);

  return h('button', {
    type: 'button',
    class: 'card card--tight card--action site-switch',
    onClick: () => openSiteDialog(db, user),
    title: 'Switch site',
  },
  h('div', { class: 'row' },
    tile('building', 'sm'),
    h('div', { class: 'grow', style: { minWidth: 0 } },
      h('div', { class: 'strong truncate' }, site.code),
      h('div', { class: 'small dim truncate' }, site.address.city)),
    options.length > 1 ? icon('swap', 16) : null),
  h('div', { class: 'small dim truncate' }, trial ? trial.code : ''));
}

function openSiteDialog(db, user) {
  const options = sitesForUser(db, user);
  if (options.length <= 1) {
    toast('You only have access to this one site.', 'info');
    return;
  }
  dialog('Switch site', (close) => h('div', { class: 'stack-sm' },
    h('p', { class: 'muted small' }, 'You have access to the sites below.'),
    ...options.map((site) => {
      const trial = getTrial(db, site.trialId);
      const isCurrent = site.id === db.currentSiteId;
      return h('button', {
        type: 'button',
        class: 'card card--tight card--action',
        onClick: () => {
          close();
          store.setCurrentSite(site.id);
          navigate('/fo/dashboard');
          toast(`Switched to ${site.code} — ${site.name}`);
        },
      },
      h('div', { class: 'row' },
        h('div', { class: 'grow' },
          h('div', { class: 'strong' }, `${site.code} · ${site.name}`),
          h('div', { class: 'small dim' },
            `${site.address.city}, ${site.address.country} · ${trial ? trial.code : ''}`)),
        isCurrent ? badge('Current', 'sage') : icon('arrowRight', 17)));
    })), { narrow: true });
}

/* ---------- persona switcher ---------- */

function personaCard(db, user) {
  const roleLine = user.role === 'FO'
    ? 'Site coordinator'
    : user.boRoles.map((r) => BO_ROLE_META[r].label).join(' · ');

  return h('div', { class: 'stack-sm' },
    h('button', {
      type: 'button',
      class: 'card card--tight card--action',
      onClick: () => openPersonaDialog(db),
      title: 'Switch persona',
    },
    h('div', { class: 'row' },
      avatar(user.name),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { class: 'strong truncate' }, user.name),
        h('div', { class: 'small dim truncate' }, roleLine)),
      icon('swap', 16))),
    h('button', {
      type: 'button',
      class: 'btn btn--ghost btn--sm',
      onClick: () => confirmDialog(
        'Reset demo data?',
        'Every shipment, task and stock movement returns to the original seeded state. This cannot be undone.',
        'Reset data',
        () => {
          store.reset();
          navigate('/fo/dashboard');
          toast('Demo data reset.', 'info');
        },
        'stop',
      ),
    }, icon('refresh', 15), 'Reset demo data'));
}

function openPersonaDialog(db) {
  const foUsers = db.users.filter((u) => u.role === 'FO');
  const boUsers = db.users.filter((u) => u.role === 'BO');

  const row = (user) => {
    const isCurrent = user.id === db.currentUserId;
    const sub = user.role === 'FO'
      ? `${user.siteIds.length} site${user.siteIds.length === 1 ? '' : 's'}`
      : user.boRoles.map((r) => BO_ROLE_META[r].label).join(' · ');
    const openCount = user.role === 'BO' ? openTasksFor(db, user.id).length : 0;
    return h('button', {
      type: 'button',
      class: 'card card--tight card--action',
      onClick: () => {
        store.setCurrentUser(user.id);
        navigate(user.role === 'FO' ? '/fo/dashboard' : '/bo/dashboard');
        toast(`Now working as ${user.name}`);
      },
    },
    h('div', { class: 'row' },
      avatar(user.name),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { class: 'strong truncate' }, user.name),
        h('div', { class: 'small dim truncate' }, sub)),
      openCount ? badge(`${openCount} open`, 'butter') : null,
      isCurrent ? badge('Current', 'sage') : icon('arrowRight', 17)));
  };

  dialog('Switch persona', () => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      'This prototype has no login — pick anyone to see the app through their eyes.'),
    h('div', { class: 'stack-sm' },
      h('span', { class: 'card__label' }, 'Front office · site coordinators'),
      ...foUsers.map(row)),
    h('div', { class: 'stack-sm' },
      h('span', { class: 'card__label' }, 'Back office · deposit'),
      ...boUsers.map(row))));
}

/* ---------- fallback ---------- */

export function notFound(main) {
  append(main, [card({}, empty('That page does not exist.', 'search',
    btn('Go to dashboard', { variant: 'primary', onClick: () => navigate('/fo/dashboard') })))]);
}

export { initials };
