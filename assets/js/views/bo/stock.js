// BO stock — items × locations matrix, filterable by site, country and trial.
// A site holds stock per trial, so each site contributes one column per study.

import { h, append, fmtInt } from '../../ui/el.js';
import { card, btn, empty, sectionHead, select, field } from '../../ui/components.js';
import * as store from '../../store.js';
import { matrixLocations, balance } from '../../domain/stock.js';
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

  // A site id left over from a deleted site would hide every site column.
  if (filters.site !== 'ALL' && !db.sites.some((x) => x.id === filters.site)) filters.site = 'ALL';
  const oneSite = filters.site !== 'ALL';

  const columns = matrixLocations(db).filter((loc) => {
    // The deposit is always shown: it is what every site column draws from, so a
    // site's stock only means something read against it.
    if (loc.kind === 'central') return true;
    // In transit is a total across every site, so it says nothing once you are
    // looking at one of them.
    if (loc.kind === 'transit') return !oneSite;

    if (oneSite && loc.site.id !== filters.site) return false;
    // Country and trial narrow the site columns only.
    if (filters.country !== 'ALL' && loc.site.address.country !== filters.country) return false;
    if (filters.trial !== 'ALL' && loc.trial.id !== filters.trial) return false;
    return true;
  });

  const rows = db.items
    .map((item) => ({
      item,
      cells: columns.map((loc) => balance(db, loc.id, item.id)),
    }))
    .filter((row) => !filters.hideEmpty || row.cells.some((qty) => qty > 0));

  append(main, [
    sectionHead('Stock', `${rows.length} items across ${columns.length} locations`),

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

    rows.length && columns.length
      ? card({}, matrix(db, rows, columns))
      : card({}, empty('Nothing matches those filters.', 'grid',
        btn('Clear filters', {
          variant: 'primary',
          onClick: () => { reset(); rerender(); },
        }))),
  ]);
}

function matrix(db, rows, columns) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      h('thead', {},
        h('tr', {},
          h('th', { class: 'col-head' }, 'Item'),
          ...columns.map((loc) => h('th', { title: loc.label }, loc.kind === 'site'
            ? loc.short
            : loc.label)))),
      h('tbody', {}, ...rows.map((row) => h('tr', {},
        h('td', { class: 'col-head' },
          h('div', {},
            h('div', {}, row.item.name),
            h('div', { class: 'small dim' },
              `${row.item.code}${row.item.coldChain ? ' · cold chain' : ''}`))),
        // There is no per-item target to be low against any more — a site's
        // ceiling covers a whole cadence — so the cells report the count only.
        ...row.cells.map((qty, i) => h('td', {
          class: qty === 0 ? 'is-zero' : '',
          title: `${columns[i].short || columns[i].label} · ${qty} units`,
        }, qty === 0 ? '—' : fmtInt(qty))))))));
}

onSection('/bo/stock', reset);
