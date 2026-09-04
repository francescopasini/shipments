// FO stock — one card per allocated item, count editable in place.

import { h, append, fmtInt } from '../../ui/el.js';
import { icon } from '../../ui/icons.js';
import {
  card, tile, btn, meter, empty, sectionHead, numberInput, toast, badge,
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
      ? h('div', { class: 'bento' }, ...rows.map((row) => h('div', { class: 'col-4' }, stockCard(row, site))))
      : card({}, empty('This site has no allocated items yet.', 'warehouse')),
  ]);
}

function stockCard(row, site) {
  const { item, held, target, inbound, ratio } = row;

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
    h('div', { class: 'row' },
      h('span', { class: `tile tile--${item.tone}` }, icon(item.icon, 22)),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { class: 'strong truncate', title: item.name }, item.name),
        h('div', { class: 'small dim' }, `${item.code} · per ${item.unit}`)),
      item.coldChain ? badge('Cold chain', 'sky') : null),

    h('div', { class: 'row-between' },
      h('div', { class: 'field', style: { maxWidth: '108px' } },
        h('span', { class: 'field__label' }, 'Counted'),
        input),
      h('div', { class: 'right' },
        h('div', { class: 'small dim' }, 'Site target'),
        h('div', { class: 'strong tnum' }, fmtInt(target)))),

    meter(ratio),

    h('div', { class: 'row-between small' },
      h('span', { class: ratio < 0.5 ? 'strong' : 'dim' },
        `${Math.round(ratio * 100)}% of target`),
      inbound
        ? h('span', { class: 'dim' }, `${fmtInt(inbound)} on the way`)
        : h('span', { class: 'dim' }, 'nothing inbound')),

    h('div', { class: 'small dim' },
      row.requestable > 0
        ? `You may still request ${fmtInt(row.requestable)} ${item.unit}${row.requestable === 1 ? '' : 's'}.`
        : 'At target — nothing to request.'));
}

export { tile };
