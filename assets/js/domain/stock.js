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
 * How much of one cadence a site has ordered for a trial, over the whole trial.
 * A shipment may carry several cadences at once, so this sums that cadence's
 * share wherever it appears. Cancelled requests are removed from `shipments`,
 * so they stop counting here.
 */
export function orderedCadenceUnits(db, siteId, trialId, cadenceId) {
  return db.shipments
    .filter((s) => s.siteId === siteId && s.trialId === trialId)
    .flatMap((s) => s.cadences || [])
    .filter((c) => c.cadenceId === cadenceId)
    .reduce((sum, c) => sum + (c.units || 0), 0);
}

/**
 * The most of `cadence` a site may still order. The pairing carries a single
 * ceiling — how many of any one cadence it may take over the trial — because a
 * cadence ships the same number of every item in it, so a per-item allowance
 * would have nothing extra to say.
 */
export function requestableCadenceUnits(db, siteTrial, cadence) {
  if (!siteTrial || !cadence) return 0;
  const cap = siteTrial.maxCadenceUnits || 0;
  const already = orderedCadenceUnits(db, siteTrial.siteId, siteTrial.trialId, cadence.id);
  return Math.max(0, cap - already);
}

export const ledgerFor = (db, shipmentId) => db.stockLedger.filter((l) => l.shipmentId === shipmentId);

/* ---------- low stock ---------- */

/**
 * The most this item could ever be asked for: every site-trial's ceiling is a
 * cap on any one cadence, and ordering N of a cadence means N of every item in
 * it — so a pairing's ceiling is also the most it could ask of any item that
 * one of its trial's cadences carries. Summed across every pairing whose trial
 * ships the item, this is the deposit's total exposure to it.
 *
 * `siteTrials` scopes the sum to a subset of pairings — the stock matrix uses
 * this to total a target across whichever sites are currently filtered in;
 * every other caller wants the whole book, so it defaults to `db.siteTrials`.
 */
export function itemTargetTotal(db, itemId, siteTrials = db.siteTrials) {
  const trialsCarryingItem = new Set(
    db.cadences.filter((c) => c.itemIds.includes(itemId)).map((c) => c.trialId),
  );
  return siteTrials
    .filter((st) => trialsCarryingItem.has(st.trialId))
    .reduce((sum, st) => sum + (st.maxCadenceUnits || 0), 0);
}

/** Units of `itemId` already sitting at a site, any site, any trial — or a scoped subset. */
export function siteStockTotal(db, itemId, siteTrials = db.siteTrials) {
  return siteTrials.reduce(
    (sum, st) => sum + balance(db, siteLocation(st.siteId, st.trialId), itemId), 0,
  );
}

/**
 * Below this, the deposit is low on `itemId`. The stricter of two readings:
 * a flat third of everything it could ever be asked for, and — sharper once
 * sites are already stocked up — what would still be uncovered if every unit
 * on a site or already in transit were set against the total demand. An item
 * nothing has a target for cannot be low; there is nothing to run out of.
 */
export function lowStockThreshold(db, itemId) {
  const target = itemTargetTotal(db, itemId);
  if (!target) return 0;
  const uncovered = target - siteStockTotal(db, itemId) - balance(db, TRANSIT, itemId);
  return Math.min(target / 3, uncovered);
}

export const isLowStock = (db, itemId) => balance(db, CENTRAL, itemId) < lowStockThreshold(db, itemId);

/**
 * One row per item: the deposit, what is in transit, what a scope of sites
 * holds between them, and the target that scope adds up to. The stock matrix
 * reads this against whichever sites the filters have picked out; the
 * dashboard's low-stock card reads it against every site, since it has no
 * filters of its own to narrow with.
 *
 * `low` is never scoped — it is the same deposit-wide check regardless of
 * which sites are in view, since a shortage in the one central balance is what
 * it is no matter which slice of the site columns you happen to be looking at.
 */
export function stockRows(db, siteTrials = db.siteTrials) {
  return db.items.map((item) => {
    const central = balance(db, CENTRAL, item.id);
    const threshold = lowStockThreshold(db, item.id);
    return {
      item,
      central,
      transit: balance(db, TRANSIT, item.id),
      selected: siteStockTotal(db, item.id, siteTrials),
      target: itemTargetTotal(db, item.id, siteTrials),
      threshold,
      low: central < threshold,
    };
  });
}

