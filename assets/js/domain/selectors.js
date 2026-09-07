// Derived reads over the database. Pure functions — no mutation.

import { SHIPMENT_STATUS_ORDER, SHIPMENT_STATUS_META, BO_ROLE, COUNTRIES } from './constants.js';
import {
  balance, siteLocation, totalAtSite, orderedCadenceUnits, requestableCadenceUnits,
} from './stock.js';

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

/**
 * How a site is named, everywhere. One convention, one implementation: the code
 * and the name read as the title, the city and country as the line beneath it.
 * Both take the site or nothing, so callers need no guards.
 */
export const siteTitle = (site) => (site ? `${site.code} · ${site.name}` : '—');
export const siteWhere = (site) => (site
  ? `${site.address.city}, ${countryName(site.address.country)}`
  : '');

/**
 * The cadences a shipment was ordered against, resolved: [{ cadence, units }].
 * One entry for a plain request, several when a site asked for more than one
 * cadence at once and they travelled together.
 */
export const shipmentCadences = (db, shipment) => (shipment.cadences || [])
  .map((c) => ({ cadence: getCadence(db, c.cadenceId), units: c.units }))
  .filter((c) => c.cadence);

/** The items a cadence ships, as item objects, in catalogue order. */
export const cadenceItems = (db, cadence) => (cadence
  ? cadence.itemIds.map((id) => getItem(db, id)).filter(Boolean)
  : []);

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
   for one pair: the cadence limit and the deposit coordinator who fields that
   study's requests. */

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
 * What a site-trial holds, per item: [{ item, held, inbound }].
 *
 * There is no target column any more. A site's ceiling is one number covering a
 * whole cadence, so no per-item allowance exists to compare against — the rows
 * report the position rather than judging it.
 */
export function siteStockRows(db, siteTrial) {
  if (!siteTrial) return [];
  const location = siteLocation(siteTrial.siteId, siteTrial.trialId);
  const open = db.shipments.filter((s) => s.siteId === siteTrial.siteId
    && s.trialId === siteTrial.trialId
    && s.status !== 'DELIVERED');

  // Every item the pairing has touched: what it holds, plus anything on its way.
  const itemIds = new Set([
    ...Object.keys(db.stock[location] || {}),
    ...open.flatMap((s) => s.lines.map((l) => l.itemId)),
  ]);

  return [...itemIds]
    .map((itemId) => ({
      item: getItem(db, itemId),
      held: balance(db, location, itemId),
      inbound: open
        .flatMap((s) => s.lines)
        .filter((l) => l.itemId === itemId)
        .reduce((sum, l) => sum + l.qty, 0),
    }))
    .filter((r) => r.item && (r.held > 0 || r.inbound > 0))
    .sort((a, b) => a.item.name.localeCompare(b.item.name));
}

export { totalAtSite, orderedCadenceUnits, requestableCadenceUnits };

/**
 * Where one cadence stands at a site, counted in cadences rather than units:
 * how many are on their way, and how many have landed. What may still be
 * ordered is `requestableCadenceUnits`, asked at the point of ordering.
 */
export function cadencePosition(db, siteTrial, cadence) {
  const mine = db.shipments.filter((s) => s.siteId === siteTrial.siteId
    && s.trialId === siteTrial.trialId);
  // A shipment can carry several cadences, so take this one's share of each.
  const tally = (match) => mine.filter(match)
    .flatMap((s) => s.cadences || [])
    .filter((c) => c.cadenceId === cadence.id)
    .reduce((sum, c) => sum + (c.units || 0), 0);

  return {
    inTransit: tally((s) => s.status !== 'DELIVERED'),
    onSite: tally((s) => s.status === 'DELIVERED'),
  };
}

/* ---------- BO metrics ---------- */

export const shippingCoordinators = (db) => db.users
  .filter((u) => u.role === 'BO' && u.boRoles.includes(BO_ROLE.SHIPPING_COORDINATOR));

