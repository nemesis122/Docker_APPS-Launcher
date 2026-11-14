# Docker_APPS-Launcher

DSM 7.2+ launcher for container web interfaces, with a shared application list on the NAS and read-only live monitoring.

## Why I built this

I built this app because I could no longer add direct links to my Docker container web interfaces in Synology DSM's Container Manager. Docker_APPS-Launcher gives me a central place to collect and open those links.

## Download 1.6.0

[Download SPK 1.6.0](https://github.com/nemesis122/Docker_APPS-Launcher/releases/download/v1.6.0/docker-apps-monitor_noarch-1.6.0-0.spk) · [Release notes](https://github.com/nemesis122/Docker_APPS-Launcher/releases/tag/v1.6.0) · [Application source](https://github.com/nemesis122/Docker_APPS-Launcher/releases/download/v1.6.0/Docker_APPS-Launcher-1.6.0-source.zip) · [SHA256 checksums](https://github.com/nemesis122/Docker_APPS-Launcher/releases/download/v1.6.0/SHA256SUMS-1.6.0.txt)

SPK SHA256:

```text
26a11c10dd3d916ca2708278e9a3b57fe544ff3a2e65690162696aa6dd04d604
```

## New in 1.6.0

- **Own categories** in addition to the five built-in ones.
- **Sorting** by name or category, and an **own order** by drag and drop or position number.
- **NAS-address links:** with "Always use the current NAS address", a link keeps working when DSM is opened through another host name or IP. Only the host name is replaced; port and path stay.
- **Container network and disk rates** in the details window.
- **An existing list is found automatically** when a new browser has no saved storage location.
- Build and text fixes. The bundled icons are unchanged.

## Since 1.5.0

- Redesigned interface: CPU, RAM and temperature in the header, grouped "Manage list" and settings menus, view buttons, running/stopped counter (1.5.6–1.5.8).
- Individual old history entries can be deleted; the current version is protected (1.5.5).
- Dependency-free build script for Windows, macOS and Linux (`build-windows.cjs`).

## Features

Container import, CPU/RAM per container, NAS CPU/RAM/temperature, network rates, volume usage, tile/list/icon views, five tile sizes, light and dark themes, German and English, JSON export/import, version history with restore, selectable storage location and an offline icon library.

## Requirements and installation

Requires **DSM 7.2-64570 or later**, File Station and appropriate folder/application permissions. Live container data additionally requires Container Manager permissions.

1. Download the SPK.
2. In DSM, open Package Center → Manual Install and select the file.
3. Open Docker Apps. The shared list is stored in `docker/Docker APPS` by default; another shared folder can be chosen under Manage list → Storage location.

The app does not start, stop or modify containers and requests no root installation privileges. It writes and deletes only `apps-*.json` files inside the `Docker APPS` folder, using the File Station permissions of the signed-in DSM user.

## Upgrade notice

Upgrading from 1.4.x or 1.5.x keeps the existing list. The app keeps the newest 30 list versions and removes older ones.

A 1.5.x installation can still read a list saved by 1.6.0, but shows own categories as "Other" and ignores the NAS-address option. If you run both versions against the same list, saving from 1.5.x drops those two details.

## Test status

53 automated checks and 20 browser scenarios pass against a simulated DSM Web API. Version 1.5.8 runs on a real NAS with real containers; the 1.6.0 additions have not yet been verified on NAS hardware. Details: [VALIDATION.md](VALIDATION.md).

## Screenshots

Browser screenshots of version 1.6.0 with **simulated demonstration data only**. No real NAS or private user data is shown.

![Docker Apps 1.6.0 — light theme, simulated demo data](https://github.com/nemesis122/Docker_APPS-Launcher/releases/download/v1.6.0/docker-apps-1.6.0-light.png)

[Dark theme](https://github.com/nemesis122/Docker_APPS-Launcher/releases/download/v1.6.0/docker-apps-1.6.0-dark.png) · [Container rates in the details window](https://github.com/nemesis122/Docker_APPS-Launcher/releases/download/v1.6.0/docker-apps-1.6.0-container-rates.png)

## Building from source

The repository contains the complete application source.

```sh
node build-windows.cjs   # any platform, no dependencies -> dist/*.spk + SHA256SUMS
./build.sh               # Linux/macOS alternative, same archive layout
```

Tests (after a build):

```sh
node --test tests/*.test.js tests/package.test.cjs
npm install                  # Playwright, only for the browser tests
node tests/ui.e2e.js
node tests/ui-regression.cjs
```

| Path | Content |
| --- | --- |
| `src/app/` | DSM app (Ext.js wrapper, launcher UI in `src/app/ui/`). `__VERSION__` is replaced during the build. |
| `spk/` | SPK metadata: `INFO`, install wizard, scripts, privileges, package icons |
| `tests/` | Simulated DSM (`fake-dsm.js`), unit tests, browser tests |
| `VERSION` | Package version used by both build scripts |

Full history: [CHANGELOG.md](CHANGELOG.md) · Test scope and limits: [VALIDATION.md](VALIDATION.md)

Icons: [selfh.st/icons](https://github.com/selfhst/icons), CC BY 4.0, plus attributed additional logos. Detailed credits are bundled in the package.
