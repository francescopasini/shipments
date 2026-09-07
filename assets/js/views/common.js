// View fragments shared between the FO and BO sides.

import { h, append, fmtInt, fmtAgo, fmtDate, fmtMoney } from '../ui/el.js';
import { icon } from '../ui/icons.js';
import {
  card, actionCard, tile, badge, shipmentBadge, pfiBadge, avatar, timeline,
  btn, dialog, field, input, select, toast,
} from '../ui/components.js';
import * as store from '../store.js';
import { COUNTRIES } from '../domain/constants.js';
import {
  getItem, getSite, getTrial, userName, unitsIn, pfiValue, siteTitle, shipmentCadences,
} from '../domain/selectors.js';
import { coordinatorForShipment } from '../domain/workflow.js';

/**
 * One shipment as a full-width clickable row. No icons here: a long list does
 * not repeat the section's own icon on every row.
 */
export function shipmentCard(db, shipment, onOpen, { showSite = false } = {}) {
  const site = getSite(db, shipment.siteId);
  const trial = getTrial(db, shipment.trialId);
  const carried = shipmentCadences(db, shipment);

  // Everything that identifies the shipment beyond its own code lives on one
  // sub-line, in narrowing order: which site, which study, what it carries. The
  // site's full name is dropped — the code is what people say out loud, and the
  // name pushed the cadences out of view on a narrow row.
  const sub = [
    showSite && site ? site.code : null,
    trial ? trial.code : null,
    // A shipment can carry more than one cadence, each with its own number.
    carried.map((c) => `${c.cadence.name} \u00d7${c.units}`).join(' + ') || null,
  ].filter(Boolean).join(' \u00b7 ');

  return actionCard({ variant: 'card--tight', onClick: onOpen },
    h('div', { class: 'row-wrap' },
      h('div', { class: 'grow', style: { minWidth: '140px' } },
        h('div', { class: 'strong truncate' }, shipment.code),
        h('div', { class: 'small dim truncate' }, sub)),
      h('div', { class: 'right small dim nowrap' }, fmtAgo(shipment.updatedAt)),
      shipmentBadge(shipment.status),
      icon('arrowRight', 17)));
}

/** Read-only table of a shipment's lines. */
export function linesTable(db, lines) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', { class: 'col-head' }, 'Item'),
        h('th', {}, 'Code'),
        h('th', {}, 'Quantity'))),
      h('tbody', {}, ...lines.map((l) => {
        const item = getItem(db, l.itemId);
        return h('tr', {},
          h('td', { class: 'col-head' },
            h('div', {},
              h('div', {}, item.name),
              item.coldChain ? h('div', { class: 'small dim' }, 'Cold chain') : null)),
          h('td', { class: 'dim' }, item.code),
          h('td', { class: 'tnum strong' }, `${fmtInt(l.qty)} ${item.unit}${l.qty === 1 ? '' : 's'}`));
      }))));
}

/**
 * The PFI panel — read-only on the FO side, actionable on the BO side.
 * `edit` is a button the shipment's coordinator can use while the invoice is
 * still a draft; `note` is a line of context under the header.
 */
export function pfiPanel(db, pfi, { actions = null, showLines = true, edit = null, note = null } = {}) {
  if (!pfi) return null;
  const total = pfiValue(pfi);

  return card({},
    h('div', { class: 'row-between' },
      h('div', { class: 'row' },
        tile('seal'),
        h('div', {},
          h('div', { class: 'card__title' }, 'Proforma invoice'),
          h('div', { class: 'small dim' }, pfi.number))),
      h('div', { class: 'row' }, edit, pfiBadge(pfi.status))),
    note ? h('p', { class: 'small muted' }, note) : null,
    h('div', { class: 'kv' },
      h('span', { class: 'kv__k' }, 'Prepared by'),
      h('span', { class: 'kv__v' }, userName(db, pfi.preparedById)),
      h('span', { class: 'kv__k' }, 'Approver'),
      h('span', { class: 'kv__v' }, pfi.approverId ? userName(db, pfi.approverId) : '—'),
      h('span', { class: 'kv__k' }, 'Requested'),
      h('span', { class: 'kv__v' }, pfi.requestedAt ? fmtDate(pfi.requestedAt) : '—'),
      h('span', { class: 'kv__k' }, 'Decided'),
      h('span', { class: 'kv__v' }, pfi.decidedAt ? fmtDate(pfi.decidedAt) : '—'),
      h('span', { class: 'kv__k' }, 'Declared value'),
      h('span', { class: 'kv__v tnum' }, fmtMoney(total, pfi.currency))),
    pfi.comment
      ? card({ variant: 'card--sunken card--tight' },
        h('span', { class: 'card__label' }, 'Approver comment'),
        h('p', { class: 'small' }, pfi.comment))
      : null,
    showLines
      ? h('div', { class: 'table-wrap' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            h('th', { class: 'col-head' }, 'Item'),
            h('th', {}, 'HS code'),
            h('th', {}, 'Qty'),
            h('th', {}, 'Unit value'),
            h('th', {}, 'Line total'))),
          h('tbody', {}, ...pfi.lines.map((l) => {
            const item = getItem(db, l.itemId);
            return h('tr', {},
              h('td', { class: 'col-head' }, item ? item.name : l.itemId),
              h('td', { class: 'dim' }, l.hsCode),
              h('td', { class: 'tnum' }, fmtInt(l.qty)),
              h('td', { class: 'tnum' }, fmtMoney(l.unitValue, pfi.currency)),
              h('td', { class: 'tnum strong' }, fmtMoney(l.qty * l.unitValue, pfi.currency)));
          }))))
      : null,
    actions);
}

/** Shipment history, newest first. */
export function shipmentTimeline(db, shipment) {
  const entries = [...shipment.timeline].reverse();
  return card({},
    h('div', { class: 'row' }, tile('clock'), h('div', { class: 'card__title' }, 'History')),
    timeline(entries, (entry) => h('div', { class: 'stack-sm' },
      h('div', { class: 'row-wrap' },
        shipmentBadge(entry.status),
        h('span', { class: 'small dim' }, fmtAgo(entry.at))),
      h('div', { class: 'small muted' },
        entry.byUserId ? userName(db, entry.byUserId) : 'System'),
      entry.note ? h('div', { class: 'small' }, `“${entry.note}”` ) : null)));
}

/**
 * Header block for a shipment detail page. `actions` is an array of buttons;
 * `showCoordinator` names the deposit person who owns the next step — the back
 * office needs it here, the front office already gives it its own card.
 */
export function shipmentHeader(db, shipment, backAction, actions = [], { showCoordinator = false } = {}) {
  const site = getSite(db, shipment.siteId);
  const trial = getTrial(db, shipment.trialId);
  const carried = shipmentCadences(db, shipment);

  return card({},
    h('div', { class: 'row-between' },
      h('div', { class: 'row' },
        backAction,
        tile('box'),
        h('div', {},
          h('div', { class: 'page-head__title' }, shipment.code),
          h('div', { class: 'small dim' },
            siteTitle(site)))),
      shipmentBadge(shipment.status)),
    h('div', { class: 'kv' },
      h('span', { class: 'kv__k' }, 'Trial'),
      h('span', { class: 'kv__v' }, trial ? `${trial.code} — ${trial.name}` : '—'),
      h('span', { class: 'kv__k' }, carried.length === 1 ? 'Cadence' : 'Cadences'),
      h('span', { class: 'kv__v' }, carried.length
        ? h('div', { class: 'stack-sm' }, ...carried.map((c) => h('div', {},
          `${c.units} × ${c.cadence.name} · week ${c.cadence.week} `
          + `(${c.cadence.itemIds.length} item${c.cadence.itemIds.length === 1 ? '' : 's'})`)))
        : '—'),
      h('span', { class: 'kv__k' }, 'Requested by'),
      h('span', { class: 'kv__v' }, userName(db, shipment.requestedById)),
      ...(showCoordinator
        ? [
          h('span', { class: 'kv__k' }, 'Shipping coordinator'),
          h('span', { class: 'kv__v' }, userName(db, coordinatorForShipment(db, shipment))),
        ]
        : []),
      h('span', { class: 'kv__k' }, 'Requested on'),
      h('span', { class: 'kv__v' }, fmtDate(shipment.createdAt)),
      h('span', { class: 'kv__k' }, 'Total units'),
      h('span', { class: 'kv__v tnum' }, fmtInt(unitsIn(shipment)))),
    actions.filter(Boolean).length
      ? h('div', { class: 'row-wrap' }, ...actions.filter(Boolean))
      : null);
}

/** Filter chip strip. options: [{ value, label, count }] */
export function chipStrip(options, active, onPick) {
  return h('div', { class: 'row-wrap' },
    ...options.map((o) => h('button', {
      type: 'button',
      class: `chip${o.value === active ? ' is-on' : ''}`,
      onClick: () => onPick(o.value),
    }, o.count === undefined ? o.label : `${o.label} · ${o.count}`)));
}

export { badge, avatar, append };

/**
 * Correct a site's postal address. Shared by both sides: the deposit maintains
 * it, and the site itself is the one that actually knows when it changes.
 */
export function openAddressDialog(site) {
  const fields = {
    street: input({ value: site.address.street, placeholder: 'Street and number' }),
    postalCode: input({ value: site.address.postalCode, placeholder: '00100' }),
    city: input({ value: site.address.city, placeholder: 'City' }),
  };
  let country = site.address.country;
  const problem = h('p', { class: 'small' });

  dialog(`Address · ${site.code}`, (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      'Where shipments for this site are delivered. It appears on the proforma invoice, '
      + 'so it travels with the goods through customs.'),
    h('div', { class: 'bento' },
      h('div', { class: 'col-12' }, field('Street', fields.street)),
      h('div', { class: 'col-4' }, field('Postcode', fields.postalCode)),
      h('div', { class: 'col-8' }, field('City', fields.city)),
      h('div', { class: 'col-6' }, field('Country', select(
        Object.entries(COUNTRIES).map(([code, label]) => ({ value: code, label })),
        { value: country, onChange: (e) => { country = e.target.value; } },
      )))),
    problem,
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: close }),
      btn('Save address', {
        variant: 'primary',
        onClick: () => {
          const city = fields.city.value.trim();
          if (!city) {
            problem.style.color = 'var(--clay-rose-ink)';
            problem.textContent = 'Enter the city.';
            return;
          }
          store.update((d) => {
            const found = d.sites.find((x) => x.id === site.id);
            if (!found) return;
            found.address = {
              street: fields.street.value.trim() || '—',
              city,
              country,
              postalCode: fields.postalCode.value.trim() || '—',
            };
          });
          close();
          toast(`Address saved for ${site.code}.`);
        },
      }))), { narrow: true });
}
