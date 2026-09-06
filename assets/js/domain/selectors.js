// Derived reads over the database. Pure functions — no mutation.

import { SHIPMENT_STATUS_ORDER, SHIPMENT_STATUS_META, BO_ROLE, COUNTRIES } from './constants.js';
import { balance, siteLocation, requestableQty, siteCoverage, totalAtSite } from './stock.js';

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

/* ---------- the site ↔ trial join ---------- */

/* A site runs any number of trials, and every trial runs at any number of sites.
   `db.siteTrials` is that join, and it carries everything that only makes sense
   for one pair: the allocation targets, the activation date the study week is
   measured from, and the deposit coordinator who fields that study's requests. */

export const getSiteTrial = (db, siteId, trialId) => db.siteTrials
  .find((st) => st.siteId === siteId && st.trialId === trialId) || null;

export const siteTrialsForSite = (db, siteId) => db.siteTrials
  .filter((st) => st.siteId === siteId)
  .sort((a, b) => trialCode(db, a.trialId).localeCompare(trialCode(db, b.trialId)));

export const siteTrialsForTrial = (db, trialId) => db.siteTrials
  .filter((st) => st.trialId === trialId)
  .sort((a, b) => siteCode(db, a.siteId).localeCompare(siteCode(db, b.siteId)));

/** The trials a site runs, as trial objects, in code order. */
export const trialsForSite = (db, siteId) => siteTrialsForSite(db, siteId)
  .map((st) => getTrial(db, st.trialId))
  .filter(Boolean);

export const sitesForTrial = (db, trialId) => byCode(siteTrialsForTrial(db, trialId)
  .map((st) => getSite(db, st.siteId))
  .filter(Boolean));

const trialCode = (db, id) => (getTrial(db, id) || {}).code || '';
const siteCode = (db, id) => (getSite(db, id) || {}).code || '';

/** How a site's trials read on a one-line summary: codes, or a count past two. */
export function trialSummary(db, siteId) {
  const trials = trialsForSite(db, siteId);
  if (!trials.length) return 'No trials';
  if (trials.length > 2) return `${trials.length} trials`;
  return trials.map((t) => t.code).join(' · ');
}

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
 * One site-trial's stock position per allocated item:
 * [{ item, held, target, inbound, requestable, ratio }]
 */
export function siteStockRows(db, siteTrial) {
  if (!siteTrial) return [];
  const location = siteLocation(siteTrial.siteId, siteTrial.trialId);
  return siteTrial.allocations
    .map((a) => {
      const item = getItem(db, a.itemId);
      const held = balance(db, location, a.itemId);
      const inbound = db.shipments
        .filter((s) => s.siteId === siteTrial.siteId
          && s.trialId === siteTrial.trialId
          && s.status !== 'DELIVERED')
        .flatMap((s) => s.lines)
        .filter((l) => l.itemId === a.itemId)
        .reduce((sum, l) => sum + l.qty, 0);
      return {
        item,
        held,
        inbound,
        target: a.targetQty,
        requestable: requestableQty(db, siteTrial, a.itemId),
        ratio: a.targetQty ? held / a.targetQty : 1,
      };
    })
    .filter((r) => r.item)
    .sort((a, b) => a.ratio - b.ratio);
}

export { siteCoverage, totalAtSite };

/** Mean coverage across every trial a site runs — one number for a list row. */
export function siteCoverageAll(db, site) {
  const pairs = siteTrialsForSite(db, site.id);
  if (!pairs.length) return 1;
  return pairs.reduce((sum, st) => sum + siteCoverage(db, st), 0) / pairs.length;
}

/** Weeks elapsed since the site was activated for this trial. */
export function siteStudyWeek(siteTrial) {
  if (!siteTrial) return 1;
  const days = (Date.now() - new Date(siteTrial.activatedOn).getTime()) / 86400000;
  return Math.max(1, Math.floor(days / 7) + 1);
}

/** The cadence a site-trial is closest to needing next. */
export function nextCadenceForSite(db, siteTrial) {
  if (!siteTrial) return null;
  const week = siteStudyWeek(siteTrial);
  const cadences = cadencesForTrial(db, siteTrial.trialId);
  return cadences.find((c) => c.week >= week) || cadences.at(-1) || null;
}

/* ---------- BO metrics ---------- */

export const shippingCoordinators = (db) => db.users
  .filter((u) => u.role === 'BO' && u.boRoles.includes(BO_ROLE.SHIPPING_COORDINATOR));

/** Items whose central-deposit cover is thin relative to outstanding demand. */
export function lowDepositItems(db, limit = 5) {
  const activeSiteIds = new Set(db.sites.filter((s) => s.active).map((s) => s.id));
  const demand = {};
  for (const st of db.siteTrials.filter((x) => activeSiteIds.has(x.siteId))) {
    for (const a of st.allocations) demand[a.itemId] = (demand[a.itemId] || 0) + a.targetQty;
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
