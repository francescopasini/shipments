// Profile — shared by both sides, adapting to the active persona's role.

import { h, append } from '../ui/el.js';
import { icon } from '../ui/icons.js';
import {
  card, tile, btn, avatar, badge, empty, sectionHead, input, field, toast,
} from '../ui/components.js';
import { navigate } from '../router.js';
import * as store from '../store.js';
import { BO_ROLE_META } from '../domain/constants.js';
import { sitesForUser, getTrial, openTasksFor, getSite, byCode } from '../domain/selectors.js';

export function render(main) {
  const db = store.getDb();
  const user = store.currentUser();
  const isFo = user.role === 'FO';
  const roleLine = isFo
    ? 'Site coordinator'
    : user.boRoles.map((r) => BO_ROLE_META[r].label).join(' · ');

  append(main, [
    sectionHead('Profile', roleLine),

    h('div', { class: 'bento' },
      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' },
          avatar(user.name, 'lg'),
          h('div', {},
            h('div', { class: 'card__title' }, user.name),
            h('div', { class: 'small dim' }, user.email))),
        h('div', { class: 'kv' },
          h('span', { class: 'kv__k' }, 'Role'),
          h('span', { class: 'kv__v' }, roleLine),
          h('span', { class: 'kv__k' }, isFo ? 'Sites' : 'Open tasks'),
          h('span', { class: 'kv__v' },
            isFo ? String(user.siteIds.length) : String(openTasksFor(db, user.id).length))),
        h('p', { class: 'small muted' },
          'This prototype has no login — use the persona switcher in the sidebar to '
          + 'see the app as somebody else.'))),

      h('div', { class: 'col-7' }, passwordCard()),

      isFo
        ? h('div', { class: 'col-12' }, card({},
          h('div', { class: 'row' }, tile('building', 'sage'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Sites you can access'),
              h('div', { class: 'small dim' }, 'Switch between them from the sidebar'))),
          h('div', { class: 'stack-sm' }, ...sitesForUser(db, user).map((site) => {
            const trial = getTrial(db, site.trialId);
            return h('button', {
              type: 'button',
              class: 'card card--tight card--action',
              onClick: () => {
                store.setCurrentSite(site.id);
                navigate('/fo/dashboard');
                toast(`Switched to ${site.code}.`);
              },
            },
            h('div', { class: 'row' },
              h('span', { class: 'tile tile--sage tile--sm' }, icon('building', 17)),
              h('div', { class: 'grow', style: { minWidth: 0 } },
                h('div', { class: 'strong truncate' }, `${site.code} · ${site.name}`),
                h('div', { class: 'small dim truncate' },
                  `${site.address.city}${trial ? ` · ${trial.code}` : ''}`)),
              site.id === db.currentSiteId ? badge('Current', 'sage') : null));
          }))))
        : h('div', { class: 'col-12' }, card({},
          h('div', { class: 'row' }, tile('building', 'butter'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Sites you coordinate'),
              h('div', { class: 'small dim' }, 'Shipments from these sites land in your task list'))),
          coordinatedSites(db, user))),
    ),
  ]);
}

function coordinatedSites(db, user) {
  const sites = byCode(db.sites.filter((s) => s.shippingCoordinatorId === user.id));
  if (!sites.length) return empty('You are not the shipping coordinator for any site.', 'building');
  return h('div', { class: 'stack-sm' }, ...sites.map((site) => h('button', {
    type: 'button',
    class: 'card card--tight card--action',
    onClick: () => navigate(`/bo/sites/${site.id}`),
  },
  h('div', { class: 'row' },
    h('span', { class: 'tile tile--butter tile--sm' }, icon('building', 17)),
    h('div', { class: 'grow', style: { minWidth: 0 } },
      h('div', { class: 'strong truncate' }, `${site.code} · ${site.address.city}`),
      h('div', { class: 'small dim truncate' },
        site.requiresPfiApproval ? 'PFI approval required' : 'No PFI approval')),
    badge(site.active ? 'Active' : 'Inactive', site.active ? 'sage' : 'rose')))));
}

/**
 * Mock password change. Nothing is stored as a credential — the form validates
 * and confirms, which is all a prototype should do.
 */
function passwordCard() {
  const current = input({ type: 'password', autocomplete: 'current-password', placeholder: '••••••••' });
  const next = input({ type: 'password', autocomplete: 'new-password', placeholder: 'At least 8 characters' });
  const repeat = input({ type: 'password', autocomplete: 'new-password', placeholder: 'Repeat it' });
  const hint = h('p', { class: 'small dim' },
    'Passwords are not stored in this prototype — the form only checks the rules.');

  const submit = () => {
    const problems = [];
    if (!current.value) problems.push('Enter your current password.');
    if (next.value.length < 8) problems.push('The new password needs at least 8 characters.');
    if (next.value !== repeat.value) problems.push('The two new passwords do not match.');

    if (problems.length) {
      hint.className = 'small';
      hint.style.color = 'var(--clay-rose-ink)';
      hint.textContent = problems[0];
      return;
    }
    hint.className = 'small dim';
    hint.style.color = '';
    hint.textContent = 'Passwords are not stored in this prototype — the form only checks the rules.';
    current.value = '';
    next.value = '';
    repeat.value = '';
    toast('Password updated.');
  };

  return card({},
    h('div', { class: 'row' }, tile('lock', 'lilac'),
      h('div', { class: 'card__title' }, 'Change password')),
    h('div', { class: 'bento' },
      h('div', { class: 'col-4' }, field('Current password', current)),
      h('div', { class: 'col-4' }, field('New password', next)),
      h('div', { class: 'col-4' }, field('Confirm new password', repeat))),
    hint,
    h('div', { class: 'row' },
      btn('Update password', { variant: 'primary', iconName: 'lock', onClick: submit })));
}

export { getSite };
