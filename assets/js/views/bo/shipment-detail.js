// BO shipment detail — the PFI panel plus whatever transitions this user may run.

import { h, append } from '../../ui/el.js';
import {
  card, tile, btn, iconBtn, empty, dialog, select, field, textarea, toast, badge,
} from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import {
  getPfi, availableActions, runAction, eligibleApprovers,
} from '../../domain/workflow.js';
import { getSite, getTrial, userName, openTasksFor } from '../../domain/selectors.js';
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
          tile('clipboard', 'butter', 'sm'),
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
        h('div', { class: 'row' }, tile('box', 'sky'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Shipment contents'),
            h('div', { class: 'small dim' },
              `${site ? site.name : ''} · ${trial ? trial.code : ''}`))),
        linesTable(db, shipment.lines))),

      h('div', { class: 'col-5' }, shipmentTimeline(db, shipment)),

      h('div', { class: 'col-7' },
        pfi && pfi.status !== 'NOT_REQUIRED'
          ? pfiPanel(db, pfi)
          : card({},
            h('div', { class: 'row' }, tile('seal', 'sage'),
              h('div', {},
                h('div', { class: 'card__title' }, 'Proforma invoice'),
                h('div', { class: 'small dim' }, 'Not required for this site'))),
            h('p', { class: 'small muted' },
              `${site ? site.code : 'This site'} is configured without PFI approval, so this `
              + 'shipment goes straight to preparation.'))),

      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' }, tile('building', 'lilac'),
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
            h('span', { class: 'kv__v' }, userName(db, site.shippingCoordinatorId)),
            h('span', { class: 'kv__k' }, 'PFI approval'),
            h('span', { class: 'kv__v' }, site.requiresPfiApproval ? 'Required' : 'Not required'))
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
  if (site && site.shippingCoordinatorId !== user.id) {
    return `${userName(db, site.shippingCoordinatorId)} is the shipping coordinator for `
      + `${site.code}, so the next step belongs to them.`;
  }
  return 'There is nothing to do on this shipment at the moment.';
}

/* ---------- action handling ---------- */

function handle(action, shipment, user) {
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
