// FO stock — a read-only table of what the site holds against its allocation.
// Stock is not maintained by hand: it moves automatically when the deposit
// marks a shipment delivered.

import { h, append, fmtInt } from '../../ui/el.js';
import { card, btn, empty, sectionHead, badge } from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { siteStockRows, siteCoverage } from '../../domain/selectors.js';

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const rows = siteStockRows(db, site);
  const coverage = siteCoverage(db, site);

  append(main, [
    sectionHead('Stock', `${site.code} · ${fmtInt(rows.length)} allocated items · `
      + `${Math.round(coverage * 100)}% of target held`,
    btn('Request a shipment', {
      variant: 'primary', iconName: 'plus', onClick: () => navigate('/fo/shipments'),
    })),

    card({ variant: 'card--tight' },
      h('p', { class: 'small muted' },
        'Your stock updates on its own: when the deposit marks a shipment delivered, '
        + 'its items are added here. The target is the most this site may hold of each '
        + 'item, and what you may still request is the difference.')),

    rows.length
      ? card({}, stockTable(rows))
      : card({}, empty('This site has no allocated items yet.', 'warehouse')),
  ]);
}

function stockTable(rows) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', { class: 'col-head' }, 'Item'),
        h('th', {}, 'In stock'),
        h('th', {}, 'Target'),
        h('th', {}, 'On the way'),
        h('th', {}, 'May request'))),
      h('tbody', {}, ...rows.map((row) => {
        const { item, held, target, inbound, requestable } = row;
        return h('tr', {},
          h('td', { class: 'col-head' },
            h('div', { class: 'row-wrap' },
              h('span', {}, item.name),
              item.coldChain ? badge('Cold chain', 'sky') : null),
            h('div', { class: 'small dim' }, `${item.code} · per ${item.unit}`)),
          h('td', { class: 'tnum strong' }, fmtInt(held)),
          h('td', { class: 'tnum dim' }, fmtInt(target)),
          h('td', { class: `tnum${inbound ? '' : ' is-zero'}` }, inbound ? fmtInt(inbound) : '—'),
          h('td', { class: `tnum${requestable ? '' : ' is-zero'}` },
            requestable ? fmtInt(requestable) : 'at target'));
      }))));
}
