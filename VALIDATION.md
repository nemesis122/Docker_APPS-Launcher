# Docker_APPS-Launcher 1.6.1 — validation report

1.6.1 differs from 1.6.0 only by the licence: the GPL text is packaged and linked in the app. A package test checks that the packaged text is identical to `LICENSE`, and the browser test opens the link: 54 automated checks and 20 browser scenarios pass. The report below for 1.6.0 applies unchanged.

## 1.6.0

## Scope

1.6.0 adds own categories, sorting and an own order, NAS-address links, per-container network/disk rates and automatic discovery of an existing list. `dsm-readonly.js` (the closed table of DSM calls) is unchanged from 1.5.8: no new DSM API is called. `nas-store.js` gained one read-only method (`locate`). The bundled icons and the icon catalogue are byte-identical to 1.5.8.

## Passed checks (Linux, Node 22, headless Chrome, simulated DSM)

- 53 automated checks: the 43 from 1.5.8 plus 10 new ones for categories, NAS-address links, ordering, rate calculation, container matching and list discovery (including that discovery performs no write call).
- 20 functional browser scenarios: the 15 from 1.5.8 plus 5 new ones:
  - own category, NAS-address option, position number, the three sort modes, persistence of the sort choice after reload, drag and drop with a real drag in Chrome, and Undo of a reorder;
  - English labels of the new controls and the error for an empty new category name;
  - a list in another shared folder is found and nothing is created in `docker`;
  - with two candidate lists the app does not guess and stays on the default;
  - container rates show dashes after the first reading and values after the second.
- The UI regression script of 1.5.8 (typography fixture, header telemetry, five tile sizes, three views, 620-pixel window, DSM wrapper launch) passed unchanged.
- The finished-SPK test passed for the package built with `build-windows.cjs` and for the one built with `build.sh`.
- A list saved by 1.6.0 was loaded with the 1.5.8 model: accepted, own category shown as "Andere", NAS-address flag dropped. A 1.5.8 list loads identically in 1.6.0.
- Screenshots of the editor, the sorted list and the details window were inspected.

## Limits

No real DSM or NAS was accessed for 1.6.0. Not verified on hardware: Package Center upgrade from 1.5.8, drag and drop inside the DSM desktop window, and the real format of `SYNO.Docker.Container` `stats` — if DSM delivers the counters in a different shape, the rates show dashes and nothing else is affected. The automatic list discovery issues one File Station list request per shared folder (at most 40) on the first launch of a browser that has no saved location and finds no list in `docker`.

1.5.8 itself was seen running on a real NAS with real containers (owner's screenshot, 14 November 2026); that observation does not cover the 1.6.0 changes.

## Re-run

Build: `node build-windows.cjs`

Automated checks: `node --test tests/*.test.js tests/package.test.cjs`

Browser checks (Playwright and Chrome required): `node tests/ui.e2e.js` and `node tests/ui-regression.cjs`
