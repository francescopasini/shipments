// FO shipment detail — read-only. The site raises requests; the deposit acts on them.

import { h, append } from '../../ui/el.js';
import { card, tile, btn, iconBtn, empty } from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { getPfi } from '../../domain/workflow.js';
import { getSite, userName } from '../../domain/selectors.js';
import { shipmentHeader, linesTable, pfiPanel, shipmentTimeline } from '../common.js';

export function render(main, params) {
  const db = store.getDb();
  const shipment = db.shipments.find((s) => s.id === params.id);

  if (!shipment) {
    append(main, [card({}, empty('That shipment no longer exists.', 'box',
      btn('Back to shipments', { variant: 'primary', onClick: () => navigate('/fo/shipments') })))]);
    return;
  }

  const site = getSite(db, shipment.siteId);
  const pfi = getPfi(db, shipment);
  const back = iconBtn('arrowRight', {
    variant: 'ghost',
    'aria-label': 'Back to shipments',
    class: 'flip',
    onClick: () => navigate('/fo/shipments'),
  });

  append(main, [
    shipmentHeader(db, shipment, back),

    h('div', { class: 'bento' },
      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row' }, tile('box'),
          h('div', { class: 'card__title' }, 'Requested items')),
        linesTable(db, shipment.lines))),

      h('div', { class: 'col-5' }, shipmentTimeline(db, shipment)),

      h('div', { class: 'col-7' },
        pfi && pfi.status !== 'NOT_REQUIRED'
          ? pfiPanel(db, pfi)
          : card({},
            h('div', { class: 'row' }, tile('seal'),
              h('div', {},
                h('div', { class: 'card__title' }, 'Proforma invoice'),
                h('div', { class: 'small dim' }, 'Not required for this site'))),
            h('p', { class: 'small muted' },
              `${site.code} ships without PFI approval, so the deposit can prepare this `
              + 'shipment as soon as it is picked up.'))),

      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' }, tile('user'),
          h('div', { class: 'card__title' }, 'Who is handling this')),
        h('div', { class: 'kv' },
          h('span', { class: 'kv__k' }, 'Requested by'),
          h('span', { class: 'kv__v' }, userName(db, shipment.requestedById)),
          h('span', { class: 'kv__k' }, 'Shipping coordinator'),
          h('span', { class: 'kv__v' }, userName(db, site.shippingCoordinatorId)),
          pfi && pfi.approverId ? h('span', { class: 'kv__k' }, 'PFI approver') : null,
          pfi && pfi.approverId ? h('span', { class: 'kv__v' }, userName(db, pfi.approverId)) : null),
        h('p', { class: 'small muted' },
          'Status updates arrive in your notifications as the deposit moves this along.'))),
    ),
  ]);
}
