// BO sites — list, detail and the add-a-site form.

import { h, append, fmtInt } from '../../ui/el.js';
import { icon } from '../../ui/icons.js';
import {
  card, tile, btn, iconBtn, badge, avatar, meter, empty, sectionHead,
  select, field, input, numberInput, toggle, toast, dialog,
} from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { COUNTRIES, siteLocation } from '../../domain/constants.js';
import { totalAt } from '../../domain/stock.js';
import {
  getTrial, coordinatorsForSite, userName, shippingCoordinators,
  siteStockRows, siteCoverage, shipmentsForSite, cadencesForTrial, countryName,
} from '../../domain/selectors.js';
import { shipmentCard, chipStrip } from '../common.js';

const filters = { scope: 'ACTIVE', trial: 'ALL' };

/* ---------- list ---------- */

export function renderList(main) {
  const db = store.getDb();
  const rerender = () => { main.replaceChildren(); renderList(main); };

  const visible = db.sites.filter((site) => {
    if (filters.scope === 'ACTIVE' && !site.active) return false;
    if (filters.scope === 'INACTIVE' && site.active) return false;
    if (filters.trial !== 'ALL' && site.trialId !== filters.trial) return false;
    return true;
  });

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
        ...db.trials.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
      ], {
        value: filters.trial,
        onChange: (e) => { filters.trial = e.target.value; rerender(); },
      })))),

    visible.length
      ? h('div', { class: 'bento' }, ...visible.map((site) => h('div', { class: 'col-4' },
        siteCard(db, site))))
      : card({}, empty('No sites match those filters.', 'building')),
  ]);
}

function siteCard(db, site) {
  const trial = getTrial(db, site.trialId);
  const coverage = siteCoverage(db, site);
  const open = shipmentsForSite(db, site.id).filter((s) => s.status !== 'DELIVERED').length;

  return h('button', {
    type: 'button',
    class: 'card card--tight card--action',
    onClick: () => navigate(`/bo/sites/${site.id}`),
  },
  h('div', { class: 'row-between' },
    h('div', { class: 'row' },
      tile('building', site.active ? 'sage' : 'rose'),
      h('div', {},
        h('div', { class: 'strong' }, site.code),
        h('div', { class: 'small dim' }, `${site.address.city}, ${site.address.country}`))),
    badge(site.active ? 'Active' : 'Inactive', site.active ? 'sage' : 'rose')),
  h('div', { class: 'small muted truncate' }, site.name),
  meter(coverage),
  h('div', { class: 'row-between small dim' },
    h('span', {}, trial ? trial.code : ''),
    h('span', {}, `${Math.round(coverage * 100)}% stocked · ${open} open`)),
  h('div', { class: 'small dim truncate' },
    `Coordinator: ${userName(db, site.shippingCoordinatorId)}`));
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

  const trial = getTrial(db, site.trialId);
  const peers = coordinatorsForSite(db, site.id);
  const rows = siteStockRows(db, site);
  const shipments = shipmentsForSite(db, site.id);
  const coordinators = shippingCoordinators(db);

  const back = iconBtn('arrowRight', {
    variant: 'ghost', class: 'flip', 'aria-label': 'Back to sites',
    onClick: () => navigate('/bo/sites'),
  });

  append(main, [
    card({},
      h('div', { class: 'row-between' },
        h('div', { class: 'row' },
          back,
          tile('building', site.active ? 'sage' : 'rose'),
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
        toggle('Requires PFI approval', site.requiresPfiApproval, (checked) => {
          store.update((d) => {
            const found = d.sites.find((s) => s.id === site.id);
            if (found) found.requiresPfiApproval = checked;
          });
          toast(`PFI approval ${checked ? 'now required' : 'no longer required'} for ${site.code}.`, 'info');
        }))),

    h('div', { class: 'bento' },
      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' }, tile('pin', 'sky'),
          h('div', { class: 'card__title' }, 'Address')),
        h('div', { class: 'kv' },
          h('span', { class: 'kv__k' }, 'Street'),
          h('span', { class: 'kv__v' }, site.address.street),
          h('span', { class: 'kv__k' }, 'City'),
          h('span', { class: 'kv__v' }, `${site.address.postalCode} ${site.address.city}`),
          h('span', { class: 'kv__k' }, 'Country'),
          h('span', { class: 'kv__v' }, countryName(site.address.country)),
          h('span', { class: 'kv__k' }, 'Trial'),
          h('span', { class: 'kv__v' }, trial ? `${trial.code} — ${trial.name}` : '—'),
          h('span', { class: 'kv__k' }, 'Stock on site'),
          h('span', { class: 'kv__v tnum' }, `${fmtInt(totalAt(db, siteLocation(site.id)))} units`)))),

      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row' }, tile('users', 'lilac'),
          h('div', { class: 'card__title' }, 'People')),
        field('Shipping coordinator', select(
          coordinators.map((c) => ({ value: c.id, label: `${c.name} — ${c.email}` })),
          {
            value: site.shippingCoordinatorId,
            onChange: (e) => {
              const next = e.target.value;
              store.update((d) => {
                const found = d.sites.find((s) => s.id === site.id);
                if (found) found.shippingCoordinatorId = next;
              });
              toast(`${userName(store.getDb(), next)} now coordinates ${site.code}.`, 'info');
            },
          },
        ), 'New shipment requests from this site go to their task list.'),
        h('hr', { class: 'divider' }),
        h('span', { class: 'card__label' }, `Site coordinators · ${peers.length}`),
        peers.length
          ? h('div', { class: 'stack-sm' }, ...peers.map((p) => h('div', { class: 'row' },
            avatar(p.name),
            h('div', { class: 'grow', style: { minWidth: 0 } },
              h('div', { class: 'strong truncate' }, p.name),
              h('div', { class: 'small dim truncate' }, p.email)),
            h('span', { class: 'small dim nowrap' },
              `${p.siteIds.length} site${p.siteIds.length === 1 ? '' : 's'}`))))
          : empty('No front-office coordinators assigned.', 'users'))),

      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' }, tile('warehouse', 'butter'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Allocated items'),
              h('div', { class: 'small dim' }, 'Target stock the site may hold'))),
          btn('Edit targets', {
            variant: 'ghost', size: 'sm', iconName: 'edit',
            onClick: () => openAllocationDialog(site),
          })),
        rows.length
          ? h('div', { class: 'stack-sm' }, ...rows.map((r) => h('div', { class: 'stack-sm' },
            h('div', { class: 'row-between' },
              h('div', { class: 'row' },
                h('span', { class: `tile tile--${r.item.tone} tile--sm` }, icon(r.item.icon, 15)),
                h('span', { class: 'small truncate' }, r.item.name)),
              h('span', { class: 'small strong tnum nowrap' },
                `${fmtInt(r.held)} / ${fmtInt(r.target)}`)),
            meter(r.ratio))))
          : empty('No allocations configured.', 'warehouse'))),

      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' }, tile('flask', 'sage'),
          h('div', { class: 'card__title' }, 'Cadences available')),
        h('div', { class: 'stack-sm' }, ...cadencesForTrial(db, site.trialId).map((c) => h('div', {
          class: 'row-between',
        },
        h('span', { class: 'small truncate' }, c.name),
        h('span', { class: 'badge badge--quiet' },
          h('span', { class: 'badge__dot' }), `Week ${c.week}`))))),
      ),

      h('div', { class: 'col-12' }, card({},
        h('div', { class: 'row' }, tile('box', 'sky'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Shipments'),
            h('div', { class: 'small dim' }, `${shipments.length} raised by this site`))),
        shipments.length
          ? h('div', { class: 'bento' }, ...shipments.slice(0, 6).map((s) => h('div', { class: 'col-4' },
            shipmentCard(db, s, () => navigate(`/bo/shipments/${s.id}`)))))
          : empty('This site has not requested anything yet.', 'box'))),
    ),
  ]);
}

/** Edit the per-item target stock for a site. */
function openAllocationDialog(site) {
  const db = store.getDb();
  const draft = new Map(site.allocations.map((a) => [a.itemId, a.targetQty]));

  dialog(`Allocations · ${site.code}`, (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted small' },
      'The target is the most this site may hold of each item. Front-office users can '
      + 'only request up to the target, minus what they hold and what is inbound.'),
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
        h('span', { class: `tile tile--${item.tone} tile--sm` }, icon(item.icon, 15)),
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
            const found = d.sites.find((s) => s.id === site.id);
            if (!found) return;
            found.allocations = [...draft]
              .filter(([, qty]) => qty > 0)
              .map(([itemId, targetQty]) => ({ itemId, targetQty }));
          });
          close();
          toast(`Allocations saved for ${site.code}.`);
        },
      }))), { wide: true });
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
  let country = 'IT';
  let trialId = db.trials[0] ? db.trials[0].id : null;
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
    if (!trialId) issues.push('Pick a trial.');
    if (!coordinatorId) issues.push('Pick a shipping coordinator.');

    if (issues.length) {
      problem.style.color = 'var(--clay-rose-ink)';
      problem.textContent = issues[0];
      return;
    }

    // A new site inherits its allocation targets from its trial's cadences.
    const targets = new Map();
    for (const cadence of cadencesForTrial(db, trialId)) {
      for (const line of cadence.lines) {
        targets.set(line.itemId, (targets.get(line.itemId) || 0) + line.suggestedQty);
      }
    }

    const created = store.update((d) => {
      const site = {
        id: `site-${d.sites.length + 1}-${Date.now().toString(36)}`,
        code,
        name,
        trialId,
        address: {
          street: fields.street.value.trim() || '—',
          city,
          country,
          postalCode: fields.postalCode.value.trim() || '—',
        },
        active,
        requiresPfiApproval: requiresPfi,
        shippingCoordinatorId: coordinatorId,
        activatedOn: new Date().toISOString(),
        allocations: [...targets].map(([itemId, targetQty]) => ({ itemId, targetQty })),
      };
      d.sites.push(site);
      return site;
    });

    toast(`${created.code} created with ${created.allocations.length} allocated items.`);
    navigate(`/bo/sites/${created.id}`);
  };

  append(main, [
    sectionHead('Add a site', 'The new site inherits allocation targets from its trial'),

    card({},
      h('div', { class: 'bento' },
        h('div', { class: 'col-3' }, field('Site code', fields.code, 'Shown throughout the app.')),
        h('div', { class: 'col-9' }, field('Site name', fields.name)),
        h('div', { class: 'col-6' }, field('Trial', select(
          db.trials.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` })),
          { value: trialId, onChange: (e) => { trialId = e.target.value; } },
        ), 'Decides which cadences the site may request.')),
        h('div', { class: 'col-6' }, field('Shipping coordinator', select(
          coordinators.map((c) => ({ value: c.id, label: `${c.name} — ${c.email}` })),
          { value: coordinatorId, onChange: (e) => { coordinatorId = e.target.value; } },
        ), 'Receives this site’s shipment tasks.')),
        h('div', { class: 'col-6' }, field('Street', fields.street)),
        h('div', { class: 'col-3' }, field('Postcode', fields.postalCode)),
        h('div', { class: 'col-3' }, field('City', fields.city)),
        h('div', { class: 'col-4' }, field('Country', select(
          Object.entries(COUNTRIES).map(([code, label]) => ({ value: code, label })),
          { value: country, onChange: (e) => { country = e.target.value; } },
        )))),

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
