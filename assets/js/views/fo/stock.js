// FO stock — everything the site holds, across every trial it runs, in one
// table. A row is grouped under the trial and cadence that first calls for its
// item, so an item shared by two cadences (or, now, seen in two trials'
// worth of demand) is still only ever listed once.
//
// Nothing here is maintained by hand — it moves when the deposit marks a
// shipment delivered.

import { h, append, fmtInt } from '../../ui/el.js';
import { card, btn, empty, sectionHead } from '../../ui/components.js';
import * as store from '../../store.js';
import { openRequestDialog } from './shipments.js';
import { siteStockRows, siteTrialsForSite, getTrial, cadencesForTrial } from '../../domain/selectors.js';

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const siteTrials = siteTrialsForSite(db, site.id);
  const groups = siteTrials.flatMap((st) => trialGroups(db, st));

  append(main, [
    sectionHead('Stock',
      `${site.code} · ${siteTrials.length} trial${siteTrials.length === 1 ? '' : 's'}`,
      btn('Request a shipment', {
        variant: 'primary', iconName: 'plus', onClick: () => openRequestDialog(),
      })),

    groups.length
      ? card({}, stockTable(groups))
      : card({}, empty('No stock has been delivered for this site yet.', 'warehouse')),
  ]);
}

/**
 * One trial's rows, grouped under the cadence that first calls for the item —
 * an item shared by two cadences of the same trial is only ever listed under
 * the earlier one. Every group's label leads with the trial code, so groups
 * from every trial the site runs can sit in the one combined table.
 */
function trialGroups(db, siteTrial) {
  const trial = getTrial(db, siteTrial.trialId);
  const code = trial ? trial.code : '—';
  const rows = siteStockRows(db, siteTrial);
  const byId = new Map(rows.map((r) => [r.item.id, r]));
  const assigned = new Set();
  const groups = [];

  for (const cadence of cadencesForTrial(db, siteTrial.trialId)) {
    const groupRows = cadence.itemIds
      .filter((id) => byId.has(id) && !assigned.has(id))
      .map((id) => { assigned.add(id); return byId.get(id); });
    if (groupRows.length) {
      groups.push({ label: `${code} · ${cadence.name} · Week ${cadence.week}`, rows: groupRows });
    }
  }
  const leftover = rows.filter((r) => !assigned.has(r.item.id));
  if (leftover.length) groups.push({ label: `${code} · Other items`, rows: leftover });

  return groups;
}

/** groups: [{ label, rows }] — a bare table, no card header of its own. */
function stockTable(groups) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', { class: 'col-head' }, 'Item'),
        h('th', {}, 'In stock'),
        h('th', {}, 'On the way'))),
      h('tbody', {}, ...groups.flatMap((group) => [
        h('tr', { class: 'table__group' },
          h('td', { class: 'col-head', colspan: 3 }, group.label)),
        ...group.rows.map((row) => itemRow(row)),
      ]))));
}

function itemRow(row) {
  const { item, held, inbound } = row;
  return h('tr', {},
    h('td', { class: 'col-head' },
      h('div', {}, item.name),
      h('div', { class: 'small dim' }, `${item.code} · per ${item.unit}`)),
    h('td', { class: 'tnum strong' }, fmtInt(held)),
    h('td', { class: `tnum${inbound ? '' : ' is-zero'}` }, inbound ? fmtInt(inbound) : '—'));
}

