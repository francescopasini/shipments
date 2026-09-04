// Hash router. Hash routing keeps the app working unchanged at file-served
// localhost and under the /shipments/ subpath on GitHub Pages — no rewrites,
// no base-path config.

const routes = [];
let onChange = () => {};

/**
 * define('/bo/shipments/:id', { side, render }) — `:name` segments become params.
 */
export function define(pattern, handler) {
  const parts = pattern.split('/').filter(Boolean);
  routes.push({ parts, handler, pattern });
}

function match(path) {
  const segments = path.split('/').filter(Boolean);
  for (const route of routes) {
    if (route.parts.length !== segments.length) continue;
    const params = {};
    let ok = true;
    for (const [i, part] of route.parts.entries()) {
      if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(segments[i]);
      else if (part !== segments[i]) { ok = false; break; }
    }
    if (ok) return { handler: route.handler, params };
  }
  return null;
}

export const currentPath = () => window.location.hash.replace(/^#/, '') || '/';

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (window.location.hash === target) { onChange(); return; }
  if (replace) window.history.replaceState(null, '', target);
  else window.location.hash = path;
  if (replace) onChange();
}

export function start(handler) {
  onChange = handler;
  window.addEventListener('hashchange', handler);
  handler();
}

/** Resolve the current hash; returns null when nothing matches. */
export function resolve() {
  return match(currentPath());
}

/** A click handler that routes internally instead of reloading. */
export const go = (path) => (event) => {
  if (event) event.preventDefault();
  navigate(path);
};
