# Shipments

A clickable prototype of an app that coordinates clinical-trial supply shipments from a central
deposit to trial sites. Two sides share one codebase:

- **Front office (FO)** — site coordinators request shipments and track their site stock.
- **Back office (BO)** — shipping coordinators fulfil those requests; some BO users also approve PFIs.

Static site, no build step, no dependencies. The database is `localStorage`, seeded with mock data.

## Running it

ES modules do not load over `file://`, so it needs a static server:

```bash
python3 -m http.server 8123
```

Then open <http://localhost:8123>. Any static server works.

## Getting around

There is no login. The **persona switcher** at the bottom of the sidebar swaps you between the six
seeded users — three site coordinators, and a back office of one shipping coordinator, one PFI
approver, and one person who is both. Picking a front-office user shows the FO app in light grey, a
back-office user shows the BO app in light brown. FO users with access to more than one site get a
**site switcher** above the navigation. Your own profile hangs off the persona switcher rather than
taking a slot in the navigation.

Sites run more than one trial. Where they do, the FO sections carry a **trial strip** — one choice
shared across the dashboard, stock and shipments, since almost everything a site coordinator sees
belongs to a single study. Sites running one trial show no strip.

**Reset demo data** rebuilds the entire database from the seed. The generator is deterministic, so a
reset always restores the identical world.

To watch the whole workflow, follow one shipment across personas:

1. As **Elena Rossi** (FO, site S001) → pick **ONC-204** on the trial strip → Shipments →
   *Request a new shipment*.
2. As **Marta Lombardi** (BO, coordinator for S001 · ONC-204) → Tasks → open it →
   *Request PFI approval*.
3. As **Camille Aubert** (BO, PFI approver) → *Request modification* to send it back, or *Approve PFI*.
4. Back as Marta → *Send request to vendor* → *Mark as shipped* → *Mark as delivered*.

Before step 2 the coordinator prepares the invoice itself — *Edit invoice* on the PFI panel sets each
line's unit value and commodity code. Nothing leaves "new request" until every line is priced.

Coordination is assigned per site-trial, so the trial picked in step 1 decides who owns steps 2 and 4:
S001's other study, NEU-077, goes to Núria Sabaté instead.

Sites S003, S005, S008 and S011 do not require PFI approval, so their shipments skip step 3 — the
coordinator issues the invoice themselves by marking the shipment ready for preparation.

## The workflow

```
NEW_REQUEST ──site requires PFI?──┬─ yes → AWAITING_PFI_APPROVAL
                                  └─ no  → READY_FOR_PREPARATION
AWAITING_PFI_APPROVAL ─ approve         → READY_FOR_PREPARATION
                      ─ request changes → NEW_REQUEST
READY_FOR_PREPARATION → IN_PREPARATION → SHIPPED → DELIVERED
```

Stock leaves the central deposit when a shipment is **requested** and lands at the site when it is
**delivered** — automatically, with no manual stock entry at the site. Vendor emails are not
simulated: the coordinator advances the status manually, as in the source workflow.

**Every shipment carries a proforma invoice.** It is the customs document that travels with the
goods, so it is prepared whether or not a second pair of eyes signs it off — `requiresPfiApproval`
on the site decides only how a draft ends: `ISSUED` where the coordinator finalises it alone,
`APPROVED` where an approver countersigns. The shipping coordinator for the site-trial edits the
declared values and HS codes while it is a draft; it locks once sent for approval, approved or
issued. Quantities are not editable there — they belong to the shipment, and the ledger has already
committed them to transit.

**Trials and sites are many-to-many.** A hospital runs several studies at once, and stock is held
per study: the ledger location for a site is `site:<siteId>:<trialId>`, so investigational product
held for one trial is never drawn on for another. The `siteTrials` join carries everything that
only makes sense for one pairing — the allocation targets, the activation date the study week runs
from, and the deposit coordinator who fields that study's requests. Whether a proforma invoice is
required stays on the site, since it is driven by the site's country and customs.

A site's allocation for a trial is the ceiling on what it may hold for it, so the most it can
request of an item is `target − held − already in transit`, all three counted for that trial alone.
The request dialog enforces that cap.

## Layout

```
index.html
assets/css/    tokens · base · clay (components) · themes (FO grey / BO brown)
assets/js/
  main.js      route table and render loop
  router.js    hash router
  store.js     localStorage store
  seed.js      deterministic mock-data generator
  domain/      constants · workflow (state machine) · stock (ledger) · selectors (incl. the
               site ↔ trial join)
  ui/          el (hyperscript) · icons · components · charts
  views/       shell · common · fo/* · bo/*
```

**Stock is a ledger.** Every movement is appended to `stockLedger`, and `stock` holds the folded
balances — the two are kept in step by `domain/stock.js:move()`. Nothing writes a balance directly.

**Rendering.** Views rebuild their subtree whenever the store changes. Form inputs are therefore
*uncontrolled* and commit on `change`/`blur`, never on every keystroke, so a re-render cannot steal
focus mid-edit.

**Routing is hash-based** (`#/bo/shipments/:id`), so the same files work from localhost and from a
project subpath on GitHub Pages with no rewrite rules or base-path config.

## Design notes

Clay/bento surfaces, per the design guidelines: cards for lists, badges reserved for statuses, and
no browser alerts anywhere — confirmations are in-app dialogs and toasts.

The palette is capped at five pastels (sky, butter, lilac, sage, rose), defined in
`assets/css/tokens.css`. Those five deliberately do **not** carry identity in the charts: validated
against a CVD check, rose and sage are indistinguishable under deuteranopia. So the deposit chart is
single-series, and the status chart direct-labels every bar — the fill only echoes the badge the
user already saw in the list.

Display icons are the 3D pack in `assets/img`, downscaled to 144px and mapped to semantic names in
`ui/icons.js`. The artwork carries its own depth, so it replaces the tile entirely rather than
sitting inside one. The small functional glyphs (arrow, close, plus, check, filter, swap, refresh,
edit, lock) have no counterpart in that pack and would be illegible at 15–17px, so they remain
hand-built inline SVG in the same file. Everything is local — no CDN.

## Deploying to GitHub Pages

No build step, so Pages can serve the repository as-is: **Settings → Pages → Deploy from a branch →
`main` / root**. `.nojekyll` stops Jekyll from touching the asset folders.

Note that GitHub Pages on a **private** repository requires a paid plan (Pro, Team or Enterprise). On
a free plan the repo has to be public, or the site hosted elsewhere.
