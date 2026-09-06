// FO home — bento analytics for the active site, scoped to one of its trials.

import { h, append, fmtInt } from '../../ui/el.js';
import { card, tile, btn, metric, meter, empty, sectionHead } from '../../ui/components.js';
import { statusBars } from '../../ui/charts.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import {
  shipmentsForSite, statusBreakdown, unitsIn, siteStockRows, siteCoverage,
  nextCadenceForSite, siteStudyWeek, getTrial, getSiteTrial, unreadCount,
} from '../../domain/selectors.js';
import { shipmentCard, trialStrip, activeTrialId, setActiveTrialId } from '../common.js';

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const trialId = activeTrialId(db, site);
  const trial = getTrial(db, trialId);
  const siteTrial = getSiteTrial(db, site.id, trialId);
  if (!siteTrial) {
    append(main, [
      sectionHead(`${site.code} · ${site.address.city}`, site.name),
      card({}, empty('This site is not running any trial yet.', 'flask')),
    ]);
    return;
  }

  const rerender = () => { main.replaceChildren(); render(main); };

  // Every figure below belongs to one study: a site's ONC-204 stock says nothing
  // about how its NEU-077 patients are supplied.
  const shipments = shipmentsForSite(db, site.id).filter((s) => s.trialId === trialId);
  const open = shipments.filter((s) => s.status !== 'DELIVERED');
  const inTransit = open.reduce((sum, s) => sum + unitsIn(s), 0);
  const rows = siteStockRows(db, siteTrial);
  const coverage = siteCoverage(db, siteTrial);
  const nextCadence = nextCadenceForSite(db, siteTrial);
  const week = siteStudyWeek(siteTrial);
  const lowRows = rows.filter((r) => r.ratio < 0.5).slice(0, 4);
  const unread = unreadCount(db, site.id);

  const strip = trialStrip(db, site, trialId, (id) => {
    setActiveTrialId(id);
    rerender();
  });

  append(main, [
    sectionHead(
      `${site.code} · ${site.address.city}`,
      `${trial ? `${trial.code} — ${trial.name}` : ''} · study week ${week}`,
      btn('Request a shipment', {
        variant: 'primary', iconName: 'plus', onClick: () => navigate('/fo/shipments'),
      }),
    ),

    strip ? card({ variant: 'card--tight' }, strip) : null,

    h('div', { class: 'bento' },
      // --- headline metrics ---
      h('div', { class: 'col-3' }, metric(
        fmtInt(open.length), 'Open shipments',
        `${fmtInt(shipments.length)} in total`, 'box',
      )),
      h('div', { class: 'col-3' }, metric(
        fmtInt(inTransit), 'Units on their way',
        'Leaving the central deposit', 'truck',
      )),
      h('div', { class: 'col-3' }, metric(
        `${Math.round(coverage * 100)}%`, 'Stock coverage',
        'Held against site allocation', 'warehouse',
      )),
      h('div', { class: 'col-3' }, metric(
        fmtInt(unread), 'Unread notices',
        unread ? 'Waiting for you' : 'All caught up', 'bell',
      )),

      // --- status breakdown ---
      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row' },
          tile('chart'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Shipments by status'),
            h('div', { class: 'small dim' },
              `Everything this site has raised for ${trial ? trial.code : 'this trial'}`))),
        shipments.length
          ? statusBars(statusBreakdown(shipments).map((s) => ({
            label: s.label,
            value: s.value,
            tone: s.tone,
            onClick: () => navigate('/fo/shipments'),
          })))
          : empty('No shipments yet.', 'box'))),

      // --- next cadence ---
      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' },
          tile('calendar'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Next cadence'),
            h('div', { class: 'small dim' }, `You are in study week ${week}`))),
        nextCadence
          ? h('div', { class: 'stack-sm' },
            h('div', { class: 'card__metric' }, `Week ${nextCadence.week}`),
            h('div', { class: 'strong' }, nextCadence.name),
            h('div', { class: 'small muted' },
              `${nextCadence.lines.length} item${nextCadence.lines.length === 1 ? '' : 's'} available to request`),
            btn('Request this cadence', {
              variant: 'primary', size: 'sm',
              onClick: () => navigate('/fo/shipments'),
            }))
          : empty('This trial has no cadences.', 'calendar'))),

      // --- stock needing attention ---
      h('div', { class: 'col-5' }, card({},
        h('div', { class: 'row' },
          tile('warehouse'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Stock needing attention'),
            h('div', { class: 'small dim' }, 'Below half of the site target'))),
        lowRows.length
          ? h('div', { class: 'stack-sm' }, ...lowRows.map((r) => h('div', { class: 'stack-sm' },
            h('div', { class: 'row-between' },
              h('span', { class: 'small truncate' }, r.item.name),
              h('span', { class: 'small strong tnum nowrap' }, `${fmtInt(r.held)} / ${fmtInt(r.target)}`)),
            meter(r.ratio))))
          : empty('Every item is above half its target.', 'check'),
        btn('Open stock', { variant: 'ghost', size: 'sm', onClick: () => navigate('/fo/stock') }))),

      // --- recent shipments ---
      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' },
            tile('clock'),
            h('div', { class: 'card__title' }, 'Latest activity')),
          btn('All shipments', {
            variant: 'ghost', size: 'sm', onClick: () => navigate('/fo/shipments'),
          })),
        shipments.length
          ? h('div', { class: 'stack-sm' }, ...shipments.slice(0, 3).map((s) => shipmentCard(
            db, s, () => navigate(`/fo/shipments/${s.id}`),
          )))
          : empty('Nothing has happened yet.', 'clock'))),
    ),
  ]);
}
