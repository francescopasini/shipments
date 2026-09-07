// The shipment state machine, transcribed from the workflow diagram.
//
//   NEW_REQUEST ──site requires PFI?──┬─ yes → AWAITING_PFI_APPROVAL
//                                     └─ no  → READY_FOR_PREPARATION
//   AWAITING_PFI_APPROVAL ─ approve         → READY_FOR_PREPARATION
//                         ─ request changes → NEW_REQUEST
//   READY_FOR_PREPARATION → IN_PREPARATION → SHIPPED → DELIVERED
//
// Stock leaves the central deposit when the shipment is requested and lands at
// the site when it is delivered, as the diagram specifies.

import {
  SHIPMENT_STATUS as ST, PFI_STATUS, TASK_TYPE, BO_ROLE,
  CENTRAL, TRANSIT, siteLocation, LEDGER_REASON, NOTIFICATION_TYPE,
} from './constants.js';
import { move, moveShipment, requestableCadenceUnits } from './stock.js';

const now = () => new Date().toISOString();

/* ---------- internal helpers ---------- */

const lastNumber = (rows, field) => Math.max(0, ...rows
  .map((r) => parseInt(String(r[field]).split('-').pop(), 10))
  .filter((n) => !Number.isNaN(n)));

const nextShipmentCode = (db) => `SHP-${lastNumber(db.shipments, 'code') + 1}`;

const nextPfiNumber = (db) => `PFI-2026-${String(lastNumber(db.pfis, 'number') + 1).padStart(4, '0')}`;

function addTimeline(shipment, status, byUserId, note = null) {
  shipment.status = status;
  shipment.updatedAt = now();
  shipment.timeline.push({ status, at: shipment.updatedAt, byUserId, note });
}

function openTask(db, { type, assigneeId, shipmentId, pfiId }) {
  const task = {
    id: `task-${db.tasks.length + 1}-${Date.now().toString(36)}`,
    type, assigneeId, shipmentId, pfiId,
    status: 'OPEN',
    createdAt: now(),
    doneAt: null,
  };
  db.tasks.push(task);
  return task;
}

function closeTasks(db, shipmentId, type) {
  for (const task of db.tasks) {
    if (task.shipmentId === shipmentId && task.status === 'OPEN' && (!type || task.type === type)) {
      task.status = 'DONE';
      task.doneAt = now();
    }
  }
}

function notify(db, siteId, type, shipmentId, message) {
  db.notifications.unshift({
    id: `note-${db.notifications.length + 1}-${Date.now().toString(36)}`,
    siteId, type, shipmentId, message,
    read: false,
    createdAt: now(),
  });
}

/**
 * The lines a set of picks comes to. An item carried by two of the chosen
 * cadences arrives once, for the sum of both — it is the same box either way.
 */
function linesFor(db, picks) {
  const totals = new Map();
  for (const pick of picks) {
    const cadence = db.cadences.find((c) => c.id === pick.cadenceId);
    if (!cadence) continue;
    for (const itemId of cadence.itemIds) {
      totals.set(itemId, (totals.get(itemId) || 0) + pick.units);
    }
  }
  return [...totals].map(([itemId, qty]) => ({ itemId, qty }));
}

export const getShipment = (db, id) => db.shipments.find((s) => s.id === id) || null;
export const getPfi = (db, shipment) => db.pfis.find((p) => p.id === shipment.pfiId) || null;

export const getSiteTrial = (db, siteId, trialId) => db.siteTrials
  .find((st) => st.siteId === siteId && st.trialId === trialId) || null;

/**
 * The deposit coordinator who owns this shipment. The assignment is per
 * site-trial: one hospital can route ONC-204 to Marta and NEU-077 to Tobias.
 */
export function coordinatorForShipment(db, shipment) {
  const siteTrial = getSiteTrial(db, shipment.siteId, shipment.trialId);
  return siteTrial ? siteTrial.shippingCoordinatorId : null;
}

/* ---------- transitions ---------- */

/**
 * FO requests a shipment. Creates the shipment and its PFI, moves stock from the
 * central deposit into transit, and hands the site's coordinator a task.
 *
 * `picks` is [{ cadenceId, units }] — a site may ask for several cadences at
 * once and they travel together in one shipment, each contributing its own
 * multiple of its own items. It never picks items or per-item quantities: a
 * cadence is a fixed bundle.
 */
export function requestShipment(db, {
  siteId, trialId, picks, userId,
  origin = 'MANUAL', scheduledFrom = null,
}) {
  const site = db.sites.find((s) => s.id === siteId);
  const siteTrial = getSiteTrial(db, siteId, trialId);
  if (!site || !siteTrial) return null;

  const wanted = (picks || [])
    .map((p) => ({ cadenceId: p.cadenceId, units: Math.round(p.units) }))
    .filter((p) => p.units > 0);
  if (!wanted.length) return null;

  // Every pick has to name a cadence of this trial, carry items, and sit inside
  // that cadence's own ceiling — they are separate allowances, not a shared one.
  for (const pick of wanted) {
    const cadence = db.cadences.find((c) => c.id === pick.cadenceId);
    if (!cadence || cadence.trialId !== trialId || !cadence.itemIds.length) return null;
    if (pick.units > requestableCadenceUnits(db, siteTrial, cadence)) return null;
  }

  const usesPfi = site.requiresPfiApproval;
  const shipmentId = `ship-${db.shipments.length + 1}-${Date.now().toString(36)}`;
  const pfiId = `pfi-${db.pfis.length + 1}-${Date.now().toString(36)}`;

  const shipment = {
    id: shipmentId,
    code: nextShipmentCode(db),
    siteId,
    trialId,
    cadences: wanted,
    origin,
    scheduledFrom,
    status: ST.NEW_REQUEST,
    lines: linesFor(db, wanted),
    requestedById: userId,
    createdAt: now(),
    updatedAt: now(),
    pfiId,
    timeline: [{ status: ST.NEW_REQUEST, at: now(), byUserId: userId, note: null }],
  };
  db.shipments.push(shipment);

  db.pfis.push({
    id: pfiId,
    shipmentId,
    number: nextPfiNumber(db),
    // Always a draft: the invoice has to be prepared either way, and only its
    // ending differs — issued by the coordinator, or approved by someone else.
    status: PFI_STATUS.DRAFT,
    preparedById: siteTrial.shippingCoordinatorId,
    approverId: null,
    requestedAt: null,
    decidedAt: null,
    comment: null,
    currency: 'EUR',
    lines: shipment.lines.map((l) => {
      const item = db.items.find((it) => it.id === l.itemId);
      return { itemId: l.itemId, qty: l.qty, unitValue: item.unitValue, hsCode: item.hsCode };
    }),
  });

  // Stock leaves the deposit at request time.
  moveShipment(db, shipment, CENTRAL, TRANSIT, LEDGER_REASON.REQUEST);

  openTask(db, {
    type: TASK_TYPE.PREPARE_SHIPMENT,
    assigneeId: siteTrial.shippingCoordinatorId,
    shipmentId,
    pfiId,
  });
  const named = wanted
    .map((p) => db.cadences.find((c) => c.id === p.cadenceId))
    .filter(Boolean)
    .map((c) => c.name)
    .join(' and ');
  notify(db, siteId, NOTIFICATION_TYPE.SHIPMENT_REQUESTED, shipmentId,
    `${shipment.code} requested for ${named}`);

  return shipment;
}

/* ---------- what the site may still change ---------- */

/** A request the site can still resize or drop: nothing has been prepared yet. */
export const isEditableBySite = (shipment) => !!shipment && shipment.status === ST.NEW_REQUEST;

/** The PFI mirrors the shipment's lines, so it is rebuilt whenever they move. */
function rebuildPfiLines(db, shipment) {
  const pfi = getPfi(db, shipment);
  if (!pfi) return;
  const previous = new Map(pfi.lines.map((l) => [l.itemId, l]));
  pfi.lines = shipment.lines.map((l) => {
    const item = db.items.find((it) => it.id === l.itemId);
    const before = previous.get(l.itemId);
    return {
      itemId: l.itemId,
      qty: l.qty,
      // Keep whatever the coordinator has already priced this line at.
      unitValue: before ? before.unitValue : item.unitValue,
      hsCode: before ? before.hsCode : item.hsCode,
    };
  });
}

/**
 * Change how many of the cadence a request is for. Only the difference moves, so
 * the ledger records the adjustment rather than a fictional return-and-reorder.
 */
export function changeShipmentCadences(db, shipmentId, picks, userId) {
  const shipment = getShipment(db, shipmentId);
  if (!isEditableBySite(shipment)) return null;
  const siteTrial = getSiteTrial(db, shipment.siteId, shipment.trialId);
  if (!siteTrial) return null;

  const wanted = (picks || [])
    .map((p) => ({ cadenceId: p.cadenceId, units: Math.round(p.units) }))
    .filter((p) => p.units > 0);
  if (!wanted.length) return null;

  const before = new Map((shipment.cadences || []).map((c) => [c.cadenceId, c.units]));
  for (const pick of wanted) {
    const cadence = db.cadences.find((c) => c.id === pick.cadenceId);
    if (!cadence || cadence.trialId !== shipment.trialId) return null;
    // This shipment's own share already counts against the ceiling, so add it
    // back before asking whether the new number fits.
    const headroom = requestableCadenceUnits(db, siteTrial, cadence)
      + (before.get(pick.cadenceId) || 0);
    if (pick.units > headroom) return null;
  }

  // Only the difference moves, so the ledger records the adjustment rather than
  // a fictional return-and-reorder.
  const nextLines = linesFor(db, wanted);
  const was = new Map(shipment.lines.map((l) => [l.itemId, l.qty]));
  const now2 = new Map(nextLines.map((l) => [l.itemId, l.qty]));
  for (const itemId of new Set([...was.keys(), ...now2.keys()])) {
    const delta = (now2.get(itemId) || 0) - (was.get(itemId) || 0);
    if (!delta) continue;
    move(db, {
      itemId,
      from: delta > 0 ? CENTRAL : TRANSIT,
      to: delta > 0 ? TRANSIT : CENTRAL,
      qty: Math.abs(delta),
      shipmentId,
      reason: delta > 0 ? LEDGER_REASON.REQUEST : LEDGER_REASON.CANCELLATION,
    });
  }

  shipment.cadences = wanted;
  shipment.lines = nextLines;
  shipment.updatedAt = now();
  rebuildPfiLines(db, shipment);
  void userId;
  return shipment;
}

/**
 * Drop a request outright. The stock it reserved goes back to the deposit as its
 * own ledger move — the ledger is append-only, so a cancellation is recorded
 * rather than erased, even though the shipment itself stops existing.
 */
export function cancelShipment(db, shipmentId, userId) {
  const shipment = getShipment(db, shipmentId);
  if (!isEditableBySite(shipment)) return null;

  // A cancelled follow-on has to be remembered, or the reconciler would look for
  // it, not find it, and helpfully create it again on the very next render.
  if (shipment.scheduledFrom) {
    db.declinedSchedules = db.declinedSchedules || [];
    for (const c of shipment.cadences || []) {
      db.declinedSchedules.push({
        scheduledFrom: shipment.scheduledFrom,
        cadenceId: c.cadenceId,
        at: now(),
      });
    }
  }

  moveShipment(db, shipment, TRANSIT, CENTRAL, LEDGER_REASON.CANCELLATION);
  closeTasks(db, shipmentId);

  db.tasks = db.tasks.filter((t) => t.shipmentId !== shipmentId);
  db.pfis = db.pfis.filter((pfi) => pfi.id !== shipment.pfiId);
  db.notifications = db.notifications.filter((n) => n.shipmentId !== shipmentId);
  db.shipments = db.shipments.filter((x) => x.id !== shipmentId);
  void userId;
  return shipment;
}

/* ---------- cadences that follow on ---------- */

/**
 * Ordering a cadence commits the site to the rest of the trial: every later
 * cadence follows at the same multiple, appearing once its week comes round.
 *
 * Reconciles rather than schedules — it derives what should exist from what does,
 * so it is safe to run on every render. `scheduledFrom` is what makes a given
 * (manual order, later cadence) pair produce exactly one shipment, ever.
 *
 * Returns how many it created.
 */
export function applyScheduledOrders(db) {
  let created = 0;

  for (const origin of db.shipments.filter((s) => s.origin === 'MANUAL')) {
    const siteTrial = getSiteTrial(db, origin.siteId, origin.trialId);
    if (!siteTrial) continue;
    // An order may cover several cadences. The latest one sets the pace: it is
    // the furthest through the trial the site has committed to, and its number
    // is the one the follow-ons inherit.
    const ordered = (origin.cadences || [])
      .map((c) => ({ cadence: db.cadences.find((x) => x.id === c.cadenceId), units: c.units }))
      .filter((c) => c.cadence)
      .sort((a, b) => a.cadence.week - b.cadence.week);
    const anchor = ordered.at(-1);
    if (!anchor) continue;
    const from = anchor.cadence;

    // The trigger is the gap between the two cadences, counted from the day the
    // site actually ordered — not from any calendar the site keeps. Order week 5
    // today and the week-13 cadence follows eight weeks from today, whatever the
    // site's own position in the trial. A cadence's week is therefore only ever
    // read as a distance from another cadence.
    const elapsedWeeks = (Date.now() - new Date(origin.createdAt).getTime()) / (7 * 86400000);
    const later = db.cadences
      .filter((c) => c.trialId === origin.trialId
        && c.week > from.week
        && c.week - from.week <= elapsedWeeks)
      .sort((a, b) => a.week - b.week);

    for (const cadence of later) {
      const exists = db.shipments.some((s) => s.scheduledFrom === origin.id
        && (s.cadences || []).some((c) => c.cadenceId === cadence.id));
      if (exists) continue;
      // The site already turned this one down.
      const declined = (db.declinedSchedules || []).some((d) => d.scheduledFrom === origin.id
        && d.cadenceId === cadence.id);
      if (declined) continue;

      // The ceiling still applies; a follow-on takes whatever room is left.
      const room = requestableCadenceUnits(db, siteTrial, cadence);
      const units = Math.min(anchor.units, room);
      if (units < 1) continue;

      const shipment = requestShipment(db, {
        siteId: origin.siteId,
        trialId: origin.trialId,
        picks: [{ cadenceId: cadence.id, units }],
        userId: origin.requestedById,
        origin: 'AUTO',
        scheduledFrom: origin.id,
      });
      if (!shipment) continue;

      created += 1;
      notify(db, origin.siteId, NOTIFICATION_TYPE.SHIPMENT_SCHEDULED, shipment.id,
        `${shipment.code} was created for ${cadence.name} (week ${cadence.week}) — `
        + 'change the quantity or cancel it if you do not need it');
    }
  }

  return created;
}

/** Coordinator sends the PFI to an approver. */
export function requestPfiApproval(db, shipmentId, approverId, userId) {
  const shipment = getShipment(db, shipmentId);
  if (!shipment || shipment.status !== ST.NEW_REQUEST) return null;
  const pfi = getPfi(db, shipment);
  if (!pfi) return null;

  pfi.status = PFI_STATUS.PENDING_APPROVAL;
  pfi.approverId = approverId;
  pfi.requestedAt = now();
  pfi.decidedAt = null;

  closeTasks(db, shipmentId, TASK_TYPE.PREPARE_SHIPMENT);
  addTimeline(shipment, ST.AWAITING_PFI_APPROVAL, userId);
  openTask(db, { type: TASK_TYPE.APPROVE_PFI, assigneeId: approverId, shipmentId, pfiId: pfi.id });
  return shipment;
}

/** Approver approves the PFI — the shipment becomes ready for preparation. */
export function approvePfi(db, shipmentId, userId) {
  const shipment = getShipment(db, shipmentId);
  if (!shipment || shipment.status !== ST.AWAITING_PFI_APPROVAL) return null;
  const pfi = getPfi(db, shipment);

  pfi.status = PFI_STATUS.APPROVED;
  pfi.decidedAt = now();
  pfi.comment = null;

  closeTasks(db, shipmentId, TASK_TYPE.APPROVE_PFI);
  addTimeline(shipment, ST.READY_FOR_PREPARATION, userId);
  openTask(db, {
    type: TASK_TYPE.CONTINUE_SHIPMENT,
    assigneeId: coordinatorForShipment(db, shipment),
    shipmentId,
    pfiId: pfi.id,
  });
  notify(db, shipment.siteId, NOTIFICATION_TYPE.PFI_APPROVED, shipmentId,
    `PFI ${pfi.number} approved for ${shipment.code}`);
  return shipment;
}

/** Approver sends the PFI back — the shipment returns to the coordinator. */
export function requestPfiChanges(db, shipmentId, userId, comment) {
  const shipment = getShipment(db, shipmentId);
  if (!shipment || shipment.status !== ST.AWAITING_PFI_APPROVAL) return null;
  const pfi = getPfi(db, shipment);

  pfi.status = PFI_STATUS.CHANGES_REQUESTED;
  pfi.decidedAt = now();
  pfi.comment = comment || null;

  closeTasks(db, shipmentId, TASK_TYPE.APPROVE_PFI);
  addTimeline(shipment, ST.NEW_REQUEST, userId, comment || 'Changes requested on the PFI');
  openTask(db, {
    type: TASK_TYPE.PREPARE_SHIPMENT,
    assigneeId: coordinatorForShipment(db, shipment),
    shipmentId,
    pfiId: pfi.id,
  });
  return shipment;
}

/** No PFI needed — straight from new request to ready for preparation. */
export function markReadyForPreparation(db, shipmentId, userId) {
  const shipment = getShipment(db, shipmentId);
  if (!shipment || shipment.status !== ST.NEW_REQUEST) return null;

  // Nobody else countersigns here, so finalising the shipment is what issues
  // the invoice. It stops being editable at the same moment.
  const pfi = getPfi(db, shipment);
  if (pfi) {
    pfi.status = PFI_STATUS.ISSUED;
    pfi.decidedAt = now();
    pfi.comment = null;
  }

  closeTasks(db, shipmentId, TASK_TYPE.PREPARE_SHIPMENT);
  addTimeline(shipment, ST.READY_FOR_PREPARATION, userId);
  openTask(db, {
    type: TASK_TYPE.CONTINUE_SHIPMENT,
    assigneeId: coordinatorForShipment(db, shipment),
    shipmentId,
    pfiId: shipment.pfiId,
  });
  return shipment;
}

/** Coordinator sends the request to the shipping vendor. */
export function sendToVendor(db, shipmentId, userId) {
  const shipment = getShipment(db, shipmentId);
  if (!shipment || shipment.status !== ST.READY_FOR_PREPARATION) return null;
  closeTasks(db, shipmentId, TASK_TYPE.CONTINUE_SHIPMENT);
  addTimeline(shipment, ST.IN_PREPARATION, userId);
  notify(db, shipment.siteId, NOTIFICATION_TYPE.SHIPMENT_IN_PREPARATION, shipmentId,
    `${shipment.code} is being prepared by the vendor`);
  return shipment;
}

/** Vendor confirmed dispatch — the coordinator records it. */
export function markShipped(db, shipmentId, userId) {
  const shipment = getShipment(db, shipmentId);
  if (!shipment || shipment.status !== ST.IN_PREPARATION) return null;
  addTimeline(shipment, ST.SHIPPED, userId);
  notify(db, shipment.siteId, NOTIFICATION_TYPE.SHIPMENT_SHIPPED, shipmentId,
    `${shipment.code} has left the central deposit`);
  return shipment;
}

/** Vendor confirmed delivery — stock lands at the site. */
export function markDelivered(db, shipmentId, userId) {
  const shipment = getShipment(db, shipmentId);
  if (!shipment || shipment.status !== ST.SHIPPED) return null;
  moveShipment(db, shipment, TRANSIT, siteLocation(shipment.siteId, shipment.trialId), LEDGER_REASON.DELIVERY);
  closeTasks(db, shipmentId);
  addTimeline(shipment, ST.DELIVERED, userId);
  notify(db, shipment.siteId, NOTIFICATION_TYPE.SHIPMENT_DELIVERED, shipmentId,
    `${shipment.code} was delivered — please confirm your stock`);
  return shipment;
}

/* ---------- preparing the invoice ---------- */

/** A PFI is ready to leave the coordinator's hands once every line is priced. */
export const pfiIsPrepared = (pfi) => !!pfi
  && pfi.lines.length > 0
  && pfi.lines.every((l) => l.unitValue > 0 && String(l.hsCode || '').trim());

/** Statuses where the coordinator may still change the invoice. */
const EDITABLE_PFI = [PFI_STATUS.DRAFT, PFI_STATUS.CHANGES_REQUESTED];

/**
 * Whether `user` may edit this shipment's invoice: they have to be the
 * coordinator for its site-trial, and it must not have been issued, approved,
 * or sent off for approval yet — the declared values are what an approver signs.
 */
export function canEditPfi(db, shipment, user) {
  if (!user || user.role !== 'BO') return false;
  if (coordinatorForShipment(db, shipment) !== user.id) return false;
  const pfi = getPfi(db, shipment);
  return !!pfi && EDITABLE_PFI.includes(pfi.status);
}

/**
 * Save the coordinator's edits. Quantities are deliberately not editable here:
 * they come from the shipment's own lines, which the stock ledger has already
 * moved into transit, so changing them would put the two out of step.
 *
 * lines: [{ itemId, unitValue, hsCode }]
 */
export function updatePfi(db, shipmentId, { currency, lines }, userId) {
  const shipment = getShipment(db, shipmentId);
  if (!shipment) return null;
  const pfi = getPfi(db, shipment);
  if (!pfi || !EDITABLE_PFI.includes(pfi.status)) return null;

  const edits = new Map((lines || []).map((l) => [l.itemId, l]));
  for (const line of pfi.lines) {
    const edit = edits.get(line.itemId);
    if (!edit) continue;
    line.unitValue = Math.max(0, Number(edit.unitValue) || 0);
    line.hsCode = String(edit.hsCode || '').trim();
  }
  if (currency) pfi.currency = currency;
  // Whoever last worked on it is who prepared it.
  pfi.preparedById = userId;
  // Re-editing after a knock-back puts it back to a plain draft.
  pfi.status = PFI_STATUS.DRAFT;
  shipment.updatedAt = now();
  return pfi;
}

/* ---------- what the current user may do ---------- */

/**
 * Actions available to `user` on `shipment`, as
 * [{ id, label, variant, needs: 'approver'|'comment'|null }].
 */
export function availableActions(db, shipment, user) {
  if (!user || user.role !== 'BO') return [];
  const site = db.sites.find((s) => s.id === shipment.siteId);
  const pfi = getPfi(db, shipment);
  const isCoordinator = coordinatorForShipment(db, shipment) === user.id;
  const isApprover = pfi && pfi.approverId === user.id;

  switch (shipment.status) {
    case ST.NEW_REQUEST:
      if (!isCoordinator) return [];
      return site.requiresPfiApproval
        ? [{ id: 'requestApproval', label: 'Request PFI approval', variant: 'primary', needs: 'approver' }]
        : [{ id: 'ready', label: 'Mark ready for preparation', variant: 'primary' }];
    case ST.AWAITING_PFI_APPROVAL:
      if (!isApprover) return [];
      return [
        { id: 'approve', label: 'Approve PFI', variant: 'go' },
        { id: 'changes', label: 'Request modification', variant: 'warn', needs: 'comment' },
      ];
    case ST.READY_FOR_PREPARATION:
      return isCoordinator
        ? [{ id: 'send', label: 'Send request to vendor', variant: 'primary' }]
        : [];
    case ST.IN_PREPARATION:
      return isCoordinator
        ? [{ id: 'shipped', label: 'Mark as shipped', variant: 'go' }]
        : [];
    case ST.SHIPPED:
      return isCoordinator
        ? [{ id: 'delivered', label: 'Mark as delivered', variant: 'go' }]
        : [];
    default:
      return [];
  }
}

/** Dispatch an action id from `availableActions`. */
export function runAction(db, actionId, shipmentId, userId, payload = {}) {
  switch (actionId) {
    case 'requestApproval': return requestPfiApproval(db, shipmentId, payload.approverId, userId);
    case 'ready': return markReadyForPreparation(db, shipmentId, userId);
    case 'approve': return approvePfi(db, shipmentId, userId);
    case 'changes': return requestPfiChanges(db, shipmentId, userId, payload.comment);
    case 'send': return sendToVendor(db, shipmentId, userId);
    case 'shipped': return markShipped(db, shipmentId, userId);
    case 'delivered': return markDelivered(db, shipmentId, userId);
    default: return null;
  }
}

/** BO users who can approve a PFI, excluding the coordinator raising it. */
export const eligibleApprovers = (db, excludeUserId) => db.users
  .filter((u) => u.role === 'BO' && u.boRoles.includes(BO_ROLE.PFI_APPROVER) && u.id !== excludeUserId);

// Re-exported so views can record ad-hoc corrections without importing stock.js too.
export { move };
