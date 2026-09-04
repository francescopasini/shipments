// View fragments shared between the FO and BO sides.

import { h, append, fmtInt, fmtAgo, fmtDate, fmtMoney } from '../ui/el.js';
import { icon } from '../ui/icons.js';
import { card, actionCard, tile, badge, shipmentBadge, pfiBadge, avatar, timeline } from '../ui/components.js';
import { SHIPMENT_STATUS_META } from '../domain/constants.js';
import { getItem, getSite, getTrial, getCadence, userName, unitsIn, pfiValue } from '../domain/selectors.js';

/** Small round icon per item category, used to preview a shipment's contents. */
export function itemDots(db, lines, max = 5) {
  const shown = lines.slice(0, max);
  return h('div', { class: 'row', style: { gap: '6px' } },
    ...shown.map((l) => {
      const item = getItem(db, l.itemId);
      if (!item) return null;
      return h('span', {
        class: `tile tile--${item.tone} tile--sm`,
        title: `${item.name} · ${l.qty} ${item.unit}${l.qty === 1 ? '' : 's'}`,
      }, icon(item.icon, 15));
    }),
    lines.length > max ? h('span', { class: 'small dim' }, `+${lines.length - max}`) : null);
}

/** One shipment as a clickable card. */
export function shipmentCard(db, shipment, onOpen, { showSite = false } = {}) {
  const cadence = getCadence(db, shipment.cadenceId);
  const site = getSite(db, shipment.siteId);
  const trial = getTrial(db, shipment.trialId);

  return actionCard({ variant: 'card--tight', onClick: onOpen },
    h('div', { class: 'row-between' },
      h('div', { class: 'row' },
        tile('box', SHIPMENT_STATUS_META[shipment.status].tone),
        h('div', {},
          h('div', { class: 'strong' }, shipment.code),
          h('div', { class: 'small dim' },
            showSite && site ? `${site.code} · ${site.address.city}` : (trial ? trial.code : '')))),
      shipmentBadge(shipment.status)),
    h('div', { class: 'row-between' },
      itemDots(db, shipment.lines),
      h('div', { class: 'small dim right' },
        h('div', {}, `${fmtInt(unitsIn(shipment))} units`),
        h('div', {}, fmtAgo(shipment.updatedAt)))),
    cadence ? h('div', { class: 'small muted truncate' },
      `${cadence.name} · week ${cadence.week}`) : null);
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
            h('div', { class: 'row' },
              h('span', { class: `tile tile--${item.tone} tile--sm` }, icon(item.icon, 15)),
              h('div', {},
                h('div', {}, item.name),
                item.coldChain ? h('div', { class: 'small dim' }, 'Cold chain') : null))),
          h('td', { class: 'dim' }, item.code),
          h('td', { class: 'tnum strong' }, `${fmtInt(l.qty)} ${item.unit}${l.qty === 1 ? '' : 's'}`));
      }))));
}

/** The PFI panel — shown read-only on the FO side, actionable on the BO side. */
export function pfiPanel(db, pfi, { actions = null, showLines = true } = {}) {
  if (!pfi) return null;
  const total = pfiValue(pfi);

  return card({},
    h('div', { class: 'row-between' },
      h('div', { class: 'row' },
        tile('seal', 'butter'),
        h('div', {},
          h('div', { class: 'card__title' }, 'Proforma invoice'),
          h('div', { class: 'small dim' }, pfi.number))),
      pfiBadge(pfi.status)),
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
    h('div', { class: 'row' }, tile('clock', 'lilac'), h('div', { class: 'card__title' }, 'History')),
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
        tile('box', SHIPMENT_STATUS_META[shipment.status].tone),
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
