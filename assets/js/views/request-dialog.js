// The "request a shipment" dialog, shared by both sides.
//
// The front office raises requests for the site it is standing in; the deposit
// raises them on a site's behalf and so has to pick the site first. Everything
// below that choice is identical — the same fixed bundles, the same per-pairing
// ceiling, the same multiples of five — so it lives here once rather than being
// kept in step in two places.

import { h, append, fmtInt } from '../ui/el.js';
import {
  btn, empty, dialog, select, numberInput, field, toast,
} from '../ui/components.js';
import { navigate } from '../router.js';
import * as store from '../store.js';
import { requestShipment } from '../domain/workflow.js';
import { requestableCadenceUnits } from '../domain/stock.js';
import {
  cadencesForTrial, cadenceItems, getSiteTrial, trialsForSite, allSites,
} from '../domain/selectors.js';

/** Cadences are ordered in multiples of five. */
const STEP = 5;

/**
 * Mirrors the dialog in the workflow diagram: pick a trial, then set a quantity
 * on one or more cadence cards. The trial decides everything below it — which
 * cadences are offered, and the ceiling each quantity is capped against, since a
 * site's stock and cadence limit are held per trial.
 *
 * @param {object}   opts
 * @param {?string}  opts.siteId     Site to open on; the only one if !chooseSite.
 * @param {boolean}  opts.chooseSite Show a site selector — the deposit orders for
 *                                   any site, the front office only for its own.
 * @param {?string}  opts.trialId    Trial to open on, if it still applies.
 * @param {function} opts.detailPath (shipmentId) => route to open on success.
 * @param {function} opts.onCreated  Called with the trial that was ordered against.
 */
export function openRequestDialog({
  siteId = null,
  chooseSite = false,
  trialId = null,
  detailPath,
  onCreated = () => {},
} = {}) {
  const db = store.getDb();
  const user = store.currentUser();

  // Only sites the deposit has actually paired with a trial can be ordered for.
  const siteOptions = allSites(db).filter((x) => trialsForSite(db, x.id).length);
  let currentSiteId = siteOptions.some((x) => x.id === siteId)
    ? siteId
    : (siteId || (siteOptions[0] && siteOptions[0].id) || null);
  let currentTrialId = null;
  // Every cadence can carry a number. Whatever is non-zero when the request is
  // sent travels together in one shipment.
  const units = new Map(); // cadenceId -> how many of that cadence

  /** Settle on a trial that the chosen site actually runs. */
  function pickTrial(preferred) {
    const options = trialsForSite(db, currentSiteId);
    currentTrialId = [preferred, options[0] && options[0].id]
      .find((id) => options.some((t) => t.id === id)) || null;
  }
  pickTrial(trialId);

  const body = h('div', { class: 'stack' });

  dialog('Request a shipment', (closeFn) => {
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

  function build() {
    body.replaceChildren();
    const siteTrial = getSiteTrial(db, currentSiteId, currentTrialId);
    const cadences = currentTrialId ? cadencesForTrial(db, currentTrialId) : [];
    const trialOptions = trialsForSite(db, currentSiteId);

    append(body, [
      // Site above trial, because the site is what narrows the trial list.
      chooseSite
        ? field('Site', select(
          siteOptions.map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` })),
          {
            value: currentSiteId,
            onChange: (e) => {
              currentSiteId = e.target.value;
              // Trials, caps and cadences all belong to the pairing.
              units.clear();
              pickTrial(null);
              build();
            },
          },
        ))
        : null,

      field('Trial', select(
        trialOptions.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
        {
          value: currentTrialId,
          onChange: (e) => {
            currentTrialId = e.target.value;
            // Caps and cadences belong to the trial, so nothing carries over.
            units.clear();
            build();
          },
        },
      )),

      h('span', { class: 'card__label' }, 'Cadence'),

      cadences.length && siteTrial
        ? h('div', { class: 'cadence-grid' },
          ...cadences.map((cadence) => cadenceCard(cadence, siteTrial)))
        : empty('This trial has no cadences configured.', 'calendar'),
    ]);
  }

  function cadenceCard(cadence, siteTrial) {
    // Cadences are ordered in fives, so the usable ceiling is the largest
    // multiple of five that still fits under the site's limit.
    const cap = Math.floor(requestableCadenceUnits(db, siteTrial, cadence) / STEP) * STEP;
    const contents = cadenceItems(db, cadence);
    if (!units.has(cadence.id)) units.set(cadence.id, 0);

    const node = h('div', {
      class: `cadence-card${units.get(cadence.id) > 0 ? ' is-picked' : ''}${cap ? '' : ' is-blocked'}`,
    },
    h('div', { class: 'row-between' },
      h('div', { class: 'strong' }, cadence.name),
      h('span', { class: 'badge badge--quiet' },
        h('span', { class: 'badge__dot' }), `Week ${cadence.week}`)),
    // The bundle is fixed, so its contents are listed rather than offered — one
    // item per line, because a run-on sentence of names is read as decoration
    // and this is the thing the site is actually choosing between.
    contents.length
      ? h('ul', { class: 'cadence-items' },
        ...contents.map((it) => h('li', {}, it.name)))
      : h('div', { class: 'small dim' }, 'No items in this cadence'));

    if (!cap) {
      append(node, [h('div', { class: 'small' },
        siteTrial.maxCadenceUnits
          ? 'This site has reached its limit for this cadence.'
          : 'The deposit has not set a limit for this site yet, so nothing can be ordered.')]);
      return node;
    }

    const input = numberInput({
      min: 0,
      max: cap,
      step: STEP,
      value: units.get(cadence.id),
      class: 'input--sm',
      'aria-label': `Quantity of ${cadence.name}`,
      // Commit on change/blur only — re-rendering on every keystroke would steal focus.
      onChange: (e) => {
        // Snap to the nearest five, whatever was typed.
        const raw = Math.max(0, Math.round((Number(e.target.value) || 0) / STEP) * STEP);
        const clamped = Math.min(raw, cap);
        if (clamped !== Number(e.target.value)) e.target.value = clamped;
        units.set(cadence.id, clamped);
        // The card highlights itself once it is carrying a number, so a request
        // spanning two cadences shows both.
        node.classList.toggle('is-picked', clamped > 0);
      },
    });

    append(node, [h('div', { class: 'row' },
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { class: 'small strong' }, 'Quantity')),
      h('div', { style: { width: '72px' } }, input),
      // The ceiling sits against the box it constrains, so the pair reads as
      // one figure: what you have asked for, out of what you may.
      h('span', { class: 'small dim nowrap' }, `/ ${fmtInt(cap)}`))]);
    return node;
  }

  function submit(closeFn) {
    const picks = [...units]
      .filter(([, n]) => n > 0)
      .map(([cadenceId, n]) => ({ cadenceId, units: n }));
    if (!picks.length) {
      toast('Set how many you need on at least one cadence.', 'warn');
      return;
    }

    const created = store.update((d) => requestShipment(d, {
      siteId: currentSiteId,
      trialId: currentTrialId,
      picks,
      userId: user.id,
    }));

    closeFn();
    if (created) {
      onCreated(currentTrialId, currentSiteId);
      toast(`${created.code} requested — the shipping coordinator has been notified.`);
      navigate(detailPath(created.id));
    } else {
      toast('That request could not be created.', 'warn');
    }
  }
}
