# Docker_APPS-Launcher 1.6.4

Package build numbers now increase with the feature version: major × 1,000,000 + minor × 1,000 + patch. This produces 1.6.4-1006004, following 1.6.2-0 and 1.6.3-0. Both build scripts use the same policy, and package tests check the preserved package identity and increased build number.

The constant build zero was inconsistent with Synology package guidance. Whether it caused the reported update refusal has not been confirmed from a DSM error or log. The owner reported that the local 1.6.4 package works after the earlier update refusal. This is owner-reported validation, not an independently observed hardware test. No uninstall is performed by this package.
