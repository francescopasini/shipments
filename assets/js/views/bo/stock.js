// BO stock — items × locations matrix, filterable by location, country and trial.

import { h, append, fmtInt } from '../../ui/el.js';
import { icon } from '../../ui/icons.js';
import { card, btn, empty, sectionHead, select, field, metric } from '../../ui/components.js';
import * as store from '../../store.js';
import { CENTRAL, TRANSIT, matrixLocations, balance, totalAt } from '../../domain/stock.js';
import { COUNTRIES } from '../../domain/constants.js';

const filters = { location: 'ALL', country: 'ALL', trial: 'ALL', hideEmpty: true };

export function render(main) {
  const db = store.getDb();
  const rerender = () => { main.replaceChildren(); render(main); };

  const columns = matrixLocations(db).filter((loc) => {
    // The location filter decides which kinds of column appear at all.
    if (filters.location === 'CENTRAL') return loc.kind === 'central';
    if (filters.location === 'TRANSIT') return loc.kind === 'transit';
    if (filters.location === 'SITES' && loc.kind !== 'site') return false;

    // Country and trial narrow the site columns only.
    if (loc.kind !== 'site') return true;
    if (filters.country !== 'ALL' && loc.site.address.country !== filters.country) return false;
    if (filters.trial !== 'ALL' && loc.site.trialId !== filters.trial) return false;
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

    h('div', { class: 'bento' },
      h('div', { class: 'col-4' }, metric(
        fmtInt(totalAt(db, CENTRAL)), 'Central deposit', 'Units on hand', 'warehouse', 'sage',
      )),
      h('div', { class: 'col-4' }, metric(
        fmtInt(totalAt(db, TRANSIT)), 'In transit', 'Committed to open shipments', 'truck', 'lilac',
      )),
      h('div', { class: 'col-4' }, metric(
        fmtInt(db.sites.reduce((sum, s) => sum + totalAt(db, `site:${s.id}`), 0)),
        'Held at sites', `${db.sites.filter((s) => s.active).length} active sites`, 'building', 'sky',
      ))),

    card({ variant: 'card--tight' },
      h('div', { class: 'filters' },
        h('div', { style: { minWidth: '190px' } }, field('Location', select([
          { value: 'ALL', label: 'All locations' },
          { value: 'CENTRAL', label: 'Central deposit only' },
          { value: 'TRANSIT', label: 'In transit only' },
          { value: 'SITES', label: 'Sites only' },
        ], {
          value: filters.location,
          onChange: (e) => { filters.location = e.target.value; rerender(); },
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
          ...db.trials.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
        ], {
          value: filters.trial,
          onChange: (e) => { filters.trial = e.target.value; rerender(); },
        }))),
        btn(filters.hideEmpty ? 'Showing stocked items' : 'Showing every item', {
          variant: 'ghost', size: 'sm', iconName: 'filter',
          onClick: () => { filters.hideEmpty = !filters.hideEmpty; rerender(); },
        }),
        (filters.location !== 'ALL' || filters.country !== 'ALL' || filters.trial !== 'ALL')
          ? btn('Clear filters', {
            variant: 'ghost', size: 'sm', iconName: 'close',
            onClick: () => {
              filters.location = 'ALL'; filters.country = 'ALL'; filters.trial = 'ALL';
              rerender();
            },
          })
          : null),
      h('p', { class: 'small dim' },
        'Country and trial filters apply to site columns; the deposit and transit columns '
        + 'are always shown unless the location filter hides them.')),

    rows.length && columns.length
      ? card({}, matrix(db, rows, columns))
      : card({}, empty('Nothing matches those filters.', 'grid',
        btn('Clear filters', {
          variant: 'primary',
          onClick: () => {
            filters.location = 'ALL'; filters.country = 'ALL'; filters.trial = 'ALL';
            rerender();
          },
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
            ? loc.site.code
            : loc.label)),
          h('th', {}, 'Total'))),
      h('tbody', {}, ...rows.map((row) => {
        const total = row.cells.reduce((sum, qty) => sum + qty, 0);
        return h('tr', {},
          h('td', { class: 'col-head' },
            h('div', { class: 'row' },
              h('span', { class: `tile tile--${row.item.tone} tile--sm` }, icon(row.item.icon, 15)),
              h('div', {},
                h('div', {}, row.item.name),
                h('div', { class: 'small dim' },
                  `${row.item.code}${row.item.coldChain ? ' · cold chain' : ''}`)))),
          ...row.cells.map((qty, i) => {
            const loc = columns[i];
            const target = loc.kind === 'site'
              ? (loc.site.allocations.find((a) => a.itemId === row.item.id) || {}).targetQty
              : null;
            const low = target ? qty < target * 0.5 : false;
            return h('td', {
              class: qty === 0 ? 'is-zero' : low ? 'is-low' : '',
              title: target ? `${qty} of ${target} target` : `${qty} units`,
            }, qty === 0 ? '—' : fmtInt(qty));
          }),
          h('td', { class: 'strong tnum' }, fmtInt(total)));
      }))));
}
