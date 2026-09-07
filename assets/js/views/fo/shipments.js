// FO shipment list + the "request a new shipment" dialog.

import { h, append } from '../../ui/el.js';
import {
  card, btn, empty, sectionHead, select, field,
} from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { SHIPMENT_STATUS_ORDER, SHIPMENT_STATUS_META } from '../../domain/constants.js';
import { shipmentsForSite, trialsForSite } from '../../domain/selectors.js';
import { shipmentCard } from '../common.js';
import { openRequestDialog as openShipmentDialog } from '../request-dialog.js';
import { onSection } from '../filters.js';

// Both filters are view-local so clicking among them needs no store write.
//
// The trial is a filter here rather than the shared lens the dashboard uses: a
// site's shipments are one queue whichever study they serve, and hiding half of
// it by default makes the list lie about how much is in flight. Every row says
// which trial it belongs to instead.
let statusFilter = 'ALL';
let trialFilter = 'ALL';
// Which trial the request dialog should open on. Not a filter — just the last
// one ordered against, so raising two requests in a row does not mean picking
// the same trial twice.
let lastOrderedTrialId = null;

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const trials = trialsForSite(db, site.id);
  // A trial the site no longer runs would hide the whole list with no way back.
  if (trialFilter !== 'ALL' && !trials.some((t) => t.id === trialFilter)) trialFilter = 'ALL';

  const everything = shipmentsForSite(db, site.id);
  const all = trialFilter === 'ALL'
    ? everything
    : everything.filter((s) => s.trialId === trialFilter);
  const visible = statusFilter === 'ALL' ? all : all.filter((s) => s.status === statusFilter);

  // No counts in the labels — the page subtitle already says how many are shown
  // out of how many there are. A status the trial filter has emptied simply
  // stops being offered, so nothing on the list leads to an empty page.
  const statusOptions = [
    { value: 'ALL', label: 'All statuses' },
    ...SHIPMENT_STATUS_ORDER
      .filter((status) => all.some((x) => x.status === status))
      .map((status) => ({ value: status, label: SHIPMENT_STATUS_META[status].label })),
  ];
  // The chosen status may have vanished with the trial switch.
  if (!statusOptions.some((o) => o.value === statusFilter)) statusFilter = 'ALL';

  append(main, [
    sectionHead('Shipments',
      `${site.code} · ${visible.length} of ${everything.length} shown`,
      btn('Request a shipment', {
        variant: 'primary', iconName: 'plus',
        onClick: () => openRequestDialog(),
      })),

    card({ variant: 'card--tight' },
      h('div', { class: 'filters' },
        trials.length > 1
          ? h('div', { style: { minWidth: '220px' } }, field('Trial', select([
            { value: 'ALL', label: 'All trials' },
            ...trials.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
          ], {
            value: trialFilter,
            onChange: (e) => {
              trialFilter = e.target.value;
              // A status that only existed under the previous trial would show nothing.
              statusFilter = 'ALL';
              rerender(main);
            },
          })))
          : null,
        h('div', { style: { minWidth: '220px' } }, field('Status', select(statusOptions, {
          value: statusFilter,
          onChange: (e) => { statusFilter = e.target.value; rerender(main); },
        }))),
        (statusFilter !== 'ALL' || trialFilter !== 'ALL')
          ? btn('Clear filters', {
            variant: 'ghost', size: 'sm', iconName: 'close',
            onClick: () => { statusFilter = 'ALL'; trialFilter = 'ALL'; rerender(main); },
          })
          : null)),

    visible.length
      ? h('div', { class: 'stack-sm' }, ...visible.map((s) => shipmentCard(
        db, s, () => navigate(`/fo/shipments/${s.id}`),
      )))
      : card({}, empty(
        statusFilter === 'ALL' && trialFilter === 'ALL'
          ? 'This site has not requested anything yet.'
          : 'No shipments match those filters.',
        'box',
        btn('Request a shipment', {
          variant: 'primary', onClick: () => openRequestDialog(),
        }),
      )),
  ]);
}

function rerender(main) {
  main.replaceChildren();
  render(main);
}

/* ---------- request dialog ---------- */

/**
 * Exported, because raising a request is the site's main job and the places that
 * prompt for it — the dashboard, the stock page — should open it where the user
 * is standing rather than bouncing them to this list first.
 *
 * The site is fixed here: the front office only ever orders for the site it is
 * switched to. It opens on the trial being filtered, else the last one ordered
 * against, so raising two requests in a row does not mean picking the same trial
 * twice.
 */
export function openRequestDialog() {
  const site = store.currentSite();
  if (!site) return;
  openShipmentDialog({
    siteId: site.id,
    trialId: trialFilter !== 'ALL' ? trialFilter : lastOrderedTrialId,
    detailPath: (id) => `/fo/shipments/${id}`,
    onCreated: (orderedTrialId) => { lastOrderedTrialId = orderedTrialId; },
  });
}

onSection('/fo/shipments', () => { statusFilter = 'ALL'; trialFilter = 'ALL'; });
