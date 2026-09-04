// Minimal hyperscript. No vdom — views rebuild their subtree and get swapped in.

/**
 * h('div', { class: 'card', onClick: fn }, child, [child, ...])
 * Props: `class`, `style` (object), `dataset` (object), `html` (raw innerHTML),
 * `on*` handlers, anything else becomes an attribute.
 */
export function h(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, value);
    }
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/** SVG from a markup string (used for the icon set and charts). */
export function svg(markup) {
  const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  const parsed = tpl.content.firstElementChild;
  return parsed && parsed.tagName.toLowerCase() === 'svg'
    ? document.importNode(parsed, true)
    : wrap;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function replace(node, ...children) {
  clear(node);
  return append(node, children);
}

/* ---------- formatting ---------- */

const DAY = 86400000;

export const fmtInt = (n) => new Intl.NumberFormat('en-GB').format(Math.round(n || 0));

export const fmtMoney = (n, currency = 'EUR') => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency, maximumFractionDigits: 0,
}).format(n || 0);

export const fmtDate = (iso) => (iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—');

export const fmtDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—');

/** "today" / "3 days ago" / a date once it is older than a fortnight. */
export function fmtAgo(iso) {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return fmtDate(iso);
}

export const initials = (name) => (name || '?')
  .split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
