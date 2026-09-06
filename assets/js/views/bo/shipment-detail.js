// BO shipment detail — the PFI panel plus whatever transitions this user may run.

import { h, append, fmtInt, fmtMoney } from '../../ui/el.js';
import {
  card, tile, btn, iconBtn, empty, dialog, select, field, input, numberInput,
  textarea, toast, badge,
} from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import {
  getPfi, availableActions, runAction, eligibleApprovers, coordinatorForShipment,
  canEditPfi, updatePfi, pfiIsPrepared,
} from '../../domain/workflow.js';
import { getSite, getTrial, getItem, userName, openTasksFor, pfiValue } from '../../domain/selectors.js';
import { shipmentHeader, linesTable, pfiPanel, shipmentTimeline } from '../common.js';

export function render(main, params) {
  const db = store.getDb();
  const user = store.currentUser();
  const shipment = db.shipments.find((s) => s.id === params.id);

  if (!shipment) {
    append(main, [card({}, empty('That shipment no longer exists.', 'box',
      btn('Back to shipments', { variant: 'primary', onClick: () => navigate('/bo/shipments') })))]);
    return;
  }

  const site = getSite(db, shipment.siteId);
  const trial = getTrial(db, shipment.trialId);
  const pfi = getPfi(db, shipment);
  const actions = availableActions(db, shipment, user);
  const myTask = openTasksFor(db, user.id).find((t) => t.shipmentId === shipment.id);

  const back = iconBtn('arrowRight', {
    variant: 'ghost',
    class: 'flip',
    'aria-label': 'Back to shipments',
    onClick: () => navigate('/bo/shipments'),
  });

  const actionButtons = actions.map((action) => btn(action.label, {
    variant: action.variant,
    onClick: () => handle(action, shipment, user),
  }));

  append(main, [
    shipmentHeader(db, shipment, back, ...actionButtons),

    myTask
      ? card({ variant: 'card--tight card--sunken' },
        h('div', { class: 'row' },
          tile('clipboard', 'sm'),
          h('div', { class: 'grow' },
            h('div', { class: 'strong' }, 'This shipment is on your task list'),
            h('div', { class: 'small dim' },
              'Completing the action above closes the task automatically.')),
          badge('Open task', 'butter')))
      : null,

    !actions.length && shipment.status !== 'DELIVERED'
      ? card({ variant: 'card--tight' },
        h('p', { class: 'small muted' },
          whyNoActions(db, shipment, user, site)))
      : null,

    h('div', { class: 'bento' },
      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row' }, tile('box'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Shipment contents'),
            h('div', { class: 'small dim' },
              `${site ? site.name : ''} · ${trial ? trial.code : ''}`))),
        linesTable(db, shipment.lines))),

      h('div', { class: 'col-5' }, shipmentTimeline(db, shipment)),

      // The invoice is the customs paperwork, so it shows on every shipment.
      // Only whether somebody else countersigns it varies by site.
      h('div', { class: 'col-7' }, pfiPanel(db, pfi, {
        edit: canEditPfi(db, shipment, user)
          ? btn('Edit invoice', {
            variant: 'ghost', size: 'sm', iconName: 'edit',
            onClick: () => openPfiDialog(shipment, user),
          })
          : null,
        note: pfiNote(db, shipment, site, user, pfi),
      })),

      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' }, tile('building'),
          h('div', { class: 'card__title' }, 'Destination')),
        site
          ? h('div', { class: 'kv' },
            h('span', { class: 'kv__k' }, 'Site'),
            h('span', { class: 'kv__v' }, `${site.code} — ${site.name}`),
            h('span', { class: 'kv__k' }, 'Address'),
            h('span', { class: 'kv__v' },
              `${site.address.street}, ${site.address.postalCode} ${site.address.city}, `
              + site.address.country),
            h('span', { class: 'kv__k' }, 'Coordinator'),
            h('span', { class: 'kv__v' }, userName(db, coordinatorForShipment(db, shipment))),
            h('span', { class: 'kv__k' }, 'PFI approval'),
            h('span', { class: 'kv__v' }, site.requiresPfiApproval
              ? 'Countersigned by an approver'
              : 'Issued by the coordinator'))
          : empty('Site not found.', 'building'),
        site
          ? btn('Open site', {
            variant: 'ghost', size: 'sm',
            onClick: () => navigate(`/bo/sites/${site.id}`),
          })
          : null)),
    ),
  ]);
}

/** Explains why the action buttons are absent, so the screen never looks broken. */
function whyNoActions(db, shipment, user, site) {
  const pfi = getPfi(db, shipment);
  if (shipment.status === 'AWAITING_PFI_APPROVAL') {
    return `This is waiting on ${userName(db, pfi.approverId)} to decide on the PFI. `
      + 'Switch to that persona to approve it or request a modification.';
  }
  // Coordination is per site-trial, so name the study as well as the site —
  // a colleague may well coordinate the same hospital's other trial.
  const coordinatorId = coordinatorForShipment(db, shipment);
  if (coordinatorId && coordinatorId !== user.id) {
    const trial = getTrial(db, shipment.trialId);
    return `${userName(db, coordinatorId)} is the shipping coordinator for `
      + `${site ? site.code : 'this site'}${trial ? ` · ${trial.code}` : ''}, `
      + 'so the next step belongs to them.';
  }
  return 'There is nothing to do on this shipment at the moment.';
}

/** A line of context under the invoice header: what still has to happen to it. */
function pfiNote(db, shipment, site, user, pfi) {
  if (!pfi) return null;
  const mine = coordinatorForShipment(db, shipment) === user.id;

  if (pfi.status === 'DRAFT' || pfi.status === 'CHANGES_REQUESTED') {
    if (!pfiIsPrepared(pfi)) {
      return 'Every line needs a unit value and an HS code before this invoice can go '
        + `anywhere.${mine ? ' Use “Edit invoice” to fill them in.' : ''}`;
    }
    return site && site.requiresPfiApproval
      ? 'Prepared and ready to send to an approver.'
      : `Prepared. ${site ? site.code : 'This site'} needs no countersignature, so marking `
        + 'the shipment ready for preparation issues it.';
  }
  if (pfi.status === 'ISSUED') {
    return `Issued by the coordinator — ${site ? site.code : 'this site'} does not require `
      + 'a separate approval. It travels with the goods.';
  }
  if (pfi.status === 'PENDING_APPROVAL') return 'Locked while an approver decides on it.';
  if (pfi.status === 'APPROVED') return 'Approved and locked. It travels with the goods.';
  return null;
}

/* ---------- action handling ---------- */

function handle(action, shipment, user) {
  // Both ways out of "new request" put the invoice in front of somebody — an
  // approver, or customs. Neither should happen with unpriced lines on it.
  if (action.id === 'requestApproval' || action.id === 'ready') {
    const pfi = getPfi(store.getDb(), shipment);
    if (!pfiIsPrepared(pfi)) {
      toast('Finish the proforma invoice first — every line needs a unit value and an HS code.', 'warn');
      openPfiDialog(shipment, user);
      return null;
    }
  }
  if (action.needs === 'approver') return openApproverDialog(shipment, user);
  if (action.needs === 'comment') return openChangesDialog(shipment, user);
  return apply(action.id, shipment.id, user.id, {}, action.label);
}

function apply(actionId, shipmentId, userId, payload, label) {
  const updated = store.update((d) => runAction(d, actionId, shipmentId, userId, payload));
  if (updated) toast(`${updated.code} — ${label.toLowerCase()} done.`);
  else toast('That action is no longer available.', 'warn');
  return updated;
}

/**
 * Prepare the invoice. Quantities are shown but not editable — they belong to
 * the shipment, and the ledger has already committed them to transit.
 */
function openPfiDialog(shipment, user) {
  const db = store.getDb();
  const pfi = getPfi(db, shipment);
  if (!pfi) return;

  let currency = pfi.currency;
  const draft = new Map(pfi.lines.map((l) => [l.itemId, {
    unitValue: l.unitValue,
    hsCode: l.hsCode || '',
  }]));

  const totalOut = h('span', { class: 'kv__v tnum strong' });
  const retotal = () => {
    const sum = pfi.lines.reduce((acc, l) => {
      const d = draft.get(l.itemId);
      return acc + l.qty * (Number(d.unitValue) || 0);
    }, 0);
    totalOut.textContent = fmtMoney(sum, currency);
  };

  dialog(`Prepare invoice · ${pfi.number}`, (close) => {
    const body = h('div', { class: 'stack' },
      h('p', { class: 'muted small' },
        `The proforma invoice travels with ${shipment.code} through customs, so it is `
        + 'prepared for every shipment. Set what each line is worth and the commodity code '
        + 'it clears under. Quantities come from the request and cannot be changed here.'),

      field('Currency', select(
        ['EUR', 'USD', 'GBP', 'CHF'].map((c) => ({ value: c, label: c })),
        {
          value: currency,
          onChange: (e) => { currency = e.target.value; retotal(); },
        },
      )),

      h('div', { class: 'table-wrap' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            h('th', { class: 'col-head' }, 'Item'),
            h('th', {}, 'Qty'),
            h('th', {}, 'HS code'),
            h('th', {}, 'Unit value'))),
          h('tbody', {}, ...pfi.lines.map((line) => {
            const item = getItem(db, line.itemId);
            const d = draft.get(line.itemId);
            return h('tr', {},
              h('td', { class: 'col-head' },
                h('div', {}, item ? item.name : line.itemId),
                h('div', { class: 'small dim' }, item ? item.code : '')),
              h('td', { class: 'tnum dim' }, fmtInt(line.qty)),
              h('td', {}, input({
                value: d.hsCode,
                class: 'input--sm',
                placeholder: '0000.00',
                'aria-label': `${item ? item.name : 'Line'} HS code`,
                onChange: (e) => { d.hsCode = e.target.value.trim(); },
              })),
              h('td', {}, numberInput({
                min: 0,
                step: 1,
                value: d.unitValue,
                class: 'input--sm',
                'aria-label': `${item ? item.name : 'Line'} unit value`,
                onChange: (e) => {
                  d.unitValue = Math.max(0, Number(e.target.value) || 0);
                  e.target.value = d.unitValue;
                  retotal();
                },
              })));
          })))),

      h('div', { class: 'kv' },
        h('span', { class: 'kv__k' }, 'Declared value'),
        totalOut),

      h('div', { class: 'dialog__foot' },
        btn('Cancel', { variant: 'ghost', onClick: close }),
        btn('Save invoice', {
          variant: 'primary',
          onClick: () => {
            const lines = [...draft].map(([itemId, d]) => ({ itemId, ...d }));
            const saved = store.update((dbx) => updatePfi(dbx, shipment.id, { currency, lines }, user.id));
            if (!saved) {
              toast('This invoice can no longer be edited.', 'warn');
              close();
              return;
            }
            close();
            toast(pfiIsPrepared(saved)
              ? `${pfi.number} saved — ${fmtMoney(pfiValue(saved), saved.currency)} declared.`
              : `${pfi.number} saved, but some lines still have no value or HS code.`,
            pfiIsPrepared(saved) ? 'ok' : 'warn');
          },
        })));
    retotal();
    return body;
  }, { wide: true });
}

/** Coordinator picks which PFI approver to send the invoice to. */
function openApproverDialog(shipment, user) {
  const db = store.getDb();
  const approvers = eligibleApprovers(db, user.id);

  if (!approvers.length) {
    toast('No other back-office user can approve a PFI.', 'warn');
    return;
  }

  let approverId = approvers[0].id;

  dialog('Request PFI approval', (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      `Send the proforma invoice for ${shipment.code} to another back-office user. `
      + 'The shipment waits at "awaiting PFI approval" until they decide.'),
    field('Approver', select(
      approvers.map((a) => ({ value: a.id, label: `${a.name} — ${a.email}` })),
      { value: approverId, onChange: (e) => { approverId = e.target.value; } },
    ), 'Only users with the PFI approver role are listed.'),
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: close }),
      btn('Send for approval', {
        variant: 'primary',
        iconName: 'seal',
        onClick: () => {
          close();
          apply('requestApproval', shipment.id, user.id, { approverId }, 'PFI sent for approval');
        },
      }))), { narrow: true });
}

/** Approver sends the PFI back to the coordinator with a note. */
function openChangesDialog(shipment, user) {
  const comment = textarea({
    placeholder: 'What should the shipping coordinator change?',
    rows: 4,
  });

  dialog('Request a modification', (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      `${shipment.code} goes back to the shipping coordinator as a new request, and they `
      + 'pick up a fresh task to revise the PFI.'),
    field('Comment', comment, 'Optional, but it is what the coordinator will see.'),
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: close }),
      btn('Request modification', {
        variant: 'warn',
        iconName: 'edit',
        onClick: () => {
          const text = comment.value.trim();
          close();
          apply('changes', shipment.id, user.id, { comment: text }, 'modification requested');
        },
      }))), { narrow: true });
}
