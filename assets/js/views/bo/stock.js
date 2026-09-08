// BO stock — items against the deposit, in transit, and whichever sites the
// filters currently select. A single site or a whole trial reads the same
// way: "Selected sites" and "Target" total across however many pairings the
// filters leave in scope, from one to all of them.

import { h, append, fmtInt } from '../../ui/el.js';
import { card, btn, empty, sectionHead, select, field } from '../../ui/components.js';
import * as store from '../../store.js';
import { matrixLocations, stockRows } from '../../domain/stock.js';
import { COUNTRIES } from '../../domain/constants.js';
import { allTrials, allSites } from '../../domain/selectors.js';
import { onSection } from '../filters.js';

const DEFAULTS = { site: 'ALL', country: 'ALL', trial: 'ALL', hideEmpty: true };
const filters = { ...DEFAULTS };

const isFiltered = () => Object.keys(DEFAULTS).some((k) => filters[k] !== DEFAULTS[k]);
const reset = () => Object.assign(filters, DEFAULTS);

export function render(main) {
  const db = store.getDb();
  const rerender = () => { main.replaceChildren(); render(main); };

  // A site id left over from a deleted site would empty the scope outright.
  if (filters.site !== 'ALL' && !db.sites.some((x) => x.id === filters.site)) filters.site = 'ALL';

  const selectedPairs = matrixLocations(db).filter((loc) => loc.kind === 'site'
    && (filters.site === 'ALL' || loc.site.id === filters.site)
    && (filters.country === 'ALL' || loc.site.address.country === filters.country)
    && (filters.trial === 'ALL' || loc.trial.id === filters.trial));

  const rows = stockRows(db, selectedPairs.map((p) => p.siteTrial))
    .filter((row) => !filters.hideEmpty || row.central > 0 || row.transit > 0 || row.selected > 0);

  const lowCount = rows.filter((r) => r.low).length;

  append(main, [
    sectionHead('Stock', `${rows.length} items · ${selectedPairs.length} site-trials selected`
      + (lowCount ? ` · ${lowCount} low on stock` : '')),

    card({ variant: 'card--tight' },
      h('div', { class: 'filters' },
        h('div', { style: { minWidth: '220px' } }, field('Site', select([
          { value: 'ALL', label: 'All sites' },
          ...allSites(db).map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` })),
        ], {
          value: filters.site,
          onChange: (e) => { filters.site = e.target.value; rerender(); },
        }))),
        h('div', { style: { minWidth: '170px' } }, field('Country', select([
          { value: 'ALL', label: 'All countries' },
          ...Object.entries(COUNTRIES).map(([code, label]) => ({ value: code, label })),
        ], {
          value: filters.country,
          onChange: (e) => { filters.country = e.target.value; rerender(); },
        }))),
        h('div', { style: { minWidth: '220px' } }, field('Trial', select([
          { value: 'ALL', label: 'All trials' },
          ...allTrials(db).map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
        ], {
          value: filters.trial,
          onChange: (e) => { filters.trial = e.target.value; rerender(); },
        }))),
        // A labelled filter rather than a toggle whose caption was its own state:
        // "Showing stocked items" read as an instruction rather than a setting.
        h('div', { style: { minWidth: '180px' } }, field('Items', select([
          { value: 'STOCKED', label: 'With stock somewhere' },
          { value: 'ALL', label: 'Every catalogue item' },
        ], {
          value: filters.hideEmpty ? 'STOCKED' : 'ALL',
          onChange: (e) => { filters.hideEmpty = e.target.value === 'STOCKED'; rerender(); },
        }))),
        isFiltered()
          ? btn('Clear filters', {
            variant: 'ghost', size: 'sm', iconName: 'close',
            onClick: () => { reset(); rerender(); },
          })
          : null)),

    rows.length
      ? card({}, stockTable(rows))
      : card({}, empty('Nothing matches those filters.', 'grid',
        btn('Clear filters', {
          variant: 'primary',
          onClick: () => { reset(); rerender(); },
        }))),
  ]);
}

/**
 * Item / Central deposit / In transit / Selected sites / Target. Shared with
 * the dashboard's low-stock card, so the same numbers read the same way
 * wherever they show up — only the row set and the label on the third column
 * differ between the two.
 */
export function stockTable(rows, { selectedLabel = 'Selected sites' } = {}) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table table--stock' },
      h('thead', {}, h('tr', {},
        h('th', { class: 'col-head' }, 'Item'),
        h('th', {}, 'Central deposit'),
        h('th', {}, 'In transit'),
        h('th', {}, selectedLabel),
        h('th', {}, 'Target'))),
      h('tbody', {}, ...rows.map((row) => h('tr', {
        class: row.low ? 'is-low' : '',
      },
        h('td', { class: 'col-head' },
          h('div', {},
            h('div', {}, row.item.name),
            h('div', {
              class: `small${row.low ? '' : ' dim'}`,
              style: row.low ? { color: 'var(--clay-rose-ink)' } : null,
            },
              `${row.item.code}${row.item.coldChain ? ' · cold chain' : ''}${row.low ? ' · low stock' : ''}`))),
        // A site's ceiling doubles as a per-item demand for whatever cadence
        // carries it, so the deposit column alone is checked against it — that
        // is the only balance a shortage here would actually be felt in.
        h('td', {
          class: [row.central === 0 ? 'is-zero' : '', row.low ? 'is-low-cell' : ''].filter(Boolean).join(' '),
          title: row.low ? `${fmtInt(row.central)} units · below the low-stock threshold` : null,
        }, row.central === 0 ? '—' : fmtInt(row.central)),
        h('td', { class: row.transit === 0 ? 'is-zero' : '' },
          row.transit === 0 ? '—' : fmtInt(row.transit)),
        h('td', { class: row.selected === 0 ? 'is-zero' : '' },
          row.selected === 0 ? '—' : fmtInt(row.selected)),
        h('td', { class: row.target === 0 ? 'is-zero' : '' },
          row.target === 0 ? '—' : fmtInt(row.target)))))));
}

onSection('/bo/stock', reset);
