// BO sites — list, detail and the add-a-site form.
//
// A site runs any number of trials. Everything that only makes sense for one
// study — the cadence limit and the deposit coordinator who fields its
// requests — lives on the site-trial
// pairing; the detail page lists those pairings and links out to each trial.

import { h, append, fmtInt } from '../../ui/el.js';
import { icon } from '../../ui/icons.js';
import {
  card, actionCard, tile, btn, iconBtn, badge, avatar, empty, sectionHead,
  select, field, input, toggle, toast, dialog,
} from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { COUNTRIES } from '../../domain/constants.js';
import {
  coordinatorsForSite, shippingCoordinators, allTrials, byCode,
  shipmentsForSite, countryName, siteTitle, siteWhere,
  siteTrialsForSite, trialsForSite, trialSummary,
} from '../../domain/selectors.js';
import { chipStrip, openAddressDialog } from '../common.js';
// Imported for their filter setters, so a count here opens the same set there.
import * as boTrials from './trials.js';
import * as boShipments from './shipments.js';
import { onSection } from '../filters.js';

const DEFAULTS = { scope: 'ACTIVE', trial: 'ALL' };
const filters = { ...DEFAULTS };

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
      h('div', { class: 'strong truncate' }, siteTitle(site)),
      h('div', { class: 'small dim truncate' }, siteWhere(site))),
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
            h('div', { class: 'page-head__title' }, siteTitle(site)),
            h('div', { class: 'small dim' }, siteWhere(site)))),
        // The name is part of the title, so it is corrected from the title. The
        // active/inactive state already shows on the Settings card below.
        btn('Edit', {
          variant: 'ghost', size: 'sm', iconName: 'edit',
          'aria-label': `Edit the name of ${site.code}`,
          onClick: () => openNameDialog(site),
        }))),

    h('div', { class: 'bento' },
      // A compact statement of what this site is, matching the address card
      // beside it. The switches themselves live behind Edit.
      h('div', { class: 'col-6' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' }, tile('lock'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Settings'),
              h('div', { class: 'small dim' }, 'Applies to every trial here'))),
          btn('Edit', {
            variant: 'ghost', size: 'sm', iconName: 'edit',
            onClick: () => openSettingsDialog(site),
          })),
        h('div', { class: 'kv' },
          h('span', { class: 'kv__k' }, 'Status'),
          h('span', { class: 'kv__v' }, badge(site.active ? 'Active' : 'Inactive',
            site.active ? 'sage' : 'rose')),
          // Active/Inactive is a status and keeps its badge; whether an approver
          // countersigns is a setting, so it reads as plain text.
          h('span', { class: 'kv__k' }, 'PFI approval'),
          h('span', { class: 'kv__v' },
            site.requiresPfiApproval ? 'Required' : 'Not required'))),
      ),

      h('div', { class: 'col-6' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' }, tile('pin'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Address'),
              h('div', { class: 'small dim' }, 'Where shipments are delivered'))),
          btn('Edit', {
            variant: 'ghost', size: 'sm', iconName: 'edit',
            onClick: () => openAddressDialog(site),
          })),
        h('div', { class: 'kv' },
          h('span', { class: 'kv__k' }, 'Street'),
          h('span', { class: 'kv__v' }, site.address.street),
          h('span', { class: 'kv__k' }, 'City'),
          h('span', { class: 'kv__v' }, `${site.address.postalCode} ${site.address.city}`),
          h('span', { class: 'kv__k' }, 'Country'),
          h('span', { class: 'kv__v' }, countryName(site.address.country))))),

      h('div', { class: 'col-12' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' }, tile('users'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Site coordinators'),
              h('div', { class: 'small dim' }, 'Can request shipments for this site'))),
          btn('Edit', {
            variant: 'ghost', size: 'sm', iconName: 'edit',
            onClick: () => openCoordinatorsDialog(site),
          })),
        peers.length
          ? h('div', { class: 'stack-sm' }, ...peers.map((p) => h('div', { class: 'row' },
            avatar(p.name),
            h('div', { class: 'grow', style: { minWidth: 0 } },
              h('div', { class: 'strong truncate' }, p.name),
              h('div', { class: 'small dim truncate' }, p.email)),
            h('span', { class: 'small dim nowrap' },
              `${p.siteIds.length} site${p.siteIds.length === 1 ? '' : 's'}`))))
          : empty('No front-office coordinators assigned.', 'users'))),

      // Two matching counts. Neither repeats what its own section already shows
      // well — they say how much there is and hand you over to it, filtered.
      h('div', { class: 'col-6' }, recapCard({
        icon: 'flask',
        label: 'Trials',
        count: siteTrials.length,
        sub: 'Studies running at this site',
        onOpen: () => { boTrials.showSite(site.id); navigate('/bo/trials'); },
      })),

      h('div', { class: 'col-6' }, recapCard({
        icon: 'box',
        label: 'Shipments',
        count: shipments.length,
        sub: 'Raised by this site, all trials',
        onOpen: () => { boShipments.showSite(site.id); navigate('/bo/shipments'); },
      })),

    ),
  ]);
}

/**
 * A count that hands over to its own section. The site page says how much there
 * is; the section it opens says everything else, already filtered to this site.
 */
function recapCard({ icon: iconName, label, count, sub, onOpen }) {
  return actionCard({ onClick: onOpen },
    h('div', { class: 'row-between' },
      h('div', { class: 'row' }, tile(iconName),
        h('div', {},
          h('div', { class: 'card__title' }, label),
          h('div', { class: 'small dim' }, sub))),
      icon('arrowRight', 17)),
    h('div', { class: 'card__metric' }, fmtInt(count)));
}

/** The two site-wide switches. Both take effect for every trial running here. */
/**
 * Correct a site's name. The code is left alone: it is how everyone refers to
 * the site, it appears on every shipment and invoice, and a prototype has no
 * business making it look re-assignable.
 */
function openNameDialog(site) {
  const nameField = input({ value: site.name, placeholder: 'Hospital name' });
  const problem = h('p', { class: 'small' });

  dialog(`Name · ${site.code}`, (close) => h('div', { class: 'stack' },
    field('Site name', nameField, `Shown everywhere as “${site.code} · name”.`),
    problem,
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: close }),
      btn('Save name', {
        variant: 'primary',
        onClick: () => {
          const name = nameField.value.trim();
          if (!name) {
            problem.style.color = 'var(--clay-rose-ink)';
            problem.textContent = 'Give the site a name.';
            return;
          }
          store.update((d) => {
            const found = d.sites.find((x) => x.id === site.id);
            if (found) found.name = name;
          });
          close();
          toast(`Renamed to ${site.code} · ${name}.`);
        },
      }))), { narrow: true });
}

function openSettingsDialog(site) {
  let active = site.active;
  let requiresPfi = site.requiresPfiApproval;

  dialog(`Settings · ${site.code}`, (close) => h('div', { class: 'stack' },
    h('div', { class: 'stack-sm' },
      toggle('Site is active', active, (v) => { active = v; }),
      h('div', { class: 'small dim' },
        'Inactive sites keep their history but drop out of the active lists and stock totals.')),
    h('div', { class: 'stack-sm' },
      toggle('Requires PFI approval', requiresPfi, (v) => { requiresPfi = v; }),
      h('div', { class: 'small dim' },
        'An approver must countersign the invoice before the deposit can prepare a shipment. '
        + 'Customs drives this, so it applies to every trial at this site.')),
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: close }),
      btn('Save settings', {
        variant: 'primary',
        onClick: () => {
          store.update((d) => {
            const found = d.sites.find((x) => x.id === site.id);
            if (!found) return;
            found.active = active;
            found.requiresPfiApproval = requiresPfi;
          });
          close();
          toast(`Settings saved for ${site.code}.`);
        },
      }))), { narrow: true });
}

/**
 * Who in the front office can see this site and raise requests for it. Access is
 * held on the user (`siteIds`), so this edits every front-office user at once
 * rather than a list hanging off the site.
 */
function openCoordinatorsDialog(site) {
  const db = store.getDb();
  const foUsers = db.users.filter((u) => u.role === 'FO');
  const picked = new Set(foUsers.filter((u) => u.siteIds.includes(site.id)).map((u) => u.id));

  dialog(`Site coordinators · ${site.code}`, (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      'Everyone ticked here sees this site in their site switcher and can request '
      + 'shipments for it. Leaving it empty is allowed — nobody will be able to raise '
      + 'a request for this site until somebody is assigned.'),
    h('div', { class: 'stack-sm' }, ...foUsers.map((u) => toggle(
      `${u.name} — ${u.email}`,
      picked.has(u.id),
      (checked) => { if (checked) picked.add(u.id); else picked.delete(u.id); },
    ))),
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: close }),
      btn('Save coordinators', {
        variant: 'primary',
        onClick: () => {
          store.update((d) => {
            for (const u of d.users.filter((x) => x.role === 'FO')) {
              const has = u.siteIds.includes(site.id);
              if (picked.has(u.id) && !has) u.siteIds.push(site.id);
              if (!picked.has(u.id) && has) u.siteIds = u.siteIds.filter((id) => id !== site.id);
            }
            // The active persona may have just lost the site it was looking at.
            const me = d.users.find((u) => u.id === d.currentUserId);
            if (me && me.role === 'FO' && !me.siteIds.includes(d.currentSiteId)) {
              d.currentSiteId = me.siteIds[0] || null;
            }
          });
          close();
          toast(`${picked.size} coordinator${picked.size === 1 ? '' : 's'} on ${site.code}.`);
        },
      }))), { narrow: true });
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

      // One pairing per trial picked. Its cadence limit starts at zero — the
      // deposit sets that on the trial, and until it does the site cannot order.
      for (const trialId of pickedTrials) {
        d.siteTrials.push({
          id: `st-${d.siteTrials.length + 1}-${Date.now().toString(36)}`,
          siteId: site.id,
          trialId,
          activatedOn: new Date().toISOString(),
          shippingCoordinatorId: coordinatorId,
          maxCadenceUnits: 0,
        });
      }
      return site;
    });

    const count = pickedTrials.size;
    toast(`${created.code} created on ${count} trial${count === 1 ? '' : 's'}.`);
    navigate(`/bo/sites/${created.id}`);
  };

  append(main, [
    sectionHead('Add a site', 'Set each trial’s cadence limit afterwards, on the trial'),

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
        'Pick every trial this site will run. Each one gets its own stock and cadence '
        + 'limit.'),
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

onSection('/bo/sites', () => Object.assign(filters, DEFAULTS));
