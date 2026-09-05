// BO shipment list — every site, filterable by status, trial and country.

import { h, append } from '../../ui/el.js';
import { card, btn, empty, sectionHead, select, field } from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { SHIPMENT_STATUS_ORDER, SHIPMENT_STATUS_META, COUNTRIES } from '../../domain/constants.js';
import { allShipments, allTrials, getSite } from '../../domain/selectors.js';
import { shipmentCard, chipStrip } from '../common.js';

const filters = { status: 'ALL', trial: 'ALL', country: 'ALL' };

export function render(main) {
  const db = store.getDb();
  const all = allShipments(db);

  const visible = all.filter((s) => {
    const site = getSite(db, s.siteId);
    if (filters.status !== 'ALL' && s.status !== filters.status) return false;
    if (filters.trial !== 'ALL' && s.trialId !== filters.trial) return false;
    if (filters.country !== 'ALL' && (!site || site.address.country !== filters.country)) return false;
    return true;
  });

  const statusOptions = [
    { value: 'ALL', label: 'All', count: all.length },
    ...SHIPMENT_STATUS_ORDER.map((status) => ({
      value: status,
      label: SHIPMENT_STATUS_META[status].label,
      count: all.filter((s) => s.status === status).length,
    })).filter((o) => o.count > 0),
  ];

  const rerender = () => { main.replaceChildren(); render(main); };

  append(main, [
    sectionHead('Shipments', `${visible.length} of ${all.length} shown`),

    card({ variant: 'card--tight' },
      chipStrip(statusOptions, filters.status, (v) => { filters.status = v; rerender(); }),
      h('div', { class: 'filters' },
        h('div', { style: { minWidth: '220px' } }, field('Trial', select([
          { value: 'ALL', label: 'All trials' },
          ...allTrials(db).map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
        ], {
          value: filters.trial,
          onChange: (e) => { filters.trial = e.target.value; rerender(); },
        }))),
        h('div', { style: { minWidth: '180px' } }, field('Country', select([
          { value: 'ALL', label: 'All countries' },
          ...Object.entries(COUNTRIES).map(([code, label]) => ({ value: code, label })),
        ], {
          value: filters.country,
          onChange: (e) => { filters.country = e.target.value; rerender(); },
        }))),
        (filters.status !== 'ALL' || filters.trial !== 'ALL' || filters.country !== 'ALL')
          ? btn('Clear filters', {
            variant: 'ghost', size: 'sm', iconName: 'close',
            onClick: () => {
              filters.status = 'ALL'; filters.trial = 'ALL'; filters.country = 'ALL';
              rerender();
            },
          })
          : null)),

    visible.length
      ? h('div', { class: 'stack-sm' }, ...visible.map((s) => shipmentCard(
        db, s, () => navigate(`/bo/shipments/${s.id}`), { showSite: true },
      )))
      : card({}, empty('No shipments match those filters.', 'search',
        btn('Clear filters', {
          variant: 'primary',
          onClick: () => {
            filters.status = 'ALL'; filters.trial = 'ALL'; filters.country = 'ALL';
            rerender();
          },
        }))),
  ]);
}
