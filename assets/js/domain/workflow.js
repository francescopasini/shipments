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
import { move, moveShipment } from './stock.js';

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

export const getShipment = (db, id) => db.shipments.find((s) => s.id === id) || null;
export const getPfi = (db, shipment) => db.pfis.find((p) => p.id === shipment.pfiId) || null;

/* ---------- transitions ---------- */

/**
 * FO requests a shipment. Creates the shipment and its PFI, moves stock from the
 * central deposit into transit, and hands the site's coordinator a task.
 *
 * lines: [{ itemId, qty }] — zero-quantity lines are dropped.
 */
export function requestShipment(db, { siteId, cadenceId, lines, userId }) {
  const site = db.sites.find((s) => s.id === siteId);
  const cadence = db.cadences.find((c) => c.id === cadenceId);
  const wanted = lines.filter((l) => l.qty > 0);
  if (!site || !cadence || !wanted.length) return null;

  const usesPfi = site.requiresPfiApproval;
  const shipmentId = `ship-${db.shipments.length + 1}-${Date.now().toString(36)}`;
  const pfiId = `pfi-${db.pfis.length + 1}-${Date.now().toString(36)}`;

  const shipment = {
    id: shipmentId,
    code: nextShipmentCode(db),
    siteId,
    trialId: site.trialId,
    cadenceId,
    status: ST.NEW_REQUEST,
    lines: wanted.map((l) => ({ itemId: l.itemId, qty: Math.round(l.qty) })),
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
    status: usesPfi ? PFI_STATUS.DRAFT : PFI_STATUS.NOT_REQUIRED,
    preparedById: site.shippingCoordinatorId,
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
    assigneeId: site.shippingCoordinatorId,
    shipmentId,
    pfiId,
  });
  notify(db, siteId, NOTIFICATION_TYPE.SHIPMENT_REQUESTED, shipmentId,
    `${shipment.code} requested for ${cadence.name} (week ${cadence.week})`);

  return shipment;
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
  const site = db.sites.find((s) => s.id === shipment.siteId);

  pfi.status = PFI_STATUS.APPROVED;
  pfi.decidedAt = now();
  pfi.comment = null;

  closeTasks(db, shipmentId, TASK_TYPE.APPROVE_PFI);
  addTimeline(shipment, ST.READY_FOR_PREPARATION, userId);
  openTask(db, {
    type: TASK_TYPE.CONTINUE_SHIPMENT,
    assigneeId: site.shippingCoordinatorId,
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
  const site = db.sites.find((s) => s.id === shipment.siteId);

  pfi.status = PFI_STATUS.CHANGES_REQUESTED;
  pfi.decidedAt = now();
  pfi.comment = comment || null;

  closeTasks(db, shipmentId, TASK_TYPE.APPROVE_PFI);
  addTimeline(shipment, ST.NEW_REQUEST, userId, comment || 'Changes requested on the PFI');
  openTask(db, {
    type: TASK_TYPE.PREPARE_SHIPMENT,
    assigneeId: site.shippingCoordinatorId,
    shipmentId,
    pfiId: pfi.id,
  });
  return shipment;
}

/** No PFI needed — straight from new request to ready for preparation. */
export function markReadyForPreparation(db, shipmentId, userId) {
  const shipment = getShipment(db, shipmentId);
  if (!shipment || shipment.status !== ST.NEW_REQUEST) return null;
  const site = db.sites.find((s) => s.id === shipment.siteId);

  closeTasks(db, shipmentId, TASK_TYPE.PREPARE_SHIPMENT);
  addTimeline(shipment, ST.READY_FOR_PREPARATION, userId);
  openTask(db, {
    type: TASK_TYPE.CONTINUE_SHIPMENT,
    assigneeId: site.shippingCoordinatorId,
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
  moveShipment(db, shipment, TRANSIT, siteLocation(shipment.siteId), LEDGER_REASON.DELIVERY);
  closeTasks(db, shipmentId);
  addTimeline(shipment, ST.DELIVERED, userId);
  notify(db, shipment.siteId, NOTIFICATION_TYPE.SHIPMENT_DELIVERED, shipmentId,
    `${shipment.code} was delivered — please confirm your stock`);
  return shipment;
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
  const isCoordinator = site && site.shippingCoordinatorId === user.id;
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
