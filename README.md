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

There is no login. The **persona switcher** at the bottom of the sidebar swaps you between all
thirteen seeded users — picking a front-office user shows the FO app in light grey, a back-office
user shows the BO app in light brown. FO users with access to more than one site get a **site
switcher** above the navigation.

**Reset demo data** rebuilds the entire database from the seed. The generator is deterministic, so a
reset always restores the identical world.

To watch the whole workflow, follow one shipment across personas:

1. As **Elena Rossi** (FO, site S001) → Shipments → *Request a new shipment*.
2. As **Marta Lombardi** (BO, S001's coordinator) → Tasks → open it → *Request PFI approval*.
3. As **Camille Aubert** (BO, PFI approver) → *Request modification* to send it back, or *Approve PFI*.
4. Back as Marta → *Send request to vendor* → *Mark as shipped* → *Mark as delivered*.

Sites S003, S005, S008 and S011 do not require PFI approval, so their shipments skip step 3.

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

A site's allocation is the ceiling on what it may hold, so the most it can request of an item is
`target − held − already in transit`. The request dialog enforces that cap.

## Layout

```
index.html
assets/css/    tokens · base · clay (components) · themes (FO grey / BO brown)
assets/js/
  main.js      route table and render loop
  router.js    hash router
  store.js     localStorage store
  seed.js      deterministic mock-data generator
  domain/      constants · workflow (state machine) · stock (ledger) · selectors
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

Icons are hand-built inline SVG (`ui/icons.js`) rather than a CDN library, so the site stays entirely
self-contained.

## Deploying to GitHub Pages

No build step, so Pages can serve the repository as-is: **Settings → Pages → Deploy from a branch →
`main` / root**. `.nojekyll` stops Jekyll from touching the asset folders.

Note that GitHub Pages on a **private** repository requires a paid plan (Pro, Team or Enterprise). On
a free plan the repo has to be public, or the site hosted elsewhere.
