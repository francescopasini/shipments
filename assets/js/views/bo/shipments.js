// BO shipment list — every site, filterable by owner, status, trial, site and country.

import { h, append } from '../../ui/el.js';
import { card, btn, empty, sectionHead, select, field } from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { SHIPMENT_STATUS_ORDER, SHIPMENT_STATUS_META, COUNTRIES } from '../../domain/constants.js';
import { allShipments, allTrials, allSites, getSite } from '../../domain/selectors.js';
import { coordinatorForShipment } from '../../domain/workflow.js';
import { shipmentCard, chipStrip } from '../common.js';
import { openRequestDialog } from '../request-dialog.js';
import { onSection } from '../filters.js';

const DEFAULTS = { owner: 'ALL', status: 'ALL', trial: 'ALL', site: 'ALL', country: 'ALL' };
const filters = { ...DEFAULTS };

const isFiltered = () => Object.keys(DEFAULTS).some((k) => filters[k] !== DEFAULTS[k]);
const reset = () => Object.assign(filters, DEFAULTS);

/**
 * Open the list showing one site only. Called from the site page, so the count
 * shown there lands on exactly those shipments here.
 */
export function showSite(siteId) {
  reset();
  filters.site = siteId;
}

/**
 * Open the list showing one status only. Called from the dashboard breakdown, so
 * the bar the user clicked lands on exactly the shipments it counted.
 */
export function showStatus(status) {
  reset();
  filters.status = status;
}

/** Open the list showing only shipments assigned to the current user. */
export function showMine() {
  reset();
  filters.owner = 'MINE';
}

export function render(main) {
  const db = store.getDb();
  const user = store.currentUser();
  const all = allShipments(db);
  if (filters.site !== 'ALL' && !db.sites.some((x) => x.id === filters.site)) filters.site = 'ALL';

  // Three nested scopes, so every count describes exactly what picking it would
  // show: the dropdowns narrow first, then the owner chips, then the status.
  const narrowed = all.filter((s) => {
    const site = getSite(db, s.siteId);
    if (filters.trial !== 'ALL' && s.trialId !== filters.trial) return false;
    if (filters.site !== 'ALL' && s.siteId !== filters.site) return false;
    if (filters.country !== 'ALL' && (!site || site.address.country !== filters.country)) return false;
    return true;
  });

  // Coordination is assigned per site-trial, so "mine" is not a property of the
  // shipment — it is asked of the pairing it belongs to.
  const isMine = (s) => coordinatorForShipment(db, s) === user.id;
  const inScope = filters.owner === 'MINE' ? narrowed.filter(isMine) : narrowed;
  const visible = filters.status === 'ALL'
    ? inScope
    : inScope.filter((s) => s.status === filters.status);

  // The chips carry the counts: they are the first cut, so how much each scope
  // holds is what decides which one you pick.
  const ownerOptions = [
    { value: 'MINE', label: 'Assigned to me', count: narrowed.filter(isMine).length },
    { value: 'ALL', label: 'All shipments', count: narrowed.length },
  ];

  // The status is a dropdown like every other filter here, so the four sit on one
  // row and read as one control set. No counts in the labels — the chips above
  // report the size of the scope — but a status the scope has emptied is still
  // dropped, so nothing on offer leads to an empty list.
  const statusOptions = [
    { value: 'ALL', label: 'All statuses' },
    ...SHIPMENT_STATUS_ORDER
      .filter((status) => inScope.some((s) => s.status === status))
      .map((status) => ({ value: status, label: SHIPMENT_STATUS_META[status].label })),
  ];
  // The chosen status may have been emptied by one of the other filters.
  if (!statusOptions.some((o) => o.value === filters.status)) filters.status = 'ALL';

  const rerender = () => { main.replaceChildren(); render(main); };

  append(main, [
    sectionHead('Shipments', `${visible.length} of ${all.length} shown`,
      // The deposit raises requests on a site's behalf — over the phone, or to
      // correct one it had to cancel — so it picks the site as well as the trial.
      btn('Request a shipment', {
        variant: 'primary', iconName: 'plus',
        onClick: () => openRequestDialog({
          chooseSite: true,
          siteId: filters.site !== 'ALL' ? filters.site : null,
          trialId: filters.trial !== 'ALL' ? filters.trial : null,
          detailPath: (id) => `/bo/shipments/${id}`,
        }),
      })),

    card({ variant: 'card--tight' },
      // A quick filter rather than a fifth dropdown: "is this mine" is the first
      // question a coordinator asks of this list, and it has only two answers.
      chipStrip(ownerOptions, filters.owner, (v) => { filters.owner = v; rerender(); }),
      h('div', { class: 'filters' },
        h('div', { style: { minWidth: '220px' } }, field('Status', select(statusOptions, {
          value: filters.status,
          onChange: (e) => { filters.status = e.target.value; rerender(); },
        }))),
        h('div', { style: { minWidth: '220px' } }, field('Trial', select([
          { value: 'ALL', label: 'All trials' },
          ...allTrials(db).map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
        ], {
          value: filters.trial,
          onChange: (e) => { filters.trial = e.target.value; rerender(); },
        }))),
        h('div', { style: { minWidth: '220px' } }, field('Site', select([
          { value: 'ALL', label: 'All sites' },
          ...allSites(db).map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` })),
        ], {
          value: filters.site,
          onChange: (e) => { filters.site = e.target.value; rerender(); },
        }))),
        h('div', { style: { minWidth: '180px' } }, field('Country', select([
          { value: 'ALL', label: 'All countries' },
          ...Object.entries(COUNTRIES).map(([code, label]) => ({ value: code, label })),
        ], {
          value: filters.country,
          onChange: (e) => { filters.country = e.target.value; rerender(); },
        }))),
        isFiltered()
          ? btn('Clear filters', {
            variant: 'ghost', size: 'sm', iconName: 'close',
            onClick: () => { reset(); rerender(); },
          })
          : null)),

    visible.length
      ? h('div', { class: 'stack-sm' }, ...visible.map((s) => shipmentCard(
        db, s, () => navigate(`/bo/shipments/${s.id}`), { showSite: true },
      )))
      : card({}, empty('No shipments match those filters.', 'search',
        btn('Clear filters', {
          variant: 'primary',
          onClick: () => { reset(); rerender(); },
        }))),
  ]);
}

onSection('/bo/shipments', reset);
