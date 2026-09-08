// BO home — how the deposit's shipments are distributed across the workflow,
// and which items need attention before that workflow runs into them.

import { h, append } from '../../ui/el.js';
import {
  actionCard, tile, empty, sectionHead,
} from '../../ui/components.js';
import { icon } from '../../ui/icons.js';
import { statusBars } from '../../ui/charts.js';
import { stockRows } from '../../domain/stock.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { allShipments, openShipments, statusBreakdown, openTasksFor } from '../../domain/selectors.js';
import { coordinatorForShipment } from '../../domain/workflow.js';
import { showStatus, showMine } from './shipments.js';
import { stockTable } from './stock.js';

export function render(main) {
  const db = store.getDb();
  const user = store.currentUser();
  const shipments = allShipments(db);
  const myTasks = openTasksFor(db, user.id);
  const lowStock = stockRows(db).filter((row) => row.low);

  // "Mine" reads off the site-trial pairing, not the shipment or the site
  // directly — coordination is assigned per pairing, so the same hospital can
  // belong to a colleague on its other trial.
  const myOpenShipments = openShipments(db)
    .filter((s) => coordinatorForShipment(db, s) === user.id).length;
  const mySites = new Set(db.siteTrials
    .filter((st) => st.shippingCoordinatorId === user.id)
    .map((st) => st.siteId)).size;
  const myTrials = new Set(db.siteTrials
    .filter((st) => st.shippingCoordinatorId === user.id)
    .map((st) => st.trialId)).size;

  append(main, [
    sectionHead('Dashboard'),

    h('div', { class: 'bento' },
      h('div', { class: 'col-3' }, recap({
        iconName: 'clipboard',
        label: 'My tasks',
        sub: 'Open tasks assigned to you',
        count: myTasks.length,
        onClick: () => navigate('/bo/tasks'),
      })),
      h('div', { class: 'col-3' }, recap({
        iconName: 'box',
        label: 'My open shipments',
        sub: 'Not yet delivered',
        count: myOpenShipments,
        onClick: () => { showMine(); navigate('/bo/shipments'); },
      })),
      h('div', { class: 'col-3' }, recap({
        iconName: 'building',
        label: 'My sites',
        sub: 'Hospitals you coordinate for',
        count: mySites,
        onClick: () => navigate('/bo/sites'),
      })),
      h('div', { class: 'col-3' }, recap({
        iconName: 'flask',
        label: 'My trials',
        sub: 'Trials you coordinate for',
        count: myTrials,
        onClick: () => navigate('/bo/trials'),
      })),

      h('div', { class: 'col-12' }, actionCard({
        onClick: () => { showStatus('ALL'); navigate('/bo/shipments'); },
      },
        h('div', { class: 'row-between' },
          h('div', { class: 'row' },
            // The section's own icon: the card is a way into the shipment list,
            // so it wears the same mark the list does.
            tile('box'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Shipments by status'),
              h('div', { class: 'small dim' }, 'Every site, every trial'))),
          icon('arrowRight', 17)),
        // Every bar opens the list on exactly what it counted: the breakdown is a
        // way into the shipments, not a number to look at and leave. Each bar
        // stops its click from also triggering the card's own "view all".
        statusBars(statusBreakdown(shipments).map((s) => ({
          label: s.label,
          value: s.value,
          tone: s.tone,
          onClick: (e) => { e.stopPropagation(); showStatus(s.status); navigate('/bo/shipments'); },
        }))))),

      // Same table the stock page itself uses — Item / Central deposit / In
      // transit / All sites / Target — narrowed here to the rows that are
      // actually running short, so the numbers read the same wherever they show up.
      h('div', { class: 'col-12' }, actionCard({ onClick: () => navigate('/bo/stock') },
        h('div', { class: 'row-between' },
          h('div', { class: 'row' }, tile('grid'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Low stock'),
              h('div', { class: 'small dim' }, 'Central deposit against every site’s demand'))),
          icon('arrowRight', 17)),
        lowStock.length
          ? stockTable(lowStock, { selectedLabel: 'All sites' })
          : empty('Nothing is low on stock right now.', 'check'))),
    ),
  ]);
}

/**
 * A count that hands over to its own section, in the same shape the site page
 * already uses for the same idea: label and subtitle beside the icon, a bare
 * arrow at top right, the number on its own line below.
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
