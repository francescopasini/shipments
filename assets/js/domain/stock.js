// Stock ledger. Every balance change goes through `move()` so the ledger stays
// the single source of truth and the deposit chart keeps up.

import { CENTRAL, TRANSIT, siteLocation, isSiteLocation, siteIdFromLocation, LEDGER_REASON } from './constants.js';

export { CENTRAL, TRANSIT, siteLocation, isSiteLocation, siteIdFromLocation };

/** Units of `itemId` currently held at `location`. */
export function balance(db, location, itemId) {
  return (db.stock[location] && db.stock[location][itemId]) || 0;
}

/** Every item held at `location`, as `{ itemId: qty }`. */
export function balancesAt(db, location) {
  return db.stock[location] || {};
}

export const totalAt = (db, location) => Object
  .values(balancesAt(db, location))
  .reduce((sum, qty) => sum + qty, 0);

/**
 * Record a stock movement. `from`/`to` may be null for restocks and consumption.
 * Mutates `db` — call inside store.update().
 */
export function move(db, { itemId, from, to, qty, shipmentId = null, reason, at = null }) {
  const amount = Math.max(0, Math.round(qty));
  if (!amount) return null;

  const entry = {
    id: `led-${db.stockLedger.length + 1}-${Date.now().toString(36)}`,
    at: at || new Date().toISOString(),
    itemId, from, to, qty: amount, shipmentId, reason,
  };
  db.stockLedger.push(entry);

  const apply = (loc, delta) => {
    if (!loc) return;
    if (!db.stock[loc]) db.stock[loc] = {};
    db.stock[loc][itemId] = Math.max(0, (db.stock[loc][itemId] || 0) + delta);
  };
  apply(from, -amount);
  apply(to, amount);

  if (from === CENTRAL || to === CENTRAL) {
    syncDepositHistory(db, (to === CENTRAL ? amount : 0) - (from === CENTRAL ? amount : 0));
  }
  return entry;
}

/** Keep today's point on the deposit chart in step with live movements. */
function syncDepositHistory(db, delta) {
  if (!delta) return;
  const today = new Date().toISOString().slice(0, 10);
  const last = db.depositHistory.at(-1);
  if (last && last.date === today) last.units = Math.max(0, last.units + delta);
  else db.depositHistory.push({ date: today, units: Math.max(0, (last ? last.units : 0) + delta) });
  if (db.depositHistory.length > 120) db.depositHistory.splice(0, db.depositHistory.length - 120);
}

/** Move a whole shipment's lines between two locations. */
export function moveShipment(db, shipment, from, to, reason) {
  for (const line of shipment.lines) {
    move(db, { itemId: line.itemId, from, to, qty: line.qty, shipmentId: shipment.id, reason });
  }
}

/**
 * Set a site's counted stock for one item to `newQty`, recording the difference
 * as an adjustment. Used by the FO stock screen.
 */
export function setSiteCount(db, siteId, itemId, newQty) {
  const loc = siteLocation(siteId);
  const current = balance(db, loc, itemId);
  const target = Math.max(0, Math.round(newQty));
  const delta = target - current;
  if (!delta) return null;
  return move(db, {
    itemId,
    from: delta < 0 ? loc : null,
    to: delta > 0 ? loc : null,
    qty: Math.abs(delta),
    reason: LEDGER_REASON.ADJUSTMENT,
  });
}

/** Ordered list of locations for the BO stock matrix. */
export function matrixLocations(db) {
  return [
    { id: CENTRAL, label: 'Central deposit', kind: 'central' },
    { id: TRANSIT, label: 'In transit', kind: 'transit' },
    ...db.sites.map((site) => ({
      id: siteLocation(site.id),
      label: `${site.code} · ${site.address.city}`,
      kind: 'site',
      site,
    })),
  ];
}

/** How many units of `itemId` are already heading to `siteId`. */
export function inboundToSite(db, siteId, itemId) {
  return db.shipments
    .filter((s) => s.siteId === siteId && s.status !== 'DELIVERED')
    .flatMap((s) => s.lines)
    .filter((l) => l.itemId === itemId)
    .reduce((sum, l) => sum + l.qty, 0);
}

/**
 * The most a site may still request of an item: its allocation target, less what
 * it already holds and what is already on its way.
 */
export function requestableQty(db, site, itemId) {
  const allocation = site.allocations.find((a) => a.itemId === itemId);
  if (!allocation) return 0;
  const held = balance(db, siteLocation(site.id), itemId);
  return Math.max(0, allocation.targetQty - held - inboundToSite(db, site.id, itemId));
}

/** Coverage of a site against its allocation targets, 0–1. */
export function siteCoverage(db, site) {
  if (!site.allocations.length) return 1;
  const parts = site.allocations.map((a) => {
    const held = balance(db, siteLocation(site.id), a.itemId);
    return a.targetQty ? Math.min(1, held / a.targetQty) : 1;
  });
  return parts.reduce((sum, p) => sum + p, 0) / parts.length;
}

export const ledgerFor = (db, shipmentId) => db.stockLedger.filter((l) => l.shipmentId === shipmentId);
