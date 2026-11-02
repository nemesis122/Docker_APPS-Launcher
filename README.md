# Docker_APPS-Launcher

## Why I built this

I built this app because I could no longer add direct links to my Docker container web interfaces in Synology DSM’s Container Manager. Docker_APPS-Launcher gives me a central place to collect and open those links.

## Download 1.5.0

[Download SPK 1.5.0](https://github.com/nemesis122/Docker_APPS-Launcher/releases/download/v1.5.0/docker-apps-monitor_noarch-1.5.0-0.spk) · [Release notes](https://github.com/nemesis122/Docker_APPS-Launcher/releases/tag/v1.5.0) · [Application source](https://github.com/nemesis122/Docker_APPS-Launcher/releases/download/v1.5.0/Docker_APPS-Launcher-1.5.0-source.zip) · [SHA256 checksums](https://github.com/nemesis122/Docker_APPS-Launcher/releases/download/v1.5.0/SHA256SUMS-1.5.0.txt)

DSM launcher for container web applications with a shared NAS application list and read-only container monitoring.

## Changes since 1.4.5

- **Version history:** view and restore earlier shared-list versions, with a preview of added, removed and changed entries. Restoring creates a new revision and supports Undo.
- **Automatic cleanup:** retains the newest 30 list revisions (`apps-*.json`) in the selected `Docker APPS` folder. Older revisions are removed after saving and once on launch. If the File Station Delete API is unavailable, cleanup is skipped.
- **Selectable storage location:** choose another shared folder when `docker` is unavailable, or change the location later. The current list can optionally be copied; existing target lists are loaded rather than overwritten. The choice is saved per DSM account in the browser.
- Updated package metadata, maintainer and support links.
- Source archive includes the application source, build script, simulated DSM unit tests and browser test code.
- Corrected repository links to **Docker_APPS-Launcher** in the SPK metadata and source documentation.

## Upgrade notice

The existing application list is retained when upgrading from 1.4.x. **On first launch, older list revisions beyond the newest 30 are deleted from the selected Docker APPS folder.** Export or back up older history first if you need to retain it. Other files in the folder are not part of the cleanup.

## Requirements and installation

Requires **DSM 7.2-64570 or later**, File Station and appropriate folder/application permissions. Live container data additionally requires Container Manager permissions.

Download `docker-apps-monitor_noarch-1.5.0-0.spk` below and install it through DSM Package Center → Manual Install.

The app does not start, stop or modify containers and requests no root installation privileges. List storage and cleanup use the signed-in DSM user’s File Station permissions.

## Downloads and checksums

- `docker-apps-monitor_noarch-1.5.0-0.spk`: installable package.
- `Docker_APPS-Launcher-1.5.0-source.zip`: application source supplied for this release; use this archive for the 1.5.0 application source.
- `SHA256SUMS-1.5.0.txt`: SHA256 checksums for both files.

SPK SHA256:
```text
4d6010db63c772d5da24f9c2aaed74f77c27167d3ef98132fa6db2c3d4f4438c
```

The SPK was repackaged to correct repository metadata; its application payload is unchanged. Byte-for-byte reproduction of the repackaged SPK with the included build script has not been verified. GitHub’s automatically generated source archives reflect the tagged repository snapshot.

## Test status

All **25 unit tests passed** locally against a simulated DSM API. Browser test code is included but was not rerun for this metadata correction. Full compatibility has not been verified on real NAS hardware.

## Demo screenshots

The screenshots below show version 1.4.5. All screenshots contain simulated demonstration data only, with no real NAS or user data.

### List view — light

![Docker Apps 1.4.5 list view — simulated demo data](https://github.com/nemesis122/Docker_APPS-Launcher/releases/download/v1.4.5/docker-apps-1.4.5-list-light.png)

### Icon view — dark

![Docker Apps 1.4.5 icon view — simulated demo data](https://github.com/nemesis122/Docker_APPS-Launcher/releases/download/v1.4.5/docker-apps-1.4.5-icons-dark.png)

Icons: [selfh.st/icons](https://github.com/selfhst/icons), CC BY 4.0, plus attributed additional logos. Detailed credits are bundled in the package.
