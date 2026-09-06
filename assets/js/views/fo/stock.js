// FO stock — a read-only table of what the site holds against its allocation,
// for one trial at a time. Stock is not maintained by hand: it moves
// automatically when the deposit marks a shipment delivered.

import { h, append, fmtInt } from '../../ui/el.js';
import { card, btn, empty, sectionHead, badge } from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { siteStockRows, siteCoverage, getSiteTrial, getTrial } from '../../domain/selectors.js';
import { trialStrip, activeTrialId, setActiveTrialId } from '../common.js';

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const trialId = activeTrialId(db, site);
  const siteTrial = getSiteTrial(db, site.id, trialId);
  const trial = getTrial(db, trialId);
  const rerender = () => { main.replaceChildren(); render(main); };

  const rows = siteStockRows(db, siteTrial);
  const coverage = siteCoverage(db, siteTrial);

  const strip = trialStrip(db, site, trialId, (id) => {
    setActiveTrialId(id);
    rerender();
  });

  append(main, [
    sectionHead('Stock', `${site.code}${trial ? ` · ${trial.code}` : ''} · `
      + `${fmtInt(rows.length)} allocated items · ${Math.round(coverage * 100)}% of target held`,
    btn('Request a shipment', {
      variant: 'primary', iconName: 'plus', onClick: () => navigate('/fo/shipments'),
    })),

    card({ variant: 'card--tight' },
      strip,
      h('p', { class: 'small muted' },
        'Stock is held per trial: what this site holds for one study is never drawn on for '
        + 'another. It updates on its own — when the deposit marks a shipment delivered, its '
        + 'items are added here. The target is the most this site may hold of each item for '
        + 'this trial, and what you may still request is the difference.')),

    rows.length
      ? card({}, stockTable(rows))
      : card({}, empty('This site has no allocated items for this trial yet.', 'warehouse')),
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
