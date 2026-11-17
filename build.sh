#!/usr/bin/env bash
# Builds the Docker Apps SPK reproducibly from src/ and spk/.
# Usage: ./build.sh            -> dist/docker-apps-monitor_noarch-<version>-<build>.spk
# The version comes from the VERSION file. Output is byte-identical for identical
# input as long as SOURCE_DATE_EPOCH is the same (default: last git commit or 0).
set -euo pipefail
cd "$(dirname "$0")"

VERSION="$(tr -d '[:space:]' < VERSION)"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Ungültige VERSION: $VERSION" >&2; exit 1; }
IFS=. read -r PKG_MAJOR PKG_MINOR PKG_PATCH <<< "$VERSION"
PKG_MAJOR=$((10#$PKG_MAJOR)); PKG_MINOR=$((10#$PKG_MINOR)); PKG_PATCH=$((10#$PKG_PATCH))
PKG_BUILD=$((PKG_MAJOR * 1000000 + PKG_MINOR * 1000 + PKG_PATCH))
((PKG_MAJOR <= 2147 && PKG_MINOR <= 999 && PKG_PATCH <= 999 && PKG_BUILD >= 1 && PKG_BUILD <= 2147483647)) || { echo "VERSION exceeds DSM build-number range" >&2; exit 1; }
if [[ -z "${SOURCE_DATE_EPOCH:-}" ]]; then
  SOURCE_DATE_EPOCH="$(git log -1 --format=%ct 2>/dev/null || echo 0)"
fi
export SOURCE_DATE_EPOCH

BUILD=build
DIST=dist
SPK_NAME="docker-apps-monitor_noarch-${VERSION}-${PKG_BUILD}.spk"
rm -rf "$BUILD" && mkdir -p "$BUILD/stage" "$BUILD/spk" "$DIST"

# 1. Stage the DSM app with versioned paths (DSM caches 3rd-party files aggressively).
cp -a src/app "$BUILD/stage/app"
cp LICENSE "$BUILD/stage/app/ui/licenses/GPL-3.0.txt"   # source licence, shown in the app
APP="$BUILD/stage/app"
mv "$APP/ui" "$APP/ui-tmp" && mkdir "$APP/ui" && mv "$APP/ui-tmp" "$APP/ui/v$VERSION"
mv "$APP/wrapper.js" "$APP/wrapper-$VERSION.js"
mv "$APP/bootstrap.js" "$APP/bootstrap-$VERSION.js"
grep -rlI --exclude-dir=icons "__VERSION__" "$APP" | xargs -r sed -i "s/__VERSION__/$VERSION/g"
if grep -rI --exclude-dir=icons -q "__VERSION__" "$APP"; then echo "Platzhalter übrig" >&2; exit 1; fi

tar_det() { tar --sort=name --owner=0 --group=0 --numeric-owner --mtime="@$SOURCE_DATE_EPOCH" \
  --mode='u+rwX,go+rX,go-w' --format=gnu "$@"; }
tar_det -C "$BUILD/stage" -cf - app | gzip -9n > "$BUILD/spk/package.tgz"

# 2. SPK metadata.
CHECKSUM="$(md5sum "$BUILD/spk/package.tgz" | cut -d' ' -f1)"
sed -e "s/__VERSION__/$VERSION/g" -e "s/__BUILD__/$PKG_BUILD/g" -e "s/__CHECKSUM__/$CHECKSUM/" spk/INFO > "$BUILD/spk/INFO"
cp -a spk/PACKAGE_ICON.PNG spk/PACKAGE_ICON_256.PNG spk/scripts spk/conf spk/WIZARD_UIFILES "$BUILD/spk/"
chmod 755 "$BUILD/spk/scripts/"*

# 3. SPK container (plain tar, INFO first as Package Center reads it first).
(cd "$BUILD/spk" && tar_det --no-recursion -cf "../../$DIST/$SPK_NAME" INFO package.tgz PACKAGE_ICON.PNG PACKAGE_ICON_256.PNG \
  $(find scripts conf WIZARD_UIFILES | sort))

(cd "$DIST" && sha256sum "$SPK_NAME" > "SHA256SUMS-$VERSION.txt")
echo "Gebaut: $DIST/$SPK_NAME"
cat "$DIST/SHA256SUMS-$VERSION.txt"
