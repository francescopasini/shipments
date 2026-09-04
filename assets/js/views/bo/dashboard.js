// BO home — bento analytics across every shipment plus the central deposit.

import { h, append, fmtInt } from '../../ui/el.js';
import { icon } from '../../ui/icons.js';
import { card, tile, btn, metric, meter, empty, sectionHead } from '../../ui/components.js';
import { areaChart, statusBars } from '../../ui/charts.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { CENTRAL, TRANSIT, totalAt } from '../../domain/stock.js';
import {
  allShipments, openShipments, statusBreakdown, unitsIn, openTasksFor,
  lowDepositItems,
} from '../../domain/selectors.js';
import { shipmentCard } from '../common.js';

export function render(main) {
  const db = store.getDb();
  const user = store.currentUser();

  const shipments = allShipments(db);
  const open = openShipments(db);
  const inTransit = totalAt(db, TRANSIT);
  const central = totalAt(db, CENTRAL);
  const myTasks = openTasksFor(db, user.id);
  const lowItems = lowDepositItems(db, 4);
  const activeSites = db.sites.filter((s) => s.active).length;

  // A shipment awaiting PFI approval is the one state where the deposit is blocked.
  const awaiting = open.filter((s) => s.status === 'AWAITING_PFI_APPROVAL');

  append(main, [
    sectionHead('Deposit overview',
      `${activeSites} active sites · ${db.trials.length} trials`,
      btn('My tasks', {
        variant: myTasks.length ? 'primary' : 'ghost',
        iconName: 'clipboard',
        onClick: () => navigate('/bo/tasks'),
      })),

    h('div', { class: 'bento' },
      h('div', { class: 'col-3' }, metric(
        fmtInt(open.length), 'Shipments in flight',
        `${fmtInt(shipments.length)} raised in total`, 'box', 'sky',
      )),
      h('div', { class: 'col-3' }, metric(
        fmtInt(myTasks.length), 'Tasks assigned to you',
        myTasks.length ? 'Waiting on your action' : 'Nothing outstanding', 'clipboard',
        myTasks.length ? 'butter' : 'sage',
      )),
      h('div', { class: 'col-3' }, metric(
        fmtInt(central), 'Units in the deposit',
        'Across every catalogue item', 'warehouse', 'sage',
      )),
      h('div', { class: 'col-3' }, metric(
        fmtInt(inTransit), 'Units in transit',
        `${fmtInt(open.reduce((s, x) => s + unitsIn(x), 0))} committed`, 'truck', 'lilac',
      )),

      // --- the deposit stock trend ---
      h('div', { class: 'col-8' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' },
            tile('chart', 'sky'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Central deposit stock over time'),
              h('div', { class: 'small dim' }, 'Total units held, last 90 days'))),
          h('div', { class: 'right' },
            h('div', { class: 'card__metric' }, fmtInt(central)),
            h('div', { class: 'small dim' }, 'units today'))),
        areaChart(db.depositHistory))),

      h('div', { class: 'col-4' }, card({},
        h('div', { class: 'row' },
          tile('chart', 'lilac'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Shipments by status'),
            h('div', { class: 'small dim' }, 'Every site, every trial'))),
        statusBars(statusBreakdown(shipments).map((s) => ({
          label: s.label,
          value: s.value,
          tone: s.tone,
          onClick: () => navigate('/bo/shipments'),
        }))))),

      // --- thin cover in the deposit ---
      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' },
          tile('warehouse', lowItems.length ? 'rose' : 'sage'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Thinnest cover'),
            h('div', { class: 'small dim' }, 'Deposit stock against total site allocation'))),
        lowItems.length
          ? h('div', { class: 'stack-sm' }, ...lowItems.map((r) => h('div', { class: 'stack-sm' },
            h('div', { class: 'row-between' },
              h('div', { class: 'row' },
                h('span', { class: `tile tile--${r.item.tone} tile--sm` }, icon(r.item.icon, 15)),
                h('span', { class: 'small truncate' }, r.item.name)),
              h('span', { class: 'small strong tnum nowrap' },
                `${fmtInt(r.held)} / ${fmtInt(r.need)}`)),
            meter(Math.min(1, r.ratio)))))
          : empty('Every item has comfortable cover.', 'check'),
        btn('Open the stock matrix', {
          variant: 'ghost', size: 'sm', onClick: () => navigate('/bo/stock'),
        }))),

      // --- blocked on approval ---
      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' },
            tile('seal', awaiting.length ? 'butter' : 'sage'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Waiting on PFI approval'),
              h('div', { class: 'small dim' }, 'These cannot move until an approver decides'))),
          btn('All shipments', {
            variant: 'ghost', size: 'sm', onClick: () => navigate('/bo/shipments'),
          })),
        awaiting.length
          ? h('div', { class: 'stack-sm' }, ...awaiting.slice(0, 3).map((s) => shipmentCard(
            db, s, () => navigate(`/bo/shipments/${s.id}`), { showSite: true },
          )))
          : empty('Nothing is blocked on an approval right now.', 'check'))),
    ),
  ]);
}
