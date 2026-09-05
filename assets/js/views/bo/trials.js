// BO trials — list, detail (sites + cadences) and the add-a-trial form.

import { h, append, fmtInt } from '../../ui/el.js';
import { icon } from '../../ui/icons.js';
import {
  card, tile, btn, iconBtn, badge, meter, empty, sectionHead,
  select, field, input, numberInput, toast, dialog,
} from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import {
  getTrial, sitesForTrial, cadencesForTrial, siteCoverage, countryName, allTrials,
} from '../../domain/selectors.js';

/* ---------- list ---------- */

export function renderList(main) {
  const db = store.getDb();

  append(main, [
    sectionHead('Trials', `${db.trials.length} trials · ${db.sites.length} sites`,
      btn('Add a trial', {
        variant: 'primary', iconName: 'plus', onClick: () => navigate('/bo/trials/new'),
      })),

    h('div', { class: 'stack-sm' }, ...allTrials(db).map((trial) => {
      const sites = sitesForTrial(db, trial.id);
      const cadences = cadencesForTrial(db, trial.id);
      const shipments = db.shipments.filter((s) => s.trialId === trial.id);

      return h('button', {
        type: 'button',
        class: 'card card--tight card--action',
        onClick: () => navigate(`/bo/trials/${trial.id}`),
      },
      h('div', { class: 'row-wrap' },
        tile('flask', 'lilac'),
        h('div', { class: 'grow', style: { minWidth: '180px' } },
          h('div', { class: 'strong truncate' }, `${trial.code} · ${trial.name}`),
          h('div', { class: 'small dim truncate' }, `${trial.sponsor} · ${trial.phase}`)),
        h('div', { class: 'small dim right nowrap' },
          h('div', {}, `${sites.filter((s) => s.active).length} active sites`),
          h('div', {}, `${cadences.length} cadences · ${shipments.length} shipments`)),
        badge(trial.status, 'sage'),
        icon('arrowRight', 17)));
    })),
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

  const sites = sitesForTrial(db, trial.id);
  const cadences = cadencesForTrial(db, trial.id);
  const shipments = db.shipments.filter((s) => s.trialId === trial.id);

  const back = iconBtn('arrowRight', {
    variant: 'ghost', class: 'flip', 'aria-label': 'Back to trials',
    onClick: () => navigate('/bo/trials'),
  });

  append(main, [
    card({},
      h('div', { class: 'row-between' },
        h('div', { class: 'row' },
          back,
          tile('flask', 'lilac'),
          h('div', {},
            h('div', { class: 'page-head__title' }, `${trial.code} · ${trial.name}`),
            h('div', { class: 'small dim' }, `${trial.sponsor} · ${trial.phase}`))),
        badge(trial.status, 'sage')),
      h('div', { class: 'kv' },
        h('span', { class: 'kv__k' }, 'Sites'),
        h('span', { class: 'kv__v' },
          `${sites.length} (${sites.filter((s) => s.active).length} active)`),
        h('span', { class: 'kv__k' }, 'Cadences'),
        h('span', { class: 'kv__v' }, String(cadences.length)),
        h('span', { class: 'kv__k' }, 'Shipments'),
        h('span', { class: 'kv__v' }, String(shipments.length)))),

    h('div', { class: 'bento' },
      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' }, tile('calendar', 'butter'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Cadences'),
              h('div', { class: 'small dim' },
                'What a site may request, and the week it is expected'))),
          btn('Add cadence', {
            variant: 'ghost', size: 'sm', iconName: 'plus',
            onClick: () => openCadenceDialog(trial),
          })),
        cadences.length
          ? h('div', { class: 'stack-sm' }, ...cadences.map((cadence) => h('div', {
            class: 'cadence-card',
          },
          h('div', { class: 'row-between' },
            h('div', { class: 'strong' }, cadence.name),
            h('span', { class: 'badge badge--quiet' },
              h('span', { class: 'badge__dot' }), `Week ${cadence.week}`)),
          h('div', { class: 'row-wrap' }, ...cadence.lines.map((line) => {
            const item = db.items.find((it) => it.id === line.itemId);
            if (!item) return null;
            return h('div', { class: 'row', style: { gap: '7px' } },
              h('span', { class: `tile tile--${item.tone} tile--sm` }, icon(item.icon, 15)),
              h('span', { class: 'small' }, `${item.name} × ${fmtInt(line.suggestedQty)}`));
          })))))
          : empty('No cadences configured for this trial.', 'calendar'))),

      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' }, tile('building', 'sage'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Sites'),
            h('div', { class: 'small dim' }, 'Stock held against allocation'))),
        sites.length
          ? h('div', { class: 'stack-sm' }, ...sites.map((site) => h('button', {
            type: 'button',
            class: 'card card--tight card--action',
            onClick: () => navigate(`/bo/sites/${site.id}`),
          },
          h('div', { class: 'row-between' },
            h('div', { class: 'row', style: { minWidth: 0 } },
              h('span', { class: `tile tile--${site.active ? 'sage' : 'rose'} tile--sm` },
                icon('building', 16)),
              h('div', { style: { minWidth: 0 } },
                h('div', { class: 'small strong truncate' }, `${site.code} · ${site.address.city}`),
                h('div', { class: 'small dim truncate' }, countryName(site.address.country)))),
            site.active ? null : badge('Inactive', 'rose')),
          meter(siteCoverage(db, site)))))
          : empty('No sites are running this trial.', 'building'))),
    ),
  ]);
}

/** Add a cadence to a trial: a name, a week, and the items it covers. */
function openCadenceDialog(trial) {
  const db = store.getDb();
  const nameField = input({ placeholder: 'e.g. Mid-study top-up' });
  const weekField = numberInput({ min: 1, max: 104, value: 1 });
  const quantities = new Map();

  dialog(`Add a cadence · ${trial.code}`, (close) => h('div', { class: 'stack' },
    h('div', { class: 'bento' },
      h('div', { class: 'col-8' }, field('Cadence name', nameField)),
      h('div', { class: 'col-4' }, field('Study week', weekField,
        'When a site is expected to request it.'))),
    h('span', { class: 'card__label' }, 'Items'),
    h('p', { class: 'small muted' },
      'Set a suggested quantity on the items this cadence covers. Leave the rest at zero.'),
    h('div', { class: 'stack-sm' }, ...db.items.map((item) => {
      const control = numberInput({
        min: 0, step: 1, value: 0, class: 'input--sm',
        'aria-label': `${item.name} suggested quantity`,
        onChange: (e) => quantities.set(item.id, Math.max(0, Math.round(Number(e.target.value) || 0))),
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
      btn('Add cadence', {
        variant: 'primary',
        onClick: () => {
          const name = nameField.value.trim();
          const week = Math.max(1, Math.round(Number(weekField.value) || 1));
          const lines = [...quantities]
            .filter(([, qty]) => qty > 0)
            .map(([itemId, suggestedQty]) => ({ itemId, suggestedQty }));

          if (!name) { toast('Give the cadence a name.', 'warn'); return; }
          if (!lines.length) { toast('Set a quantity on at least one item.', 'warn'); return; }

          store.update((d) => {
            d.cadences.push({
              id: `cad-${d.cadences.length + 1}-${Date.now().toString(36)}`,
              trialId: trial.id,
              name,
              week,
              lines,
            });
          });
          close();
          toast(`“${name}” added to ${trial.code}.`);
        },
      }))), { wide: true });
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
  let status = 'Recruiting';
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
        status,
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
          ['Planned', 'Active', 'Recruiting', 'Closed'].map((sv) => ({ value: sv, label: sv })),
          { value: status, onChange: (e) => { status = e.target.value; } },
        )))),

      problem,

      h('div', { class: 'row-wrap' },
        btn('Create trial', { variant: 'primary', iconName: 'plus', onClick: save }),
        btn('Cancel', { variant: 'ghost', onClick: () => navigate('/bo/trials') }))),
  ]);
}
