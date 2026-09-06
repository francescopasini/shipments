// BO sites — list, detail and the add-a-site form.
//
// A site runs any number of trials. Everything that only makes sense for one
// study — allocation targets, the activation date the study week runs from, and
// the deposit coordinator who fields its requests — lives on the site-trial
// pairing, so the detail page is one section per trial.

import { h, append, fmtInt, fmtDate } from '../../ui/el.js';
import { icon } from '../../ui/icons.js';
import {
  card, tile, btn, iconBtn, badge, avatar, meter, empty, sectionHead,
  select, field, input, numberInput, toggle, toast, dialog, confirmDialog,
} from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { COUNTRIES } from '../../domain/constants.js';
import { totalAtSite } from '../../domain/stock.js';
import {
  getTrial, coordinatorsForSite, userName, shippingCoordinators, allTrials, byCode,
  siteStockRows, shipmentsForSite, cadencesForTrial, countryName,
  siteTrialsForSite, trialsForSite, trialSummary, siteStudyWeek,
} from '../../domain/selectors.js';
import { shipmentCard, chipStrip } from '../common.js';

const filters = { scope: 'ACTIVE', trial: 'ALL' };

/** The allocation targets a trial's cadences imply — what a new pairing starts from. */
function targetsFromCadences(db, trialId) {
  const targets = new Map();
  for (const cadence of cadencesForTrial(db, trialId)) {
    for (const line of cadence.lines) {
      targets.set(line.itemId, (targets.get(line.itemId) || 0) + line.suggestedQty);
    }
  }
  return [...targets].map(([itemId, targetQty]) => ({ itemId, targetQty }));
}

/* ---------- list ---------- */

export function renderList(main) {
  const db = store.getDb();
  const rerender = () => { main.replaceChildren(); renderList(main); };

  const visible = byCode(db.sites.filter((site) => {
    if (filters.scope === 'ACTIVE' && !site.active) return false;
    if (filters.scope === 'INACTIVE' && site.active) return false;
    // A site matches the trial filter if any of its pairings do.
    if (filters.trial !== 'ALL'
      && !db.siteTrials.some((st) => st.siteId === site.id && st.trialId === filters.trial)) {
      return false;
    }
    return true;
  }));

  append(main, [
    sectionHead('Sites', `${visible.length} of ${db.sites.length} shown`,
      btn('Add a site', {
        variant: 'primary', iconName: 'plus', onClick: () => navigate('/bo/sites/new'),
      })),

    card({ variant: 'card--tight' },
      chipStrip([
        { value: 'ACTIVE', label: 'Active', count: db.sites.filter((s) => s.active).length },
        { value: 'INACTIVE', label: 'Inactive', count: db.sites.filter((s) => !s.active).length },
        { value: 'ALL', label: 'All', count: db.sites.length },
      ], filters.scope, (v) => { filters.scope = v; rerender(); }),
      h('div', { style: { maxWidth: '320px' } }, field('Trial', select([
        { value: 'ALL', label: 'All trials' },
        ...allTrials(db).map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
      ], {
        value: filters.trial,
        onChange: (e) => { filters.trial = e.target.value; rerender(); },
      })))),

    visible.length
      ? h('div', { class: 'stack-sm' }, ...visible.map((site) => siteCard(db, site)))
      : card({}, empty('No sites match those filters.', 'building')),
  ]);
}

function siteCard(db, site) {
  const trials = trialsForSite(db, site.id);
  const open = shipmentsForSite(db, site.id).filter((s) => s.status !== 'DELIVERED').length;

  return h('button', {
    type: 'button',
    class: 'card card--tight card--action',
    onClick: () => navigate(`/bo/sites/${site.id}`),
  },
  h('div', { class: 'row-wrap' },
    h('div', { class: 'grow', style: { minWidth: '160px' } },
      h('div', { class: 'strong truncate' }, `${site.code} · ${site.name}`),
      h('div', { class: 'small dim truncate' },
        `${site.address.city}, ${countryName(site.address.country)}`)),
    h('div', { class: 'small dim right nowrap' },
      h('div', { class: 'truncate' },
        `${trials.length} trial${trials.length === 1 ? '' : 's'} · ${trialSummary(db, site.id)}`),
      h('div', {}, `${open} open`)),
    badge(site.active ? 'Active' : 'Inactive', site.active ? 'sage' : 'rose'),
    icon('arrowRight', 17)));
}

/* ---------- detail ---------- */

export function renderDetail(main, params) {
  const db = store.getDb();
  const site = db.sites.find((s) => s.id === params.id);

  if (!site) {
    append(main, [card({}, empty('That site no longer exists.', 'building',
      btn('Back to sites', { variant: 'primary', onClick: () => navigate('/bo/sites') })))]);
    return;
  }

  const peers = coordinatorsForSite(db, site.id);
  const siteTrials = siteTrialsForSite(db, site.id);
  const shipments = shipmentsForSite(db, site.id);
  const unassigned = allTrials(db).filter((t) => !siteTrials.some((st) => st.trialId === t.id));

  const back = iconBtn('arrowRight', {
    variant: 'ghost', class: 'flip', 'aria-label': 'Back to sites',
    onClick: () => navigate('/bo/sites'),
  });

  append(main, [
    card({},
      h('div', { class: 'row-between' },
        h('div', { class: 'row' },
          back,
          tile('building'),
          h('div', {},
            h('div', { class: 'page-head__title' }, `${site.code} · ${site.name}`),
            h('div', { class: 'small dim' },
              `${site.address.city}, ${countryName(site.address.country)}`))),
        badge(site.active ? 'Active' : 'Inactive', site.active ? 'sage' : 'rose')),
      h('div', { class: 'row-wrap' },
        toggle('Site is active', site.active, (checked) => {
          store.update((d) => {
            const found = d.sites.find((s) => s.id === site.id);
            if (found) found.active = checked;
          });
          toast(`${site.code} marked ${checked ? 'active' : 'inactive'}.`, 'info');
        }),
        // Whether a proforma invoice is needed is customs-driven, so it applies
        // to every study shipping to this site.
        toggle('Requires PFI approval', site.requiresPfiApproval, (checked) => {
          store.update((d) => {
            const found = d.sites.find((s) => s.id === site.id);
            if (found) found.requiresPfiApproval = checked;
          });
          toast(`PFI approval ${checked ? 'now required' : 'no longer required'} for ${site.code}.`, 'info');
        }))),

    h('div', { class: 'bento' },
      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' }, tile('pin'),
          h('div', { class: 'card__title' }, 'Address')),
        h('div', { class: 'kv' },
          h('span', { class: 'kv__k' }, 'Street'),
          h('span', { class: 'kv__v' }, site.address.street),
          h('span', { class: 'kv__k' }, 'City'),
          h('span', { class: 'kv__v' }, `${site.address.postalCode} ${site.address.city}`),
          h('span', { class: 'kv__k' }, 'Country'),
          h('span', { class: 'kv__v' }, countryName(site.address.country)),
          h('span', { class: 'kv__k' }, 'Trials'),
          h('span', { class: 'kv__v' }, trialSummary(db, site.id)),
          h('span', { class: 'kv__k' }, 'Stock on site'),
          h('span', { class: 'kv__v tnum' }, `${fmtInt(totalAtSite(db, site.id))} units`)))),

      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row' }, tile('users'),
          h('div', { class: 'card__title' }, 'Site coordinators')),
        h('p', { class: 'small dim' },
          'Front-office users with access to this site. Deposit coordinators are assigned '
          + 'per trial, below.'),
        peers.length
          ? h('div', { class: 'stack-sm' }, ...peers.map((p) => h('div', { class: 'row' },
            avatar(p.name),
            h('div', { class: 'grow', style: { minWidth: 0 } },
              h('div', { class: 'strong truncate' }, p.name),
              h('div', { class: 'small dim truncate' }, p.email)),
            h('span', { class: 'small dim nowrap' },
              `${p.siteIds.length} site${p.siteIds.length === 1 ? '' : 's'}`))))
          : empty('No front-office coordinators assigned.', 'users'))),

      h('div', { class: 'col-12' }, card({ variant: 'card--tight' },
        h('div', { class: 'row-between' },
          h('div', { class: 'row' }, tile('flask'),
            h('div', {},
              h('div', { class: 'card__title' }, `Trials at this site · ${siteTrials.length}`),
              h('div', { class: 'small dim' },
                'Each has its own targets, stock, coordinator and study week'))),
          btn('Add a trial', {
            variant: 'primary', size: 'sm', iconName: 'plus',
            disabled: !unassigned.length,
            onClick: () => openAddTrialDialog(site, unassigned),
          })))),

      ...(siteTrials.length
        ? siteTrials.map((st) => h('div', { class: 'col-6' }, siteTrialCard(db, site, st)))
        : [h('div', { class: 'col-12' }, card({},
          empty('This site is not running any trial yet.', 'flask',
            btn('Add a trial', {
              variant: 'primary',
              disabled: !unassigned.length,
              onClick: () => openAddTrialDialog(site, unassigned),
            }))))]),

      h('div', { class: 'col-12' }, card({},
        h('div', { class: 'row' }, tile('box'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Shipments'),
            h('div', { class: 'small dim' }, `${shipments.length} raised by this site`))),
        shipments.length
          ? h('div', { class: 'stack-sm' }, ...shipments.slice(0, 6).map((s) => shipmentCard(
            db, s, () => navigate(`/bo/shipments/${s.id}`),
          )))
          : empty('This site has not requested anything yet.', 'box'))),
    ),
  ]);
}

/** One trial running at this site: its coordinator, cadences and allocation targets. */
function siteTrialCard(db, site, siteTrial) {
  const trial = getTrial(db, siteTrial.trialId);
  const rows = siteStockRows(db, siteTrial);
  const cadences = cadencesForTrial(db, siteTrial.trialId);
  const coordinators = shippingCoordinators(db);
  const shipmentCount = db.shipments
    .filter((s) => s.siteId === site.id && s.trialId === siteTrial.trialId).length;

  return card({},
    h('div', { class: 'row-between' },
      h('div', { class: 'row' }, tile('flask'),
        h('div', {},
          h('div', { class: 'card__title' }, trial ? trial.code : '—'),
          h('div', { class: 'small dim' }, trial ? trial.name : ''))),
      iconBtn('close', {
        variant: 'ghost',
        'aria-label': `Remove ${trial ? trial.code : 'trial'} from ${site.code}`,
        onClick: () => removeSiteTrial(site, siteTrial, trial, shipmentCount),
      })),

    h('div', { class: 'kv' },
      h('span', { class: 'kv__k' }, 'Activated'),
      h('span', { class: 'kv__v' },
        `${fmtDate(siteTrial.activatedOn)} · week ${siteStudyWeek(siteTrial)}`),
      h('span', { class: 'kv__k' }, 'Shipments'),
      h('span', { class: 'kv__v' }, String(shipmentCount))),

    field('Shipping coordinator', select(
      coordinators.map((c) => ({ value: c.id, label: `${c.name} — ${c.email}` })),
      {
        value: siteTrial.shippingCoordinatorId,
        onChange: (e) => {
          const next = e.target.value;
          store.update((d) => {
            const found = d.siteTrials.find((st) => st.id === siteTrial.id);
            if (found) found.shippingCoordinatorId = next;
          });
          toast(`${userName(store.getDb(), next)} now coordinates ${trial ? trial.code : 'this trial'} at ${site.code}.`, 'info');
        },
      },
    ), 'Requests for this trial land in their task list.'),

    h('hr', { class: 'divider' }),
    h('span', { class: 'card__label' }, `Cadences · ${cadences.length}`),
    cadences.length
      ? h('div', { class: 'row-wrap' }, ...cadences.map((c) => h('span', { class: 'badge badge--quiet' },
        h('span', { class: 'badge__dot' }), `${c.name} · wk ${c.week}`)))
      : h('p', { class: 'small dim' }, 'No cadences configured for this trial.'),

    h('hr', { class: 'divider' }),
    h('div', { class: 'row-between' },
      h('div', {},
        h('span', { class: 'card__label' }, 'Allocated items'),
        h('div', { class: 'small dim' }, 'Target stock held here for this trial')),
      btn('Edit targets', {
        variant: 'ghost', size: 'sm', iconName: 'edit',
        onClick: () => openAllocationDialog(site, siteTrial, trial),
      })),
    rows.length
      ? h('div', { class: 'stack-sm' }, ...rows.map((r) => h('div', { class: 'stack-sm' },
        h('div', { class: 'row-between' },
          h('span', { class: 'small truncate' }, r.item.name),
          h('span', { class: 'small strong tnum nowrap' },
            `${fmtInt(r.held)} / ${fmtInt(r.target)}`)),
        meter(r.ratio))))
      : empty('No allocations configured.', 'warehouse'));
}

/** Edit the per-item target stock for one site-trial. */
function openAllocationDialog(site, siteTrial, trial) {
  const db = store.getDb();
  const draft = new Map(siteTrial.allocations.map((a) => [a.itemId, a.targetQty]));
  const title = `Allocations · ${site.code} · ${trial ? trial.code : ''}`;

  dialog(title, (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      'The target is the most this site may hold of each item for this trial. Front-office '
      + 'users can only request up to the target, minus what they hold and what is inbound. '
      + 'Other trials at this site are unaffected.'),
    h('div', { class: 'stack-sm' }, ...db.items.map((item) => {
      const control = numberInput({
        min: 0,
        step: 1,
        value: draft.get(item.id) || 0,
        class: 'input--sm',
        'aria-label': `${item.name} target`,
        onChange: (e) => draft.set(item.id, Math.max(0, Math.round(Number(e.target.value) || 0))),
      });
      return h('div', { class: 'row' },
        h('div', { class: 'grow', style: { minWidth: 0 } },
          h('div', { class: 'small strong truncate' }, item.name),
          h('div', { class: 'small dim' }, `${item.code} · per ${item.unit}`)),
        h('div', { style: { width: '96px' } }, control));
    })),
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: close }),
      btn('Save allocations', {
        variant: 'primary',
        onClick: () => {
          store.update((d) => {
            const found = d.siteTrials.find((st) => st.id === siteTrial.id);
            if (!found) return;
            found.allocations = [...draft]
              .filter(([, qty]) => qty > 0)
              .map(([itemId, targetQty]) => ({ itemId, targetQty }));
          });
          close();
          toast(`Allocations saved for ${site.code} · ${trial ? trial.code : ''}.`);
        },
      }))), { wide: true });
}

/** Start running another trial at this site. Targets are inherited from its cadences. */
function openAddTrialDialog(site, unassigned) {
  const db = store.getDb();
  const coordinators = shippingCoordinators(db);
  let trialId = unassigned[0] ? unassigned[0].id : null;
  let coordinatorId = coordinators[0] ? coordinators[0].id : null;

  dialog(`Add a trial · ${site.code}`, (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      'The new pairing starts today, so its study week begins at 1, and it inherits its '
      + 'allocation targets from the trial’s cadences. Its stock starts empty and fills as '
      + 'shipments are delivered.'),
    field('Trial', select(
      unassigned.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
      { value: trialId, onChange: (e) => { trialId = e.target.value; } },
    )),
    field('Shipping coordinator', select(
      coordinators.map((c) => ({ value: c.id, label: `${c.name} — ${c.email}` })),
      { value: coordinatorId, onChange: (e) => { coordinatorId = e.target.value; } },
    ), 'Receives this trial’s shipment tasks for this site.'),
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: close }),
      btn('Add trial', {
        variant: 'primary',
        iconName: 'plus',
        onClick: () => {
          if (!trialId || !coordinatorId) {
            toast('Pick a trial and a coordinator.', 'warn');
            return;
          }
          const created = store.update((d) => {
            const siteTrial = {
              id: `st-${d.siteTrials.length + 1}-${Date.now().toString(36)}`,
              siteId: site.id,
              trialId,
              activatedOn: new Date().toISOString(),
              shippingCoordinatorId: coordinatorId,
              allocations: targetsFromCadences(d, trialId),
            };
            d.siteTrials.push(siteTrial);
            return siteTrial;
          });
          close();
          const trial = getTrial(store.getDb(), created.trialId);
          toast(`${trial ? trial.code : 'Trial'} added to ${site.code} with `
            + `${created.allocations.length} allocated items.`);
        },
      }))), { narrow: true });
}

/** Stop running a trial at this site. Refused while it still has shipments. */
function removeSiteTrial(site, siteTrial, trial, shipmentCount) {
  const label = trial ? trial.code : 'this trial';
  if (shipmentCount) {
    toast(`${label} has ${shipmentCount} shipment${shipmentCount === 1 ? '' : 's'} at `
      + `${site.code} — it cannot be removed.`, 'warn');
    return;
  }
  confirmDialog(
    `Remove ${label} from ${site.code}?`,
    'Its allocation targets and study week are discarded. Any stock recorded against this '
    + 'pairing stays in the ledger but stops being counted.',
    'Remove trial',
    () => {
      store.update((d) => {
        const idx = d.siteTrials.findIndex((st) => st.id === siteTrial.id);
        if (idx >= 0) d.siteTrials.splice(idx, 1);
      });
      toast(`${label} removed from ${site.code}.`, 'info');
    },
    'stop',
  );
}

/* ---------- new site ---------- */

export function renderNew(main) {
  const db = store.getDb();
  const coordinators = shippingCoordinators(db);

  const fields = {
    code: input({ placeholder: 'S013', maxlength: 6 }),
    name: input({ placeholder: 'Hospital name' }),
    street: input({ placeholder: 'Street and number' }),
    postalCode: input({ placeholder: '00100' }),
    city: input({ placeholder: 'City' }),
  };
  const trialOptions = allTrials(db);
  let country = 'IT';
  // A site can start on several studies at once, so this is a set, not a choice.
  const pickedTrials = new Set(trialOptions[0] ? [trialOptions[0].id] : []);
  let coordinatorId = coordinators[0] ? coordinators[0].id : null;
  let requiresPfi = true;
  let active = true;

  const problem = h('p', { class: 'small' });

  const save = () => {
    const code = fields.code.value.trim().toUpperCase();
    const name = fields.name.value.trim();
    const city = fields.city.value.trim();

    const issues = [];
    if (!code) issues.push('Give the site a code.');
    else if (db.sites.some((s) => s.code.toUpperCase() === code)) issues.push(`${code} is already taken.`);
    if (!name) issues.push('Give the site a name.');
    if (!city) issues.push('Enter the city.');
    if (!pickedTrials.size) issues.push('Pick at least one trial.');
    if (!coordinatorId) issues.push('Pick a shipping coordinator.');

    if (issues.length) {
      problem.style.color = 'var(--clay-rose-ink)';
      problem.textContent = issues[0];
      return;
    }

    const created = store.update((d) => {
      const site = {
        id: `site-${d.sites.length + 1}-${Date.now().toString(36)}`,
        code,
        name,
        address: {
          street: fields.street.value.trim() || '—',
          city,
          country,
          postalCode: fields.postalCode.value.trim() || '—',
        },
        active,
        requiresPfiApproval: requiresPfi,
      };
      d.sites.push(site);

      // One pairing per trial picked, each inheriting that trial's cadence totals.
      for (const trialId of pickedTrials) {
        d.siteTrials.push({
          id: `st-${d.siteTrials.length + 1}-${Date.now().toString(36)}`,
          siteId: site.id,
          trialId,
          activatedOn: new Date().toISOString(),
          shippingCoordinatorId: coordinatorId,
          allocations: targetsFromCadences(d, trialId),
        });
      }
      return site;
    });

    const count = pickedTrials.size;
    toast(`${created.code} created on ${count} trial${count === 1 ? '' : 's'}.`);
    navigate(`/bo/sites/${created.id}`);
  };

  append(main, [
    sectionHead('Add a site', 'The new site inherits allocation targets from each trial it runs'),

    card({},
      h('div', { class: 'bento' },
        h('div', { class: 'col-3' }, field('Site code', fields.code, 'Shown throughout the app.')),
        h('div', { class: 'col-9' }, field('Site name', fields.name)),
        h('div', { class: 'col-6' }, field('Street', fields.street)),
        h('div', { class: 'col-3' }, field('Postcode', fields.postalCode)),
        h('div', { class: 'col-3' }, field('City', fields.city)),
        h('div', { class: 'col-4' }, field('Country', select(
          Object.entries(COUNTRIES).map(([code, label]) => ({ value: code, label })),
          { value: country, onChange: (e) => { country = e.target.value; } },
        ))),
        h('div', { class: 'col-8' }, field('Shipping coordinator', select(
          coordinators.map((c) => ({ value: c.id, label: `${c.name} — ${c.email}` })),
          { value: coordinatorId, onChange: (e) => { coordinatorId = e.target.value; } },
        ), 'Takes every trial to begin with; reassign per trial afterwards.'))),

      h('hr', { class: 'divider' }),
      h('span', { class: 'card__label' }, 'Trials'),
      h('p', { class: 'small muted' },
        'Pick every trial this site will run. Each one gets its own allocation targets, '
        + 'stock and study week.'),
      h('div', { class: 'stack-sm' }, ...trialOptions.map((trial) => toggle(
        `${trial.code} — ${trial.name}`,
        pickedTrials.has(trial.id),
        (checked) => {
          if (checked) pickedTrials.add(trial.id);
          else pickedTrials.delete(trial.id);
        },
      ))),

      h('hr', { class: 'divider' }),
      h('div', { class: 'row-wrap' },
        toggle('Site is active', active, (v) => { active = v; }),
        toggle('Requires PFI approval', requiresPfi, (v) => { requiresPfi = v; })),

      problem,

      h('div', { class: 'row-wrap' },
        btn('Create site', { variant: 'primary', iconName: 'plus', onClick: save }),
        btn('Cancel', { variant: 'ghost', onClick: () => navigate('/bo/sites') }))),
  ]);
}
