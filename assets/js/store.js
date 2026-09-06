// localStorage-backed store. The whole database lives under one versioned key;
// bumping STORE_VERSION invalidates old shapes and forces a re-seed.

import { buildSeed } from './seed.js';

export const STORE_KEY = 'shipmentsapp:v1';
const STORE_VERSION = 3;

let db = null;
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.version === STORE_VERSION ? parsed : null;
  } catch {
    // Corrupt or unavailable storage (private mode, quota): fall back to a fresh seed.
    return null;
  }
}

function write() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
    // Storage is unavailable — the app still works for this session, just not across reloads.
  }
}

/** Load the database from storage, seeding it on first run. */
export function init() {
  db = read() || { version: STORE_VERSION, ...buildSeed() };
  write();
  return db;
}

/** Wipe and regenerate the demo data. */
export function reset() {
  db = { version: STORE_VERSION, ...buildSeed() };
  write();
  emit();
  return db;
}

export function getDb() {
  if (!db) init();
  return db;
}

/**
 * Mutate the database. `fn` receives the live object and edits it in place;
 * anything it returns is passed back to the caller.
 */
export function update(fn) {
  const result = fn(getDb());
  write();
  emit();
  return result;
}

/** Mutate without notifying subscribers — for edits that must not re-render (e.g. mid-typing). */
export function updateQuiet(fn) {
  const result = fn(getDb());
  write();
  return result;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(db);
}

/** Notify subscribers without changing anything (used after session-only changes). */
export function touch() {
  emit();
}

// ---------- session ----------

export const currentUser = () => getDb().users.find((u) => u.id === getDb().currentUserId) || null;

export const currentSite = () => {
  const d = getDb();
  return d.sites.find((s) => s.id === d.currentSiteId) || null;
};

export function setCurrentUser(userId) {
  update((d) => {
    d.currentUserId = userId;
    const user = d.users.find((u) => u.id === userId);
    // Keep the active site consistent with what this persona can actually see.
    if (user && user.role === 'FO') {
      if (!user.siteIds.includes(d.currentSiteId)) d.currentSiteId = user.siteIds[0] || null;
    }
  });
}

export function setCurrentSite(siteId) {
  update((d) => { d.currentSiteId = siteId; });
}

// ---------- id helper ----------

let counter = 0;
export function nextId(prefix) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`;
}
