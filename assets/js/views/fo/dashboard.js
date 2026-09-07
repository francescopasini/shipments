// FO home — one card per trial the site runs, each showing where every cadence
// of that trial stands: what is already here, and what is still coming.
//
// Together they answer the only question this page needs to — is anything about
// to run out, and is more already coming. How much more the site is still
// allowed to order is a different question, and the request dialog answers it
// at the moment it matters.

import { h, append } from '../../ui/el.js';
import { card, tile, btn, empty, sectionHead } from '../../ui/components.js';
import { groupedBars, seriesTone } from '../../ui/charts.js';
import { navigate } from '../../router.js';
import * as store from '../../store.js';
import { openRequestDialog } from './shipments.js';
import { showTrial } from './stock.js';
import {
  siteTrialsForSite, cadencesForTrial, cadencePosition, getTrial,
} from '../../domain/selectors.js';

const STATES = ['In stock', 'On the way'];

export function render(main) {
  const db = store.getDb();
  const site = store.currentSite();
  if (!site) {
    append(main, [card({}, empty('No site selected.', 'building'))]);
    return;
  }

  const siteTrials = siteTrialsForSite(db, site.id);

  append(main, [
    sectionHead(
      'Dashboard',
      null,
      btn('Request a shipment', {
        variant: 'primary', iconName: 'plus', onClick: () => openRequestDialog(),
      }),
    ),

    ...(siteTrials.length
      ? siteTrials.map((st) => trialCard(db, st))
      : [card({}, empty('This site is not running any trial yet.', 'flask'))]),
  ]);
}

/** One trial's cadences, and where each of them stands. */
function trialCard(db, siteTrial) {
  const trial = getTrial(db, siteTrial.trialId);
  const cadences = cadencesForTrial(db, siteTrial.trialId);

  const series = cadences.map((cadence, i) => {
    const at = cadencePosition(db, siteTrial, cadence);
    return {
      label: cadence.name,
      tone: seriesTone(i),
      values: [at.onSite, at.inTransit],
    };
  });

  return card({},
    h('div', { class: 'row-between' },
      h('div', { class: 'row' }, tile('flask'),
        h('div', {},
          h('div', { class: 'card__title' }, trial ? `${trial.code} · ${trial.name}` : '—'),
          h('div', { class: 'small dim' },
            `Up to ${siteTrial.maxCadenceUnits || 0} of any cadence`))),
      // The chart counts cadences; stock counts items. One is the natural next
      // question from the other — asked from this card, about this trial, so it
      // lands on this trial's table rather than at the top of the page.
      btn('Detailed stock', {
        variant: 'ghost', size: 'sm', iconName: 'arrowRight',
        onClick: () => { showTrial(siteTrial.trialId); navigate('/fo/stock'); },
      })),

    cadences.length && siteTrial.maxCadenceUnits
      ? groupedBars(STATES, series, { height: 440, unit: 'cadences' })
      : empty(
        cadences.length
          ? 'The deposit has not set a limit for this site yet, so nothing can be ordered.'
          : 'This trial has no cadences configured.',
        'calendar',
      ));
}
