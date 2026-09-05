// Inline icon set. Chunky rounded strokes to sit with the clay surfaces —
// bundled rather than pulled from a CDN so the site stays self-contained.

import { svg } from './el.js';

const P = {
  home: '<path d="M4 11.2 12 4.5l8 6.7"/><path d="M6.4 10v8.2a1 1 0 0 0 1 1h9.2a1 1 0 0 0 1-1V10"/>',
  box: '<path d="M3.6 8.3 12 4.2l8.4 4.1v7.4L12 19.8l-8.4-4.1Z"/><path d="M3.6 8.3 12 12.4l8.4-4.1M12 12.4v7.4"/>',
  truck: '<path d="M2.8 7.2h9.6v8.6H2.8z"/><path d="M12.4 10.4h3.5l3.3 3.1v2.3h-6.8z"/><circle cx="7" cy="17.8" r="1.9"/><circle cx="16.4" cy="17.8" r="1.9"/>',
  warehouse: '<path d="M3.4 9.6 12 5l8.6 4.6v9.4H3.4z"/><path d="M7.6 19v-5.4h8.8V19"/><path d="M7.6 16.2h8.8"/>',
  bell: '<path d="M6.6 10.4a5.4 5.4 0 0 1 10.8 0c0 3.4 1.2 4.6 1.2 4.6H5.4s1.2-1.2 1.2-4.6Z"/><path d="M10.2 18.2a2 2 0 0 0 3.6 0"/>',
  clipboard: '<path d="M9 4.8h6a1 1 0 0 1 1 1v1.4H8V5.8a1 1 0 0 1 1-1Z"/><path d="M8 6.4H6.2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1v-11a1 1 0 0 0-1-1H16"/><path d="M8.6 11.6h6.8M8.6 15h4.6"/>',
  seal: '<circle cx="12" cy="10.4" r="5.4"/><path d="m9.8 10.4 1.6 1.6 3-3.1"/><path d="m8.6 15.2-.8 4.2 4.2-1.9 4.2 1.9-.8-4.2"/>',
  flask: '<path d="M10 4.6h4M10.8 4.6v5L6.4 17a1.6 1.6 0 0 0 1.4 2.4h8.4A1.6 1.6 0 0 0 17.6 17l-4.4-7.4v-5"/><path d="M8.2 14h7.6"/>',
  building: '<path d="M5.2 19.4V6.2a1 1 0 0 1 1-1h7.4a1 1 0 0 1 1 1v13.2"/><path d="M14.6 10.6h3.2a1 1 0 0 1 1 1v7.8"/><path d="M8 8.6h3.8M8 12h3.8M8 15.4h3.8M3.8 19.4h16.4"/>',
  user: '<circle cx="12" cy="8.6" r="3.5"/><path d="M5.4 19.2a6.8 6.8 0 0 1 13.2 0"/>',
  users: '<circle cx="9.4" cy="9" r="3.1"/><path d="M3.8 18.6a5.8 5.8 0 0 1 11.2 0"/><path d="M15.6 6.2a3.1 3.1 0 0 1 0 5.9M17 18.6a5.9 5.9 0 0 0-1.4-3.8"/>',
  chart: '<path d="M4.4 19h15.2"/><path d="M7.2 19v-5.2M11 19V8.6M14.8 19v-7.4M18.4 19V6"/>',
  grid: '<rect x="4.2" y="4.2" width="6.4" height="6.4" rx="1.6"/><rect x="13.4" y="4.2" width="6.4" height="6.4" rx="1.6"/><rect x="4.2" y="13.4" width="6.4" height="6.4" rx="1.6"/><rect x="13.4" y="13.4" width="6.4" height="6.4" rx="1.6"/>',
  plus: '<path d="M12 5.6v12.8M5.6 12h12.8"/>',
  search: '<circle cx="10.9" cy="10.9" r="5.6"/><path d="m15.1 15.1 3.8 3.8"/>',
  filter: '<path d="M4.6 5.8h14.8l-5.6 6.6v5.4l-3.6 2v-7.4Z"/>',
  arrowRight: '<path d="M5.4 12h13M13 6.6 18.4 12 13 17.4"/>',
  check: '<path d="m5.6 12.4 4.2 4.2 8.6-9"/>',
  close: '<path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2.2-5.1"/><path d="M19.2 4.6v4.2H15"/>',
  edit: '<path d="M15.6 5.4 18.6 8.4 9.4 17.6l-3.8.8.8-3.8z"/><path d="M5 20.4h14"/>',
  calendar: '<rect x="4.2" y="6" width="15.6" height="13.4" rx="2"/><path d="M4.2 10.4h15.6M8.6 4.4v3.2M15.4 4.4v3.2"/>',
  vial: '<path d="M9 4.4h6"/><path d="M10.2 4.4v12.4a1.8 1.8 0 0 0 3.6 0V4.4"/><path d="M10.2 11.6h3.6"/>',
  kit: '<rect x="3.8" y="7.6" width="16.4" height="11.6" rx="2"/><path d="M9 7.6V6.2a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 15 6.2v1.4"/><path d="M12 11v4.8M9.6 13.4h4.8"/>',
  swap: '<path d="M4.6 8.6h12.2M13.4 5.2l3.4 3.4-3.4 3.4"/><path d="M19.4 15.4H7.2M10.6 12l-3.4 3.4L10.6 18.8"/>',
  gear: '<circle cx="12" cy="12" r="2.9"/><path d="M12 3.8v2.4M12 17.8v2.4M20.2 12h-2.4M6.2 12H3.8M17.8 6.2 16.1 7.9M7.9 16.1l-1.7 1.7M17.8 17.8l-1.7-1.7M7.9 7.9 6.2 6.2"/>',
  lock: '<rect x="5" y="10.4" width="14" height="9" rx="2"/><path d="M8.4 10.4V8.2a3.6 3.6 0 0 1 7.2 0v2.2"/>',
  clock: '<circle cx="12" cy="12" r="7.4"/><path d="M12 7.8V12l2.8 1.8"/>',
  pin: '<path d="M12 20.4s6-5.2 6-9.6a6 6 0 1 0-12 0c0 4.4 6 9.6 6 9.6Z"/><circle cx="12" cy="10.6" r="2.3"/>',
};

/**
 * Display icons: the 3D pack in assets/img, keyed by the same semantic names as
 * the SVG glyphs below. These replace the tile entirely — the artwork carries its
 * own depth, so it needs no cream box behind it.
 *
 * The small functional glyphs (arrow, close, plus, check, filter, swap, refresh,
 * edit, lock) have no counterpart in the pack and would be illegible at 15–17px
 * anyway, so they stay as the inline SVGs below.
 */
const IMG = {
  home: 'global-shipping-network',
  box: 'storage-container-box',
  truck: 'delivery-truck-cargo',
  warehouse: 'small-warehouse-storage',
  grid: 'fulfillment-center-warehouse',
  bell: 'customer-support-center',
  building: 'distribution-center-building',
  user: 'package-handling-worker',
  users: 'supply-chain-partnership',
  clipboard: 'delivery-checklist-package',
  flask: 'factory-production-plant',
  seal: 'package-inspection-checklist',
  chart: 'order-processing-center',
  calendar: 'conveyor-belt-packages',
  clock: 'shipment-tracking-search',
  search: 'shipment-tracking-search',
  check: 'package-inspection-checklist',
  pin: 'direction-signpost-route',
  lock: 'warehouse-reception-desk',
};

/** An <img> for `name` at `size` px, or null when the pack has no such icon. */
export function iconImg(name, size = 46) {
  const file = IMG[name];
  if (!file) return null;
  const img = document.createElement('img');
  img.src = `assets/img/${file}.png`;
  img.width = size;
  img.height = size;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  return img;
}

export const hasImg = (name) => Object.prototype.hasOwnProperty.call(IMG, name);

/**
 * Returns an <svg> element for `name`.
 * Unknown names fall back to a neutral box so a typo never breaks a screen.
 */
export function icon(name, size = 20) {
  const path = P[name] || P.box;
  return svg(`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
      stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">${path}</svg>`);
}

export const hasIcon = (name) => Object.prototype.hasOwnProperty.call(P, name);
