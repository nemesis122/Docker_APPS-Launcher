# 1.6.3

Clear live states and permission help, first-start actions and storage location, startup regression tests and enforced LF installation scripts.

# Changelog

## 1.6.1

- **Licence:** the source code is licensed under GPL-3.0-or-later (`LICENSE`). The licence text is included in the package and linked in the app under Settings → About & licenses. Bundled icons keep their own licenses.
- No functional changes to the launcher.

## 1.6.0

Built on 1.5.8. The bundled icons are unchanged.

- **Own categories:** besides the five built-in categories, any name can be entered in the editor ("New category …"). Own categories appear in the filter.
- **Sorting and own order:** new selector with *Custom order*, *By name* and *By category*. In the custom order, tiles can be dragged with the mouse or given a position number in the editor. The sort choice is a per-browser view setting; only a changed order is saved to the NAS.
- **NAS-address links:** new option "Always use the current NAS address". The stored address stays complete; on opening, only the host name is replaced by the address DSM is open with. Imported containers get the option when their link uses that same address.
- **Container network and disk rates:** the per-container statistics that were already requested are now shown as download/upload and read/write rates in the details window (icon view) and as a tooltip on the metrics in the other views. No additional DSM request.
- **Existing list is found automatically:** a browser without a saved storage location looks for a `Docker APPS` list in the other shared folders when `docker` has none, and uses it if there is exactly one. Read-only; nothing is created while searching.
- Fixed: `build.sh` now writes the same archive paths as `build-windows.cjs` (the package test failed on Linux builds).
- Fixed: DSM search description no longer names three example applications.
- Fixed: untranslated German screen-reader labels in the card markup.
- Repository: the complete source, tests and build scripts are now in the Git repository; README and validation report brought up to date.

Compatibility: the list format is unchanged (`version: 1`). A 1.5.x installation still reads a list saved by 1.6.0, but shows own categories as "Other" and ignores the NAS-address option; if 1.5.x then saves the list, those two details are lost.

## 1.5.8

- Moved CPU/RAM/temperature into a responsive header; kept network and storage in collapsible details.
- Preserved 1.5.0 typography and existing storage/history behavior.
- Added header containment, responsive wrapping, telemetry refresh and stale-reading regressions.


## 1.5.7

- Polished grouped menus with line icons, theme segments, live switch, single location path and license disclosure; fixed invisible simple glyphs.
- Preserved 1.5.0 typography and existing storage/history behavior.
- Expanded tests for actual backup export/import, invalid backups, running/stopped container import, duplicate matching, menu controls and simple-icon visibility.


## 1.5.6

- Implemented the compact launcher redesign: grouped menus, view buttons, original icons, aligned metrics and connection footer.
- Preserved 1.5.0 typography and existing storage/history behavior.
- Added menu, keyboard, view persistence, edit and visible-error browser regressions.


## 1.5.5

- Added confirmed deletion of individual old history entries, protected the current version, and added deletion failure/regression checks. Retains 1.5.0 typography.
- Fixed icon-picker clipping and missing labels, including narrow-window layout.
- Added icon-picker geometry, search, paging and selection regressions.


## 1.5.4

- Restored exact 1.5.0 typography while retaining the repaired icon picker and tile icons.
- Fixed icon-picker clipping and missing labels, including narrow-window layout.
- Added icon-picker geometry, search, paging and selection regressions.


## 1.5.3

- Restored bold Arial typography and increased tile icons.
- Fixed icon-picker clipping and missing labels, including narrow-window layout.
- Added icon-picker geometry, search, paging and selection regressions.


## 1.5.2

- Fixed missing version substitution in extensionless DSM app/config.
- Added finished-SPK registration/asset/permission checks, storage-failure regressions and simulated DSM-wrapper launch checks.


## 1.5.1

- Explicit UI fonts and a restrained type hierarchy.
- Compact system strip with collapsible volume details.
- Readable application tiles and compact numeric CPU/RAM metrics in small sizes.
- Responsive adjustments for narrow DSM windows; existing launcher features retained.

## 1.5.0

- **History:** Earlier versions of the shared list can be viewed and restored ("History" button). The dialog shows what a restore would add, remove or change. Restoring creates a new version; nothing is overwritten, and "Undo" works as for any change.
- **Automatic cleanup:** Only the newest 30 list versions (`apps-*.json`) are kept in `Docker APPS`. Older ones are removed through File Station after saving and once on launch. Existing collections from 1.4.x are reduced on the first launch. Other files in the folder are never touched. If the File Station Delete API is unavailable, the app keeps working without cleanup.
- **Selectable storage location:** If the `docker` shared folder does not exist, a dialog opens to choose another shared folder. The location can also be changed at any time ("Storage location"); optionally the current list is copied there. An existing list at the target is loaded, never overwritten. The choice is stored per DSM account in the browser.
- Package metadata: maintainer, support and help links, English and German description in Package Center.
- Source code, reproducible build script, unit tests against a simulated DSM API and browser tests are now part of the repository.

## 1.4.5

- Very small and ultra small tiles.
- Additional list and icon views.
- Detail window when clicking an application icon.
- Collapsible system overview in the upper-right corner.
- View selection and collapsed state are saved in the browser.
- Network and disk information removed from application tiles.
- CPU, RAM and status remain available.
