// Deterministic mock-data generator. The same seed always produces the same
// database, so "Reset demo data" restores an identical world.

import {
  SHIPMENT_STATUS, SHIPMENT_STATUS_ORDER, PFI_STATUS, TASK_TYPE, BO_ROLE,
  CENTRAL, TRANSIT, siteLocation, LEDGER_REASON, NOTIFICATION_TYPE,
} from './domain/constants.js';

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
  { code: 'ONC-204',  name: 'Solid tumours, second line', sponsor: 'Helvara Bio',            phase: 'Phase II',  status: 'Recruiting' },
  { code: 'CARD-118', name: 'Chronic heart failure',      sponsor: 'Northline Pharma',       phase: 'Phase III', status: 'Recruiting' },
  { code: 'NEU-077',  name: 'First-in-human, early onset', sponsor: 'Auralis Therapeutics',  phase: 'Phase I',   status: 'Active' },
];

/** [trialIndex, name, week, [[itemCode, qty], ...]] */
const CADENCES = [
  [0, 'Start-up supply',     1,  [['KIT-010', 20], ['ANC-002', 20], ['ANC-001', 20]]],
  [0, 'First dosing wave',   3,  [['IMP-100', 30], ['IMP-200', 10], ['ANC-003', 15]]],
  [0, 'Mid-study top-up',    20, [['IMP-100', 24], ['KIT-020', 18], ['KIT-040', 12]]],
  [0, 'Biomarker sub-study', 34, [['KIT-050', 10], ['LAB-060', 4], ['ANC-005', 6]]],
  [1, 'Site activation pack', 1,  [['KIT-010', 25], ['ANC-002', 25]]],
  [1, 'Dosing wave 1',        4,  [['IMP-100', 40], ['ANC-004', 20], ['ANC-003', 20]]],
  [1, 'Quarterly resupply',   16, [['IMP-100', 36], ['KIT-020', 24], ['ANC-001', 24]]],
  [1, 'Close-out sampling',   40, [['KIT-030', 16], ['LAB-050', 8]]],
  [2, 'First-in-human start', 2,  [['KIT-010', 12], ['KIT-040', 12], ['ANC-005', 4]]],
  [2, 'Cohort 2 dosing',      8,  [['IMP-100', 18], ['IMP-200', 6], ['ANC-003', 10]]],
  [2, 'Cohort 3 dosing',      18, [['IMP-100', 18], ['KIT-040', 10], ['LAB-060', 3]]],
];

/** [code, name, trialIndex, country, city, street, postcode, active, requiresPfi, activatedDaysAgo] */
const SITES = [
  ['S001', 'Ospedale San Raffaele',        0, 'IT', 'Milan',     'Via Olgettina 60',        '20132', true,  true,  180],
  ['S002', 'Hospital Clínic',              0, 'ES', 'Barcelona', "Carrer de Villarroel 170", '08036', true,  true,  165],
  ['S003', 'Charité Campus Mitte',         0, 'DE', 'Berlin',    'Charitéplatz 1',          '10117', true,  false, 150],
  ['S004', 'Centre Léon Bérard',           0, 'FR', 'Lyon',      'Rue Laennec 28',          '69008', true,  true,  140],
  ['S005', 'Instytut Onkologii',           0, 'PL', 'Warsaw',    'Wawelska 15',             '02-034', false, false, 210],
  ['S006', 'Policlinico Gemelli',          1, 'IT', 'Rome',      'Largo Agostino Gemelli 8', '00168', true,  true,  120],
  ['S007', 'Hospital La Paz',              1, 'ES', 'Madrid',    'Paseo de la Castellana 261', '28046', true, true,  115],
  ['S008', 'Universitätsklinikum Eppendorf', 1, 'DE', 'Hamburg', 'Martinistraße 52',        '20246', true,  false, 105],
  ['S009', 'Hôpital Bichat',               1, 'FR', 'Paris',     'Rue Henri Huchard 46',    '75018', true,  true,  98],
  ['S010', 'AOU Federico II',              2, 'IT', 'Naples',    'Via Sergio Pansini 5',    '80131', true,  true,  76],
  ['S011', 'Klinikum rechts der Isar',     2, 'DE', 'Munich',    'Ismaninger Straße 22',    '81675', true,  false, 70],
  ['S012', 'Szpital Uniwersytecki',        2, 'PL', 'Kraków',    'Jakubowskiego 2',         '30-688', false, true,  190],
];

/** [name, email, boRoles] */
const BO_USERS = [
  ['Marta Lombardi',  'marta.lombardi@depot.example',  [BO_ROLE.SHIPPING_COORDINATOR]],
  ['Tobias Renner',   'tobias.renner@depot.example',   [BO_ROLE.SHIPPING_COORDINATOR]],
  ['Camille Aubert',  'camille.aubert@depot.example',  [BO_ROLE.PFI_APPROVER]],
  ['Piotr Zieliński', 'piotr.zielinski@depot.example', [BO_ROLE.PFI_APPROVER]],
  ['Núria Sabaté',    'nuria.sabate@depot.example',    [BO_ROLE.SHIPPING_COORDINATOR, BO_ROLE.PFI_APPROVER]],
];

/** [name, email, siteCodes] */
const FO_USERS = [
  ['Elena Rossi',       'elena.rossi@site.example',       ['S001', 'S010']],
  ['Marc Vidal',        'marc.vidal@site.example',        ['S002']],
  ['Anke Brandt',       'anke.brandt@site.example',       ['S003', 'S008']],
  ['Julien Perrot',     'julien.perrot@site.example',     ['S004', 'S009']],
  ['Agnieszka Nowak',   'agnieszka.nowak@site.example',   ['S005', 'S012']],
  ['Sara Bianchi',      'sara.bianchi@site.example',      ['S001', 'S006']],
  ['Diego Herrera',     'diego.herrera@site.example',     ['S007']],
  ['Lukas Weber',       'lukas.weber@site.example',       ['S003', 'S011']],
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
  const cadences = CADENCES.map(([ti, name, week, lines], i) => ({
    id: `cad-${i + 1}`,
    trialId: trials[ti].id,
    name,
    week,
    lines: lines.map(([code, qty]) => ({ itemId: itemByCode[code].id, suggestedQty: qty })),
  }));

  // --- users ---
  const boUsers = BO_USERS.map(([name, email, boRoles], i) => ({
    id: `bo-${i + 1}`, name, email, role: 'BO', boRoles, siteIds: [],
  }));
  const coordinators = boUsers.filter((u) => u.boRoles.includes(BO_ROLE.SHIPPING_COORDINATOR));

  // --- sites ---
  const sites = SITES.map(([code, name, ti, country, city, street, postalCode, active, requiresPfi, activatedDaysAgo], i) => {
    const trial = trials[ti];
    const trialCadences = cadences.filter((c) => c.trialId === trial.id);
    // A site's allocation target is everything its trial's cadences can ask for.
    const targets = new Map();
    for (const cad of trialCadences) {
      for (const line of cad.lines) {
        targets.set(line.itemId, (targets.get(line.itemId) || 0) + line.suggestedQty);
      }
    }
    return {
      id: `site-${i + 1}`,
      code, name, trialId: trial.id,
      address: { street, city, country, postalCode },
      active,
      requiresPfiApproval: requiresPfi,
      shippingCoordinatorId: coordinators[i % coordinators.length].id,
      activatedOn: daysAgo(activatedDaysAgo),
      allocations: [...targets].map(([itemId, targetQty]) => ({ itemId, targetQty })),
    };
  });
  const siteByCode = Object.fromEntries(sites.map((s) => [s.code, s]));

  const foUsers = FO_USERS.map(([name, email, codes], i) => ({
    id: `fo-${i + 1}`, name, email, role: 'FO', boRoles: [],
    siteIds: codes.map((c) => siteByCode[c].id),
  }));

  const users = [...foUsers, ...boUsers];
  const approvers = boUsers.filter((u) => u.boRoles.includes(BO_ROLE.PFI_APPROVER));

  // --- shipments ---
  const activeSites = sites.filter((s) => s.active);
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

  const pfiSites = activeSites.filter((s) => s.requiresPfiApproval);
  let siteCursor = 0;
  let pfiSiteCursor = 0;

  for (const status of plan) {
    // A shipment can only sit in AWAITING_PFI_APPROVAL if its site actually requires approval.
    const site = status === SHIPMENT_STATUS.AWAITING_PFI_APPROVAL
      ? pfiSites[pfiSiteCursor++ % pfiSites.length]
      : activeSites[siteCursor++ % activeSites.length];
    const trial = trials.find((t) => t.id === site.trialId);
    const cadence = pick(cadences.filter((c) => c.trialId === trial.id));
    const requester = pick(foUsers.filter((u) => u.siteIds.includes(site.id))) || foUsers[0];
    const coordinatorId = site.shippingCoordinatorId;
    const usesPfi = site.requiresPfiApproval;
    const approverId = usesPfi
      ? pick(approvers.filter((a) => a.id !== coordinatorId)).id
      : null;
    const [ageLo, ageHi] = AGE_BY_STATUS[status];
    const startDay = between(ageLo, ageHi);

    // Order quantities near, but not exactly at, the cadence suggestion.
    const lines = cadence.lines
      .map((l) => ({ itemId: l.itemId, qty: Math.max(1, Math.round(l.suggestedQty * (0.6 + rnd() * 0.5))) }));

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
    const reached = (s) => path.includes(s);
    let pfiStatus = PFI_STATUS.NOT_REQUIRED;
    let requestedApprovalAt = null;
    let decidedAt = null;
    if (usesPfi) {
      if (status === SHIPMENT_STATUS.NEW_REQUEST) pfiStatus = PFI_STATUS.DRAFT;
      else if (status === SHIPMENT_STATUS.AWAITING_PFI_APPROVAL) {
        pfiStatus = PFI_STATUS.PENDING_APPROVAL;
        requestedApprovalAt = timeline.at(-1).at;
      } else {
        pfiStatus = PFI_STATUS.APPROVED;
        requestedApprovalAt = timeline.find((t) => t.status === SHIPMENT_STATUS.AWAITING_PFI_APPROVAL)?.at || requestedAt;
        decidedAt = timeline.find((t) => t.status === SHIPMENT_STATUS.READY_FOR_PREPARATION)?.at || requestedAt;
      }
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
      cadenceId: cadence.id,
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
          from: TRANSIT, to: siteLocation(site.id),
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
  const demandByItem = {};
  for (const site of sites) {
    for (const a of site.allocations) {
      demandByItem[a.itemId] = (demandByItem[a.itemId] || 0) + a.targetQty;
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

  // --- settle each site on a plausible opening position ---
  // Deliveries alone would leave a site holding only the cadences it happened to
  // receive, so every allocated item is trued up to 35–85% of its target: the
  // shortfall becomes site-activation stock, the excess becomes consumption.
  const settlement = [];
  for (const site of sites) {
    const location = siteLocation(site.id);
    for (const a of site.allocations) {
      const delivered = ledger
        .filter((l) => l.to === location && l.itemId === a.itemId)
        .reduce((sum, l) => sum + l.qty, 0);
      const desired = site.active
        ? Math.round(a.targetQty * (0.35 + rnd() * 0.5))
        : 0;
      const delta = desired - delivered;
      if (!delta) continue;
      settlement.push({
        id: `led-settle-${site.id}-${a.itemId}`,
        at: daysAgo(delta > 0 ? 89 : between(1, 14)),
        itemId: a.itemId,
        from: delta < 0 ? location : null,
        to: delta > 0 ? location : null,
        qty: Math.abs(delta),
        shipmentId: null,
        reason: delta > 0 ? LEDGER_REASON.RESTOCK : LEDGER_REASON.ADJUSTMENT,
      });
    }
  }

  const stockLedger = [...opening, ...restocks, ...ledger, ...settlement]
    .sort((a, b) => a.at.localeCompare(b.at));

  const stock = replayBalances(stockLedger);
  const depositHistory = buildDepositHistory(stockLedger, items);

  notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    currentUserId: foUsers[0].id,
    currentSiteId: foUsers[0].siteIds[0],
    users, trials, cadences, items, sites,
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
