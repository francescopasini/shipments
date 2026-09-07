// BO home — how the deposit's shipments are distributed across the workflow.

import { h, append } from '../../ui/el.js';
import { card, tile, btn, sectionHead } from '../../ui/components.js';
import { statusBars } from '../../ui/charts.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { allShipments, statusBreakdown, openTasksFor } from '../../domain/selectors.js';
import { showStatus } from './shipments.js';

export function render(main) {
  const db = store.getDb();
  const user = store.currentUser();
  const shipments = allShipments(db);
  const myTasks = openTasksFor(db, user.id);

  append(main, [
    sectionHead('Dashboard', null,
      btn('My tasks', {
        variant: myTasks.length ? 'primary' : 'ghost',
        iconName: 'clipboard',
        onClick: () => navigate('/bo/tasks'),
      })),

    h('div', { class: 'bento' },
      h('div', { class: 'col-12' }, card({},
        h('div', { class: 'row-between' },
          h('div', { class: 'row' },
            // The section's own icon: the card is a way into the shipment list,
            // so it wears the same mark the list does.
            tile('box'),
            h('div', {},
              h('div', { class: 'card__title' }, 'Shipments by status'),
              h('div', { class: 'small dim' }, 'Every site, every trial'))),
          // The bars each open one status, so the button beside them has to say
          // that it opens all of them — an unlabelled arrow would read as "open
          // whatever is selected".
          btn('All shipments', {
            variant: 'ghost', size: 'sm', iconName: 'arrowRight',
            onClick: () => { showStatus('ALL'); navigate('/bo/shipments'); },
          })),
        // Every bar opens the list on exactly what it counted: the breakdown is a
        // way into the shipments, not a number to look at and leave.
        statusBars(statusBreakdown(shipments).map((s) => ({
          label: s.label,
          value: s.value,
          tone: s.tone,
          onClick: () => { showStatus(s.status); navigate('/bo/shipments'); },
        }))))),
    ),
  ]);
}
