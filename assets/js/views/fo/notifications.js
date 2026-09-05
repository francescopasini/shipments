// FO notifications — newest first, with mark-as-read.

import { h, append, fmtAgo, fmtDateTime } from '../../ui/el.js';
import { icon } from '../../ui/icons.js';
import { card, tile, btn, empty, sectionHead, badge, toast } from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { NOTIFICATION_META } from '../../domain/constants.js';
import { notificationsForSite, unreadCount } from '../../domain/selectors.js';

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const notes = notificationsForSite(db, site.id);
  const unread = unreadCount(db, site.id);

  append(main, [
    sectionHead('Notifications', `${site.code} · ${unread} unread of ${notes.length}`,
      unread
        ? btn('Mark all as read', {
          variant: 'ghost', iconName: 'check',
          onClick: () => {
            store.update((d) => {
              for (const n of d.notifications) if (n.siteId === site.id) n.read = true;
            });
            toast('All notifications marked as read.', 'info');
          },
        })
        : null),

    notes.length
      ? h('div', { class: 'stack-sm' }, ...notes.map((note) => noteCard(db, note)))
      : card({}, empty('Nothing has been sent to this site yet.', 'bell')),
  ]);
}

function noteCard(db, note) {
  const meta = NOTIFICATION_META[note.type] || { icon: 'bell', tone: 'sky' };
  const open = () => {
    if (!note.read) store.update((d) => {
      const found = d.notifications.find((n) => n.id === note.id);
      if (found) found.read = true;
    });
    if (note.shipmentId) navigate(`/fo/shipments/${note.shipmentId}`);
  };

  return h('button', {
    type: 'button',
    class: 'card card--tight card--action',
    onClick: open,
  },
  h('div', { class: 'row' },
    h('div', { class: 'grow', style: { minWidth: 0 } },
      h('div', { class: note.read ? 'muted' : 'strong' }, note.message),
      h('div', { class: 'small dim' },
        `${fmtAgo(note.createdAt)} · ${fmtDateTime(note.createdAt)}`)),
    note.read ? null : badge('New', 'sky'),
    note.shipmentId ? icon('arrowRight', 17) : null));
}

export { tile };
