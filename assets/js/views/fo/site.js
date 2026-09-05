// FO site profile — address, who handles the site, and its allocations.

import { h, append, fmtInt } from '../../ui/el.js';
import { card, tile, avatar, meter, empty, sectionHead, badge } from '../../ui/components.js';
import * as store from '../../store.js';
import {
  getTrial, coordinatorsForSite, userName, siteStockRows, siteStudyWeek,
  cadencesForTrial, countryName,
} from '../../domain/selectors.js';

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const trial = getTrial(db, site.trialId);
  const peers = coordinatorsForSite(db, site.id);
  const rows = siteStockRows(db, site);
  const cadences = cadencesForTrial(db, site.trialId);
  const week = siteStudyWeek(site);

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
          h('span', { class: 'kv__v' }, site.code)))),

      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row' }, tile('flask'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Trial'),
            h('div', { class: 'small dim' }, trial ? trial.sponsor : ''))),
        h('div', { class: 'kv' },
          h('span', { class: 'kv__k' }, 'Trial'),
          h('span', { class: 'kv__v' }, trial ? `${trial.code} — ${trial.name}` : '—'),
          h('span', { class: 'kv__k' }, 'Phase'),
          h('span', { class: 'kv__v' }, trial ? trial.phase : '—'),
          h('span', { class: 'kv__k' }, 'Study week'),
          h('span', { class: 'kv__v' }, `Week ${week}`),
          h('span', { class: 'kv__k' }, 'PFI approval'),
          h('span', { class: 'kv__v' },
            site.requiresPfiApproval ? 'Required before preparation' : 'Not required')),
        h('hr', { class: 'divider' }),
        h('span', { class: 'card__label' }, `Cadences · ${cadences.length}`),
        h('div', { class: 'row-wrap' }, ...cadences.map((c) => h('span', { class: 'badge badge--quiet' },
          h('span', { class: 'badge__dot' }), `${c.name} · wk ${c.week}`))))),

      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' }, tile('users'),
          h('div', { class: 'card__title' }, 'People')),
        h('div', { class: 'stack-sm' },
          h('span', { class: 'card__label' }, 'Shipping coordinator (deposit)'),
          h('div', { class: 'row' },
            avatar(userName(db, site.shippingCoordinatorId)),
            h('div', {},
              h('div', { class: 'strong' }, userName(db, site.shippingCoordinatorId)),
              h('div', { class: 'small dim' }, 'Back office'))),
          h('hr', { class: 'divider' }),
          h('span', { class: 'card__label' }, `Site coordinators · ${peers.length}`),
          ...peers.map((p) => h('div', { class: 'row' },
            avatar(p.name),
            h('div', { class: 'grow', style: { minWidth: 0 } },
              h('div', { class: 'strong truncate' }, p.name),
              h('div', { class: 'small dim truncate' }, p.email)),
            p.id === db.currentUserId ? badge('You', 'sage') : null))))),

      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row' }, tile('warehouse'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Allocated items'),
            h('div', { class: 'small dim' }, 'The most this site may hold of each item'))),
        rows.length
          ? h('div', { class: 'stack-sm' }, ...rows.map((r) => h('div', { class: 'stack-sm' },
            h('div', { class: 'row-between' },
              h('span', { class: 'small truncate' }, r.item.name),
              h('span', { class: 'small strong tnum nowrap' },
                `${fmtInt(r.held)} / ${fmtInt(r.target)}`)),
            meter(r.ratio))))
          : empty('No allocations set for this site.', 'warehouse'))),
    ),
  ]);
}
