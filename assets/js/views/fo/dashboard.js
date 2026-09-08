// FO home — quick counts for the site, and where every trial's cadences stand:
// what is already here, and what is still coming.
//
// The stock chart answers the only question this page needs to — is anything
// about to run out, and is more already coming. How much more the site is
// still allowed to order is a different question, and the request dialog
// answers it at the moment it matters.

import { h, append } from '../../ui/el.js';
import {
  card, actionCard, tile, btn, empty, sectionHead,
} from '../../ui/components.js';
import { icon } from '../../ui/icons.js';
import { cadenceStockBars } from '../../ui/charts.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { openRequestDialog } from './shipments.js';
import {
  siteTrialsForSite, cadencesForTrial, cadencePosition, getTrial,
  shipmentsForSite, unreadCount,
} from '../../domain/selectors.js';

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const siteTrials = siteTrialsForSite(db, site.id);
  const openCount = shipmentsForSite(db, site.id).filter((s) => s.status !== 'DELIVERED').length;
  const notifCount = unreadCount(db, site.id);

  append(main, [
    sectionHead(
      'Dashboard',
      null,
      btn('Request a shipment', {
        variant: 'primary', iconName: 'plus', onClick: () => openRequestDialog(),
      }),
    ),

    h('div', { class: 'bento' },
      h('div', { class: 'col-6' }, recap({
        iconName: 'bell',
        label: 'Notifications',
        sub: 'Unread updates on your shipments',
        count: notifCount,
        onClick: () => navigate('/fo/notifications'),
      })),
      h('div', { class: 'col-6' }, recap({
        iconName: 'box',
        label: 'Open shipments',
        sub: 'Not yet delivered',
        count: openCount,
        onClick: () => navigate('/fo/shipments'),
      })),
      h('div', { class: 'col-12' }, stockByCadenceCard(db, siteTrials))),
  ]);
}

/**
 * Every cadence across every trial the site runs, in one chart — a site
 * running two studies still needs to tell their cadences apart, so each bar
 * names its trial as well as its cadence, rather than splitting into one
 * chart per trial.
 */
function stockByCadenceCard(db, siteTrials) {
  const rows = siteTrials.flatMap((st) => {
    const trial = getTrial(db, st.trialId);
    return cadencesForTrial(db, st.trialId).map((cadence) => {
      const at = cadencePosition(db, st, cadence);
      return {
        trial: trial ? trial.code : '—',
        label: cadence.name,
        week: cadence.week,
        stock: at.onSite,
        transit: at.inTransit,
      };
    });
  });

  return actionCard({ onClick: () => navigate('/fo/stock') },
    h('div', { class: 'row-between' },
      h('div', { class: 'row' }, tile('warehouse'),
        h('div', {},
          h('div', { class: 'card__title' }, 'Stock by cadence'),
          h('div', { class: 'small dim' }, 'Every trial running at this site'))),
      icon('arrowRight', 17)),

    rows.length
      ? h('div', { class: 'stack-sm' },
        h('div', { class: 'legend' },
          h('span', { class: 'legend__item' },
            h('span', { class: 'legend__swatch legend__swatch--sage' }),
            h('span', {}, 'In stock')),
          h('span', { class: 'legend__item' },
            h('span', { class: 'legend__swatch legend__swatch--butter' }),
            h('span', {}, 'On the way'))),
        cadenceStockBars(rows, { height: 200 }))
      : empty('This site is not running any trial yet.', 'flask'));
}

/**
 * A count that hands over to its own section — label and subtitle beside the
 * icon, a bare arrow at top right, the number on its own line below. Same
 * shape as the back office's dashboard recap cards.
 */
function recap({ iconName, label, sub, count, onClick }) {
  return actionCard({ variant: 'card--tight', onClick },
    h('div', { class: 'row-between' },
      h('div', { class: 'row' }, tile(iconName, 'sm'),
        h('div', {},
          h('div', { class: 'card__label' }, label),
          h('div', { class: 'small dim' }, sub))),
      icon('arrowRight', 17)),
    h('div', { class: 'card__metric' }, count));
}
