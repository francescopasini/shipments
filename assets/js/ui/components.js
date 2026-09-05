// Shared clay components: cards, badges, buttons, fields, dialogs, toasts.

import { h, append, initials } from './el.js';
import { icon, iconImg } from './icons.js';
import { SHIPMENT_STATUS_META, PFI_STATUS_META } from '../domain/constants.js';

/* ---------- surfaces ---------- */

export function card(props = {}, ...children) {
  const { variant = '', span = '', ...rest } = props;
  const cls = ['card', variant, span, rest.class].filter(Boolean).join(' ');
  return h('div', { ...rest, class: cls }, ...children);
}

/** A card that behaves as a button — used for every list row. */
export function actionCard(props = {}, ...children) {
  const { span = '', variant = '', onClick, ...rest } = props;
  const cls = ['card', 'card--action', variant, span, rest.class].filter(Boolean).join(' ');
  return h('button', { ...rest, type: 'button', class: cls, onClick }, ...children);
}

/**
 * A display icon. The 3D artwork *is* the tile — it fills the space the cream
 * box used to occupy, with no container behind it. One version of every icon,
 * no colour variants.
 */
export function tile(name, size = 'md') {
  const px = size === 'sm' ? 56 : 76;
  const img = iconImg(name, px);
  if (img) {
    img.className = `tile${size === 'sm' ? ' tile--sm' : ''}`;
    return img;
  }
  // No artwork for this name — fall back to the inline glyph at the same size.
  return h('span', { class: `tile tile--glyph${size === 'sm' ? ' tile--sm' : ''}` },
    icon(name, px - 12));
}

export function avatar(name, size = '') {
  return h('span', { class: `avatar${size === 'lg' ? ' avatar--lg' : ''}`, title: name },
    initials(name));
}

/* ---------- badges (statuses only) ---------- */

export function badge(label, tone = 'quiet') {
  return h('span', { class: `badge badge--${tone}` },
    h('span', { class: 'badge__dot' }), label);
}

export const shipmentBadge = (status) => {
  const meta = SHIPMENT_STATUS_META[status] || { label: status, tone: 'quiet' };
  return badge(meta.label, meta.tone);
};

export const pfiBadge = (status) => {
  const meta = PFI_STATUS_META[status] || { label: status, tone: 'quiet' };
  return badge(meta.label, meta.tone);
};

/* ---------- buttons ---------- */

export function btn(label, props = {}) {
  const { variant = '', size = '', iconName, block, ...rest } = props;
  const cls = [
    'btn',
    variant && `btn--${variant}`,
    size === 'sm' && 'btn--sm',
    block && 'btn--block',
    rest.class,
  ].filter(Boolean).join(' ');
  return h('button', { type: 'button', ...rest, class: cls },
    iconName ? icon(iconName, size === 'sm' ? 15 : 17) : null,
    label);
}

export function iconBtn(name, props = {}) {
  const { variant = '', ...rest } = props;
  const cls = ['btn', 'btn--icon', variant && `btn--${variant}`, rest.class].filter(Boolean).join(' ');
  return h('button', { type: 'button', ...rest, class: cls }, icon(name, 18));
}

/* ---------- fields ---------- */

export function field(label, control, hint, hintTone) {
  return h('div', { class: 'field' },
    label ? h('span', { class: 'field__label' }, label) : null,
    control,
    hint ? h('span', { class: `field__hint${hintTone === 'warn' ? ' field__hint--warn' : ''}` }, hint) : null);
}

export function input(props = {}) {
  const { variant = '', ...rest } = props;
  return h('input', { ...rest, class: ['input', variant, rest.class].filter(Boolean).join(' ') });
}

export function numberInput(props = {}) {
  return input({ type: 'number', inputmode: 'numeric', variant: 'input--num', ...props });
}

export function textarea(props = {}) {
  return h('textarea', { ...props, class: ['textarea', props.class].filter(Boolean).join(' ') });
}

/** options: [{ value, label }] */
export function select(options, props = {}) {
  const { value, ...rest } = props;
  const node = h('select', { ...rest, class: ['select', rest.class].filter(Boolean).join(' ') },
    ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  if (value !== undefined && value !== null) node.value = value;
  return node;
}

export function toggle(label, checked, onChange) {
  return h('label', { class: 'switch' },
    h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked) }),
    h('span', { class: 'switch__track' }, h('span', { class: 'switch__knob' })),
    h('span', {}, label));
}

/* ---------- small blocks ---------- */

/** pairs: [[key, valueNodeOrText], ...] */
export function kv(pairs) {
  const node = h('div', { class: 'kv' });
  for (const [k, v] of pairs) {
    if (v === null || v === undefined) continue;
    append(node, [h('span', { class: 'kv__k' }, k), h('span', { class: 'kv__v' }, v)]);
  }
  return node;
}

export function meter(ratio) {
  const pct = Math.max(0, Math.min(1, ratio || 0)) * 100;
  const level = pct < 34 ? ' meter__fill--low' : pct < 67 ? ' meter__fill--mid' : '';
  return h('div', { class: 'meter' },
    h('div', { class: `meter__fill${level}`, style: { width: `${pct}%` } }));
}

export function empty(message, iconName = 'box', action) {
  return h('div', { class: 'empty' }, tile(iconName), h('p', {}, message), action || null);
}

export function statLabel(text) { return h('span', { class: 'card__label' }, text); }

export function metric(value, label, footer, iconName) {
  return card({ variant: 'card--tight' },
    h('div', { class: 'row' },
      iconName ? tile(iconName, 'sm') : null,
      h('span', { class: 'card__label' }, label)),
    h('div', { class: 'card__metric' }, value),
    footer ? h('div', { class: 'card__foot' }, footer) : null);
}

/** steps: [{ status, at, byUserId, note }] rendered newest-first. */
export function timeline(entries, renderRow) {
  const node = h('div', { class: 'timeline' });
  for (const entry of entries) {
    append(node, [h('div', { class: 'timeline__row' },
      h('div', { class: 'timeline__rail' },
        h('span', { class: 'timeline__dot' }),
        h('span', { class: 'timeline__line' })),
      h('div', { class: 'timeline__body' }, renderRow(entry)))]);
  }
  return node;
}

export function sectionHead(title, sub, ...actions) {
  return h('div', { class: 'page-head' },
    h('div', {},
      h('h1', { class: 'page-head__title' }, title),
      sub ? h('p', { class: 'page-head__sub' }, sub) : null),
    actions.length ? h('div', { class: 'page-head__actions' }, ...actions) : null);
}

/* ---------- dialog ---------- */

let openScrim = null;

/**
 * Opens a modal. `build(close)` returns the dialog body; it is responsible for
 * its own footer buttons. Returns a close function.
 */
export function dialog(title, build, { wide = false, narrow = false } = {}) {
  closeDialog();
  const close = () => closeDialog();
  const box = h('div', {
    class: `dialog${wide ? ' dialog--wide' : ''}${narrow ? ' dialog--narrow' : ''}`,
    role: 'dialog',
    'aria-modal': 'true',
    onClick: (e) => e.stopPropagation(),
  },
  h('div', { class: 'row-between' },
    h('h2', { class: 'dialog__title' }, title),
    iconBtn('close', { variant: 'ghost', 'aria-label': 'Close', onClick: close })),
  build(close));

  const scrim = h('div', { class: 'scrim', onClick: close }, box);
  document.body.appendChild(scrim);
  openScrim = scrim;
  document.addEventListener('keydown', onEsc);
  const focusable = box.querySelector('input, select, textarea, button.btn');
  if (focusable) focusable.focus();
  return close;
}

function onEsc(e) { if (e.key === 'Escape') closeDialog(); }

export function closeDialog() {
  if (!openScrim) return;
  openScrim.remove();
  openScrim = null;
  document.removeEventListener('keydown', onEsc);
}

/** Inline confirmation — the design guidelines rule out browser alerts. */
export function confirmDialog(title, message, confirmLabel, onConfirm, variant = 'primary') {
  dialog(title, (close) => h('div', { class: 'stack' },
    h('p', { class: 'muted' }, message),
    h('div', { class: 'dialog__foot' },
      btn('Cancel', { variant: 'ghost', onClick: close }),
      btn(confirmLabel, { variant, onClick: () => { close(); onConfirm(); } }))),
  { narrow: true });
}

/* ---------- toasts ---------- */

let toastHost = null;

export function toast(message, tone = 'ok') {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts' });
    document.body.appendChild(toastHost);
  }
  const node = h('div', { class: `toast toast--${tone}` }, message);
  toastHost.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s, transform .3s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 320);
  }, 3200);
}
