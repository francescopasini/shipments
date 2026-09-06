// Stock ledger. Every balance change goes through `move()` so the ledger stays
// the single source of truth and the deposit chart keeps up.

import { CENTRAL, TRANSIT, siteLocation, isSiteLocation, parseSiteLocation } from './constants.js';

export { CENTRAL, TRANSIT, siteLocation, isSiteLocation, parseSiteLocation };

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

/* Site stock is never set by hand: it moves in when a shipment is marked
   delivered (see markDelivered in workflow.js) and out via seeded consumption.
   It lands in the bucket for the shipment's own trial, never the site as a whole. */

/**
 * Ordered list of locations for the BO stock matrix. One column per site-trial,
 * since that is the granularity stock is actually held at — sorted by site code,
 * then trial code.
 */
export function matrixLocations(db) {
  const site = (id) => db.sites.find((s) => s.id === id);
  const trial = (id) => db.trials.find((t) => t.id === id);

  const pairs = db.siteTrials
    .map((st) => ({ siteTrial: st, site: site(st.siteId), trial: trial(st.trialId) }))
    .filter((p) => p.site && p.trial)
    .sort((a, b) => a.site.code.localeCompare(b.site.code)
      || a.trial.code.localeCompare(b.trial.code));

  return [
    { id: CENTRAL, label: 'Central deposit', kind: 'central' },
    { id: TRANSIT, label: 'In transit', kind: 'transit' },
    ...pairs.map((p) => ({
      id: siteLocation(p.site.id, p.trial.id),
      label: `${p.site.code} · ${p.trial.code} · ${p.site.address.city}`,
      short: `${p.site.code} · ${p.trial.code}`,
      kind: 'site',
      site: p.site,
      trial: p.trial,
      siteTrial: p.siteTrial,
    })),
  ];
}

/** Everything a site holds, across every trial it runs. */
export function totalAtSite(db, siteId) {
  return db.siteTrials
    .filter((st) => st.siteId === siteId)
    .reduce((sum, st) => sum + totalAt(db, siteLocation(st.siteId, st.trialId)), 0);
}

/** How many units of `itemId` are already heading to a site for a given trial. */
export function inboundToSite(db, siteId, trialId, itemId) {
  return db.shipments
    .filter((s) => s.siteId === siteId && s.trialId === trialId && s.status !== 'DELIVERED')
    .flatMap((s) => s.lines)
    .filter((l) => l.itemId === itemId)
    .reduce((sum, l) => sum + l.qty, 0);
}

/**
 * The most a site may still request of an item for one trial: that site-trial's
 * allocation target, less what it already holds and what is already on its way.
 */
export function requestableQty(db, siteTrial, itemId) {
  if (!siteTrial) return 0;
  const allocation = siteTrial.allocations.find((a) => a.itemId === itemId);
  if (!allocation) return 0;
  const held = balance(db, siteLocation(siteTrial.siteId, siteTrial.trialId), itemId);
  const inbound = inboundToSite(db, siteTrial.siteId, siteTrial.trialId, itemId);
  return Math.max(0, allocation.targetQty - held - inbound);
}

/** Coverage of one site-trial against its allocation targets, 0–1. */
export function siteCoverage(db, siteTrial) {
  if (!siteTrial || !siteTrial.allocations.length) return 1;
  const location = siteLocation(siteTrial.siteId, siteTrial.trialId);
  const parts = siteTrial.allocations.map((a) => {
    const held = balance(db, location, a.itemId);
    return a.targetQty ? Math.min(1, held / a.targetQty) : 1;
  });
  return parts.reduce((sum, p) => sum + p, 0) / parts.length;
}

export const ledgerFor = (db, shipmentId) => db.stockLedger.filter((l) => l.shipmentId === shipmentId);
