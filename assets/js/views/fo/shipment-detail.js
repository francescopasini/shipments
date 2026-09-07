// FO shipment detail. Mostly a read-only window onto what the deposit is doing;
// the exception is a request that has not been picked up yet, which the site may
// still resize or drop. That matters most for the shipments the app creates on
// the site's behalf when a cadence's week comes round.
//
// The proforma invoice is deliberately absent: it is the deposit's customs
// paperwork, not something the site prepares, reads or acts on.

import { h, append, fmtInt } from '../../ui/el.js';
import {
  card, tile, btn, iconBtn, empty, dialog, numberInput,
  toast, confirmDialog,
} from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import {
  coordinatorForShipment, isEditableBySite, changeShipmentCadences, cancelShipment,
} from '../../domain/workflow.js';
import {
  userName, getSiteTrial, requestableCadenceUnits, shipmentCadences,
} from '../../domain/selectors.js';
import { shipmentHeader, linesTable, shipmentTimeline } from '../common.js';

export function render(main, params) {
  const db = store.getDb();
  const shipment = db.shipments.find((s) => s.id === params.id);

  if (!shipment) {
    append(main, [card({}, empty('That shipment no longer exists.', 'box',
      btn('Back to shipments', { variant: 'primary', onClick: () => navigate('/fo/shipments') })))]);
    return;
  }

  const back = iconBtn('arrowRight', {
    variant: 'ghost',
    'aria-label': 'Back to shipments',
    class: 'flip',
    onClick: () => navigate('/fo/shipments'),
  });

  const carried = shipmentCadences(db, shipment);
  const editable = isEditableBySite(shipment);

  append(main, [
    shipmentHeader(db, shipment, back),

    // Automatic shipments are the one thing the site is expected to act on: they
    // appear without being asked for, so they say so and offer a way out.
    shipment.origin === 'AUTO' && editable
      ? card({ variant: 'card--tight card--sunken' },
        h('div', { class: 'row-between' },
          h('div', { class: 'row' },
            tile('calendar', 'sm'),
            h('div', { class: 'grow' },
              h('div', { class: 'strong' },
                `Created for you — ${carried.map((c) => c.cadence.name).join(', ') || 'a later cadence'}`),
              h('div', { class: 'small dim' },
                'It follows what you ordered earlier in this trial. Change the quantity or '
                + 'cancel it before the deposit picks it up.'))),
          h('span', { class: 'small dim nowrap' }, 'Automatic')),
        h('div', { class: 'row-wrap' },
          btn('Change quantity', {
            variant: 'primary', size: 'sm', iconName: 'edit',
            onClick: () => openQuantityDialog(shipment),
          }),
          btn('Cancel shipment', {
            variant: 'warn', size: 'sm', iconName: 'close',
            onClick: () => confirmCancel(shipment),
          })))
      : null,

    h('div', { class: 'bento' },
      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row' }, tile('box'),
          h('div', { class: 'card__title' }, 'Requested items')),
        linesTable(db, shipment.lines))),

      h('div', { class: 'col-5' }, shipmentTimeline(db, shipment)),

      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row' }, tile('user'),
          h('div', { class: 'card__title' }, 'Who is handling this')),
        h('div', { class: 'kv' },
          h('span', { class: 'kv__k' }, 'Requested by'),
          h('span', { class: 'kv__v' }, userName(db, shipment.requestedById)),
          h('span', { class: 'kv__k' }, 'Shipping coordinator'),
          h('span', { class: 'kv__v' }, userName(db, coordinatorForShipment(db, shipment)))),
        h('p', { class: 'small muted' },
          'Status updates arrive in your notifications as the deposit moves this along.'))),
    ),
  ]);
}

/** Cadences are ordered in multiples of five. */
const STEP = 5;

/** Resize a request: the site chooses how many of each cadence, never the items. */
function openQuantityDialog(shipment) {
  const db = store.getDb();
  const siteTrial = getSiteTrial(db, shipment.siteId, shipment.trialId);
  const carried = shipmentCadences(db, shipment);
  if (!siteTrial || !carried.length) return;

  const draft = new Map(carried.map((c) => [c.cadence.id, c.units]));

  const rows = carried.map((c) => {
    // This shipment's own share already counts against the ceiling, so add it
    // back to see how far it could grow — then round down to a whole five.
    const cap = Math.floor(
      (requestableCadenceUnits(db, siteTrial, c.cadence) + c.units) / STEP,
    ) * STEP;
    const control = numberInput({
      min: 0, max: cap, step: STEP, value: c.units,
      'aria-label': `Quantity of ${c.cadence.name}`,
      onChange: (e) => {
        const raw = Math.max(0, Math.round((Number(e.target.value) || 0) / STEP) * STEP);
        const clamped = Math.min(raw, cap);
        if (clamped !== Number(e.target.value)) e.target.value = clamped;
        draft.set(c.cadence.id, clamped);
      },
    });
    return h('div', { class: 'row' },
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { class: 'small strong truncate' }, c.cadence.name),
        h('div', { class: 'small dim' },
          `${c.cadence.itemIds.length} item${c.cadence.itemIds.length === 1 ? '' : 's'}`)),
      h('div', { style: { width: '72px' } }, control),
      h('span', { class: 'small dim nowrap' }, `/ ${fmtInt(cap)}`));
  });

  dialog(`Change quantity · ${shipment.code}`, (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      'Each cadence ships as a set, in multiples of five. Set any of them to zero to drop '
      + 'it from this shipment.'),
    h('div', { class: 'stack-sm' }, ...rows),
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: close }),
      btn('Save quantity', {
        variant: 'primary',
        onClick: () => {
          const picks = [...draft]
            .filter(([, n]) => n > 0)
            .map(([cadenceId, n]) => ({ cadenceId, units: n }));
          if (!picks.length) {
            toast('Leave at least one cadence on the shipment, or cancel it.', 'warn');
            return;
          }
          const saved = store.update((d) => changeShipmentCadences(d, shipment.id, picks, d.currentUserId));
          close();
          if (saved) toast(`${shipment.code} updated.`);
          else toast('Those quantities do not fit this site\u2019s limit.', 'warn');
        },
      }))), { narrow: true });
}

/** Drop a request the site does not need. Its stock goes back to the deposit. */
function confirmCancel(shipment) {
  confirmDialog(
    `Cancel ${shipment.code}?`,
    'The shipment is dropped and the stock it was holding returns to the central deposit. '
    + 'This cannot be undone, but you can order the cadence again later.',
    'Cancel shipment',
    () => {
      const done = store.update((d) => cancelShipment(d, shipment.id, d.currentUserId));
      if (done) {
        toast(`${shipment.code} cancelled.`, 'info');
        navigate('/fo/shipments');
      } else {
        toast('That shipment can no longer be cancelled.', 'warn');
      }
    },
    'stop',
  );
}
