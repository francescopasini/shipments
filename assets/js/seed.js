// Deterministic mock-data generator. The same seed always produces the same
// database, so "Reset demo data" restores an identical world.

import {
  SHIPMENT_STATUS, SHIPMENT_STATUS_ORDER, PFI_STATUS, TASK_TYPE, BO_ROLE,
  CENTRAL, TRANSIT, siteLocation, LEDGER_REASON, NOTIFICATION_TYPE,
} from './domain/constants.js';
import { lowStockThreshold, balance } from './domain/stock.js';

/* ---------- deterministic randomness ---------- */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- dates ---------- */

const DAY = 86400000;
/** Anchor "today" to midnight so snapshots line up on day boundaries. */
const TODAY = (() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d.getTime(); })();
const daysAgo = (n) => new Date(TODAY - n * DAY).toISOString();
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/* ---------- static catalogues ---------- */

const ITEMS = [
  { code: 'IMP-100', name: 'Investigational drug 50 mg', unit: 'vial', category: 'IMP', coldChain: true,  unitValue: 940, hsCode: '3004.90' },
  { code: 'IMP-200', name: 'Matching placebo 50 mg',     unit: 'vial', category: 'IMP', coldChain: true,  unitValue: 120, hsCode: '3004.90' },
  { code: 'KIT-010', name: 'Screening kit',              unit: 'kit',  category: 'KIT', coldChain: false, unitValue: 78,  hsCode: '9027.80' },
  { code: 'KIT-020', name: 'Blood sampling kit',         unit: 'kit',  category: 'KIT', coldChain: false, unitValue: 44,  hsCode: '9027.80' },
  { code: 'KIT-030', name: 'Urine sampling kit',         unit: 'kit',  category: 'KIT', coldChain: false, unitValue: 31,  hsCode: '9027.80' },
  { code: 'KIT-040', name: 'PK sampling kit',            unit: 'kit',  category: 'KIT', coldChain: true,  unitValue: 96,  hsCode: '9027.80' },
  { code: 'KIT-050', name: 'Biomarker kit',              unit: 'kit',  category: 'KIT', coldChain: true,  unitValue: 152, hsCode: '9027.80' },
  { code: 'ANC-001', name: 'Patient dosing diary',       unit: 'pack', category: 'ANCILLARY', coldChain: false, unitValue: 9,  hsCode: '4820.10' },
  { code: 'ANC-002', name: 'Patient ID cards',           unit: 'pack', category: 'ANCILLARY', coldChain: false, unitValue: 6,  hsCode: '4911.99' },
  { code: 'ANC-003', name: 'Syringe set 10 ml',          unit: 'box',  category: 'ANCILLARY', coldChain: false, unitValue: 23, hsCode: '9018.31' },
  { code: 'ANC-004', name: 'Infusion line',              unit: 'box',  category: 'ANCILLARY', coldChain: false, unitValue: 37, hsCode: '9018.39' },
  { code: 'ANC-005', name: 'Temperature logger',         unit: 'unit', category: 'ANCILLARY', coldChain: false, unitValue: 64, hsCode: '9025.19' },
  { code: 'LAB-050', name: 'Centrifuge tube rack',       unit: 'unit', category: 'LAB', coldChain: false, unitValue: 18, hsCode: '3926.90' },
  { code: 'LAB-060', name: 'Dry ice shipper',            unit: 'unit', category: 'LAB', coldChain: true,  unitValue: 210, hsCode: '3923.10' },
];

const CATEGORY_ICON = { IMP: 'vial', KIT: 'kit', ANCILLARY: 'box', LAB: 'flask' };
const CATEGORY_TONE = { IMP: 'rose', KIT: 'sky', ANCILLARY: 'butter', LAB: 'sage' };

const TRIALS = [
  { code: 'ONC-204',  name: 'Solid tumours, second line', sponsor: 'Helvara Bio',            phase: 'Phase II',  status: 'Active' },
  { code: 'CARD-118', name: 'Chronic heart failure',      sponsor: 'Northline Pharma',       phase: 'Phase III', status: 'Active' },
  { code: 'NEU-077',  name: 'First-in-human, early onset', sponsor: 'Auralis Therapeutics',  phase: 'Phase I',   status: 'Active' },
];

/**
 * A cadence is the set of items that travel together, and the study week it is
 * expected in. It carries no quantities: a site orders N of the cadence and gets
 * N of every item in it.
 *
 * [trialIndex, name, week, [itemCode, ...]]
 */
const CADENCES = [
  [0, 'Start-up supply',      1,  ['KIT-010', 'ANC-002', 'ANC-001']],
  [0, 'First dosing wave',    3,  ['IMP-100', 'IMP-200', 'ANC-003']],
  [0, 'Mid-study top-up',     20, ['IMP-100', 'KIT-020', 'KIT-040']],
  [0, 'Biomarker sub-study',  34, ['KIT-050', 'LAB-060', 'ANC-005']],
  [1, 'Site activation pack', 1,  ['KIT-010', 'ANC-002']],
  [1, 'Dosing wave 1',        4,  ['IMP-100', 'ANC-004', 'ANC-003']],
  [1, 'Quarterly resupply',   16, ['IMP-100', 'KIT-020', 'ANC-001']],
  [1, 'Close-out sampling',   40, ['KIT-030', 'LAB-050']],
  [2, 'First-in-human start', 2,  ['KIT-010', 'KIT-040', 'ANC-005']],
  [2, 'Cohort 2 dosing',      8,  ['IMP-100', 'IMP-200', 'ANC-003']],
  [2, 'Cohort 3 dosing',      18, ['IMP-100', 'KIT-040', 'LAB-060']],
];

/** [code, name, country, city, street, postcode, active, requiresPfi] */
const SITES = [
  ['S001', 'Ospedale San Raffaele',        'IT', 'Milan',     'Via Olgettina 60',        '20132', true,  true],
  ['S002', 'Hospital Clínic',              'ES', 'Barcelona', "Carrer de Villarroel 170", '08036', true,  true],
  ['S003', 'Charité Campus Mitte',         'DE', 'Berlin',    'Charitéplatz 1',          '10117', true,  false],
  ['S004', 'Centre Léon Bérard',           'FR', 'Lyon',      'Rue Laennec 28',          '69008', true,  true],
  ['S005', 'Instytut Onkologii',           'PL', 'Warsaw',    'Wawelska 15',             '02-034', false, false],
  ['S006', 'Policlinico Gemelli',          'IT', 'Rome',      'Largo Agostino Gemelli 8', '00168', true,  true],
  ['S007', 'Hospital La Paz',              'ES', 'Madrid',    'Paseo de la Castellana 261', '28046', true, true],
  ['S008', 'Universitätsklinikum Eppendorf', 'DE', 'Hamburg', 'Martinistraße 52',        '20246', true,  false],
  ['S009', 'Hôpital Bichat',               'FR', 'Paris',     'Rue Henri Huchard 46',    '75018', true,  true],
  ['S010', 'AOU Federico II',              'IT', 'Naples',    'Via Sergio Pansini 5',    '80131', true,  true],
  ['S011', 'Klinikum rechts der Isar',     'DE', 'Munich',    'Ismaninger Straße 22',    '81675', true,  false],
  ['S012', 'Szpital Uniwersytecki',        'PL', 'Kraków',    'Jakubowskiego 2',         '30-688', false, true],
];

/**
 * The site ↔ trial join. Sites run several studies at once — the big academic
 * centres carry two or three — and each pairing has its own activation date and
 * deposit coordinator.
 *
 * [siteCode, trialIndex, activatedDaysAgo, coordinatorIndex]
 * `coordinatorIndex` selects from the shipping coordinators, in order.
 */
const SITE_TRIALS = [
  ['S001', 0, 180, 0],
  ['S001', 2, 64,  1],
  ['S002', 0, 165, 1],
  ['S003', 0, 150, 1],
  ['S003', 1, 96,  0],
  ['S004', 0, 140, 0],
  ['S005', 0, 210, 1],
  ['S006', 1, 120, 0],
  ['S006', 0, 88,  1],
  ['S007', 1, 115, 0],
  ['S008', 1, 105, 1],
  ['S009', 1, 98,  1],
  ['S009', 2, 52,  0],
  ['S010', 2, 76,  1],
  ['S011', 2, 70,  0],
  ['S011', 1, 44,  0],
  ['S012', 2, 190, 1],
];

/** [name, email, boRoles] */
/* One of each shape the back office can take: a plain shipping coordinator, a
   plain approver, and somebody who is both — enough to show that an approver may
   never countersign an invoice they raised themselves. */
const BO_USERS = [
  ['Marta Lombardi',  'marta.lombardi@depot.example',  [BO_ROLE.SHIPPING_COORDINATOR]],
  ['Camille Aubert',  'camille.aubert@depot.example',  [BO_ROLE.PFI_APPROVER]],
  ['Núria Sabaté',    'nuria.sabate@depot.example',    [BO_ROLE.SHIPPING_COORDINATOR, BO_ROLE.PFI_APPROVER]],
];

/** [name, email, siteCodes] */
/* Three site coordinators between them cover every site, so no site is left
   without somebody who can raise a request for it. */
const FO_USERS = [
  ['Elena Rossi',  'elena.rossi@site.example',  ['S001', 'S002', 'S010', 'S012']],
  ['Marc Vidal',   'marc.vidal@site.example',   ['S003', 'S004', 'S007', 'S011']],
  ['Anke Brandt',  'anke.brandt@site.example',  ['S005', 'S006', 'S008', 'S009']],
];

/** How many shipments to place in each status. */
const STATUS_MIX = [
  [SHIPMENT_STATUS.DELIVERED, 12],
  [SHIPMENT_STATUS.SHIPPED, 4],
  [SHIPMENT_STATUS.IN_PREPARATION, 3],
  [SHIPMENT_STATUS.READY_FOR_PREPARATION, 3],
  [SHIPMENT_STATUS.AWAITING_PFI_APPROVAL, 3],
  [SHIPMENT_STATUS.NEW_REQUEST, 3],
];

/** How long ago (min, max days) a shipment in each status was requested. */
const AGE_BY_STATUS = {
  DELIVERED: [24, 84],
  SHIPPED: [9, 17],
  IN_PREPARATION: [5, 10],
  READY_FOR_PREPARATION: [3, 7],
  AWAITING_PFI_APPROVAL: [2, 6],
  NEW_REQUEST: [0, 4],
};

/* ---------- builder ---------- */

export function buildSeed() {
  const rnd = mulberry32(20260904);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

  // --- items ---
  const items = ITEMS.map((it, i) => ({
    id: `item-${i + 1}`,
    ...it,
    icon: CATEGORY_ICON[it.category],
    tone: CATEGORY_TONE[it.category],
  }));
  const itemByCode = Object.fromEntries(items.map((it) => [it.code, it]));

  // --- trials & cadences ---
  const trials = TRIALS.map((t, i) => ({ id: `trial-${i + 1}`, ...t }));
  const cadences = CADENCES.map(([ti, name, week, codes], i) => ({
    id: `cad-${i + 1}`,
    trialId: trials[ti].id,
    name,
    week,
    itemIds: codes.map((code) => itemByCode[code].id),
  }));

  // --- users ---
  const boUsers = BO_USERS.map(([name, email, boRoles], i) => ({
    id: `bo-${i + 1}`, name, email, role: 'BO', boRoles, siteIds: [],
  }));
  const coordinators = boUsers.filter((u) => u.boRoles.includes(BO_ROLE.SHIPPING_COORDINATOR));

  // --- sites ---
  const sites = SITES.map(([code, name, country, city, street, postalCode, active, requiresPfi], i) => ({
    id: `site-${i + 1}`,
    code, name,
    address: { street, city, country, postalCode },
    active,
    // Whether a proforma invoice is needed is customs-driven, so it belongs to
    // the site rather than to any one study running there.
    requiresPfiApproval: requiresPfi,
  }));
  const siteByCode = Object.fromEntries(sites.map((s) => [s.code, s]));
  const siteById = Object.fromEntries(sites.map((s) => [s.id, s]));

  // --- site ↔ trial pairings ---
  // One ceiling per pairing: how many of any single cadence the site may take
  // over the whole trial. Set wide enough that the recurring cadences are not
  // blocked after a couple of orders.
  const siteTrials = SITE_TRIALS.map(([siteCode, ti, activatedDaysAgo, ci], i) => {
    const site = siteByCode[siteCode];
    const trial = trials[ti];
    return {
      id: `st-${i + 1}`,
      siteId: site.id,
      trialId: trial.id,
      activatedOn: daysAgo(activatedDaysAgo),
      maxCadenceUnits: between(60, 120),
      shippingCoordinatorId: coordinators[ci % coordinators.length].id,
    };
  });

  const foUsers = FO_USERS.map(([name, email, codes], i) => ({
    id: `fo-${i + 1}`, name, email, role: 'FO', boRoles: [],
    siteIds: codes.map((c) => siteByCode[c].id),
  }));

  const users = [...foUsers, ...boUsers];
  const approvers = boUsers.filter((u) => u.boRoles.includes(BO_ROLE.PFI_APPROVER));

  // --- shipments ---
  const isActive = (st) => siteById[st.siteId].active;
  const activePairs = siteTrials.filter(isActive);
  const shipments = [];
  const pfis = [];
  const tasks = [];
  const notifications = [];
  const ledger = [];

  let shipmentNo = 1041;
  let pfiNo = 1;

  const plan = [];
  for (const [status, count] of STATUS_MIX) {
    for (let i = 0; i < count; i += 1) plan.push(status);
  }

  const pfiPairs = activePairs.filter((st) => siteById[st.siteId].requiresPfiApproval);
  let pairCursor = 0;
  let pfiPairCursor = 0;

  for (const status of plan) {
    // A shipment can only sit in AWAITING_PFI_APPROVAL if its site actually requires approval.
    const siteTrial = status === SHIPMENT_STATUS.AWAITING_PFI_APPROVAL
      ? pfiPairs[pfiPairCursor++ % pfiPairs.length]
      : activePairs[pairCursor++ % activePairs.length];
    const site = siteById[siteTrial.siteId];
    const trial = trials.find((t) => t.id === siteTrial.trialId);
    const cadence = pick(cadences.filter((c) => c.trialId === trial.id));
    const requester = pick(foUsers.filter((u) => u.siteIds.includes(site.id))) || foUsers[0];
    const coordinatorId = siteTrial.shippingCoordinatorId;
    const usesPfi = site.requiresPfiApproval;
    const approverId = usesPfi
      ? pick(approvers.filter((a) => a.id !== coordinatorId)).id
      : null;
    const [ageLo, ageHi] = AGE_BY_STATUS[status];
    const startDay = between(ageLo, ageHi);

    // A site orders a number of each cadence it needs, and gets that many of
    // every item in them. Most requests are a single cadence; now and then a
    // site asks for two at once and they travel together, an item carried by
    // both arriving once for the sum.
    const alsoPick = rnd() > 0.75
      ? pick(cadences.filter((c) => c.trialId === trial.id && c.id !== cadence.id))
      : null;
    const picks = [{ cadenceId: cadence.id, units: between(2, 6) * 5 }];
    if (alsoPick) picks.push({ cadenceId: alsoPick.id, units: between(1, 3) * 5 });

    const totals = new Map();
    for (const p of picks) {
      const c = cadences.find((x) => x.id === p.cadenceId);
      for (const itemId of c.itemIds) totals.set(itemId, (totals.get(itemId) || 0) + p.units);
    }
    const lines = [...totals].map(([itemId, qty]) => ({ itemId, qty }));

    const id = `ship-${shipments.length + 1}`;
    const code = `SHP-${shipmentNo}`;
    shipmentNo += 1;

    // Walk the status path, spacing transitions 1–3 days apart as we move toward today.
    const path = statusPath(usesPfi, status);
    let cursor = startDay;
    const timeline = path.map((step, idx) => {
      if (idx > 0) cursor = Math.max(0, cursor - between(1, 3));
      return {
        status: step,
        at: daysAgo(cursor),
        byUserId: actorFor(step, { requesterId: requester.id, coordinatorId, approverId, usesPfi }),
        note: null,
      };
    });
    const requestedAt = timeline[0].at;
    const deliveredEntry = timeline.find((t) => t.status === SHIPMENT_STATUS.DELIVERED);

    // --- PFI ---
    // Every shipment has one: it is the customs paperwork, not an approval step.
    // A shipment still sitting at "new request" has a draft on the coordinator's
    // desk; anything further along has an invoice that was either issued by the
    // coordinator or approved by somebody else.
    const reached = (s) => path.includes(s);
    const readyAt = timeline.find((t) => t.status === SHIPMENT_STATUS.READY_FOR_PREPARATION)?.at;
    let pfiStatus = PFI_STATUS.DRAFT;
    let requestedApprovalAt = null;
    let decidedAt = null;
    if (status === SHIPMENT_STATUS.NEW_REQUEST) {
      pfiStatus = PFI_STATUS.DRAFT;
    } else if (usesPfi) {
      if (status === SHIPMENT_STATUS.AWAITING_PFI_APPROVAL) {
        pfiStatus = PFI_STATUS.PENDING_APPROVAL;
        requestedApprovalAt = timeline.at(-1).at;
      } else {
        pfiStatus = PFI_STATUS.APPROVED;
        requestedApprovalAt = timeline.find((t) => t.status === SHIPMENT_STATUS.AWAITING_PFI_APPROVAL)?.at || requestedAt;
        decidedAt = readyAt || requestedAt;
      }
    } else {
      pfiStatus = PFI_STATUS.ISSUED;
      decidedAt = readyAt || requestedAt;
    }
    const pfiId = `pfi-${pfis.length + 1}`;
    pfis.push({
      id: pfiId,
      shipmentId: id,
      number: `PFI-2026-${String(pfiNo).padStart(4, '0')}`,
      status: pfiStatus,
      preparedById: coordinatorId,
      approverId,
      requestedAt: requestedApprovalAt,
      decidedAt,
      comment: null,
      currency: 'EUR',
      lines: lines.map((l) => {
        const item = items.find((it) => it.id === l.itemId);
        return { itemId: l.itemId, qty: l.qty, unitValue: item.unitValue, hsCode: item.hsCode };
      }),
    });
    pfiNo += 1;

    shipments.push({
      id, code,
      siteId: site.id,
      trialId: trial.id,
      cadences: picks,
      origin: 'MANUAL',
      scheduledFrom: null,
      status,
      lines,
      requestedById: requester.id,
      createdAt: requestedAt,
      updatedAt: timeline.at(-1).at,
      pfiId,
      timeline,
    });

    // --- stock moves ---
    for (const line of lines) {
      ledger.push({
        id: `led-${ledger.length + 1}`,
        at: requestedAt,
        itemId: line.itemId,
        from: CENTRAL, to: TRANSIT,
        qty: line.qty,
        shipmentId: id,
        reason: LEDGER_REASON.REQUEST,
      });
      if (deliveredEntry) {
        ledger.push({
          id: `led-${ledger.length + 1}`,
          at: deliveredEntry.at,
          itemId: line.itemId,
          from: TRANSIT, to: siteLocation(site.id, trial.id),
          qty: line.qty,
          shipmentId: id,
          reason: LEDGER_REASON.DELIVERY,
        });
      }
    }

    // --- tasks (only where a human genuinely owes an action) ---
    if (status === SHIPMENT_STATUS.NEW_REQUEST) {
      tasks.push(mkTask(tasks, TASK_TYPE.PREPARE_SHIPMENT, coordinatorId, id, pfiId, requestedAt, 'OPEN'));
    } else if (status === SHIPMENT_STATUS.AWAITING_PFI_APPROVAL) {
      tasks.push(mkTask(tasks, TASK_TYPE.PREPARE_SHIPMENT, coordinatorId, id, pfiId, requestedAt, 'DONE'));
      tasks.push(mkTask(tasks, TASK_TYPE.APPROVE_PFI, approverId, id, pfiId, timeline.at(-1).at, 'OPEN'));
    } else if (status === SHIPMENT_STATUS.READY_FOR_PREPARATION) {
      tasks.push(mkTask(tasks, TASK_TYPE.PREPARE_SHIPMENT, coordinatorId, id, pfiId, requestedAt, 'DONE'));
      if (usesPfi) tasks.push(mkTask(tasks, TASK_TYPE.APPROVE_PFI, approverId, id, pfiId, requestedApprovalAt, 'DONE'));
      tasks.push(mkTask(tasks, TASK_TYPE.CONTINUE_SHIPMENT, coordinatorId, id, pfiId, timeline.at(-1).at, 'OPEN'));
    } else {
      tasks.push(mkTask(tasks, TASK_TYPE.PREPARE_SHIPMENT, coordinatorId, id, pfiId, requestedAt, 'DONE'));
      if (usesPfi) tasks.push(mkTask(tasks, TASK_TYPE.APPROVE_PFI, approverId, id, pfiId, requestedApprovalAt, 'DONE'));
    }

    // --- notifications for the site ---
    notifications.push(mkNote(notifications, site.id, NOTIFICATION_TYPE.SHIPMENT_REQUESTED, id,
      `${code} requested for ${cadence.name} (week ${cadence.week})`, requestedAt, true));
    if (reached(SHIPMENT_STATUS.SHIPPED)) {
      notifications.push(mkNote(notifications, site.id, NOTIFICATION_TYPE.SHIPMENT_SHIPPED, id,
        `${code} has left the central deposit`, timeline.find((t) => t.status === SHIPMENT_STATUS.SHIPPED).at, true));
    }
    if (deliveredEntry) {
      notifications.push(mkNote(notifications, site.id, NOTIFICATION_TYPE.SHIPMENT_DELIVERED, id,
        `${code} was delivered — please confirm your stock`, deliveredEntry.at, rnd() > 0.45));
    }
  }

  // --- opening central stock, sized against total demand ---
  // With no per-item targets to sum, demand is read off cadence membership: an
  // item is wanted once per cadence that carries it, at a typical order size.
  const TYPICAL_ORDER = 20;
  const cadencesOf = (trialId) => cadences.filter((c) => c.trialId === trialId);
  const pairingItems = (st) => [...new Set(cadencesOf(st.trialId).flatMap((c) => c.itemIds))];

  const demandByItem = {};
  for (const st of siteTrials) {
    for (const cadence of cadencesOf(st.trialId)) {
      for (const itemId of cadence.itemIds) {
        demandByItem[itemId] = (demandByItem[itemId] || 0) + TYPICAL_ORDER;
      }
    }
  }
  const opening = [];
  for (const item of items) {
    const qty = Math.round((demandByItem[item.id] || 40) * 2.6);
    opening.push({
      id: `led-open-${item.id}`,
      at: daysAgo(90),
      itemId: item.id,
      from: null, to: CENTRAL,
      qty,
      shipmentId: null,
      reason: LEDGER_REASON.RESTOCK,
    });
  }

  // --- periodic deposit restocks, so the BO chart shows a sawtooth ---
  const restocks = [];
  for (const day of [72, 54, 37, 19, 6]) {
    for (const item of items) {
      if (rnd() > 0.65) continue;
      restocks.push({
        id: `led-rs-${day}-${item.id}`,
        at: daysAgo(day),
        itemId: item.id,
        from: null, to: CENTRAL,
        qty: Math.round((demandByItem[item.id] || 40) * (0.15 + rnd() * 0.25)),
        shipmentId: null,
        reason: LEDGER_REASON.RESTOCK,
      });
    }
  }

  // --- settle each site-trial on a plausible opening position ---
  // Deliveries alone would leave a site holding only the cadences it happened to
  // receive, so every item its trial's cadences cover is trued up to a plausible
  // holding: the shortfall becomes site-activation stock, the excess consumption.
  const settlement = [];
  for (const st of siteTrials) {
    const location = siteLocation(st.siteId, st.trialId);
    for (const itemId of pairingItems(st)) {
      const delivered = ledger
        .filter((l) => l.to === location && l.itemId === itemId)
        .reduce((sum, l) => sum + l.qty, 0);
      const desired = siteById[st.siteId].active ? between(4, 34) : 0;
      const delta = desired - delivered;
      if (!delta) continue;
      settlement.push({
        id: `led-settle-${st.id}-${itemId}`,
        at: daysAgo(delta > 0 ? 89 : between(1, 14)),
        itemId,
        from: delta < 0 ? location : null,
        to: delta > 0 ? location : null,
        qty: Math.abs(delta),
        shipmentId: null,
        reason: delta > 0 ? LEDGER_REASON.RESTOCK : LEDGER_REASON.ADJUSTMENT,
      });
    }
  }

  let stockLedger = [...opening, ...restocks, ...ledger, ...settlement]
    .sort((a, b) => a.at.localeCompare(b.at));
  let stock = replayBalances(stockLedger);

  // --- run a few lines thin, so the low-stock check has something to catch ---
  // Opening stock above is sized generously against demand, so nothing would
  // trip the threshold by chance. A handful of items are deliberately trued
  // down after the fact — one per category — so a reset shows the low-stock
  // views doing something rather than sitting permanently empty.
  const THIN_ITEMS = ['IMP-200', 'KIT-030', 'ANC-004'];
  const dbSoFar = { items, cadences, siteTrials, stock };
  const shortages = THIN_ITEMS.map((code) => {
    const item = itemByCode[code];
    const threshold = lowStockThreshold(dbSoFar, item.id);
    const held = balance(dbSoFar, CENTRAL, item.id);
    if (threshold <= 0 || held < threshold) return null;
    const runDownTo = Math.floor(threshold * 0.6);
    return {
      id: `led-short-${item.id}`,
      at: daysAgo(2),
      itemId: item.id,
      from: CENTRAL, to: null,
      qty: held - runDownTo,
      shipmentId: null,
      reason: LEDGER_REASON.ADJUSTMENT,
    };
  }).filter(Boolean);

  if (shortages.length) {
    stockLedger = [...stockLedger, ...shortages].sort((a, b) => a.at.localeCompare(b.at));
    stock = replayBalances(stockLedger);
  }

  const depositHistory = buildDepositHistory(stockLedger, items);

  notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    currentUserId: foUsers[0].id,
    currentSiteId: foUsers[0].siteIds[0],
    users, trials, cadences, items, sites, siteTrials,
    // Follow-on cadences the site has turned down, so they are not re-created.
    declinedSchedules: [],
    shipments, pfis, tasks, notifications,
    stock, stockLedger, depositHistory,
  };
}

/* ---------- helpers ---------- */

/** The statuses a shipment passes through on its way to `target`. */
export function statusPath(usesPfi, target) {
  const full = SHIPMENT_STATUS_ORDER
    .filter((s) => usesPfi || s !== SHIPMENT_STATUS.AWAITING_PFI_APPROVAL);
  const end = full.indexOf(target);
  return end < 0 ? full.slice(0, 1) : full.slice(0, end + 1);
}

/** Who performs each transition. */
function actorFor(step, { requesterId, coordinatorId, approverId, usesPfi }) {
  if (step === SHIPMENT_STATUS.NEW_REQUEST) return requesterId;
  // Reaching "ready for preparation" is the approver's act when a PFI was involved.
  if (step === SHIPMENT_STATUS.READY_FOR_PREPARATION && usesPfi) return approverId;
  return coordinatorId;
}

function mkTask(tasks, type, assigneeId, shipmentId, pfiId, at, status) {
  return {
    id: `task-${tasks.length + 1}`,
    type, assigneeId, shipmentId, pfiId,
    status,
    createdAt: at,
    doneAt: status === 'DONE' ? at : null,
  };
}

function mkNote(notifications, siteId, type, shipmentId, message, createdAt, read) {
  return {
    id: `note-${notifications.length + 1}`,
    siteId, type, shipmentId, message, createdAt, read,
  };
}

/** Fold the ledger into `{ [location]: { [itemId]: qty } }`. */
export function replayBalances(ledger) {
  const stock = {};
  const add = (loc, itemId, delta) => {
    if (!loc) return;
    if (!stock[loc]) stock[loc] = {};
    stock[loc][itemId] = Math.max(0, (stock[loc][itemId] || 0) + delta);
  };
  for (const move of ledger) {
    add(move.from, move.itemId, -move.qty);
    add(move.to, move.itemId, move.qty);
  }
  if (!stock[CENTRAL]) stock[CENTRAL] = {};
  if (!stock[TRANSIT]) stock[TRANSIT] = {};
  return stock;
}

/** Daily totals of units held in the central deposit over the last 90 days. */
function buildDepositHistory(ledger, items) {
  const byDay = new Map();
  for (const move of ledger) {
    const delta = (move.to === CENTRAL ? move.qty : 0) - (move.from === CENTRAL ? move.qty : 0);
    if (!delta) continue;
    const key = move.at.slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + delta);
  }
  const series = [];
  let total = 0;
  for (let d = 90; d >= 0; d -= 1) {
    const key = dayKey(TODAY - d * DAY);
    total += byDay.get(key) || 0;
    series.push({ date: key, units: total });
  }
  void items;
  return series;
}
