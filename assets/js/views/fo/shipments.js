// FO shipment list + the "request a new shipment" dialog.

import { h, append, fmtInt } from '../../ui/el.js';
import {
  card, btn, empty, sectionHead, dialog, select, numberInput, field, toast,
} from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { SHIPMENT_STATUS_ORDER, SHIPMENT_STATUS_META } from '../../domain/constants.js';
import { requestShipment } from '../../domain/workflow.js';
import { requestableQty } from '../../domain/stock.js';
import {
  shipmentsForSite, cadencesForTrial, getItem, getSiteTrial, trialsForSite, siteStudyWeek,
} from '../../domain/selectors.js';
import { shipmentCard, chipStrip, trialStrip, activeTrialId, setActiveTrialId } from '../common.js';

// The status filter is view-local so clicking among chips does not need a store
// write; the trial is shared with every other FO view.
let statusFilter = 'ALL';

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const trialId = activeTrialId(db, site);

  const all = shipmentsForSite(db, site.id).filter((s) => s.trialId === trialId);
  const visible = statusFilter === 'ALL' ? all : all.filter((s) => s.status === statusFilter);

  const options = [
    { value: 'ALL', label: 'All', count: all.length },
    ...SHIPMENT_STATUS_ORDER
      .map((status) => ({
        value: status,
        label: SHIPMENT_STATUS_META[status].label,
        count: all.filter((s) => s.status === status).length,
      }))
      .filter((o) => o.count > 0),
  ];

  const strip = trialStrip(db, site, trialId, (id) => {
    setActiveTrialId(id);
    // A status that only existed under the previous trial would show an empty list.
    statusFilter = 'ALL';
    rerender(main);
  });

  append(main, [
    sectionHead('Shipments', `${site.code} · ${site.address.city}`,
      btn('Request a new shipment', {
        variant: 'primary', iconName: 'plus',
        onClick: () => openRequestDialog(),
      })),

    card({ variant: 'card--tight' },
      strip,
      chipStrip(options, statusFilter, (value) => { statusFilter = value; rerender(main); })),

    visible.length
      ? h('div', { class: 'stack-sm' }, ...visible.map((s) => shipmentCard(
        db, s, () => navigate(`/fo/shipments/${s.id}`),
      )))
      : card({}, empty(
        statusFilter === 'ALL'
          ? 'This site has not requested anything for this trial yet.'
          : 'No shipments in that status.',
        'box',
        btn('Request a new shipment', {
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
 * Mirrors the dialog in the workflow diagram: pick a trial, then set a quantity
 * on one cadence card. The trial decides everything below it — which cadences
 * are offered, and the allocation the quantities are capped against, since a
 * site's stock and targets are held per trial.
 */
function openRequestDialog() {
  const db = store.getDb();
  const site = store.currentSite();
  const user = store.currentUser();

  const trialOptions = trialsForSite(db, site.id);
  let trialId = activeTrialId(db, site);
  let pickedCadenceId = null;
  const quantities = new Map(); // cadenceId -> Map(itemId -> qty)

  const body = h('div', { class: 'stack' });

  dialog('Request a new shipment', (closeFn) => {
    const foot = h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: () => closeFn() }),
      btn('Request shipment', {
        variant: 'primary',
        iconName: 'truck',
        onClick: () => submit(closeFn),
      }));
    build();
    return h('div', { class: 'stack' }, body, foot);
  }, { wide: true });

  function qtyMap(cadenceId) {
    if (!quantities.has(cadenceId)) quantities.set(cadenceId, new Map());
    return quantities.get(cadenceId);
  }

  function build() {
    body.replaceChildren();
    const siteTrial = getSiteTrial(db, site.id, trialId);
    const cadences = cadencesForTrial(db, trialId);
    const week = siteStudyWeek(siteTrial);

    append(body, [
      field('Trial', select(
        trialOptions.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
        {
          value: trialId,
          onChange: (e) => {
            trialId = e.target.value;
            // Caps and cadences belong to the trial, so nothing carries over.
            pickedCadenceId = null;
            quantities.clear();
            build();
          },
        },
      ), `This site is in study week ${week} of this trial.`),

      h('span', { class: 'card__label' }, 'Cadence'),
      h('p', { class: 'small muted' },
        'Pick a cadence and set how much you need. Quantities are capped at your site '
        + 'allocation for this trial, minus what you already hold and what is already on its way.'),

      cadences.length
        ? h('div', { class: 'cadence-grid' },
          ...cadences.map((cadence) => cadenceCard(cadence, week, siteTrial)))
        : empty('This trial has no cadences configured.', 'calendar'),
    ]);
  }

  function cadenceCard(cadence, week, siteTrial) {
    const picked = pickedCadenceId === cadence.id;
    const map = qtyMap(cadence.id);

    const node = h('div', {
      class: `cadence-card${picked ? ' is-picked' : ''}`,
    },
    h('div', { class: 'row-between' },
      h('div', { class: 'strong' }, cadence.name),
      h('span', { class: 'badge badge--quiet' },
        h('span', { class: 'badge__dot' }), `Week ${cadence.week}`)),
    cadence.week < week
      ? h('div', { class: 'small dim' }, 'Earlier than your current week')
      : null);

    for (const line of cadence.lines) {
      const item = getItem(db, line.itemId);
      const cap = requestableQty(db, siteTrial, line.itemId);
      const suggested = Math.min(line.suggestedQty, cap);
      if (!map.has(line.itemId)) map.set(line.itemId, suggested);

      const input = numberInput({
        min: 0,
        max: cap,
        step: 1,
        value: map.get(line.itemId),
        class: 'input--sm',
        'aria-label': `${item.name} quantity`,
        // Commit on change/blur only — re-rendering on every keystroke would steal focus.
        onChange: (e) => {
          const raw = Math.max(0, Math.round(Number(e.target.value) || 0));
          const clamped = Math.min(raw, cap);
          if (clamped !== raw) e.target.value = clamped;
          map.set(line.itemId, clamped);
          pickedCadenceId = cadence.id;
          markPicked();
        },
        onFocus: () => { pickedCadenceId = cadence.id; markPicked(); },
      });

      append(node, [h('div', { class: 'stack-sm' },
        h('div', { class: 'row' },
          h('div', { class: 'grow', style: { minWidth: 0 } },
            h('div', { class: 'small strong', title: item.name }, item.name),
            h('div', { class: 'small dim' },
              cap > 0 ? `up to ${fmtInt(cap)} ${item.unit}${cap === 1 ? '' : 's'}` : 'at target — none needed')),
          h('div', { style: { width: '82px' } }, input)))]);
    }

    return node;
  }

  function markPicked() {
    for (const el of body.querySelectorAll('.cadence-card')) el.classList.remove('is-picked');
    const cards = [...body.querySelectorAll('.cadence-card')];
    const cadences = cadencesForTrial(db, trialId);
    const idx = cadences.findIndex((c) => c.id === pickedCadenceId);
    if (idx >= 0 && cards[idx]) cards[idx].classList.add('is-picked');
  }

  function submit(closeFn) {
    if (!pickedCadenceId) {
      toast('Set a quantity on one of the cadences first.', 'warn');
      return;
    }
    const map = qtyMap(pickedCadenceId);
    const lines = [...map].map(([itemId, qty]) => ({ itemId, qty })).filter((l) => l.qty > 0);
    if (!lines.length) {
      toast('Every quantity is zero — nothing to request.', 'warn');
      return;
    }

    const created = store.update((d) => requestShipment(d, {
      siteId: site.id,
      trialId,
      cadenceId: pickedCadenceId,
      lines,
      userId: user.id,
    }));

    closeFn();
    if (created) {
      // Land the list on the trial the request was raised against.
      setActiveTrialId(trialId);
      toast(`${created.code} requested — the shipping coordinator has been notified.`);
      navigate(`/fo/shipments/${created.id}`);
    } else {
      toast('That request could not be created.', 'warn');
    }
  }
}
