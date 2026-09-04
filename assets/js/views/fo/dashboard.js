// FO home — bento analytics for the active site only.

import { h, append, fmtInt } from '../../ui/el.js';
import { card, tile, btn, metric, meter, empty, sectionHead } from '../../ui/components.js';
import { statusBars } from '../../ui/charts.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import {
  shipmentsForSite, statusBreakdown, unitsIn, siteStockRows, siteCoverage,
  nextCadenceForSite, siteStudyWeek, getTrial, unreadCount,
} from '../../domain/selectors.js';
import { shipmentCard } from '../common.js';

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const trial = getTrial(db, site.trialId);
  const shipments = shipmentsForSite(db, site.id);
  const open = shipments.filter((s) => s.status !== 'DELIVERED');
  const inTransit = open.reduce((sum, s) => sum + unitsIn(s), 0);
  const rows = siteStockRows(db, site);
  const coverage = siteCoverage(db, site);
  const nextCadence = nextCadenceForSite(db, site);
  const week = siteStudyWeek(site);
  const lowRows = rows.filter((r) => r.ratio < 0.5).slice(0, 4);
  const unread = unreadCount(db, site.id);

  append(main, [
    sectionHead(
      `${site.code} · ${site.address.city}`,
      `${trial ? `${trial.code} — ${trial.name}` : ''} · study week ${week}`,
      btn('Request a shipment', {
        variant: 'primary', iconName: 'plus', onClick: () => navigate('/fo/shipments'),
      }),
    ),

    h('div', { class: 'bento' },
      // --- headline metrics ---
      h('div', { class: 'col-3' }, metric(
        fmtInt(open.length), 'Open shipments',
        `${fmtInt(shipments.length)} in total`, 'box', 'sky',
      )),
      h('div', { class: 'col-3' }, metric(
        fmtInt(inTransit), 'Units on their way',
        'Leaving the central deposit', 'truck', 'lilac',
      )),
      h('div', { class: 'col-3' }, metric(
        `${Math.round(coverage * 100)}%`, 'Stock coverage',
        'Held against site allocation', 'warehouse', 'sage',
      )),
      h('div', { class: 'col-3' }, metric(
        fmtInt(unread), 'Unread notices',
        unread ? 'Waiting for you' : 'All caught up', 'bell', unread ? 'rose' : 'sage',
      )),

      // --- status breakdown ---
      h('div', { class: 'col-7' }, card({},
        h('div', { class: 'row' },
          tile('chart', 'sky'),
          h('div', {},
            h('div', { class: 'card__title' }, 'Shipments by status'),
            h('div', { class: 'small dim' }, 'Every shipment this site has raised'))),
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
          tile('calendar', 'butter'),
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
          tile('warehouse', lowRows.length ? 'rose' : 'sage'),
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
            tile('clock', 'lilac'),
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
