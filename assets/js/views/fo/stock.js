// FO stock — one card per allocated item, count editable in place.

import { h, append, fmtInt } from '../../ui/el.js';
import {
  card, tile, btn, empty, sectionHead, numberInput, toast, badge,
} from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { setSiteCount } from '../../domain/stock.js';
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
        'Counts here are what your site physically holds. Correct them whenever you '
        + 'recount — the deposit uses this to work out what you can still request.')),

    rows.length
      ? h('div', { class: 'stack-sm' }, ...rows.map((row) => stockCard(row, site)))
      : card({}, empty('This site has no allocated items yet.', 'warehouse')),
  ]);
}

function stockCard(row, site) {
  const { item, held, target, inbound } = row;

  // Uncontrolled input: commit on change/blur so the re-render never steals focus.
  const input = numberInput({
    min: 0,
    step: 1,
    value: held,
    'aria-label': `${item.name} counted quantity`,
    onChange: (e) => {
      const next = Math.max(0, Math.round(Number(e.target.value) || 0));
      if (next === held) return;
      store.update((d) => setSiteCount(d, site.id, item.id, next));
      toast(`${item.name} set to ${fmtInt(next)} ${item.unit}${next === 1 ? '' : 's'}.`, 'info');
    },
  });

  return card({ variant: 'card--tight' },
    h('div', { class: 'row-wrap' },
      h('div', { class: 'grow', style: { minWidth: '160px' } },
        h('div', { class: 'row-wrap' },
          h('span', { class: 'strong truncate', title: item.name }, item.name),
          item.coldChain ? badge('Cold chain', 'sky') : null),
        h('div', { class: 'small dim truncate' },
          `${item.code} · per ${item.unit} · target ${fmtInt(target)}`
          + (inbound ? ` · ${fmtInt(inbound)} on the way` : ''))),

      h('div', { class: 'small dim right nowrap' },
        row.requestable > 0
          ? `may request ${fmtInt(row.requestable)} ${item.unit}${row.requestable === 1 ? '' : 's'}`
          : 'at target'),

      h('div', { class: 'field', style: { width: '90px' } },
        h('span', { class: 'field__label' }, 'Counted'),
        input)));
}

export { tile };
