// BO trials — list, detail (sites + cadences) and the add-a-trial form.

import { h, append, fmtInt } from '../../ui/el.js';
import { icon } from '../../ui/icons.js';
import {
  card, tile, btn, iconBtn, badge, empty, sectionHead,
  select, field, input, numberInput, toggle, toast, dialog, confirmDialog,
} from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import {
  getTrial, getSite, sitesForTrial, siteTrialsForTrial, cadencesForTrial,
  allTrials, allSites, trialsForSite, cadenceItems,
  shippingCoordinators, getSiteTrial, siteTitle, siteWhere,
} from '../../domain/selectors.js';
import { onSection } from '../filters.js';

const filters = { site: 'ALL' };

/**
 * Open the list showing only what one site runs. Called from the site page, so
 * "N trials" there lands on the same N here rather than the whole catalogue.
 */
export function showSite(siteId) {
  filters.site = siteId;
}

/* ---------- list ---------- */

export function renderList(main) {
  const db = store.getDb();
  const rerender = () => { main.replaceChildren(); renderList(main); };

  // A site filter that no longer names a site would silently hide everything.
  if (filters.site !== 'ALL' && !db.sites.some((x) => x.id === filters.site)) filters.site = 'ALL';
  const visible = filters.site === 'ALL' ? allTrials(db) : trialsForSite(db, filters.site);

  append(main, [
    sectionHead('Trials', `${visible.length} of ${db.trials.length} shown`,
      btn('Add a trial', {
        variant: 'primary', iconName: 'plus', onClick: () => navigate('/bo/trials/new'),
      })),

    card({ variant: 'card--tight' },
      h('div', { class: 'filters' },
        h('div', { style: { minWidth: '220px' } }, field('Site', select([
          { value: 'ALL', label: 'All sites' },
          ...allSites(db).map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` })),
        ], {
          value: filters.site,
          onChange: (e) => { filters.site = e.target.value; rerender(); },
        }))),
        filters.site !== 'ALL'
          ? btn('Clear filter', {
            variant: 'ghost', size: 'sm', iconName: 'close',
            onClick: () => { filters.site = 'ALL'; rerender(); },
          })
          : null)),

    visible.length
      ? h('div', { class: 'stack-sm' }, ...visible.map((trial) => {
      const sites = sitesForTrial(db, trial.id);
      const cadences = cadencesForTrial(db, trial.id);
      const shipments = db.shipments.filter((s) => s.trialId === trial.id);

      return h('button', {
        type: 'button',
        class: 'card card--tight card--action',
        onClick: () => navigate(`/bo/trials/${trial.id}`),
      },
      h('div', { class: 'row-wrap' },
        h('div', { class: 'grow', style: { minWidth: '180px' } },
          h('div', { class: 'strong truncate' }, `${trial.code} · ${trial.name}`),
          h('div', { class: 'small dim truncate' }, `${trial.sponsor} · ${trial.phase}`)),
        h('div', { class: 'small dim right nowrap' },
          h('div', {}, `${sites.filter((s) => s.active).length} active sites`),
          h('div', {}, `${cadences.length} cadences · ${shipments.length} shipments`)),
        badge(trial.status, trial.status === 'Active' ? 'sage' : 'rose'),
        icon('arrowRight', 17)));
      }))
      : card({}, empty('That site is not running any trial yet.', 'flask',
        btn('Clear filter', {
          variant: 'primary',
          onClick: () => { filters.site = 'ALL'; rerender(); },
        }))),
  ]);
}

/* ---------- detail ---------- */

export function renderDetail(main, params) {
  const db = store.getDb();
  const trial = getTrial(db, params.id);

  if (!trial) {
    append(main, [card({}, empty('That trial no longer exists.', 'flask',
      btn('Back to trials', { variant: 'primary', onClick: () => navigate('/bo/trials') })))]);
    return;
  }

  const siteTrials = siteTrialsForTrial(db, trial.id);
  const unassignedSites = allSites(db).filter((x) => !siteTrials.some((st) => st.siteId === x.id));
  const cadences = cadencesForTrial(db, trial.id);

  const back = iconBtn('arrowRight', {
    variant: 'ghost', class: 'flip', 'aria-label': 'Back to trials',
    onClick: () => navigate('/bo/trials'),
  });

  append(main, [
    card({},
      h('div', { class: 'row-between' },
        h('div', { class: 'row' },
          back,
          tile('flask'),
          h('div', {},
            h('div', { class: 'page-head__title' }, `${trial.code} · ${trial.name}`),
            h('div', { class: 'small dim' }, `${trial.sponsor} · ${trial.phase}`))),
        // The name is part of the title, so it is corrected from the title.
        btn('Edit', {
          variant: 'ghost', size: 'sm', iconName: 'edit',
          'aria-label': `Edit ${trial.code}`,
          onClick: () => openTrialDialog(trial),
        }))),

    h('div', { class: 'bento' },
      h('div', { class: 'col-6' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' }, tile('calendar'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Cadences'),
              h('div', { class: 'small dim' },
                'What a site may request, and the week it is expected'))),
          // The card's own title says what is being edited.
          btn('Edit', {
            variant: 'ghost', size: 'sm', iconName: 'edit',
            'aria-label': 'Edit cadences',
            onClick: () => openCadencesDialog(trial),
          })),
        cadences.length
          ? h('div', { class: 'stack-sm' }, ...cadences.map((cadence) => h('div', {
            class: 'cadence-card',
          },
          h('div', { class: 'row-between' },
            h('div', { class: 'strong' }, cadence.name),
            h('span', { class: 'badge badge--quiet' },
              h('span', { class: 'badge__dot' }), `Week ${cadence.week}`)),
          h('div', { class: 'row-wrap' }, ...cadenceItems(db, cadence).map((item) => h('span', {
            class: 'small',
          }, item.name))))))
          : empty('No cadences configured for this trial.', 'calendar'))),

      // Where a site starts or stops running this trial. The pairing is governed
      // from here rather than from the site, so one study's footprint is managed
      // in one place.
      h('div', { class: 'col-6' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' }, tile('building'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Sites'),
              h('div', { class: 'small dim' }, 'How much of a cadence each may take'))),
          // Adding, removing and re-targeting all happen in one dialog, as they
          // do for cadences — the card itself is a read-out, not a control panel.
          btn('Edit', {
            variant: 'ghost', size: 'sm', iconName: 'edit',
            'aria-label': 'Edit sites',
            onClick: () => openSitesDialog(trial),
          })),
        siteTrials.length
          ? sitesTable(db, trial, siteTrials)
          : empty('No sites are running this trial.', 'building',
            btn('Add a site', {
              variant: 'primary',
              disabled: !unassignedSites.length,
              onClick: () => openAddSiteDialog(trial, unassignedSites),
            })))),
    ),
  ]);
}


/**
 * Correct a trial's name, sponsor, phase and whether it is running. The code is
 * left alone: it is how everyone refers to the study, it appears on every
 * shipment, and a prototype has no business making it look re-assignable.
 *
 * A trial is either Active or Inactive — the intermediate states a protocol
 * really has (planned, recruiting, closed) say nothing about whether the deposit
 * may ship to it, which is the only thing this app acts on.
 */
function openTrialDialog(trial) {
  const nameField = input({ value: trial.name, placeholder: 'Short study description' });
  const sponsorField = input({ value: trial.sponsor, placeholder: 'Sponsor name' });
  let phase = trial.phase;
  let active = trial.status === 'Active';
  const problem = h('p', { class: 'small' });

  dialog(`Edit · ${trial.code}`, (close) => h('div', { class: 'stack' },
    field('Trial name', nameField, `Shown everywhere as \u201c${trial.code} \u00b7 name\u201d.`),
    h('div', { class: 'bento' },
      h('div', { class: 'col-6' }, field('Sponsor', sponsorField)),
      h('div', { class: 'col-6' }, field('Phase', select(
        ['Phase I', 'Phase II', 'Phase III', 'Phase IV'].map((x) => ({ value: x, label: x })),
        { value: phase, onChange: (e) => { phase = e.target.value; } },
      )))),
    h('div', { class: 'stack-sm' },
      toggle('Trial is active', active, (v) => { active = v; }),
      h('div', { class: 'small dim' },
        'An inactive trial keeps its history, its cadences and its sites — it simply is '
        + 'not one the deposit is shipping for.')),
    problem,
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: close }),
      btn('Save trial', {
        variant: 'primary',
        onClick: () => {
          const name = nameField.value.trim();
          if (!name) {
            problem.style.color = 'var(--clay-rose-ink)';
            problem.textContent = 'Give the trial a name.';
            return;
          }
          store.update((d) => {
            const found = d.trials.find((t) => t.id === trial.id);
            if (!found) return;
            found.name = name;
            found.sponsor = sponsorField.value.trim() || '\u2014';
            found.phase = phase;
            found.status = active ? 'Active' : 'Inactive';
          });
          close();
          toast(`${trial.code} saved.`);
        },
      }))), { narrow: true });
}

/**
 * The pairings as a table: one row per site, its target beside it. A row is a
 * link to the site — the whole row, because the site name alone would be a very
 * small target and the target quantity belongs to the same subject.
 */
function sitesTable(db, trial, siteTrials) {
  const open = (siteId) => navigate(`/bo/sites/${siteId}`);

  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table table--fit' },
      h('thead', {}, h('tr', {},
        h('th', { class: 'col-head' }, 'Site'),
        h('th', { style: { width: '132px' } }, 'Target quantity'))),
      h('tbody', {}, ...siteTrials.map((st) => {
        const site = getSite(db, st.siteId);
        if (!site) return null;
        return h('tr', {
          class: 'is-clickable',
          tabindex: '0',
          role: 'link',
          onClick: () => open(site.id),
          // A row is not a button, so Enter has to be wired up by hand.
          onKeydown: (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            open(site.id);
          },
        },
        h('td', { class: 'col-head' },
          h('div', { style: { minWidth: 0 } },
            h('div', { class: 'row' },
              h('span', { class: 'truncate' }, siteTitle(site)),
              site.active ? null : badge('Inactive', 'rose')),
            h('div', { class: 'small dim truncate' }, siteWhere(site)))),
        // The limit is this pairing's, not the site's — the same hospital may
        // take a different amount of another study's cadences.
        h('td', { class: 'tnum strong' }, st.maxCadenceUnits
          ? fmtInt(st.maxCadenceUnits)
          : h('span', { class: 'small dim' }, 'Not set')));
      }))));
}

/**
 * Every pairing in one place: add a site, drop one, or move a target. Mirrors
 * the cadences dialog, and like it the sub-dialogs come back here when they are
 * done, so the two read as one place.
 */
function openSitesDialog(trial) {
  const db = store.getDb();
  const siteTrials = siteTrialsForTrial(db, trial.id);
  const unassigned = allSites(db).filter((x) => !siteTrials.some((st) => st.siteId === x.id));
  const reopen = () => openSitesDialog(trial);

  dialog(`Sites · ${trial.code}`, (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      'A site’s target is the most of any single cadence it may order over the whole trial. '
      + 'A site with no target set cannot order anything yet.'),

    siteTrials.length
      ? h('div', { class: 'stack-sm' }, ...siteTrials.map((st) => {
        const site = getSite(db, st.siteId);
        if (!site) return null;
        const used = db.shipments
          .filter((x) => x.siteId === site.id && x.trialId === trial.id).length;
        return h('div', { class: 'row' },
          h('div', { class: 'grow', style: { minWidth: 0 } },
            h('div', { class: 'small strong truncate' }, siteTitle(site)),
            h('div', { class: 'small dim truncate' },
              `${siteWhere(site)} · `
              + (st.maxCadenceUnits ? `target ${fmtInt(st.maxCadenceUnits)}` : 'no target set')
              + `${used ? ` · ${used} shipment${used === 1 ? '' : 's'}` : ''}`)),
          btn('Target', {
            variant: 'ghost', size: 'sm',
            onClick: () => { close(); openLimitDialog(trial, st, site, reopen); },
          }),
          iconBtn('close', {
            variant: 'ghost',
            'aria-label': `Remove ${site.code} from ${trial.code}`,
            onClick: () => removeSiteFromTrial(trial, st, site, used, reopen),
          }));
      }))
      : empty('No sites are running this trial.', 'building'),

    h('div', { class: 'dialog__foot' },
      btn('Add site', {
        variant: 'ghost',
        iconName: 'plus',
        disabled: !unassigned.length,
        onClick: () => { close(); openAddSiteDialog(trial, unassigned, reopen); },
      }),
      btn('Done', { variant: 'primary', onClick: close }))), { narrow: true });
}

/**
 * Start running this trial at another site. The pairing carries its own cadence
 * limit, a fresh activation date, and the deposit coordinator who will field this
 * study's requests from that site.
 */
function openAddSiteDialog(trial, unassigned, onDone = () => {}) {
  const db = store.getDb();
  const coordinators = shippingCoordinators(db);
  let siteId = unassigned[0] ? unassigned[0].id : null;
  let coordinatorId = coordinators[0] ? coordinators[0].id : null;

  dialog(`Add a site · ${trial.code}`, (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      'Set how much of any one cadence the site may take over the trial — until you do, '
      + 'it cannot order.'),
    field('Site', select(
      unassigned.map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` })),
      { value: siteId, onChange: (e) => { siteId = e.target.value; } },
    ), 'Only sites not already running this trial are listed.'),
    field('Shipping coordinator', select(
      coordinators.map((c) => ({ value: c.id, label: `${c.name} — ${c.email}` })),
      { value: coordinatorId, onChange: (e) => { coordinatorId = e.target.value; } },
    ), 'Receives this trial’s shipment tasks from that site.'),
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: () => { close(); onDone(); } }),
      btn('Add site', {
        variant: 'primary',
        iconName: 'plus',
        onClick: () => {
          if (!siteId || !coordinatorId) {
            toast('Pick a site and a coordinator.', 'warn');
            return;
          }
          const created = store.update((d) => {
            if (getSiteTrial(d, siteId, trial.id)) return null;
            const siteTrial = {
              id: `st-${d.siteTrials.length + 1}-${Date.now().toString(36)}`,
              siteId,
              trialId: trial.id,
              activatedOn: new Date().toISOString(),
              shippingCoordinatorId: coordinatorId,
              // The deposit sets the ceiling; until it does, the site cannot order.
              maxCadenceUnits: 0,
            };
            d.siteTrials.push(siteTrial);
            return siteTrial;
          });
          close();
          if (!created) {
            toast('That site already runs this trial.', 'warn');
            onDone();
            return;
          }
          const site = getSite(store.getDb(), created.siteId);
          toast(`${site ? site.code : 'Site'} added to ${trial.code} — set its target next.`);
          // A pairing with no target cannot order, so the target is asked for
          // straight away rather than left to be discovered later.
          openLimitDialog(trial, created, site, onDone);
        },
      }))), { narrow: true });
}

/**
 * How much of any one cadence this site may take over the whole trial. One
 * number, because a cadence ships the same count of every item in it — there is
 * nothing a per-item allowance could express that this does not.
 */
function openLimitDialog(trial, siteTrial, site, onDone = () => {}) {
  const control = numberInput({
    min: 0, max: 999, step: 1, value: siteTrial.maxCadenceUnits || 0,
  });

  dialog(`Target quantity · ${site.code} · ${trial.code}`, (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      'The most of any single cadence this site may order for this trial, counted over the '
      + 'whole study. A recurring cadence is bounded by it too, so leave room for the '
      + 'repeats you expect. Zero stops the site ordering anything.'),
    field('Target quantity', control),
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: () => { close(); onDone(); } }),
      btn('Save target', {
        variant: 'primary',
        onClick: () => {
          const value = Math.max(0, Math.round(Number(control.value) || 0));
          store.update((d) => {
            const found = d.siteTrials.find((st) => st.id === siteTrial.id);
            if (found) found.maxCadenceUnits = value;
          });
          close();
          onDone();
          toast(`${site.code} may take up to ${value} of any ${trial.code} cadence.`);
        },
      }))), { narrow: true });
}

/** Stop running this trial at a site. Refused while the pairing has shipments. */
function removeSiteFromTrial(trial, siteTrial, site, shipmentCount, onDone = () => {}) {
  if (shipmentCount) {
    toast(`${site.code} has ${shipmentCount} ${trial.code} shipment`
      + `${shipmentCount === 1 ? '' : 's'} — it cannot be removed.`, 'warn');
    return;
  }
  confirmDialog(
    `Remove ${site.code} from ${trial.code}?`,
    'Its target quantity is discarded. Any stock recorded against this '
    + 'pairing stays in the ledger but stops being counted.',
    'Remove site',
    () => {
      store.update((d) => {
        const idx = d.siteTrials.findIndex((st) => st.id === siteTrial.id);
        if (idx >= 0) d.siteTrials.splice(idx, 1);
      });
      toast(`${site.code} removed from ${trial.code}.`, 'info');
      onDone();
    },
    'stop',
  );
}

/**
 * The trial's cadences, listed so they can be revised rather than only added to.
 * Editing one opens the form below and comes back here, so the two dialogs read
 * as one place.
 */
function openCadencesDialog(trial) {
  const db = store.getDb();
  const cadences = cadencesForTrial(db, trial.id);
  const reopen = () => openCadencesDialog(trial);

  dialog(`Cadences · ${trial.code}`, (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      'Each cadence is a set of items that ship together, and the study week it is expected '
      + 'in. There are no quantities here — a site orders a number of the cadence and '
      + 'receives that many of every item in it.'),

    cadences.length
      ? h('div', { class: 'stack-sm' }, ...cadences.map((cadence) => {
        const used = db.shipments
          .filter((x) => (x.cadences || []).some((c) => c.cadenceId === cadence.id)).length;
        return h('div', { class: 'row' },
          h('div', { class: 'grow', style: { minWidth: 0 } },
            h('div', { class: 'small strong truncate' }, cadence.name),
            h('div', { class: 'small dim truncate' },
              `Week ${cadence.week} · ${cadence.itemIds.length} item`
              + `${cadence.itemIds.length === 1 ? '' : 's'}`
              + `${used ? ` · ${used} shipment${used === 1 ? '' : 's'}` : ''}`)),
          btn('Edit', {
            variant: 'ghost', size: 'sm',
            onClick: () => openCadenceForm(trial, cadence, reopen),
          }),
          iconBtn('close', {
            variant: 'ghost',
            'aria-label': `Remove ${cadence.name}`,
            onClick: () => removeCadence(trial, cadence, used, reopen),
          }));
      }))
      : empty('No cadences configured for this trial.', 'calendar'),

    h('div', { class: 'dialog__foot' },
      btn('Add cadence', {
        variant: 'ghost', iconName: 'plus',
        onClick: () => openCadenceForm(trial, null, reopen),
      }),
      btn('Done', { variant: 'primary', onClick: close }))), { narrow: true });
}

/** Create a cadence, or revise one. `cadence` is null when adding. */
function openCadenceForm(trial, cadence, onDone) {
  const db = store.getDb();
  const editing = !!cadence;
  const nameField = input({
    placeholder: 'e.g. Mid-study top-up',
    value: editing ? cadence.name : '',
  });
  const weekField = numberInput({ min: 1, max: 104, value: editing ? cadence.week : 1 });
  const picked = new Set(editing ? cadence.itemIds : []);

  dialog(`${editing ? 'Edit' : 'Add a'} cadence · ${trial.code}`, (close) => h('div', { class: 'stack' },
    h('div', { class: 'bento' },
      h('div', { class: 'col-8' }, field('Cadence name', nameField)),
      h('div', { class: 'col-4' }, field('Study week', weekField,
        'When a site is expected to request it.'))),
    h('span', { class: 'card__label' }, 'Items'),
    h('p', { class: 'small muted' },
      'Pick the items that travel together in this cadence. There are no quantities here — '
      + 'a site orders a number of the cadence and receives that many of each item.'),
    h('div', { class: 'stack-sm' }, ...db.items.map((item) => toggle(
      `${item.name} — ${item.code}`,
      picked.has(item.id),
      (on) => { if (on) picked.add(item.id); else picked.delete(item.id); },
    ))),
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: () => { close(); onDone(); } }),
      btn(editing ? 'Save cadence' : 'Add cadence', {
        variant: 'primary',
        onClick: () => {
          const name = nameField.value.trim();
          const week = Math.max(1, Math.round(Number(weekField.value) || 1));
          const itemIds = db.items.filter((i) => picked.has(i.id)).map((i) => i.id);

          if (!name) { toast('Give the cadence a name.', 'warn'); return; }
          if (!itemIds.length) { toast('Pick at least one item.', 'warn'); return; }

          store.update((d) => {
            if (editing) {
              const found = d.cadences.find((c) => c.id === cadence.id);
              if (found) Object.assign(found, { name, week, itemIds });
              return;
            }
            d.cadences.push({
              id: `cad-${d.cadences.length + 1}-${Date.now().toString(36)}`,
              trialId: trial.id,
              name,
              week,
              itemIds,
            });
          });
          close();
          onDone();
          toast(`“${name}” ${editing ? 'saved' : `added to ${trial.code}`}.`);
        },
      }))), { wide: true });
}

/** Drop a cadence. Refused once shipments were raised against it. */
function removeCadence(trial, cadence, used, onDone) {
  if (used) {
    toast(`“${cadence.name}” has ${used} shipment${used === 1 ? '' : 's'} `
      + 'raised against it — it cannot be removed.', 'warn');
    return;
  }
  confirmDialog(
    `Remove “${cadence.name}”?`,
    'Sites will no longer be able to request it. Allocation targets already derived from '
    + 'it stay as they are.',
    'Remove cadence',
    () => {
      store.update((d) => {
        const idx = d.cadences.findIndex((c) => c.id === cadence.id);
        if (idx >= 0) d.cadences.splice(idx, 1);
      });
      toast(`“${cadence.name}” removed from ${trial.code}.`, 'info');
      onDone();
    },
    'stop',
  );
}

/* ---------- new trial ---------- */

export function renderNew(main) {
  const db = store.getDb();
  const fields = {
    code: input({ placeholder: 'ONC-301' }),
    name: input({ placeholder: 'Short study description' }),
    sponsor: input({ placeholder: 'Sponsor name' }),
  };
  let phase = 'Phase II';
  let active = true;
  const problem = h('p', { class: 'small' });

  const save = () => {
    const code = fields.code.value.trim().toUpperCase();
    const name = fields.name.value.trim();

    const issues = [];
    if (!code) issues.push('Give the trial a code.');
    else if (db.trials.some((t) => t.code.toUpperCase() === code)) issues.push(`${code} is already taken.`);
    if (!name) issues.push('Give the trial a name.');

    if (issues.length) {
      problem.style.color = 'var(--clay-rose-ink)';
      problem.textContent = issues[0];
      return;
    }

    const created = store.update((d) => {
      const trial = {
        id: `trial-${d.trials.length + 1}-${Date.now().toString(36)}`,
        code,
        name,
        sponsor: fields.sponsor.value.trim() || '—',
        phase,
        status: active ? 'Active' : 'Inactive',
      };
      d.trials.push(trial);
      return trial;
    });

    toast(`${created.code} created — add cadences next.`);
    navigate(`/bo/trials/${created.id}`);
  };

  append(main, [
    sectionHead('Add a trial', 'Cadences and sites are added afterwards'),

    card({},
      h('div', { class: 'bento' },
        h('div', { class: 'col-4' }, field('Trial code', fields.code)),
        h('div', { class: 'col-8' }, field('Trial name', fields.name)),
        h('div', { class: 'col-4' }, field('Sponsor', fields.sponsor)),
        h('div', { class: 'col-4' }, field('Phase', select(
          ['Phase I', 'Phase II', 'Phase III', 'Phase IV'].map((p) => ({ value: p, label: p })),
          { value: phase, onChange: (e) => { phase = e.target.value; } },
        ))),
        h('div', { class: 'col-4' }, field('Status', select(
          [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }],
          { value: active ? 'ACTIVE' : 'INACTIVE', onChange: (e) => { active = e.target.value === 'ACTIVE'; } },
        )))),

      problem,

      h('div', { class: 'row-wrap' },
        btn('Create trial', { variant: 'primary', iconName: 'plus', onClick: save }),
        btn('Cancel', { variant: 'ghost', onClick: () => navigate('/bo/trials') }))),
  ]);
}

onSection('/bo/trials', () => { filters.site = 'ALL'; });
