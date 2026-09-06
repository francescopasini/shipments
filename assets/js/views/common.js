// View fragments shared between the FO and BO sides.

import { h, append, fmtInt, fmtAgo, fmtDate, fmtMoney } from '../ui/el.js';
import { icon } from '../ui/icons.js';
import { card, actionCard, tile, badge, shipmentBadge, pfiBadge, avatar, timeline } from '../ui/components.js';
import {
  getItem, getSite, getTrial, getCadence, userName, unitsIn, pfiValue, trialsForSite,
} from '../domain/selectors.js';

/**
 * One shipment as a full-width clickable row. No icons here: a long list does
 * not repeat the section's own icon on every row, and the shipment's items are
 * summarised by their unit count rather than a row of category icons.
 */
export function shipmentCard(db, shipment, onOpen, { showSite = false } = {}) {
  const cadence = getCadence(db, shipment.cadenceId);
  const site = getSite(db, shipment.siteId);
  const trial = getTrial(db, shipment.trialId);

  const sub = [
    showSite && site ? `${site.code} · ${site.address.city}` : null,
    trial ? trial.code : null,
    cadence ? `${cadence.name} · week ${cadence.week}` : null,
  ].filter(Boolean).join(' · ');

  return actionCard({ variant: 'card--tight', onClick: onOpen },
    h('div', { class: 'row-wrap' },
      h('div', { class: 'grow', style: { minWidth: '140px' } },
        h('div', { class: 'strong truncate' }, shipment.code),
        h('div', { class: 'small dim truncate' }, sub)),
      h('div', { class: 'right small dim nowrap' },
        h('div', {}, `${fmtInt(unitsIn(shipment))} units`),
        h('div', {}, fmtAgo(shipment.updatedAt))),
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

/** Header block for a shipment detail page. */
export function shipmentHeader(db, shipment, backAction, ...actions) {
  const site = getSite(db, shipment.siteId);
  const trial = getTrial(db, shipment.trialId);
  const cadence = getCadence(db, shipment.cadenceId);

  return card({},
    h('div', { class: 'row-between' },
      h('div', { class: 'row' },
        backAction,
        tile('box'),
        h('div', {},
          h('div', { class: 'page-head__title' }, shipment.code),
          h('div', { class: 'small dim' },
            `${site ? site.code : ''} · ${site ? site.name : ''}`))),
      shipmentBadge(shipment.status)),
    h('div', { class: 'kv' },
      h('span', { class: 'kv__k' }, 'Trial'),
      h('span', { class: 'kv__v' }, trial ? `${trial.code} — ${trial.name}` : '—'),
      h('span', { class: 'kv__k' }, 'Cadence'),
      h('span', { class: 'kv__v' }, cadence ? `${cadence.name} · week ${cadence.week}` : '—'),
      h('span', { class: 'kv__k' }, 'Requested by'),
      h('span', { class: 'kv__v' }, userName(db, shipment.requestedById)),
      h('span', { class: 'kv__k' }, 'Requested on'),
      h('span', { class: 'kv__v' }, fmtDate(shipment.createdAt)),
      h('span', { class: 'kv__k' }, 'Total units'),
      h('span', { class: 'kv__v tnum' }, fmtInt(unitsIn(shipment)))),
    actions.filter(Boolean).length
      ? h('div', { class: 'row-wrap' }, ...actions.filter(Boolean))
      : null);
}

/**
 * The trial selector for the front office. A site runs any number of trials and
 * almost everything the FO sees — stock, targets, study week, cadences — belongs
 * to one of them, so each view picks a trial and scopes itself to that pair.
 * Sites running a single trial get nothing: there is no choice to offer.
 *
 * Returns `null` when there is nothing to show, so callers can drop it straight
 * into a child list.
 */
export function trialStrip(db, site, activeTrialId, onPick) {
  const trials = trialsForSite(db, site.id);
  if (trials.length < 2) return null;
  return h('div', { class: 'stack-sm' },
    h('span', { class: 'card__label' }, 'Trial'),
    chipStrip(trials.map((t) => ({ value: t.id, label: t.code })), activeTrialId, onPick));
}

/**
 * Which trial the front office is looking at. One choice shared by every FO
 * view, so picking a trial on the dashboard still holds when you open stock or
 * shipments — the alternative, a selection per view, has the sections silently
 * disagreeing about which study you are working on.
 *
 * Session-only: it is a lens on the data, not part of it, and it falls back to
 * the site's first trial whenever the remembered one does not apply — which is
 * what happens as soon as the user switches site.
 */
let foTrialId = null;

export function activeTrialId(db, site) {
  const trials = trialsForSite(db, site.id);
  if (trials.some((t) => t.id === foTrialId)) return foTrialId;
  foTrialId = trials[0] ? trials[0].id : null;
  return foTrialId;
}

export function setActiveTrialId(trialId) {
  foTrialId = trialId;
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
