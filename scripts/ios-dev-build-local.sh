#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
IOS_DIR="$MOBILE_DIR/ios"
WORKSPACE="$IOS_DIR/BeachRanker.xcworkspace"
SCHEME="${IOS_SCHEME:-BeachRanker}"
CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
DEVICE_ID="${IOS_DEVICE_ID:-00008120-00084D323440201E}"
DEVELOPMENT_TEAM="${APPLE_TEAM_ID:-9C8W7Q8F3B}"
DERIVED_DATA="$IOS_DIR/build/LocalDevDerivedData"
APP_PATH="$DERIVED_DATA/Build/Products/${CONFIGURATION}-iphoneos/${SCHEME}.app"

log() {
  printf '\n%s\n' "$1"
}

fail() {
  printf '\nError: %s\n' "$1" >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || fail "npm is not installed."
command -v xcodebuild >/dev/null 2>&1 || fail "xcodebuild is not available. Install/open Xcode, then retry."

if [ ! -d "$WORKSPACE" ]; then
  fail "Missing iOS workspace at $WORKSPACE. Run npm install and generate/sync the native iOS project first."
fi

cd "$ROOT_DIR"

log "Building shared API client..."
npm run build -w packages/api-client

log "Building iOS app for device ${DEVICE_ID} with provisioning updates enabled..."
xcodebuild \
  -workspace "$WORKSPACE" \
  -configuration "$CONFIGURATION" \
  -scheme "$SCHEME" \
  -destination "id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
  CODE_SIGN_STYLE=Automatic \
  COCOAPODS_PARALLEL_CODE_SIGN=false \
  COMPILER_INDEX_STORE_ENABLE=NO \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build

if [ ! -d "$APP_PATH" ]; then
  fail "Build completed, but the app was not found at $APP_PATH"
fi

log "Installing ${APP_PATH} on device ${DEVICE_ID}..."
if ! npm exec -w @beach-ranker/mobile -- expo run:ios --device "$DEVICE_ID" --binary "$APP_PATH"; then
  printf '\nThe app was built and Expo attempted to install it, but iOS refused to launch it.\n' >&2
  printf 'On the iPhone, open Settings > General > VPN & Device Management and trust the Apple Development profile for this Apple ID/team, then rerun this command.\n' >&2
  exit 1
fi
