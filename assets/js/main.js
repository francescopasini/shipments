// Bootstrap: load (or seed) the database, register routes, mount the shell.

import * as store from './store.js';
import { define, start, resolve, navigate, currentPath } from './router.js';
import { renderShell, notFound } from './views/shell.js';
import { closeDialog } from './ui/components.js';

import * as foDashboard from './views/fo/dashboard.js';
import * as foShipments from './views/fo/shipments.js';
import * as foShipmentDetail from './views/fo/shipment-detail.js';
import * as foStock from './views/fo/stock.js';
import * as foNotifications from './views/fo/notifications.js';
import * as foSite from './views/fo/site.js';
import * as profile from './views/profile.js';

import * as boDashboard from './views/bo/dashboard.js';
import * as boTasks from './views/bo/tasks.js';
import * as boShipments from './views/bo/shipments.js';
import * as boShipmentDetail from './views/bo/shipment-detail.js';
import * as boStock from './views/bo/stock.js';
import * as boSites from './views/bo/sites.js';
import * as boTrials from './views/bo/trials.js';

const root = document.getElementById('app');

/* ---------- routes ---------- */

// side: which persona role a route belongs to, so we can redirect a mismatch.
define('/fo/dashboard', { side: 'FO', render: foDashboard.render });
define('/fo/shipments', { side: 'FO', render: foShipments.render });
define('/fo/shipments/:id', { side: 'FO', render: foShipmentDetail.render });
define('/fo/stock', { side: 'FO', render: foStock.render });
define('/fo/notifications', { side: 'FO', render: foNotifications.render });
define('/fo/site', { side: 'FO', render: foSite.render });
define('/fo/profile', { side: 'FO', render: profile.render });

define('/bo/dashboard', { side: 'BO', render: boDashboard.render });
define('/bo/tasks', { side: 'BO', render: boTasks.render });
define('/bo/shipments', { side: 'BO', render: boShipments.render });
define('/bo/shipments/:id', { side: 'BO', render: boShipmentDetail.render });
define('/bo/stock', { side: 'BO', render: boStock.render });
define('/bo/sites', { side: 'BO', render: boSites.renderList });
define('/bo/sites/new', { side: 'BO', render: boSites.renderNew });
define('/bo/sites/:id', { side: 'BO', render: boSites.renderDetail });
define('/bo/trials', { side: 'BO', render: boTrials.renderList });
define('/bo/trials/new', { side: 'BO', render: boTrials.renderNew });
define('/bo/trials/:id', { side: 'BO', render: boTrials.renderDetail });
define('/bo/profile', { side: 'BO', render: profile.render });

/* ---------- render loop ---------- */

function homeFor(user) {
  return user.role === 'FO' ? '/fo/dashboard' : '/bo/dashboard';
}

let lastPath = null;

function draw() {
  const user = store.currentUser();
  if (!user) { store.reset(); return; }

  const path = currentPath();
  if (path === '/' || path === '') {
    navigate(homeFor(user), { replace: true });
    return;
  }

  const match = resolve();

  // Switching persona while on the other side's page: send them to their home.
  if (match && match.handler.side !== user.role) {
    navigate(homeFor(user), { replace: true });
    return;
  }

  const main = renderShell(root);
  if (!match) { notFound(main); return; }
  match.handler.render(main, match.params);

  // Only jump to the top on a real navigation — not on every in-place store update.
  if (path !== lastPath) {
    window.scrollTo({ top: 0 });
    lastPath = path;
  }
}

store.init();
// A store change can invalidate whatever is on screen, so close any open dialog first.
store.subscribe(() => { closeDialog(); draw(); });
start(draw);
