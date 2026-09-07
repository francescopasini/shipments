// FO stock — what the site holds, one table per trial.
//
// Stock is held per trial: what a site holds for one study is never drawn on for
// another. That used to be a chip strip you switched between, which made two
// separate positions look like one thing being filtered. A table each says it
// outright, and lets the coordinator read both at once.
//
// Nothing here is maintained by hand — it moves when the deposit marks a
// shipment delivered.

import { h, append, fmtInt } from '../../ui/el.js';
import { card, tile, btn, empty, sectionHead, badge } from '../../ui/components.js';
import * as store from '../../store.js';
import { openRequestDialog } from './shipments.js';
import { siteStockRows, siteTrialsForSite, getTrial } from '../../domain/selectors.js';
import { onSection } from '../filters.js';

// Which trial's table to scroll to on the next render. The dashboard sets it,
// because "detailed stock" asked from one trial's card means that trial's table
// — on a site running four studies, landing at the top is landing nowhere.
let focusTrialId = null;

/** Open the stock page at one trial's table. */
export function showTrial(trialId) {
  focusTrialId = trialId;
}

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const siteTrials = siteTrialsForSite(db, site.id);
  let target = null;

  append(main, [
    sectionHead('Stock',
      `${site.code} · ${siteTrials.length} trial${siteTrials.length === 1 ? '' : 's'}`,
      btn('Request a shipment', {
        variant: 'primary', iconName: 'plus', onClick: () => openRequestDialog(),
      })),

    ...(siteTrials.length
      ? siteTrials.map((st) => {
        const node = trialStock(db, st);
        if (st.trialId === focusTrialId) target = node;
        return node;
      })
      : [card({}, empty('This site is not running any trial yet.', 'flask'))]),
  ]);

  // Consumed once: arriving here again from the menu should not keep jumping.
  focusTrialId = null;
  if (target) {
    // After the append, so the node has a position to scroll to.
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      // The scroll alone is ambiguous on a short page that did not move — the
      // card says once that it is the one that was asked for.
      target.classList.add('is-flash');
    });
  }
}

/** One trial's position at this site. */
function trialStock(db, siteTrial) {
  const trial = getTrial(db, siteTrial.trialId);
  const rows = siteStockRows(db, siteTrial);
  const held = rows.reduce((sum, r) => sum + r.held, 0);

  return card({},
    h('div', { class: 'row' }, tile('flask'),
      h('div', {},
        h('div', { class: 'card__title' }, trial ? trial.code : '—'),
        h('div', { class: 'small dim' }, rows.length
          ? `${fmtInt(held)} units across ${rows.length} item${rows.length === 1 ? '' : 's'}`
          : 'Nothing held yet'))),
    rows.length
      ? stockTable(rows)
      : empty('No stock has been delivered for this trial yet.', 'warehouse'));
}

function stockTable(rows) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', { class: 'col-head' }, 'Item'),
        h('th', {}, 'In stock'),
        h('th', {}, 'On the way'))),
      h('tbody', {}, ...rows.map((row) => {
        const { item, held, inbound } = row;
        return h('tr', {},
          h('td', { class: 'col-head' },
            h('div', { class: 'row-wrap' },
              h('span', {}, item.name),
              item.coldChain ? badge('Cold chain', 'sky') : null),
            h('div', { class: 'small dim' }, `${item.code} · per ${item.unit}`)),
          h('td', { class: 'tnum strong' }, fmtInt(held)),
          h('td', { class: `tnum${inbound ? '' : ' is-zero'}` }, inbound ? fmtInt(inbound) : '—'));
      }))));
}

onSection('/fo/stock', () => { focusTrialId = null; });
