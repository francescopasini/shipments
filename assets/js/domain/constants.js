// Shared enums and their display metadata.
// Badge tones map onto the five-color palette in tokens.css.

export const SHIPMENT_STATUS = {
  NEW_REQUEST: 'NEW_REQUEST',
  AWAITING_PFI_APPROVAL: 'AWAITING_PFI_APPROVAL',
  READY_FOR_PREPARATION: 'READY_FOR_PREPARATION',
  IN_PREPARATION: 'IN_PREPARATION',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
};

/** Display order, also the natural progression of the workflow. */
export const SHIPMENT_STATUS_ORDER = [
  SHIPMENT_STATUS.NEW_REQUEST,
  SHIPMENT_STATUS.AWAITING_PFI_APPROVAL,
  SHIPMENT_STATUS.READY_FOR_PREPARATION,
  SHIPMENT_STATUS.IN_PREPARATION,
  SHIPMENT_STATUS.SHIPPED,
  SHIPMENT_STATUS.DELIVERED,
];

/** Blue for a new request, green once delivered, yellow for everything in between. */
export const SHIPMENT_STATUS_META = {
  NEW_REQUEST:            { label: 'New request',           tone: 'sky' },
  AWAITING_PFI_APPROVAL:  { label: 'Awaiting PFI approval', tone: 'butter' },
  READY_FOR_PREPARATION:  { label: 'Ready for preparation', tone: 'butter' },
  IN_PREPARATION:         { label: 'In preparation',        tone: 'butter' },
  SHIPPED:                { label: 'Shipped',               tone: 'butter' },
  DELIVERED:              { label: 'Delivered',             tone: 'sage' },
};

/**
 * Every shipment carries a proforma invoice — it is the customs document that
 * travels with the goods, so it has to be prepared whether or not a second pair
 * of eyes signs it off. `requiresPfiApproval` on the site decides only which
 * ending a draft reaches: ISSUED where the coordinator finalises it alone,
 * APPROVED where an approver has to countersign.
 */
export const PFI_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  ISSUED: 'ISSUED',
};

export const PFI_STATUS_META = {
  DRAFT:             { label: 'Draft',             tone: 'quiet' },
  PENDING_APPROVAL:  { label: 'Pending approval',  tone: 'butter' },
  APPROVED:          { label: 'Approved',          tone: 'sage' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'rose' },
  ISSUED:            { label: 'Issued',            tone: 'sage' },
};

export const TASK_TYPE = {
  PREPARE_SHIPMENT: 'PREPARE_SHIPMENT',
  APPROVE_PFI: 'APPROVE_PFI',
  CONTINUE_SHIPMENT: 'CONTINUE_SHIPMENT',
};

export const TASK_TYPE_META = {
  PREPARE_SHIPMENT:  { label: 'Prepare shipment & PFI', tone: 'sky',    icon: 'clipboard' },
  APPROVE_PFI:       { label: 'Approve PFI',            tone: 'butter', icon: 'seal' },
  CONTINUE_SHIPMENT: { label: 'Continue with shipment', tone: 'lilac',  icon: 'truck' },
};

export const BO_ROLE = {
  SHIPPING_COORDINATOR: 'SHIPPING_COORDINATOR',
  PFI_APPROVER: 'PFI_APPROVER',
};

export const BO_ROLE_META = {
  SHIPPING_COORDINATOR: { label: 'Shipping coordinator' },
  PFI_APPROVER:         { label: 'PFI approver' },
};

/**
 * Stock locations. A site holds stock per trial, so its bucket is keyed by both:
 * `site:<siteId>:<trialId>`. Nothing a site holds for one study can be dispensed
 * for another, and allocation targets are per site-trial too.
 */
export const CENTRAL = 'CENTRAL';
export const TRANSIT = 'TRANSIT';
export const siteLocation = (siteId, trialId) => `site:${siteId}:${trialId}`;
export const isSiteLocation = (loc) => loc.startsWith('site:');
export const parseSiteLocation = (loc) => {
  const [, siteId, trialId] = loc.split(':');
  return { siteId, trialId };
};

export const LEDGER_REASON = {
  REQUEST: 'REQUEST',
  DELIVERY: 'DELIVERY',
  ADJUSTMENT: 'ADJUSTMENT',
  RESTOCK: 'RESTOCK',
};

export const NOTIFICATION_TYPE = {
  SHIPMENT_REQUESTED: 'SHIPMENT_REQUESTED',
  PFI_APPROVED: 'PFI_APPROVED',
  SHIPMENT_READY: 'SHIPMENT_READY',
  SHIPMENT_IN_PREPARATION: 'SHIPMENT_IN_PREPARATION',
  SHIPMENT_SHIPPED: 'SHIPMENT_SHIPPED',
  SHIPMENT_DELIVERED: 'SHIPMENT_DELIVERED',
  STOCK_LOW: 'STOCK_LOW',
};

export const NOTIFICATION_META = {
  SHIPMENT_REQUESTED:      { icon: 'box',   tone: 'sky' },
  PFI_APPROVED:            { icon: 'seal',  tone: 'sage' },
  SHIPMENT_READY:          { icon: 'clipboard', tone: 'lilac' },
  SHIPMENT_IN_PREPARATION: { icon: 'warehouse', tone: 'lilac' },
  SHIPMENT_SHIPPED:        { icon: 'truck', tone: 'sage' },
  SHIPMENT_DELIVERED:      { icon: 'check', tone: 'sage' },
  STOCK_LOW:               { icon: 'chart', tone: 'rose' },
};

export const COUNTRIES = {
  IT: 'Italy',
  ES: 'Spain',
  DE: 'Germany',
  FR: 'France',
  PL: 'Poland',
};
