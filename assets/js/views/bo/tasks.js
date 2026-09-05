// BO task list — shipment preparation and PFI approval requests for this user.

import { h, append, fmtAgo, fmtInt } from '../../ui/el.js';
import { icon } from '../../ui/icons.js';
import { card, btn, empty, sectionHead, shipmentBadge } from '../../ui/components.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { TASK_TYPE_META } from '../../domain/constants.js';
import { openTasksFor, doneTasksFor, getSite, getTrial, unitsIn } from '../../domain/selectors.js';
import { chipStrip } from '../common.js';

let scope = 'OPEN';

export function render(main) {
  const db = store.getDb();
  const user = store.currentUser();

  const open = openTasksFor(db, user.id);
  const done = doneTasksFor(db, user.id);
  const tasks = scope === 'OPEN' ? open : done.slice(0, 30);

  append(main, [
    sectionHead('Tasks', `Assigned to ${user.name}`),

    card({ variant: 'card--tight' }, chipStrip([
      { value: 'OPEN', label: 'Open', count: open.length },
      { value: 'DONE', label: 'Completed', count: done.length },
    ], scope, (value) => { scope = value; main.replaceChildren(); render(main); })),

    tasks.length
      ? h('div', { class: 'stack-sm' }, ...tasks.map((task) => taskCard(db, task)))
      : card({}, empty(
        scope === 'OPEN'
          ? 'Nothing is waiting on you right now.'
          : 'You have not completed any tasks yet.',
        'check',
        btn('Browse all shipments', {
          variant: 'primary', onClick: () => navigate('/bo/shipments'),
        }),
      )),
  ]);
}

function taskCard(db, task) {
  const shipment = db.shipments.find((s) => s.id === task.shipmentId);
  if (!shipment) return null;
  const site = getSite(db, shipment.siteId);
  const trial = getTrial(db, shipment.trialId);
  const meta = TASK_TYPE_META[task.type] || { label: task.type };
  const isDone = task.status === 'DONE';

  return h('button', {
    type: 'button',
    class: 'card card--tight card--action',
    onClick: () => navigate(`/bo/shipments/${shipment.id}`),
  },
  h('div', { class: 'row' },
    h('div', { class: 'grow', style: { minWidth: 0 } },
      h('div', { class: 'strong truncate' }, meta.label),
      h('div', { class: 'small dim truncate' },
        `${shipment.code} · ${site ? site.code : ''} ${site ? site.address.city : ''}`
        + `${trial ? ` · ${trial.code}` : ''}`)),
    h('div', { class: 'right small dim nowrap' },
      h('div', {}, `${fmtInt(unitsIn(shipment))} units`),
      h('div', {}, isDone ? `done ${fmtAgo(task.doneAt)}` : fmtAgo(task.createdAt))),
    shipmentBadge(shipment.status),
    icon('arrowRight', 17)));
}
