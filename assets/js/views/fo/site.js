// FO site profile — address, the trials running here, and who handles them.

import { h, append } from '../../ui/el.js';
import { card, tile, avatar, empty, sectionHead, badge } from '../../ui/components.js';
import * as store from '../../store.js';
import {
  getTrial, coordinatorsForSite, userName, siteStudyWeek,
  cadencesForTrial, countryName, siteTrialsForSite,
} from '../../domain/selectors.js';

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const peers = coordinatorsForSite(db, site.id);
  const siteTrials = siteTrialsForSite(db, site.id);

  append(main, [
    sectionHead(site.name, `${site.code} · ${site.address.city}, ${countryName(site.address.country)}`),

    h('div', { class: 'bento' },
      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' }, tile('pin'),
            h('div', { class: 'card__title' }, 'Address')),
          badge(site.active ? 'Active' : 'Inactive', site.active ? 'sage' : 'rose')),
        h('div', { class: 'kv' },
          h('span', { class: 'kv__k' }, 'Street'),
          h('span', { class: 'kv__v' }, site.address.street),
          h('span', { class: 'kv__k' }, 'City'),
          h('span', { class: 'kv__v' }, `${site.address.postalCode} ${site.address.city}`),
          h('span', { class: 'kv__k' }, 'Country'),
          h('span', { class: 'kv__v' }, countryName(site.address.country)),
          h('span', { class: 'kv__k' }, 'Site code'),
          h('span', { class: 'kv__v' }, site.code),
          // Customs-driven, so it applies to everything leaving the deposit for
          // this site, whichever study it belongs to.
          h('span', { class: 'kv__k' }, 'PFI approval'),
          h('span', { class: 'kv__v' },
            site.requiresPfiApproval ? 'Required before preparation' : 'Not required')))),

      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row' }, tile('users'),
          h('div', { class: 'card__title' }, 'Site coordinators')),
        peers.length
          ? h('div', { class: 'stack-sm' }, ...peers.map((p) => h('div', { class: 'row' },
            avatar(p.name),
            h('div', { class: 'grow', style: { minWidth: 0 } },
              h('div', { class: 'strong truncate' }, p.name),
              h('div', { class: 'small dim truncate' }, p.email)),
            p.id === db.currentUserId ? badge('You', 'sage') : null)))
          : empty('Nobody is assigned to this site.', 'users'))),

      // One card per study running here. Each carries its own study week,
      // cadences and deposit coordinator.
      ...siteTrials.map((st) => h('div', { class: 'col-6' }, trialCard(db, st))),

      siteTrials.length
        ? null
        : h('div', { class: 'col-12' }, card({},
          empty('This site is not running any trial yet.', 'flask'))),
    ),
  ]);
}

function trialCard(db, siteTrial) {
  const trial = getTrial(db, siteTrial.trialId);
  const cadences = cadencesForTrial(db, siteTrial.trialId);
  const week = siteStudyWeek(siteTrial);

  return card({},
    h('div', { class: 'row' }, tile('flask'),
      h('div', {},
        h('div', { class: 'card__title' }, trial ? trial.code : '—'),
        h('div', { class: 'small dim' }, trial ? trial.sponsor : ''))),
    h('div', { class: 'kv' },
      h('span', { class: 'kv__k' }, 'Trial'),
      h('span', { class: 'kv__v' }, trial ? trial.name : '—'),
      h('span', { class: 'kv__k' }, 'Phase'),
      h('span', { class: 'kv__v' }, trial ? trial.phase : '—'),
      h('span', { class: 'kv__k' }, 'Study week'),
      h('span', { class: 'kv__v' }, `Week ${week}`),
      h('span', { class: 'kv__k' }, 'Deposit coordinator'),
      h('span', { class: 'kv__v' }, userName(db, siteTrial.shippingCoordinatorId))),
    h('hr', { class: 'divider' }),
    h('span', { class: 'card__label' }, `Cadences · ${cadences.length}`),
    cadences.length
      ? h('div', { class: 'row-wrap' }, ...cadences.map((c) => h('span', { class: 'badge badge--quiet' },
        h('span', { class: 'badge__dot' }), `${c.name} · wk ${c.week}`)))
      : h('p', { class: 'small dim' }, 'No cadences configured.'));
}
