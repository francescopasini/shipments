// Derived reads over the database. Pure functions — no mutation.

import { SHIPMENT_STATUS_ORDER, SHIPMENT_STATUS_META, BO_ROLE, COUNTRIES } from './constants.js';
import { balance, siteLocation, requestableQty, siteCoverage } from './stock.js';

/* ---------- lookups ---------- */

export const byId = (rows, id) => rows.find((r) => r.id === id) || null;

export const getSite = (db, id) => byId(db.sites, id);
export const getTrial = (db, id) => byId(db.trials, id);
export const getItem = (db, id) => byId(db.items, id);
export const getUser = (db, id) => byId(db.users, id);
export const getCadence = (db, id) => byId(db.cadences, id);

export const userName = (db, id) => (getUser(db, id) || {}).name || 'Unassigned';
export const itemName = (db, id) => (getItem(db, id) || {}).name || 'Unknown item';
export const countryName = (code) => COUNTRIES[code] || code;

export const cadencesForTrial = (db, trialId) => db.cadences
  .filter((c) => c.trialId === trialId)
  .sort((a, b) => a.week - b.week);

/** Sort sites or trials alphabetically by their code — the identifier shown first on every card. */
export const byCode = (rows) => [...rows].sort((a, b) => a.code.localeCompare(b.code));

export const allSites = (db) => byCode(db.sites);
export const allTrials = (db) => byCode(db.trials);

export const sitesForTrial = (db, trialId) => byCode(db.sites.filter((s) => s.trialId === trialId));

export const coordinatorsForSite = (db, siteId) => db.users
  .filter((u) => u.role === 'FO' && u.siteIds.includes(siteId));

export const sitesForUser = (db, user) => (user && user.role === 'FO'
  ? byCode(user.siteIds.map((id) => getSite(db, id)).filter(Boolean))
  : []);

/* ---------- shipments ---------- */

export const shipmentsForSite = (db, siteId) => db.shipments
  .filter((s) => s.siteId === siteId)
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const allShipments = (db) => [...db.shipments]
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const openShipments = (db) => db.shipments.filter((s) => s.status !== 'DELIVERED');

export const unitsIn = (shipment) => shipment.lines.reduce((sum, l) => sum + l.qty, 0);

/** Counts per status, in workflow order, ready for the status bar chart. */
export function statusBreakdown(shipments) {
  return SHIPMENT_STATUS_ORDER.map((status) => ({
    status,
    label: SHIPMENT_STATUS_META[status].label,
    tone: SHIPMENT_STATUS_META[status].tone,
    value: shipments.filter((s) => s.status === status).length,
  }));
}

/** Total declared value of a PFI. */
export const pfiValue = (pfi) => (pfi
  ? pfi.lines.reduce((sum, l) => sum + l.qty * l.unitValue, 0)
  : 0);

/* ---------- tasks ---------- */

export const openTasksFor = (db, userId) => db.tasks
  .filter((t) => t.assigneeId === userId && t.status === 'OPEN')
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const doneTasksFor = (db, userId) => db.tasks
  .filter((t) => t.assigneeId === userId && t.status === 'DONE')
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/* ---------- notifications ---------- */

export const notificationsForSite = (db, siteId) => db.notifications
  .filter((n) => n.siteId === siteId)
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const unreadCount = (db, siteId) => db.notifications
  .filter((n) => n.siteId === siteId && !n.read).length;

/* ---------- site metrics ---------- */

/**
 * A site's stock position per allocated item:
 * [{ item, held, target, inbound, requestable, ratio }]
 */
export function siteStockRows(db, site) {
  return site.allocations
    .map((a) => {
      const item = getItem(db, a.itemId);
      const held = balance(db, siteLocation(site.id), a.itemId);
      const inbound = db.shipments
        .filter((s) => s.siteId === site.id && s.status !== 'DELIVERED')
        .flatMap((s) => s.lines)
        .filter((l) => l.itemId === a.itemId)
        .reduce((sum, l) => sum + l.qty, 0);
      return {
        item,
        held,
        inbound,
        target: a.targetQty,
        requestable: requestableQty(db, site, a.itemId),
        ratio: a.targetQty ? held / a.targetQty : 1,
      };
    })
    .filter((r) => r.item)
    .sort((a, b) => a.ratio - b.ratio);
}

export { siteCoverage };

/** Weeks elapsed since the site was activated — used to suggest the next cadence. */
export function siteStudyWeek(site) {
  const days = (Date.now() - new Date(site.activatedOn).getTime()) / 86400000;
  return Math.max(1, Math.floor(days / 7) + 1);
}

/** The cadence a site is closest to needing next. */
export function nextCadenceForSite(db, site) {
  const week = siteStudyWeek(site);
  const cadences = cadencesForTrial(db, site.trialId);
  return cadences.find((c) => c.week >= week) || cadences.at(-1) || null;
}

/* ---------- BO metrics ---------- */

export const shippingCoordinators = (db) => db.users
  .filter((u) => u.role === 'BO' && u.boRoles.includes(BO_ROLE.SHIPPING_COORDINATOR));

/** Items whose central-deposit cover is thin relative to outstanding demand. */
export function lowDepositItems(db, limit = 5) {
  const demand = {};
  for (const site of db.sites.filter((s) => s.active)) {
    for (const a of site.allocations) demand[a.itemId] = (demand[a.itemId] || 0) + a.targetQty;
  }
  return db.items
    .map((item) => {
      const held = balance(db, 'CENTRAL', item.id);
      const need = demand[item.id] || 0;
      return { item, held, need, ratio: need ? held / need : 99 };
    })
    .filter((r) => r.need > 0)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, limit);
}
