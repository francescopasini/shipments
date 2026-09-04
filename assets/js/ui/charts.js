// Hand-rolled inline SVG charts.
//
// Color note: the app's five pastels fail a categorical-palette check (rose and
// sage collide under deuteranopia), so no chart here uses color to carry identity.
// The deposit chart is single-series — its title names it, so it needs no legend.
// The status chart is a status encoding: every bar is direct-labeled with its name
// and count, and the fill only echoes the badge the user already saw in the list.

import { h, append, fmtInt, fmtDate } from './el.js';

const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (!child) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Round a maximum up to a readable axis top, without leaving huge headroom. */
function niceMax(value) {
  if (value <= 0) return 10;
  const mag = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => value <= m * mag) || 10;
  return step * mag;
}

/**
 * Deposit stock over time. Single series — 2px line, soft fill, recessive grid,
 * crosshair tooltip on hover, and a collapsible data table underneath.
 *
 * points: [{ date: 'YYYY-MM-DD', units: number }]
 */
export function areaChart(points, { height = 230, label = 'Units in deposit' } = {}) {
  const W = 760;
  const H = height;
  const pad = { t: 16, r: 18, b: 28, l: 52 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const data = points.length ? points : [{ date: '', units: 0 }];
  const max = niceMax(Math.max(...data.map((p) => p.units)) * 1.08);
  const x = (i) => pad.l + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v) => pad.t + plotH - (v / max) * plotH;

  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: '100%',
    height,
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': `${label} over the last ${data.length} days, from ${fmtInt(data[0].units)} to ${fmtInt(data.at(-1).units)} units`,
  });

  // gradient for the area fill
  const gradId = `grad-${Math.random().toString(36).slice(2, 8)}`;
  append(svg, [s('defs', {}, s('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' },
    s('stop', { offset: '0%', 'stop-color': 'var(--clay-sky-ink)', 'stop-opacity': '.34' }),
    s('stop', { offset: '100%', 'stop-color': 'var(--clay-sky-ink)', 'stop-opacity': '.02' })))]);

  // recessive gridlines + y labels
  for (let i = 0; i <= 4; i += 1) {
    const value = (max / 4) * i;
    const yy = y(value);
    append(svg, [
      s('line', {
        x1: pad.l, x2: W - pad.r, y1: yy, y2: yy,
        stroke: 'var(--line)', 'stroke-width': 1,
      }),
      s('text', {
        x: pad.l - 10, y: yy + 4, 'text-anchor': 'end',
        fill: 'var(--ink-3)', 'font-size': '11', 'font-weight': '600',
      }, fmtInt(value)),
    ]);
  }

  // x labels — about five, evenly spaced
  const tickEvery = Math.max(1, Math.floor(data.length / 5));
  data.forEach((p, i) => {
    if (i % tickEvery !== 0 && i !== data.length - 1) return;
    append(svg, [s('text', {
      x: x(i), y: H - 8, 'text-anchor': i === data.length - 1 ? 'end' : 'middle',
      fill: 'var(--ink-3)', 'font-size': '11', 'font-weight': '600',
    }, new Date(p.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }))]);
  });

  const line = data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.units).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;

  append(svg, [
    s('path', { d: area, fill: `url(#${gradId})` }),
    s('path', {
      d: line, fill: 'none', stroke: 'var(--clay-sky-ink)',
      'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }),
  ]);

  // hover layer
  const crossX = s('line', {
    y1: pad.t, y2: pad.t + plotH, stroke: 'var(--ink-3)',
    'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0,
  });
  const dot = s('circle', {
    r: 5, fill: 'var(--clay-sky-ink)', stroke: 'var(--card)', 'stroke-width': 2, opacity: 0,
  });
  const hit = s('rect', {
    x: pad.l, y: pad.t, width: plotW, height: plotH, fill: 'transparent',
  });
  append(svg, [crossX, dot, hit]);

  const tip = h('div', {
    class: 'chart__tip',
    style: { opacity: '0' },
  });
  const wrap = h('div', { class: 'chart' }, svg, tip);

  const show = (e) => {
    const box = svg.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    const i = Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1))));
    const p = data[i];
    const px = (x(i) / W) * box.width;
    crossX.setAttribute('x1', x(i));
    crossX.setAttribute('x2', x(i));
    crossX.setAttribute('opacity', 1);
    dot.setAttribute('cx', x(i));
    dot.setAttribute('cy', y(p.units));
    dot.setAttribute('opacity', 1);
    tip.textContent = '';
    append(tip, [
      h('strong', {}, `${fmtInt(p.units)} units`),
      h('span', { class: 'chart__tip-sub' }, fmtDate(p.date)),
    ]);
    tip.style.opacity = '1';
    tip.style.left = `${Math.max(8, Math.min(box.width - 8, px))}px`;
  };
  const hide = () => {
    crossX.setAttribute('opacity', 0);
    dot.setAttribute('opacity', 0);
    tip.style.opacity = '0';
  };
  hit.addEventListener('mousemove', show);
  hit.addEventListener('mouseleave', hide);

  // table view, for the contrast/accessibility relief the validator asks for
  const table = h('details', { class: 'chart__table' },
    h('summary', {}, 'Show weekly figures'),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', { class: 'col-head' }, 'Date'),
          h('th', {}, 'Units in deposit'))),
        h('tbody', {}, ...data
          .filter((_, i) => i % 7 === 0 || i === data.length - 1)
          .map((p) => h('tr', {},
            h('td', { class: 'col-head' }, fmtDate(p.date)),
            h('td', { class: 'tnum' }, fmtInt(p.units))))))));

  return h('div', { class: 'stack-sm' }, wrap, table);
}

/**
 * Horizontal status bars. Identity comes from the direct label on every row,
 * never from the fill.
 *
 * rows: [{ label, value, tone, onClick? }]
 */
export function statusBars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const node = h('div', { class: 'bars' });
  for (const row of rows) {
    const pct = (row.value / max) * 100;
    // Label above the track, so the row stays legible in a narrow bento card.
    const bar = h(row.onClick ? 'button' : 'div', {
      class: `bars__row${row.onClick ? ' bars__row--action' : ''}`,
      type: row.onClick ? 'button' : null,
      onClick: row.onClick || null,
      title: `${row.label}: ${fmtInt(row.value)}`,
    },
    h('span', { class: 'bars__head' },
      h('span', { class: 'bars__label' }, row.label),
      h('span', { class: 'bars__value tnum' }, fmtInt(row.value))),
    h('span', { class: 'bars__track' },
      h('span', {
        class: `bars__fill bars__fill--${row.tone}`,
        style: { width: `${Math.max(row.value ? 3 : 0, pct)}%` },
      })));
    append(node, [bar]);
  }
  return node;
}

/** Compact inline trend line for metric cards. */
export function sparkline(values, tone = 'sky') {
  const W = 120;
  const H = 34;
  if (!values.length) return h('div');
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * W;
    const y = H - 3 - ((v - min) / span) * (H - 6);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' },
    s('path', {
      d, fill: 'none', stroke: `var(--clay-${tone}-ink)`,
      'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '.8',
    }));
}
